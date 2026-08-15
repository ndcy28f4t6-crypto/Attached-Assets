---
name: API client regeneration
description: Steps to rebuild generated packages after changing the OpenAPI spec
---

## The constraint
`my-day-ai` and `api-server` use TypeScript project references to consume `lib/api-client-react`, `lib/api-zod`, and `lib/db`. Each of these packages has `composite: true` and `emitDeclarationOnly: true` — they must emit `.d.ts` files into their own `dist/` before consumers can see new exports.

## Why it matters
After running orval or changing a schema, the frontend will show "Module has no exported member" errors even though the source file contains the export. The root cause is always a stale `dist/` in the referenced package.

## How to apply
After editing `openapi.yaml`: `cd lib/api-spec && pnpm orval`, then `cd lib/api-client-react && pnpm tsc --build`, then `cd lib/api-zod && pnpm tsc --build` if needed.
After editing `lib/db/src/schema/`: `cd lib/db && pnpm tsc --build`.
Then re-run the consumer's typecheck.
