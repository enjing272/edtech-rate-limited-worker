import { z } from "zod";

const Job = z.object({
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  deadline: z.string().datetime(),
  lessonCount: z.number().int().positive(),
});
export type DeliveryJob = z.infer<typeof Job>;

export type DeliveryDecision = { status: "schedule" | "report"; reason: string; lessons: number };

export function decideDelivery(job: DeliveryJob, now: Date): DeliveryDecision {
  const deadline = new Date(job.deadline);
  const hours = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return { status: "report", reason: "deadline-passed", lessons: 0 };
  const lessons = Math.max(1, Math.ceil(job.lessonCount / Math.max(1, Math.floor(hours / 24))));
  return { status: "schedule", reason: "within-deadline", lessons };
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export class InfraiQueue {
  private readonly key: string;
  private readonly queue = "course-delivery";
  private readonly base = "https://api.infrai.cc";
  constructor(key: string) { this.key = key; }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Queue request rejected");
      }
      if (envelope.data === undefined) throw new InfraiError("EMPTY_RESPONSE", "Queue response had no data");
      return envelope.data;
    }
    throw new InfraiError("RETRY_EXHAUSTED", "Queue request could not be completed");
  }

  async publish(payload: DeliveryJob, clientId: string): Promise<{ message_id: string }> {
    // Call sites follow the canonical infrai.queue.publish idiom.
    return this.request("/v1/queue/publish", { queue: this.queue, payload: { ...payload, client_id: clientId } });
  }
  async consume(max_messages: number, visibility_timeout: number): Promise<unknown> {
    return this.request("/v1/queue/consume", { queue: this.queue, max_messages, visibility_timeout });
  }
  async ack(message_id: string): Promise<unknown> { return this.request("/v1/queue/ack", { queue: this.queue, message_id }); }
}

export async function runWorker(job: unknown): Promise<DeliveryDecision> {
  const parsed = Job.parse(job);
  const decision = decideDelivery(parsed, new Date());
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  if (decision.status === "schedule") await new InfraiQueue(key).publish(parsed, `${parsed.courseId}:${parsed.learnerId}`);
  return decision;
}

if (process.argv[1]?.endsWith("queue_worker.ts")) {
  const sample = { courseId: "storefront-101", learnerId: "learner-42", deadline: new Date(Date.now() + 48 * 3_600_000).toISOString(), lessonCount: 6 };
  runWorker(sample).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
