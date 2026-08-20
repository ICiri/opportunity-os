import type {HunterSource} from '../registry';
import {SourceConnectionError} from './common';
import {fetchGreenhouseJobs} from './greenhouse';
import {fetchLeverJobs} from './lever';

export async function fetchSourceJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
) {
  if (source.provider === 'GREENHOUSE') return fetchGreenhouseJobs(source, options);
  if (source.provider === 'LEVER') return fetchLeverJobs(source, options);
  throw new SourceConnectionError('No runnable adapter is registered for this source.', 'INVALID_CONFIGURATION');
}

export {SourceConnectionError} from './common';
