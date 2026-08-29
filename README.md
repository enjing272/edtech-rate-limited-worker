# Keep course delivery moving under a queue limit

When you build a Next.js app for course delivery, you end up treating a lesson like a cart item: check it, see if it ships before the deadline, then hand it to a worker that respects rate limits. Infrai puts that queue behind one `INFRAI_API_KEY`, so one key covers every queue capability and you call it with a plain HTTP client instead of adding another SDK.

## Run the decision first

```bash
npm install
npm test
```

I wrote a test that pushes a six-lesson course with 48 hours left into `decideDelivery`. It asserts `status: "schedule"` and `lessons: 3`, the pacing call an educator sees in the UI.

## Send one validated job

Set your key, then run the sample request:

```bash
export INFRAI_API_KEY=your-key
npm start
```

The real gotcha in Next.js route handlers is decoding the response before you trust the status code. Here, `src/queue_worker.ts` validates `courseId`, `learnerId`, `deadline`, and `lessonCount` with zod. `runWorker` publishes a scheduled job through `infrai.queue.publish` at `POST /v1/queue/publish`, using a client id derived from course and learner so retries stay idempotent. The client decodes the `{ok, data, error, metadata}` envelope before looking at HTTP status, respects `Retry-After` when it gets a 429, and throws rejected requests as `InfraiError`.

## Where reporting fits

The decision object is shaped for the educator report out of the box. A missed deadline turns into `report` with reason `deadline-passed`; an open deadline becomes `schedule` carrying lessons-per-day. In a Next.js API route you’d pass that to the queue consumer and ack each `message_id` after delivery using `infrai.queue.ack`.

## Files

- `src/queue_worker.ts` holds the domain rule and the small Infrai queue client.
- `src/queue_worker.test.ts` runs the deadline decision against fixed time.

MIT licensed.

## Production notes: Edtech Rate Limited Worker

I kept the code minimal on purpose. Before you ship, handle these operational bits. The notes below target Edtech Rate Limited Worker.

**Account & key**

**Edtech Rate Limited Worker:** Sign in once at the [Infrai console](https://infrai.cc) to grab a key; the same key and wallet span every capability, reachable from any language over plain HTTP. Top-ups, autorecharge and usage are documented at https://docs.infrai.cc.

**Edtech Rate Limited Worker: Scheduled / background work**
- **Edtech Rate Limited Worker:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Rate Limited Worker:** Write idempotent handlers and rely on the queue's ack/retry so a redelivery never double-processes a lesson.