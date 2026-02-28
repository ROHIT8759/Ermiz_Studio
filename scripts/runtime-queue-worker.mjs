import { Worker } from "bullmq";

const queueName = process.env.RUNTIME_QUEUE_NAME || "runtime-default";
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error(
    "[runtime-queue-worker] REDIS_URL is required to run BullMQ worker.",
  );
  process.exit(1);
}

const parseRedisConnection = (urlText) => {
  const url = new URL(urlText);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
};

const connection = parseRedisConnection(redisUrl);

const worker = new Worker(
  queueName,
  async (job) => {
    const payload = job.data || {};
    console.log(
      `[runtime-queue-worker] processed job ${job.id} from "${queueName}"`,
      payload,
    );
  },
  { connection },
);

worker.on("ready", () => {
  console.log(`[runtime-queue-worker] listening on queue "${queueName}"`);
});

worker.on("failed", (job, error) => {
  console.error(
    `[runtime-queue-worker] job ${job?.id || "unknown"} failed: ${error.message}`,
  );
});

process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});
