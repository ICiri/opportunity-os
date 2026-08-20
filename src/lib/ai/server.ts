import 'server-only';

import OpenAI from 'openai';
import type {AIProvider} from './contracts';
import {readOpenAIProviderConfig} from './config';
import {OpenAIResponsesProvider, type ResponsesParseClient} from './openai-responses-provider';

export function createOpenAIProvider(environment: Record<string, string | undefined> = process.env): AIProvider {
  const config = readOpenAIProviderConfig(environment);
  const sdk = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
  const client: ResponsesParseClient = {
    parse: (params) => sdk.responses.parse(params),
  };
  return new OpenAIResponsesProvider({
    client,
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
  });
}
