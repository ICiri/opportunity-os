import type {HunterSource} from '../registry';
import {SourceConnectionError} from './common';
import {fetchGreenhouseJobs} from './greenhouse';
import {fetchLeverJobs} from './lever';
import {fetchSmartRecruitersJobs} from './smartrecruiters';
import {fetchAshbyJobs} from './ashby';
import {fetchWorkableJobs} from './workable';
import {fetchJobSpyJobs} from './jobspy';

export async function fetchSourceJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
) {
  if (source.provider === 'GREENHOUSE') return fetchGreenhouseJobs(source, options);
  if (source.provider === 'LEVER') return fetchLeverJobs(source, options);
  if (source.provider === 'ASHBY') return fetchAshbyJobs(source, options);
  if (source.provider === 'SMARTRECRUITERS') return fetchSmartRecruitersJobs(source, options);
  if (source.provider === 'WORKABLE') return fetchWorkableJobs(source, options);
  if (source.provider === 'JOBSPY') return fetchJobSpyJobs(source, options);
  throw new SourceConnectionError('No runnable adapter is registered for this source.', 'INVALID_CONFIGURATION');
}

export {SourceConnectionError} from './common';
