import type {RawJob} from '../engine';
import type {HunterSource} from '../registry';
import {absoluteHttpsUrl, fetchText, plainText, SourceConnectionError} from './common';

type WorkableRow = {
  title: string;
  department: string;
  location: string;
  type: string;
  posted: string;
  detailUrl: string;
  externalId: string;
};

function parseRows(markdown: string): WorkableRow[] {
  const rows: WorkableRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|') || line.includes('|-------')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === 'Title' || cells.length < 7) continue;
    const match = cells[6].match(/\[View\]\((https:\/\/apply\.workable\.com\/[^)]+\/([A-Z0-9]+)\.md)\)/i);
    if (!match) continue;
    rows.push({
      title: cells[0],
      department: cells[1],
      location: cells[2],
      type: cells[3],
      posted: cells[5],
      detailUrl: match[1],
      externalId: match[2],
    });
  }
  return rows;
}

function markdownText(value: string) {
  return plainText(
    value
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[#>*-]+\s*/gm, '')
      .replace(/\|/g, ' '),
  );
}

export async function fetchWorkableJobs(
  source: HunterSource,
  options: {fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number} = {},
): Promise<{jobs: RawJob[]; httpStatus: number; checkedAt: string}> {
  if (source.provider !== 'WORKABLE' || !source.configured || !source.endpoint || !source.company) {
    throw new SourceConnectionError('Workable source is not fully configured.', 'INVALID_CONFIGURATION');
  }
  const checkedAt = (options.now ?? new Date()).toISOString();
  const listing = await fetchText(source.endpoint, options.fetchImpl, options.timeoutMs);
  const rows = parseRows(listing.body);
  if (!rows.length)
    throw new SourceConnectionError(
      'Workable feed contained no parseable jobs.',
      'INVALID_PAYLOAD',
      listing.httpStatus,
    );
  const jobs = await Promise.all(
    rows.map(async (row): Promise<RawJob> => {
      const detail = await fetchText(row.detailUrl, options.fetchImpl, options.timeoutMs);
      const applyUrl = row.detailUrl.replace(/\/jobs\/view\/([A-Z0-9]+)\.md$/i, '/j/$1/apply/');
      return {
        sourceId: source.id,
        externalId: row.externalId,
        requisitionId: row.externalId,
        provider: 'WORKABLE',
        canonicalUrl: absoluteHttpsUrl(row.detailUrl.replace(/\.md$/i, '')),
        title: row.title,
        company: source.company as string,
        location: row.location || 'Location not specified',
        url: absoluteHttpsUrl(applyUrl),
        publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(row.posted)
          ? new Date(`${row.posted}T00:00:00.000Z`).toISOString()
          : null,
        sourceUpdatedAt: null,
        verifiedAt: checkedAt,
        description: markdownText(`${detail.body}\nEmployment type: ${row.type}. Department: ${row.department}.`),
        availability: 'LIVE',
      };
    }),
  );
  return {jobs, httpStatus: listing.httpStatus, checkedAt};
}
