---
title: "Typed AI decisions"
description: "Read when code must classify, route, score, or check a yes/no condition with an AI model and branch on the answer, or locate an object in an image: `makeDecision` from `@start/sdk`."
---

# Typed AI decisions with `makeDecision`

`makeDecision` asks a decision model narrow typed questions about a **state** and returns calibrated probabilities instead of text. It is one synchronous server-side call: the answers are in the returned value, with no callbacks, history or tools.

Use it wherever the code branches on the answer: a label, a yes/no gate, a level on a scale, a box in an image. For prose, free-form JSON, explanations or tool use, use [`startCompletion`](ai-generation.md).

```typescript
// backend file
import { makeDecision } from '@start/sdk'

const { answers } = await makeDecision(ctx, {
  model: 'typesafe/jev-1.14',
  state: { customerTier: 'enterprise', ticket: ticketText },
  questions: {
    isBug: {
      type: 'noul',
      instructions: 'Is the customer reporting a software defect?',
      criteria: {
        true: 'Broken or unexpected product behavior',
        false: 'A question or a feature request',
      },
    },
    team: {
      type: 'choice',
      instructions: 'Which team should own this ticket?',
      criteria: {
        payments: 'Checkout, billing, payment processing',
        frontend: 'Rendering, layout, browser issues',
        account: 'Login, permissions, profile',
      },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is this ticket?',
      criteria: ['Can wait', 'This week', 'Blocking revenue now'],
    },
  },
})

if (answers.isBug.noul > 0.8 && answers.team.confidence > 0.6) {
  await routeTicket(ctx, answers.team.choice) // 'payments' | 'frontend' | 'account'
}
```

Answers are typed from `questions`: `answers.team.choice` is the union of the `criteria` keys, so no type guards are needed.

## Questions

Put every question about one state into one call: the state is paid for once per call.

| `type` | Asks | `criteria` | Answer fields |
| --- | --- | --- | --- |
| `noul` | Does the condition hold? | optional `{ true, false }` descriptions | `noul`: probability of yes, 0–1 |
| `choice` | Which one option? | `{ key: description }` | `choice` (a key), `probabilities` per key, `confidence` |
| `score` | Where on an ordered scale? | levels from lowest to highest | `score` (weighted position, 0 = first level), `probabilities`, `legend`, `confidence` |
| `box` | Where in the image is the target? | none; describe the target in `instructions` | `box: { top, bottom, left, right }` as fractions of the image, `confidence` |

`box` always returns edges, even when the target is absent: pair it with a `noul` question about the target's presence.

## State

`state` is a string, a JSON object, or an array of related context. Images go into the array as `{ type: 'image_url', image_url: { url } }` parts.

## Models

Default to `typesafe/jev-1.14`; `~typesafe/jev-latest` tracks the newest Jev. The `model` field autocompletes the supported OpenRouter decision models and also accepts any other decision model id as a string.

- `box` works only with `typesafe/jev-1.14` and `~typesafe/jev-latest`; the types reject it for other listed models.
- Text-only models (no images in `state`): `microsoft/microsoft-decision-1`, `upstage/solar-decide`, `upstage/solar-decide-flash`, `nace-ai/drex-v1.5`, `nace-ai/drex-v2.0`.

## Thresholds

Choose each threshold from the cost of each kind of mistake, tuned on a small labeled sample. `noul: 0.5` means the model is unsure, not that the condition holds halfway. Probabilities differ between models on the same question, so re-tune thresholds when switching models.

## Result, cost and errors

The call returns `{ id, model, answers, usage: { costTokens } }`, where `model` is the dated snapshot that answered. Each call is charged to the account balance: a typical call costs 0.01 token, and only very large states cost several tokens.

`makeDecision` throws:

- `Insufficient balance` when the balance is below 1 token;
- `Invalid decision request: …` when the request does not fit the model (fix the questions, state or model);
- `Decision rate limit exceeded` (retry later) or `Decision service is temporarily unavailable`.

Wrap the call in `try/catch` wherever a failed decision has a safe fallback, such as sending the item to a human queue.
