export const HUNTER_TIMEZONE = 'Europe/Zagreb';
export const HUNTER_LOCAL_HOUR = 11;
export const CLOUDFLARE_CRON_CANDIDATES = ['0 9 * * *', '0 10 * * *'] as const;

export type ScheduleDecision = {
  due: boolean;
  timezone: typeof HUNTER_TIMEZONE;
  localDate: string;
  localTime: string;
  idempotencyKey: string;
};

export function zagrebScheduleDecision(instant: Date): ScheduleDecision {
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Scheduled instant must be a valid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HUNTER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const localDate = `${value('year')}-${value('month')}-${value('day')}`;
  const localTime = `${value('hour')}:${value('minute')}:${value('second')}`;
  return {
    due: Number(value('hour')) === HUNTER_LOCAL_HOUR && Number(value('minute')) === 0,
    timezone: HUNTER_TIMEZONE,
    localDate,
    localTime,
    idempotencyKey: `DAILY_HUNT:${localDate}`,
  };
}
