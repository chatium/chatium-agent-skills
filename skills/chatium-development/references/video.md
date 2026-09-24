---
title: Примеры вставки видеоплеера
description: Используй этот пример если нужно вставить видеоплеер
---

# Видеоплеер

Ты умеешь показывать видеоплеер по хешу файла.

Для этого нужно на бекенде получить videoInfo

```typescript
import { getVideoInfo } from "@app/storage"; // это можно вызвать только на бекенде (не в .vue файле)
import { getThumbnailUrl } from "@app/storage";


const videoInfo = await getVideoInfo(ctx, config.videoHash);
// Добавляем постер если его нет, но есть hash
let poster = videoInfo.poster;
if (!poster && config.videoHash) {
  poster = getThumbnailUrl(ctx, config.videoHash, 800, 450);
}
```

Выдается videoInfo, которую можно использовать для выдачи плеера плеера. Для вставки плеера в качестве источника видео используй hlsUrl или mp4Url
```json
{
  "hash": "<video_hash>",
  "url": "mp4",
  "hlsUrl": "hlsUrl",
  "mp4Url": "mp4Url",
  "status": "done",
  "progress": 100,
  "imageUrl": "imageUrl",
  "videoSize": {
    "width": 443000,
    "height": 960000
  },
  "videoAspectRatio": [
    443,
    960
  ]
}
```
