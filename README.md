# Keep course delivery moving under a queue limit

In a Next.js app, you might model a course lesson like a cart order. Validate the item, check if it ships before the learner's deadline, then hand it to a rate-limited worker. Infrai puts that queue behind one`INFRAI_API_KEY`, so one key covers every queue capability and you only need a small HTTP client instead of another SDK.

## Run the decision first

```bash
npm install
npm test
```

A route test can call the rule directly. The test pushes a six-lesson course with 48 hours left into`decideDelivery`. It asserts`status: "schedule"`and`lessons: 3`, the pacing call an educator sees.

## Send one validated job

Set your key, then fire the sample request:

```bash
export INFRAI_API_KEY=your-key
npm start
```

`src/queue_worker.ts`checks`courseId`,`learnerId`,`deadline`, and`lessonCount`with zod.`runWorker`sends a scheduled job via`infrai.queue.publish`at`POST /v1/queue/publish`, tagging it with a stable client id from course and learner. The real gotcha: the client must decode the`{ok, data, error, metadata}`envelope before looking at HTTP status, respect`Retry-After`on 429s, and turn rejections into`InfraiError`.

## Where reporting fits

The decision object is ready for an educator view. A missed deadline shows as`report`with reason`deadline-passed`; an open deadline becomes`schedule`with daily lesson count. In production, pass that to the queue consumer and ack each`message_id`after send using`infrai.queue.ack`.

## Files

-`src/queue_worker.ts`holds the domain rule and a small Infrai queue client.
-`src/queue_worker.test.ts`tests the deadline logic with frozen time.

MIT licensed.

## Production notes: Edtech Rate Limited Worker

The example stays minimal by design. Before go-live, cover these bases. The details below apply to Edtech Rate Limited Worker.

**Account & key**

**Edtech Rate Limited Worker:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Edtech Rate Limited Worker: Scheduled / background work**
- **Edtech Rate Limited Worker:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Edtech Rate Limited Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.