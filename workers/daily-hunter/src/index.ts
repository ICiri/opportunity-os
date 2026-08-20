type Env = {
  OPPORTUNITY_OS_BASE_URL: string;
  HUNTER_CRON_SECRET: string;
};

type ScheduledController = {scheduledTime: number};
type ExecutionContext = {waitUntil(promise: Promise<unknown>): void};

function isElevenInZagreb(instant: Date) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return Number(hour) === 11;
}

async function trigger(controller: ScheduledController, env: Env) {
  if (!isElevenInZagreb(new Date(controller.scheduledTime))) return;
  const baseUrl = new URL(env.OPPORTUNITY_OS_BASE_URL);
  if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== '127.0.0.1' && baseUrl.hostname !== 'localhost') {
    throw new Error('Opportunity OS scheduler target must use HTTPS.');
  }
  const response = await fetch(new URL('/api/internal/hunter/scheduled', baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.HUNTER_CRON_SECRET}`,
      'x-opportunity-scheduled-at': new Date(controller.scheduledTime).toISOString(),
    },
  });
  if (!response.ok) throw new Error(`Opportunity OS scheduler returned HTTP ${response.status}.`);
}

const dailyHunterWorker = {
  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(trigger(controller, env));
  },
};

export default dailyHunterWorker;
