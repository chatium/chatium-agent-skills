---
title: Встройка скрипта формы геткурса на Vue
description: Используй этот пример для встраивания предоставленного пользователем скрипта формы GetCourse в Vue, включая показ в модальном окне без перезагрузки iframe.
---

# Как встроить скрипт формы геткурса (GetCourse) на страницу Vue

Используй embed-код нужной формы, предоставленный пользователем. Сохрани его `id` и `src`; если кода нет, запроси его. В примере `getcourseScriptId` и `getcourseScriptSrc` — эти значения из проверенного embed-кода, а не поля публичного запроса.

Добавь форму на страницу следующим образом:

1. Размести в серверном коде генерации страницы этот скрипт в div:

```tsx
<body>
  <div id="allGetcourseForms">
    <div id="getcourseForm1" style="display: none;"><script id={getcourseScriptId} src={getcourseScriptSrc}></script></div>
  </div>
</body>
```

2. Размести код в компоненте Vue который перенесёт форму в нужное место:

```vue
<template>
  <div ref="getcourseWidgetContainer" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const getcourseWidgetContainer = ref<HTMLElement | null>(null)

onMounted(() => {
  const form = document.getElementById('getcourseForm1')
  if (form && getcourseWidgetContainer.value) {
    getcourseWidgetContainer.value.appendChild(form)
    form.style.display = 'block'
  }
})

// Keep the form mounted so its iframe is not reloaded.
onBeforeUnmount(() => {
  const form = document.getElementById('getcourseForm1')
  const staging = document.getElementById('allGetcourseForms')
  if (form && staging) {
    staging.appendChild(form)
    form.style.display = 'none'
  }
})
</script>
```

3. Если форму нужно показать в Popup (модальном окне) - сделай так чтобы попап и форма в нём отрендерились сразу при рендеринге страницы, просто скрой его через директиву v-show и реактивную переменную. Благодаря этому, форма не будет перезагружаться, а модальному окну можно будет задать анимацию через блок Transition. Это очень важно, если постоянно переносить iframe - то
он будет перезагружаться, а это приводит к плохому поведению
