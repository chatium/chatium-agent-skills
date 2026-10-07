---
title: Using websocket to perform realtime updates
description: >
  Describes how to use websocket technology in Chatium to perform delivery async events from backend
  to frontend.
---

# Using websocket to perform realtime updates

You can use Chatium platform to perform realtime updates with websocket.

This task perform in multiple steps.

Step 1: Select socketId. This should not be generated, use some stable id. For example, we will use thread id.

Step 2: Implement sending data to socket. This should be achieved in server side:

```typescript
import { sendDataToSocket } from '@app/socket'

await sendDataToSocket(ctx, socketId, {
  type: 'socket-data',
  data: {
    message: `Sending data to socket! Iteration`,
  },
})
```

Step 3: You should pass encoded socket id from server to client. In this example, we will do this in html rendering:

```tsx
import { genSocketId } from '@app/socket'
import { jsx } from '@app/html-jsx'
// Inside the page handler, after authorizing access to this socket's data:
const encodedSocketId = await genSocketId(ctx, socketId)

return <VuePage encodedSocketId={encodedSocketId} />
```

Step 4: Subscribe in the Vue component. Keep this component's socket prop stable; remount it when the target changes.

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getOrCreateBrowserSocketClient } from '@app/socket'

const props = defineProps<{ encodedSocketId: string }>()
const dataFromSocket = ref<unknown[]>([])
const error = ref('')
let disposed = false
let unsubscribe: (() => void) | undefined

onMounted(async () => {
  try {
    const socketClient = await getOrCreateBrowserSocketClient()
    if (disposed) return
    unsubscribe = socketClient.subscribeToData(props.encodedSocketId, data => {
      if (!disposed) dataFromSocket.value.push(data)
    })
  } catch {
    if (!disposed) error.value = 'Could not connect to live updates'
  }
})

onUnmounted(() => {
  disposed = true
  unsubscribe?.()
})
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <pre v-for="(data, index) in dataFromSocket" :key="index">{{ data }}</pre>
</template>
```

Important notes:
To send socket you MUST use NON-encoded socket id
To subscribe to socket you MUST use ENCODED socket id.

This websocket implementation is not intended to transform high amount of data, such as video.
If user need to stream video (WebRTC), advise him to integrate with other services.
