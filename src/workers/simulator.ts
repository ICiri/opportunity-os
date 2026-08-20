import type {Queue, QueueMessage} from './queue';

export type WorkerResult<T> = Readonly<{
  message: QueueMessage<T>;
  status: 'SUCCEEDED' | 'RETRY_SCHEDULED' | 'FAILED';
  error?: string;
}>;

export type WorkerSimulatorOptions = Readonly<{
  maxAttempts?: number;
}>;

export class DeterministicWorkerSimulator<T> {
  private readonly maxAttempts: number;

  constructor(
    private readonly queue: Queue<T>,
    private readonly handler: (payload: T, message: QueueMessage<T>) => void | Promise<void>,
    options: WorkerSimulatorOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('WORKER_MAX_ATTEMPTS_INVALID');
    }
  }

  async runNext(): Promise<WorkerResult<T> | undefined> {
    const message = await this.queue.receive();
    if (!message) return undefined;

    try {
      await this.handler(message.payload, message);
      await this.queue.acknowledge(message);
      return {message, status: 'SUCCEEDED'};
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'UNKNOWN_WORKER_ERROR';
      if (message.attempt < this.maxAttempts) {
        const retried = await this.queue.retry(message);
        return {message: retried, status: 'RETRY_SCHEDULED', error: reason};
      }
      await this.queue.acknowledge(message);
      return {message, status: 'FAILED', error: reason};
    }
  }

  async drain(): Promise<WorkerResult<T>[]> {
    const results: WorkerResult<T>[] = [];
    while (this.queue.size() > 0) {
      const result = await this.runNext();
      if (result) results.push(result);
    }
    return results;
  }
}
