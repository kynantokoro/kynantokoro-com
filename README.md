# kynantokoro.com

Personal bilingual website and blog built with React Router 7, Sanity CMS, and Cloudflare Workers.

> **Note**: This repository uses a private git submodule for experimental projects. See [SUBMODULE_SETUP.md](./SUBMODULE_SETUP.md) for details.

## Tech Stack

- React Router 7 + Cloudflare Workers
- Sanity CMS with Portable Text
- Tailwind CSS
- AI translation with Claude

## Structure

```
kynantokoro-com/
├── packages/
│   ├── website/        # Main website
│   ├── website-cms/    # Sanity Studio
│   └── projects/       # Experimental games/projects (private submodule)
└── SUBMODULE_SETUP.md  # Setup guide for projects submodule
```

## Development

```bash
# Clone with submodules
git clone --recursive <repo-url>

# Install
pnpm install

# Dev server (website)
pnpm dev

# Dev server (projects)
pnpm dev:projects

# Build everything (projects + website)
pnpm build

# Deploy
pnpm deploy
```

## Deployment

See [docs/DEPLOYMENT_COMPARISON.md](./docs/DEPLOYMENT_COMPARISON.md) to choose your deployment method:

- **Cloudflare Pages** (recommended): Simple GitHub App integration
- **GitHub Actions**: Advanced CI/CD with custom workflows

## Environment Setup

**`packages/website/.env`**
```bash
SANITY_PROJECT_ID=your-project-id
SANITY_DATASET=production
ANTHROPIC_API_KEY=your-api-key
```

**`packages/website-cms/.env`**
```bash
SANITY_PROJECT_ID=your-project-id
SANITY_DATASET=production
SANITY_STUDIO_TRANSLATION_API_URL=http://localhost:5174/translate
```

## License

MIT License - see LICENSE file for details

Note: The `packages/projects` submodule is private and not included in this license.
