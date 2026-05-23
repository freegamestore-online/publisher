# freegamestore-publisher

Self-service publish portal for [FreeGameStore](https://freegamestore.online). Creators use this to submit and manage their games on the store.

- **Live:** https://publish.freegamestore.online
- **Stack:** React 19 + Vite, Cloudflare Pages + Workers, KV for creator sessions

## Development

```bash
pnpm install
pnpm dev        # starts Wrangler Pages dev + Vite
```

## Build

```bash
pnpm build      # type-check + Vite build → web/dist
```

## Deploy

Push to `main` — GitHub Actions deploys automatically via Cloudflare Pages.

The worker uses two KV namespaces (`CREATORS`, `SESSIONS`) configured in `wrangler.toml`.
