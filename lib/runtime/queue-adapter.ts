import { Queue, Worker } from "bullmq";

export type QueueWorkerHandler = (payload: Record<string, unknown>) => Promise<void>;

export type QueueJob = {
  id: string;
  payload: Record<string, unknown>;
};

export type QueueEnqueueResult = {
  jobId: string;
};

export interface RuntimeQueueAdapter {
  enqueue(queueName: string, payload: Record<string, unknown>): Promise<QueueEnqueueResult>;
  registerWorker(queueName: string, handler: QueueWorkerHandler): Promise<void>;
  drain(queueName: string): Promise<number>;
  readonly kind: "bullmq" | "mock";
}

type InMemoryQueueState = {
  jobs: QueueJob[];
  worker?: QueueWorkerHandler;
};

export class InMemoryQueueAdapter implements RuntimeQueueAdapter {
  public readonly kind = "mock";
  private static readonly queues = new Map<string, InMemoryQueueState>();

  public async enqueue(
    queueName: string,
    payload: Record<string, unknown>,
  ): Promise<QueueEnqueueResult> {
    const state = this.getQueueState(queueName);
    const job: QueueJob = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      payload,
    };

    state.jobs.push(job);

    if (state.worker) {
      await this.processQueuedJobs(queueName, state);
    }

    return { jobId: job.id };
  }

  public async registerWorker(
    queueName: string,
    handler: QueueWorkerHandler,
  ): Promise<void> {
    const state = this.getQueueState(queueName);
    state.worker = handler;
  }

  public async drain(queueName: string): Promise<number> {
    const state = this.getQueueState(queueName);
    if (!state.worker) return 0;
    return this.processQueuedJobs(queueName, state);
  }

  private getQueueState(queueName: string): InMemoryQueueState {
    const existing = InMemoryQueueAdapter.queues.get(queueName);
    if (existing) {
      return existing;
    }

    const created: InMemoryQueueState = { jobs: [] };
    InMemoryQueueAdapter.queues.set(queueName, created);
    return created;
  }

  private async processQueuedJobs(
    queueName: string,
    state: InMemoryQueueState,
  ): Promise<number> {
    let processed = 0;

    while (state.jobs.length > 0 && state.worker) {
      const job = state.jobs.shift();
      if (!job) continue;

      try {
        await state.worker(job.payload);
      } catch (error) {
        console.error(
          `[RuntimeQueue] Worker failed for queue "${queueName}" job "${job.id}":`,
          error,
        );
      }

      processed += 1;
    }

    return processed;
  }
}

const parseRedisConnection = (
  redisUrl: string,
): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
} => {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
};

export class BullMqQueueAdapter implements RuntimeQueueAdapter {
  public readonly kind = "bullmq";
  private readonly connection: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    tls?: Record<string, never>;
  };
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(redisUrl: string) {
    this.connection = parseRedisConnection(redisUrl);
  }

  public async enqueue(
    queueName: string,
    payload: Record<string, unknown>,
  ): Promise<QueueEnqueueResult> {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }

    const job = await queue.add("runtime_job", payload);
    return {
      jobId: String(job.id),
    };
  }

  public async registerWorker(
    queueName: string,
    handler: QueueWorkerHandler,
  ): Promise<void> {
    if (this.workers.has(queueName)) {
      return;
    }

    const worker = new Worker(
      queueName,
      async (job) => {
        await handler((job.data ?? {}) as Record<string, unknown>);
      },
      { connection: this.connection },
    );

    this.workers.set(queueName, worker);
  }

  public async drain(queueName: string): Promise<number> {
    void queueName;
    // BullMQ workers process asynchronously; draining is managed by workers.
    return 0;
  }
}

export const createRuntimeQueueAdapter = (): RuntimeQueueAdapter => {
  const mode = process.env.RUNTIME_QUEUE_MODE?.trim().toLowerCase();
  if (mode === "mock") {
    return new InMemoryQueueAdapter();
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return new InMemoryQueueAdapter();
  }

  return new BullMqQueueAdapter(redisUrl);
};
