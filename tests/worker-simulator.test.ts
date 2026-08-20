import {describe, expect, it, vi} from 'vitest';
import {InMemoryQueue} from '../src/workers/queue';
import {DeterministicWorkerSimulator} from '../src/workers/simulator';

describe('vendor-neutral queue and deterministic worker simulator', () => {
  it('processes messages in FIFO order and acknowledges them', async () => {
    const queue = new InMemoryQueue<number>();
    await queue.enqueue(2);
    await queue.enqueue(1);
    const handled: number[] = [];
    const worker = new DeterministicWorkerSimulator(queue, (payload) => {
      handled.push(payload);
    });

    expect(await worker.drain()).toMatchObject([
      {status: 'SUCCEEDED', message: {id: 'message-1', attempt: 1}},
      {status: 'SUCCEEDED', message: {id: 'message-2', attempt: 1}},
    ]);
    expect(handled).toEqual([2, 1]);
    expect(queue.size()).toBe(0);
  });

  it('retries deterministically and preserves the message identity', async () => {
    const queue = new InMemoryQueue<{jobId: string}>();
    await queue.enqueue({jobId: 'job-1'});
    const handler = vi.fn().mockRejectedValueOnce(new Error('TRANSIENT')).mockResolvedValue(undefined);
    const worker = new DeterministicWorkerSimulator(queue, handler, {maxAttempts: 2});

    const results = await worker.drain();
    expect(results).toMatchObject([
      {status: 'RETRY_SCHEDULED', error: 'TRANSIENT', message: {id: 'message-1', attempt: 2}},
      {status: 'SUCCEEDED', message: {id: 'message-1', attempt: 2}},
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('fails closed after the configured attempt limit', async () => {
    const queue = new InMemoryQueue<string>();
    await queue.enqueue('work');
    const worker = new DeterministicWorkerSimulator(
      queue,
      () => {
        throw new Error('PERMANENT');
      },
      {maxAttempts: 2},
    );

    expect(await worker.drain()).toMatchObject([
      {status: 'RETRY_SCHEDULED', message: {attempt: 2}},
      {status: 'FAILED', error: 'PERMANENT', message: {attempt: 2}},
    ]);
    expect(queue.size()).toBe(0);
  });

  it('rejects acknowledgements for messages that were not received', async () => {
    const queue = new InMemoryQueue<string>();
    const message = await queue.enqueue('work');
    await expect(queue.acknowledge(message)).rejects.toThrow('QUEUE_MESSAGE_NOT_IN_FLIGHT:message-1');
  });
});
