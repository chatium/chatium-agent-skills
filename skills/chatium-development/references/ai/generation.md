---
title: "Performing programming AI-generation"
description: "Use this example if you need to know how: perform ai-generation, add tools to existing usage of ai-generation, if you need to know how to use method `startCompletion` from `@start/sdk`"
---

# Example of using AI generation in your code

You can use API to perform AI generation inside Chatium environment. This example assumes an existing server-side `Generations` table with optional `response`, `error` and `costTokens` fields; import that application's table before using it.

```typescript
// This should be backend file

import {
  CompletionCompletedBody, // schema of completion completed callback
  CompletionFailedBody, // schema of completion failed callback
  CompletionBilledBody, // schema of completion billed callback
  startCompletion, // main api method to start completion
} from '@start/sdk'

async function initializeGeneration(ctx: app.Ctx, generationId: string) {

  /**
   * IMPORTANT! startCompletion method DOES NOT return generation result.
   * The only way to get result - use onCompletionCompleted api.
   * Store this information in your `.CHATIUM-LLM.md` file
   */
  await startCompletion(ctx, {
    onCompletionCompleted: onCompletionCompleted, // Successful completion callback
    onCompletionFailed: onCompletionFailed, // Failed completion callback
    onCompletionBilled: onCompletionBilled, // Completion billed callback, optional
    system: `You are helpful assistant`,
    model: 'chatium/agent-basic-1',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Hello, how are you? Check this photo! Also listen my voice message, what do you think?"
          },
          {
            type: 'image',
            source: {
              type: 'url',
              url: '<put_here_real_image_url>'
            }
          },
          {
            type: 'audio',
            source: {
              type: 'url',
              url: '<put_here_real_audio_url>'
            }
          }
        ]
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "Hello, I'm fine. Photo looks beautiful. Your voice message is absolute masterpiece!"
          }
        ]
      },
    ],
    nativeTools: ['crawl'], // "crawl" is builtin tool allowing generation crawling websites
    context: { // You can put into context ANYTHING what you want. You will receive it on `onCompletionCompleted` callback
      generationId,
    },
  })
}

/**
 * This is `onCompletionCompleted` callback definition.
 * Should be defined only this style, because completion could take a huge amount of time
 * So we define static function here
 */
const onCompletionCompleted = app
  .function('/onCompletionCompleted')
  .body(CompletionCompletedBody) // Use body schema
  .handle(async (ctx, body: CompletionCompletedBody, caller) => {
    // Always check that function called from "start" application
    if (!(caller.type === 'plugin' && caller.appSlug === 'start')) {
      throw new Error(`Invalid caller`)
    }

    const { generationId } = body.context ?? {}
    if (typeof generationId !== 'string' || !generationId) throw new Error('Missing generationId')

    // body.messages contains all messages generated in this completion, including tool calls and tool responses

    const messageTexts: string[] = []
    const latestMessage = body.messages[body.messages.length - 1]
    for (const block of latestMessage?.content ?? []) {
      if (block.type == 'text') {
        messageTexts.push(block.text)
      }
    }



    // You can store response as you want. For example, we store response as part of our generation model

    await Generations.update(ctx, {
      id: generationId,
      response: messageTexts.join('\n')
    })

    // Afterthat, you can send generated data to client using websockets

    // If you need to store full chat history - use all messages from body.messages
    // body.messages contains only this turn generated messages

    return null
  })

/**
 * This is `onCompletionFailed` callback definition.
 * Should be defined only this style, because completion could take a huge amount of time
 * So we define static function here
 */
const onCompletionFailed = app
  .function("onCompletionFailed")
  .body(CompletionFailedBody)
  .handle(async (ctx, body: CompletionFailedBody, caller) => {
    // Always check that function called from "start" application
    if (!(caller.type === "plugin" && caller.appSlug === "start")) {
      throw new Error(`Invalid caller`);
    }

    const { generationId } = body.context ?? {}
    if (typeof generationId !== 'string' || !generationId) throw new Error('Missing generationId')

    await Generations.update(ctx, {
      id: generationId,
      error: body.error,
    })
  });

const onCompletionBilled = app
  .function("onCompletionBilled")
  .body(CompletionBilledBody)
  .handle(async (ctx, body: CompletionBilledBody, caller) => {
    // Always check that function called from "start" application
    if (!(caller.type === "plugin" && caller.appSlug === "start")) {
      throw new Error(`Invalid caller`);
    }

    const { generationId } = body.context ?? {}
    if (typeof generationId !== 'string' || !generationId) throw new Error('Missing generationId')


    await Generations.update(ctx, {
      id: generationId,
      costTokens: body.costTokens, // number of tokens cost
    })
  })

```

## available models

You can use any model from openrouter (https://openrouter.ai/models)
Recommended model: `chatium/agent-basic-1`. Use this model awlays, until user ask you to use other model. If user provided model -se it as provided.
And feel free to use any explicit model provided you by user

## Инструменты генерации

Передавай пользовательские функции через `tools`; их контракт и пример находятся в [tools.md](tools.md#tools-для-standalone-startcompletion). Встроенные инструменты включаются через `nativeTools`.

The difference between nativeTools and tools:

**nativeTools** are system-provided tools — these are built into the platform itself. For example, tools like crawl or other low-level utilities are part of this set. You don’t define them manually; they’re available by default and maintained by the system.

Available native tools:

crawl: allowing AI crawling websites
generate-video: allowing AI generate videos
generate-image: allowing AI generate images

Example enabling native tools:

```typescript
await startCompletion(ctx, {
  // ...
  nativeTools: [
    { name: 'generate-image', model: 'chatium/flux' }, // this is preferred model to generate images
    { name: 'generate-video', model: 'wan/2-2-a14b' },
  ]
  // ...
})
```

You can also use these models for generating images:
google/nano-banana-pro
google/gemini-2.5-flash-image


**tools**, on the other hand, are custom tools that can be created by the user or the AI programming assistant. These are defined explicitly in your code and passed to startCompletion to extend the assistant’s capabilities with app-specific logic.
