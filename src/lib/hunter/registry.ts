import {z} from 'zod';
import type {Provider} from './engine';

export type RegistryStatus = 'LIVE' | 'RESEARCH' | 'DISCONNECTED' | 'DEGRADED';

export type HunterSource = {
  id: string;
  name: string;
  company?: string;
  provider?: Provider;
  tenant?: string;
  leverRegion?: 'GLOBAL' | 'EU';
  markets: string[];
  status: RegistryStatus;
  configured: boolean;
  endpoint?: string;
  note: string;
  access: 'OFFICIAL_PUBLIC_API' | 'RESEARCH_ONLY';
};

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/i);
const tenant = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/i);
const markets = z
  .array(z.string().regex(/^[A-Z]{2,12}$/))
  .min(1)
  .max(32);

const greenhouseConfig = z.object({
  id,
  name: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  boardToken: tenant,
  markets,
});

const leverConfig = z.object({
  id,
  name: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  site: tenant,
  region: z.enum(['GLOBAL', 'EU']).default('GLOBAL'),
  markets,
});

const ashbyConfig = z.object({
  id,
  name: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  boardName: tenant,
  markets,
});
const smartRecruitersConfig = z.object({
  id,
  name: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  companyIdentifier: tenant,
  markets,
});
const workableConfig = z.object({
  id,
  name: z.string().min(2).max(120),
  company: z.string().min(1).max(120),
  subdomain: tenant,
  query: z.string().max(120).optional(),
  markets,
});

function parseList<T>(value: string | undefined, schema: z.ZodType<T[]>): {items: T[]; error?: string} {
  if (!value?.trim()) return {items: []};
  try {
    const parsed: unknown = JSON.parse(value);
    const result = schema.safeParse(parsed);
    return result.success
      ? {items: result.data}
      : {items: [], error: result.error.issues.map((issue) => issue.message).join('; ')};
  } catch {
    return {items: [], error: 'Environment value is not valid JSON.'};
  }
}

export function getSourceRegistry(env: Readonly<Record<string, string | undefined>> = process.env): HunterSource[] {
  const greenhouse = parseList(env.HUNTER_GREENHOUSE_SOURCES, z.array(greenhouseConfig));
  const lever = parseList(env.HUNTER_LEVER_SOURCES, z.array(leverConfig));
  const ashby = parseList(env.HUNTER_ASHBY_SOURCES, z.array(ashbyConfig));
  const smartRecruiters = parseList(env.HUNTER_SMARTRECRUITERS_SOURCES, z.array(smartRecruitersConfig));
  const workable = parseList(env.HUNTER_WORKABLE_SOURCES, z.array(workableConfig));
  const sources: HunterSource[] = [];

  for (const source of greenhouse.items) {
    sources.push({
      id: source.id,
      name: source.name,
      company: source.company,
      provider: 'GREENHOUSE',
      tenant: source.boardToken,
      markets: source.markets,
      status: 'DISCONNECTED',
      configured: true,
      endpoint: `https://boards-api.greenhouse.io/v1/boards/${source.boardToken}/jobs?content=true`,
      note: 'Configured; no successful live check has completed in this process yet.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }

  for (const source of lever.items) {
    const host = source.region === 'EU' ? 'api.eu.lever.co' : 'api.lever.co';
    sources.push({
      id: source.id,
      name: source.name,
      company: source.company,
      provider: 'LEVER',
      tenant: source.site,
      leverRegion: source.region,
      markets: source.markets,
      status: 'DISCONNECTED',
      configured: true,
      endpoint: `https://${host}/v0/postings/${source.site}?mode=json`,
      note: 'Configured; no successful live check has completed in this process yet.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }

  for (const source of ashby.items) {
    sources.push({
      id: source.id,
      name: source.name,
      company: source.company,
      provider: 'ASHBY',
      tenant: source.boardName,
      markets: source.markets,
      status: 'DISCONNECTED',
      configured: true,
      endpoint: `https://api.ashbyhq.com/posting-api/job-board/${source.boardName}?includeCompensation=true`,
      note: 'Configured; no successful live check has completed in this process yet.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }
  for (const source of smartRecruiters.items) {
    sources.push({
      id: source.id,
      name: source.name,
      company: source.company,
      provider: 'SMARTRECRUITERS',
      tenant: source.companyIdentifier,
      markets: source.markets,
      status: 'DISCONNECTED',
      configured: true,
      endpoint: `https://api.smartrecruiters.com/v1/companies/${source.companyIdentifier}/postings?limit=100`,
      note: 'Configured; no successful live check has completed in this process yet.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }
  for (const source of workable.items) {
    sources.push({
      id: source.id,
      name: source.name,
      company: source.company,
      provider: 'WORKABLE',
      tenant: source.subdomain,
      markets: source.markets,
      status: 'RESEARCH',
      configured: true,
      note: 'Workable requires documented authenticated API access. The undocumented careers feed is not executed.',
      access: 'RESEARCH_ONLY',
    });
  }

  if (greenhouse.items.length === 0) {
    sources.push({
      id: 'greenhouse-configuration',
      name: 'Greenhouse official Job Board API',
      provider: 'GREENHOUSE',
      markets: [],
      status: 'DISCONNECTED',
      configured: false,
      note: greenhouse.error
        ? `Configuration rejected: ${greenhouse.error}`
        : 'No board tokens configured in HUNTER_GREENHOUSE_SOURCES.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }

  if (lever.items.length === 0) {
    sources.push({
      id: 'lever-configuration',
      name: 'Lever official Postings API',
      provider: 'LEVER',
      markets: [],
      status: 'DISCONNECTED',
      configured: false,
      note: lever.error ? `Configuration rejected: ${lever.error}` : 'No sites configured in HUNTER_LEVER_SOURCES.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }

  if (ashby.items.length === 0) {
    sources.push({
      id: 'ashby-configuration',
      name: 'Ashby official Job Postings API',
      provider: 'ASHBY',
      markets: [],
      status: 'DISCONNECTED',
      configured: false,
      note: ashby.error ? `Configuration rejected: ${ashby.error}` : 'No boards configured in HUNTER_ASHBY_SOURCES.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }
  if (smartRecruiters.items.length === 0) {
    sources.push({
      id: 'smartrecruiters-configuration',
      name: 'SmartRecruiters public Posting API',
      provider: 'SMARTRECRUITERS',
      markets: [],
      status: 'DISCONNECTED',
      configured: false,
      note: smartRecruiters.error
        ? `Configuration rejected: ${smartRecruiters.error}`
        : 'No companies configured in HUNTER_SMARTRECRUITERS_SOURCES.',
      access: 'OFFICIAL_PUBLIC_API',
    });
  }
  if (workable.items.length === 0) {
    sources.push({
      id: 'workable-configuration',
      name: 'Workable authenticated API research',
      provider: 'WORKABLE',
      markets: [],
      status: 'RESEARCH',
      configured: false,
      note: workable.error
        ? `Configuration rejected: ${workable.error}`
        : 'Documented API credentials and r_jobs access are required before an adapter can be activated.',
      access: 'RESEARCH_ONLY',
    });
  }

  sources.push(
    {
      id: 'eures-research',
      name: 'EURES and national employment services',
      markets: ['EU', 'EEA'],
      status: 'RESEARCH',
      configured: false,
      note: 'Adapter and access conditions must be verified before activation.',
      access: 'RESEARCH_ONLY',
    },
    {
      id: 'commercial-boards-research',
      name: 'LinkedIn and commercial job boards',
      markets: ['EU', 'UK', 'US', 'CA', 'AU', 'NZ'],
      status: 'RESEARCH',
      configured: false,
      note: 'No scraping is enabled; terms, robots rules, and authorized access require verification.',
      access: 'RESEARCH_ONLY',
    },
  );

  return sources;
}

export function registryMetrics(sources: HunterSource[]) {
  const runnable = sources.filter((source) => source.configured && source.access === 'OFFICIAL_PUBLIC_API');
  const live = runnable.filter((source) => source.status === 'LIVE');
  return {
    registeredSources: sources.length,
    runnableSources: runnable.length,
    liveSources: live.length,
    sourceCoverage: runnable.length === 0 ? 0 : Math.round((live.length / runnable.length) * 100),
    countriesCovered: new Set(live.flatMap((source) => source.markets)).size,
  };
}
