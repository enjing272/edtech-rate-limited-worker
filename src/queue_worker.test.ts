import { decideDelivery, InfraiQueue } from "./queue_worker.js";

const now = new Date("2026-08-20T00:00:00.000Z");
const result = decideDelivery({ courseId: "checkout", learnerId: "learner", deadline: "2026-08-22T00:00:00.000Z", lessonCount: 6 }, now);
if (result.status !== "schedule" || result.lessons !== 3) throw new Error(`unexpected decision: ${JSON.stringify(result)}`);
console.log("deadline decision test passed");

const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
globalThis.fetch = async (input, init) => {
  requests.push({ path: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
  return new Response(JSON.stringify({ ok: true, data: { message_id: "message-1" } }), {
    headers: { "Content-Type": "application/json" },
  });
};

const queue = new InfraiQueue("test-key");
await queue.publish({ courseId: "checkout", learnerId: "learner", deadline: "2026-08-22T00:00:00.000Z", lessonCount: 6 }, "checkout:learner");
await queue.consume(2, 30);
await queue.ack("message-1");

const expected = [
  ["/v1/queue/publish", ["payload", "queue"]],
  ["/v1/queue/consume", ["max_messages", "queue", "visibility_timeout"]],
  ["/v1/queue/ack", ["message_id", "queue"]],
] as const;
for (const [index, [path, fields]] of expected.entries()) {
  const request = requests[index];
  if (!request?.path.endsWith(path) || JSON.stringify(Object.keys(request.body).sort()) !== JSON.stringify([...fields])) {
    throw new Error(`unexpected queue request: ${JSON.stringify(request)}`);
  }
  if (request.body.queue !== "course-delivery") throw new Error(`unexpected queue name: ${String(request.body.queue)}`);
}
console.log("queue request contract test passed");
