# kynantokoro.com

Personal website and blog. pnpm monorepo; the site is React Router v7 on Cloudflare Workers, with content from Sanity CMS.

## Packages
- `packages/website` — the site (React Router v7 + Cloudflare Workers). Most work happens here.
- `packages/website-cms` — Sanity Studio (content schema + CMS UI).
- `packages/projects` — git submodule of interactive WASM / LÖVE.js demos, built and served under `/projects/<slug>` and embedded via iframe. The whole site is cross-origin isolated (COOP/COEP) so SharedArrayBuffer works; embeds must be same-origin and self-contained (no CDN-loaded resources).

## Commands (run from `packages/website` unless noted)
- `pnpm dev` — dev server (applies the same COOP/COEP headers as production)
- `pnpm --filter website typecheck` — typecheck
- `pnpm --filter website test` — unit tests (vitest)
- `pnpm --filter website build` — build the Worker bundle
- `pnpm build:projects` (from repo root) — build the interactive demos into `packages/website/public/projects`

## Git & deploy workflow
- **Branch-first:** start from `main`, create a `feature/*` or `chore/*` branch, and do all work there. Never commit directly to `main`.
- **Pushing to `main` triggers a production deploy** (`.github/workflows/deploy-workers.yml`) → kynantokoro.com, draft.kynantokoro.com, and the CMS.
- **PRs to `main` get a temporary preview deploy** (`.github/workflows/preview.yml`, via `wrangler versions upload`); the preview URL is posted as a PR comment and production is unaffected.
- Merging to `main` is the manual release gate, done by the maintainer.

## Conventions
- Do not add `Co-Authored-By` or tool signatures to commit messages.
- Never commit secrets. Local dev: `.env` (gitignored). Production: Cloudflare Worker secrets. Claude Code web: sandbox environment variables.
- Sanity environment variables: `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_PERSPECTIVE`, `SANITY_TOKEN` (plus `ANTHROPIC_API_KEY` for the CMS translation feature).
- Sanity has a single dataset: `production`.
