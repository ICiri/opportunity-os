import type OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import type {z} from 'zod';
import type {AIAuditMetadata, AIProvider, AITokenUsage, CvTailoringResult, DailyBriefResult} from './contracts';
import {selectDailyBriefCandidates} from './daily-brief';
import {AIConfigurationError, AIResponseError} from './errors';
import {assertCvDraftGrounded, assertCvInputGrounded, assertDailyBriefGrounded} from './grounding';
import {hashJson, sha256} from './hash';
import {
  CV_TAILOR_INSTRUCTIONS,
  CV_TAILOR_PROMPT_VERSION,
  CV_TAILOR_SCHEMA_VERSION,
  DAILY_BRIEF_INSTRUCTIONS,
  DAILY_BRIEF_PROMPT_VERSION,
  DAILY_BRIEF_SCHEMA_VERSION,
} from './prompts';
import {
  cvTailoringDraftSchema,
  cvTailoringInputSchema,
  dailyBriefInputSchema,
  dailyBriefNarrativeSchema,
  type AICallContext,
  type CvTailoringInput,
  type DailyBriefInput,
} from './schemas';

export type ResponsesParseParams = Parameters<OpenAI['responses']['parse']>[0];
export type ResponsesParseResult = Awaited<ReturnType<OpenAI['responses']['parse']>>;

export interface ResponsesParseClient {
  parse(params: ResponsesParseParams): Promise<ResponsesParseResult>;
}

type ProviderOptions = {
  client: ResponsesParseClient;
  model: string;
  maxOutputTokens?: number;
  now?: () => Date;
};

type StructuredCallOptions<Output> = {
  context: AICallContext;
  useCase: AIAuditMetadata['useCase'];
  prompt: string;
  promptVersion: string;
  schemaVersion: string;
  formatName: string;
  schema: z.ZodType<Output>;
  payload: unknown;
};

type StructuredCallResult<Output> = {
  output: Output;
  audit: AIAuditMetadata;
};

function findRefusal(response: ResponsesParseResult) {
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type === 'refusal') return content.refusal;
    }
  }
  return undefined;
}

function tokenUsage(response: ResponsesParseResult): AITokenUsage | null {
  if (!response.usage) return null;
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    totalTokens: response.usage.total_tokens,
  };
}

/**
 * Testable Responses implementation. Production code must construct it through
 * `./server`, which owns the server-only SDK client and fail-closed environment.
 */
export class OpenAIResponsesProvider implements AIProvider {
  readonly kind = 'openai-responses' as const;
  private readonly client: ResponsesParseClient;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly now: () => Date;

  constructor(options: ProviderOptions) {
    const model = options.model.trim();
    if (!model) throw new AIConfigurationError('OPENAI_MODEL_REQUIRED');
    const maxOutputTokens = options.maxOutputTokens ?? 4_000;
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16_000) {
      throw new AIConfigurationError('OPENAI_MAX_OUTPUT_TOKENS_INVALID');
    }
    this.client = options.client;
    this.model = model;
    this.maxOutputTokens = maxOutputTokens;
    this.now = options.now ?? (() => new Date());
  }

  async tailorCv(rawInput: CvTailoringInput): Promise<CvTailoringResult> {
    const input = cvTailoringInputSchema.parse(rawInput);
    assertCvInputGrounded(input);
    const payload = {
      language: input.language,
      opportunity: input.opportunity,
      baseCv: input.baseCv,
      verifiedFacts: input.verifiedFacts,
    };
    const call = await this.callStructured({
      context: input.context,
      useCase: 'CV_TAILOR',
      prompt: CV_TAILOR_INSTRUCTIONS,
      promptVersion: CV_TAILOR_PROMPT_VERSION,
      schemaVersion: CV_TAILOR_SCHEMA_VERSION,
      formatName: 'cv_tailoring_v2',
      schema: cvTailoringDraftSchema,
      payload,
    });
    assertCvDraftGrounded(input, call.output);
    return {draft: call.output, audit: call.audit};
  }

  async generateDailyBrief(rawInput: DailyBriefInput): Promise<DailyBriefResult> {
    const input = dailyBriefInputSchema.parse(rawInput);
    const selection = selectDailyBriefCandidates(input);
    const payload = {selection};
    const call = await this.callStructured({
      context: input.context,
      useCase: 'DAILY_BRIEF',
      prompt: DAILY_BRIEF_INSTRUCTIONS,
      promptVersion: DAILY_BRIEF_PROMPT_VERSION,
      schemaVersion: DAILY_BRIEF_SCHEMA_VERSION,
      formatName: 'daily_brief_v1',
      schema: dailyBriefNarrativeSchema,
      payload,
    });
    assertDailyBriefGrounded(selection, call.output);
    return {selection, narrative: call.output, audit: call.audit};
  }

  private async callStructured<Output>(options: StructuredCallOptions<Output>): Promise<StructuredCallResult<Output>> {
    const subjectHash = sha256(options.context.subjectId);
    const promptHash = sha256(options.prompt);
    const inputHash = hashJson(options.payload);
    const request: ResponsesParseParams = {
      model: this.model,
      instructions: options.prompt,
      input: JSON.stringify(options.payload),
      text: {format: zodTextFormat(options.schema, options.formatName)},
      store: false,
      background: false,
      tools: [],
      tool_choice: 'none',
      max_output_tokens: this.maxOutputTokens,
      safety_identifier: `oo_${subjectHash.slice(0, 48)}`,
      metadata: {
        use_case: options.useCase,
        prompt_version: options.promptVersion,
        schema_version: options.schemaVersion,
        prompt_hash: promptHash,
        input_hash: inputHash,
        request_hash: sha256(options.context.requestId),
      },
    };

    let response: ResponsesParseResult;
    try {
      response = await this.client.parse(request);
    } catch {
      throw new AIResponseError('OPENAI_REQUEST_FAILED');
    }
    if (response.error) throw new AIResponseError(`OPENAI_RESPONSE_ERROR:${response.error.code}`);
    if (response.status !== 'completed') {
      throw new AIResponseError(`OPENAI_RESPONSE_NOT_COMPLETED:${response.status ?? 'UNKNOWN'}`);
    }
    if (findRefusal(response)) throw new AIResponseError('OPENAI_RESPONSE_REFUSED');
    if (response.output_parsed === null || response.output_parsed === undefined) {
      throw new AIResponseError('OPENAI_STRUCTURED_OUTPUT_MISSING');
    }

    const parsed = options.schema.safeParse(response.output_parsed);
    if (!parsed.success) throw new AIResponseError('OPENAI_STRUCTURED_OUTPUT_INVALID');
    const outputHash = hashJson(parsed.data);
    return {
      output: parsed.data,
      audit: {
        provider: 'openai-responses',
        useCase: options.useCase,
        requestId: options.context.requestId,
        subjectHash,
        responseId: response.id,
        modelRequested: this.model,
        modelResolved: String(response.model),
        promptVersion: options.promptVersion,
        schemaVersion: options.schemaVersion,
        promptHash,
        inputHash,
        outputHash,
        generatedAt: this.now().toISOString(),
        usage: tokenUsage(response),
      },
    };
  }
}
