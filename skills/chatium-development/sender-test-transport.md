# Internal test transport

Use the built-in Sender transport to test and debug customer messaging with scripts,
without a Telegram account, mailbox or external recipient. It records incoming and
outgoing messages in ordinary Sender chats/feeds and an account-local test journal.
It does not contact external providers or enter billing. No external transport
registration, production channel or fake recipient address is required.

Missing external channels and real test contacts must not stop process design,
build or supported internal tests. Explain the internal test path to the owner
and record connection of the real provider as a launch prerequisite. This does
not disable SDK validation for real sends: `mailings.send`, production automations
and AI routing are not automatically redirected. Use a supported guarded callback
integration; identify any unsupported case separately and continue the rest of
the build. Never put the internal channel ID into production senderChannels.

## Prepare a protected run

The transport requires installed Start and Sender plugins and a server-issued
`ProcessTestContext` from `@start/sdk`. Check current SDK typings and
`getProcessTestCapabilities(ctx)` before effects. The plan at
`<process>/tests/plan.yaml` declares the scenario, expected results, script,
capabilities and all significant source paths, including callback implementations.
Publish that source version first. Use the `processes` skill's
`formats/test-records.md` for the plan, context creation and report workflow.

The Developer context fixes the account, process, branch, source hashes, provider
versions and permitted resources. For an internal-only run, `contacts: []` and
`channels: []` are valid. Sender creates its own channel and synthetic peers.
A branch, `test: true` or a run ID alone grants no access. Keep the context token
outside Git, reports and logs. Do not change production subscriptions, senderChannels
or testOnly to enable this transport.

## SDK lifecycle

Import these methods from `@sender/sdk`. Every mutation takes
`(ctx, context, requestId, input)`. Use a stable request ID per operation and inspect
the outer `status` (`completed`, `blocked`, `pending`, `uncertain`), then the inner
delivery result. `completed` alone does not prove successful delivery.

| Method | Input | Important result |
| --- | --- | --- |
| `createTestTransport` | `{title?, callbacks?: {incoming?, outgoing?}, maxEvents?}` | `result.sessionId`, `result.channelId` |
| `createTestTransportPeer` | `{sessionId, key, title?}` | `result.peerId`, `chatId`, `personId` |
| `receiveTestTransportMessage` | `{sessionId, peerId, message: {text?, files?, replyToId?}}` | `result`: incoming event and callback state |
| `sendTestTransportMessage` | `{sessionId, peerId, message}` | `result.result`: ordinary Sender result; `result.event`: journal event when created |
| `configureTestTransportDelivery` | `{sessionId, peerId, mode: 'success' \| 'fail' \| 'deferred', failure?}` | Selected simulated delivery mode |
| `completeTestTransportDelivery` | `{sessionId, peerId, eventId, state: 'accepted' \| 'delivered' \| 'read' \| 'failed', failure?}` | Updated deferred event |
| `closeTestTransport` | `sessionId` string | Session closed; fixtures and evidence retained |

Capabilities are `sender.transport.create`, `.peer`, `.receive`, `.send`,
`.configure`, `.complete`, `.history` and `.close`. They use the existing Start
operation dispatcher; do not register an account hook to grant access.

`getTestTransportHistory(ctx, context, {sessionId, peerId?, direction?, after?, limit?},
{capture?})` performs one bounded read, with `limit` 1–100 (default 50). Use the
returned `nextAfter` as the next `after`. A script owns polling, backoff and timeout;
do not sleep in a server request. `capture:true` retains the final observation.
History includes message content, files/buttons, sequence, callback outcomes and
simulated delivery transitions. It remains readable after closing the run.

Outgoing `message` supports text/HTML/Markdown variants, files, buttons, format,
isMailing and isNotification; use exported `TestTransportMessage` typings.
Files carry actual platform storage hashes and URLs: upload via [Storage](storage.md),
do not invent hashes. Incoming reply targets must exist in that peer's feed.

## Callback integration

Callbacks are account `app.function` RouteRefs or their serialized
`[accountId, path, pattern]` refs. Each function must be inside the tested process
and its source must be declared in the scenario. URLs and plugin functions are
rejected. Verify the Sender plugin caller in the callback. Its body is:

```ts
{
  testContext, runId, sessionId, peerId, channelId, chatId,
  eventId, sequence, direction, message, state, simulated: true
}
```

This is trusted Developer code, **not a sandbox**. Use the supplied context for
guarded process/CRM/AI operations and `eventId` in stable request IDs. Custom effects
must stay within the run. Do not log the body: it contains the capability token.

An incoming callback can start a protected AI dialogue. A script then polls
`agents.state` until a reply for that turn is complete and passes the actual reply
to `sendTestTransportMessage`. Alternatively, implement the process's protected
continuation explicitly. Do not substitute a canned reply when checking AI output.
Do not build an unbounded callback echo loop: default maximum is 100 events per
session (configurable 1–1000), at most 100 peers per session and 20 sessions per run.

Incoming uses Sender's real external normalizer and native feed storage. Outgoing
uses ordinary Sender policy checks and the feed writer. Synthetic incoming peers
and the channel bot have different authors, preserving native message direction.
Global message/webhook/bucket hooks, production CRM identity linking and metrics
are suppressed. A `/start bucket-...` is test text. Ordinary manual/SDK sends to
the owned test chat also use this backend, but without a helper request ID they
are distinct operations rather than idempotent test sends.

## Outcomes, diagnosis and cleanup

- `success` stores outgoing history and records `accepted`.
- `fail` records the configured failure without adding an outgoing feed message.
- `deferred` records `pending`; complete it explicitly. Successful progression is
  monotonic; failure is allowed only before acceptance. Completion writes the feed
  once and does not invoke the outgoing callback again.

Callback states are `none`, `pending`, `completed`, `blocked`, `uncertain`. A thrown
callback can already have performed effects: preserve the recorded message and
inspect its event ID, callback error and trace. Do not automatically replay it.
For a lost response, use Start `executeProcessTestOperation` with `reconcile:true`,
the original operation, requestId and original input. Reconciliation reads facts;
it never resends a message. Changed inputs with the same ID are rejected.
Unresolved outcomes stay incomplete; explicit Start acknowledgement permits cleanup
without pretending the outcome is known.

Close a session to prevent further messages/callbacks. Before final cleanup, close
the process context and reconcile pending operations. `sender.cleanup` closes all
owned transport sessions, disables their channels and hides/blocks only their chats.
It retains journals/feeds and does not recall in-flight effects or delete real chats.

## What this proves

The transport can prove process reactions, conditions, content/attachments,
guarded tool effects, ordering, deduplication, failures and simulated delivery.
It does **not** prove real inbox receipt, Telegram/email provider formatting,
production AI channel routing, external queues/rate limits, billing, mailing
statistics or real identity/bucket handoff. Test those contracts separately when
they matter. `delivered`/`read` here are explicitly simulated; neither means a
person received or read a real message.
