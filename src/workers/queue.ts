export type QueueMessage<T> = Readonly<{
  id: string;
  payload: T;
  attempt: number;
}>;

export interface Queue<T> {
  enqueue(payload: T): Promise<QueueMessage<T>>;
  receive(): Promise<QueueMessage<T> | undefined>;
  acknowledge(message: QueueMessage<T>): Promise<void>;
  retry(message: QueueMessage<T>): Promise<QueueMessage<T>>;
  size(): number;
}

export class InMemoryQueue<T> implements Queue<T> {
  private readonly pending: QueueMessage<T>[] = [];
  private readonly inFlight = new Map<string, QueueMessage<T>>();
  private nextId = 1;

  async enqueue(payload: T): Promise<QueueMessage<T>> {
    const message = Object.freeze({id: `message-${this.nextId++}`, payload, attempt: 1});
    this.pending.push(message);
    return message;
  }

  async receive(): Promise<QueueMessage<T> | undefined> {
    const message = this.pending.shift();
    if (message) this.inFlight.set(message.id, message);
    return message;
  }

  async acknowledge(message: QueueMessage<T>): Promise<void> {
    this.assertInFlight(message);
    this.inFlight.delete(message.id);
  }

  async retry(message: QueueMessage<T>): Promise<QueueMessage<T>> {
    this.assertInFlight(message);
    this.inFlight.delete(message.id);
    const retried = Object.freeze({...message, attempt: message.attempt + 1});
    this.pending.push(retried);
    return retried;
  }

  size(): number {
    return this.pending.length;
  }

  private assertInFlight(message: QueueMessage<T>) {
    if (this.inFlight.get(message.id) !== message) {
      throw new Error(`QUEUE_MESSAGE_NOT_IN_FLIGHT:${message.id}`);
    }
  }
}
