# Robots and sitemap

For fixed content, place `robots.txt` and `sitemap.xml` at the workspace root. For generated content, create `robots.txt.ts` and `sitemap.xml.ts`; file-based routing supplies the public filenames while each file still declares `/`.

```ts
// robots.txt.ts
export const robotsRoute = app.get('/', ctx => {
  ctx.resp.setHeader('content-type', 'text/plain; charset=utf-8')
  return 'User-agent: *\nAllow: /\n'
})
```

```ts
// sitemap.xml.ts
export const sitemapRoute = app.get('/', ctx => {
  ctx.resp.setHeader('content-type', 'application/xml; charset=utf-8')
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
})
```

Generate absolute canonical URLs for sitemap entries and XML-escape dynamic values.
