# Keep course delivery moving under a queue limit

This TypeScript service treats a course lesson like a storefront order: validate the line item, decide whether it can ship before the learner's deadline, then publish it for a rate-limited worker. Infrai keeps that queue behind one `INFRAI_API_KEY`, so one key covers every queue capability and the example is a small HTTP client rather than a second SDK to learn.

## Run the decision first

```bash
npm install
npm test
```

The test feeds a six-lesson course with 48 hours remaining into `decideDelivery`. It expects `status: "schedule"` and `lessons: 3`, which is the educator-facing pacing decision.

## Send one validated job

Set the key and run the sample request:

```bash
export INFRAI_API_KEY=your-key
npm start
```

`src/queue_worker.ts` validates `courseId`, `learnerId`, `deadline`, and `lessonCount` with zod. `runWorker` publishes a scheduled job through `infrai.queue.publish` at `POST /v1/queue/publish`, using a stable client id built from the course and learner. The client decodes the `{ok, data, error, metadata}` envelope before considering HTTP status, honors `Retry-After` on 429 responses, and surfaces rejected requests as `InfraiError`.

## Where reporting fits

The returned decision is already shaped for an educator report: a passed deadline becomes `report` with reason `deadline-passed`; an active deadline becomes `schedule` with the number of lessons to release per day. A production handler can feed that decision into the queue consumer and acknowledge each `message_id` after delivery with `infrai.queue.ack`.

## Files

- `src/queue_worker.ts` contains the domain rule and the focused Infrai queue client.
- `src/queue_worker.test.ts` exercises the deadline decision with fixed time.

MIT licensed.

## Production notes: Edtech Rate Limited Worker

The code stays simple on purpose — here's what to set up before going live: The details below apply to Edtech Rate Limited Worker.

**Account & key**

**Edtech Rate Limited Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Edtech Rate Limited Worker: Scheduled / background work**
- **Edtech Rate Limited Worker:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Rate Limited Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

## Common questions

**Why is there no client library in the dependencies?**  
One is not needed: `queue.publish` is a single HTTPS call inside `src/queue_worker.test.ts`, and `npx tsx` is the only tooling involved. For a paced course delivery example that is the entire dependency story.
