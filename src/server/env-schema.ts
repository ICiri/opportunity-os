import {z} from 'zod';

const optionalUrl = z.string().url().optional().or(z.literal(''));
const optionalInteger = z.coerce.number().int().positive().optional();

export const serverEnvSchema = z.object({
  DATABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPPORTUNITY_LOCAL_USER_ID: z.string().uuid().optional(),
  OPPORTUNITY_AUTH_MODE: z.enum(['local', 'supabase']).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_TIMEOUT_MS: optionalInteger,
  OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().optional(),
  OPENAI_MAX_OUTPUT_TOKENS: optionalInteger,
  HUNTER_GREENHOUSE_SOURCES: z.string().optional(),
  HUNTER_LEVER_SOURCES: z.string().optional(),
  HUNTER_ASHBY_SOURCES: z.string().optional(),
  HUNTER_SMARTRECRUITERS_SOURCES: z.string().optional(),
  HUNTER_WORKABLE_SOURCES: z.string().optional(),
  HUNTER_JOBSPY_SOURCES: z.string().optional(),
  HUNTER_CRON_SECRET: z.string().min(16).optional(),
  TZ: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Readonly<Record<string, string | undefined>> = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}
