import {z} from 'zod';
import {AIConfigurationError} from './errors';

const environmentSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z.string().trim().min(1).max(128),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_000).default(4_000),
});

export type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
};

export function readOpenAIProviderConfig(
  environment: Record<string, string | undefined> = process.env,
): OpenAIProviderConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'environment'))];
    throw new AIConfigurationError(`OPENAI_CONFIGURATION_INVALID:${fields.join(',')}`);
  }
  return {
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_MODEL,
    timeoutMs: parsed.data.OPENAI_TIMEOUT_MS,
    maxRetries: parsed.data.OPENAI_MAX_RETRIES,
    maxOutputTokens: parsed.data.OPENAI_MAX_OUTPUT_TOKENS,
  };
}
