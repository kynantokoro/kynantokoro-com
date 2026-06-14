# Tech Blog Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the weekly-project/blog dual-type from the site, making `entry` a single tag-centric blog post, and add 2026-effective Agent Experience (AX) features: Markdown endpoints, JSON-LD, a tag index, and `tags.json`.

**Architecture:** Pure, testable logic lives in `app/lib/*` (Markdown serialization, tag aggregation, JSON-LD builders) with vitest unit tests. Thin React Router v7 routes consume those libs. `.md` and `tags.json` are top-level resource routes (loader returns a `Response`, like the existing `sitemap.xml`); the human tag index is a normal page under the `:lang` layout. A one-off Node script unsets `entryType`/`week` from existing Sanity documents.

**Tech Stack:** React Router v7 (config routing), Cloudflare Workers, Sanity (`@sanity/client`, `@sanity/image-url`, `@portabletext/react`), TypeScript, vitest (to be added).

**Source spec:** `docs/superpowers/specs/2026-06-14-tech-blog-simplification-design.md`

**Working directory for all commands:** `packages/website` unless stated otherwise.

---

## File Structure

New files:
- `packages/website/vitest.config.ts` — vitest config (separate from `vite.config.ts` to avoid the Cloudflare plugin).
- `packages/website/app/lib/portableTextToMarkdown.ts` — PortableText → Markdown serializer (pure).
- `packages/website/app/lib/portableTextToMarkdown.test.ts`
- `packages/website/app/lib/tags.ts` — tag aggregation/filter helpers (pure).
- `packages/website/app/lib/tags.test.ts`
- `packages/website/app/lib/jsonLd.ts` — JSON-LD builders (pure).
- `packages/website/app/lib/jsonLd.test.ts`
- `packages/website/app/routes/entry-md.tsx` — `/:lang/entry/:slug.md` resource route.
- `packages/website/app/routes/tags[.]json.tsx` — `/tags.json` resource route.
- `packages/website/app/routes/tags.tsx` — `/:lang/tags` human tag index.
- `packages/website/scripts/migrate-remove-entrytype.ts` — one-off migration.

Modified files:
- `packages/website/package.json` — add vitest dep + `test` script.
- `packages/website-cms/schemaTypes/entry.ts` — drop `entryType`/`week`, add `summary`, fix `preview`.
- `packages/website/app/lib/sanity.ts` — drop `entryType`/`week` from queries, add `summary`.
- `packages/website/app/components/EntryCard.tsx` — drop `week`/`contentType`, drop Week badge.
- `packages/website/app/routes/home.tsx` — replace type filter with tag filter; add JSON-LD.
- `packages/website/app/routes/entry.$slug.tsx` — drop week display; add `.md` alternate link + JSON-LD.
- `packages/website/app/routes.ts` — register new routes.

### Design note: clickable tags

`EntryCard` is itself a single `<Link>` wrapping the whole card. Nesting `<a>`/`<button>` inside an anchor is invalid HTML, so **tags on cards stay as visual `<span>`s**. Clickable tag navigation is provided on (a) the home filter bar, (b) the entry detail page, and (c) the tag index page — none of which nest the tag inside another anchor. This honors the "browse by tag" vision without invalid markup.

---

## Task 1: Add vitest test infrastructure

**Files:**
- Create: `packages/website/vitest.config.ts`
- Modify: `packages/website/package.json`

- [ ] **Step 1: Add vitest config**

Create `packages/website/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['app/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 2: Add the dev dependency and script**

Run (from `packages/website`):

```bash
pnpm add -D vitest@^3
```

Then in `packages/website/package.json`, add to `"scripts"` (after the `"preview"` line):

```json
		"test": "vitest run",
		"test:watch": "vitest",
```

- [ ] **Step 3: Add a smoke test**

Create `packages/website/app/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test to verify the runner works**

Run: `pnpm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Remove the smoke test and commit**

```bash
rm app/lib/smoke.test.ts
git add packages/website/vitest.config.ts packages/website/package.json packages/website/pnpm-lock.yaml ../../pnpm-lock.yaml 2>/dev/null
git commit -m "chore: add vitest test infrastructure"
```

(If a lockfile path does not exist, drop it from the `git add` — only commit the lockfiles that actually changed.)

---

## Task 2: PortableText → Markdown serializer

**Files:**
- Create: `packages/website/app/lib/portableTextToMarkdown.ts`
- Test: `packages/website/app/lib/portableTextToMarkdown.test.ts`

Block value shapes are confirmed from the existing portable-text components:
`gameEmbed { gameSlug, title? }`, `audioPlayer { audioUrl, title? }`, `image { asset._ref, alt?, caption? }`, standard `block { style, listItem?, level?, children:[{text, marks?}], markDefs:[{_key,_type,href?}] }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/website/app/lib/portableTextToMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { portableTextToMarkdown } from './portableTextToMarkdown';

describe('portableTextToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(portableTextToMarkdown([])).toBe('');
    expect(portableTextToMarkdown(undefined)).toBe('');
  });

  it('serializes headings and paragraphs', () => {
    const blocks = [
      { _type: 'block', style: 'h2', children: [{ _type: 'span', text: 'Title' }] },
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: 'Hello world' }] },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('## Title\n\nHello world');
  });

  it('applies decorators and link annotations', () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        markDefs: [{ _key: 'l1', _type: 'link', href: 'https://x.test' }],
        children: [
          { _type: 'span', text: 'bold', marks: ['strong'] },
          { _type: 'span', text: ' and ' },
          { _type: 'span', text: 'link', marks: ['l1'] },
        ],
      },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('**bold** and [link](https://x.test)');
  });

  it('serializes tight lists', () => {
    const blocks = [
      { _type: 'block', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'a' }] },
      { _type: 'block', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'b' }] },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('- a\n- b');
  });

  it('serializes images with resolver and caption', () => {
    const blocks = [
      { _type: 'image', asset: { _ref: 'image-abc' }, alt: 'pic', caption: 'cap' },
    ];
    const md = portableTextToMarkdown(blocks, { resolveImageUrl: () => 'https://cdn/x.png' });
    expect(md).toBe('![pic](https://cdn/x.png)\n\n*cap*');
  });

  it('serializes game embeds and audio players as links', () => {
    const blocks = [
      { _type: 'gameEmbed', gameSlug: 'my-game', title: 'My Game' },
      { _type: 'audioPlayer', audioUrl: 'https://a/x.mp3', title: 'Track' },
    ];
    expect(portableTextToMarkdown(blocks, { siteUrl: 'https://s.test' })).toBe(
      '[▶ Play: My Game](https://s.test/projects/my-game)\n\n[🔊 Audio: Track](https://a/x.mp3)'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test portableTextToMarkdown`
Expected: FAIL — cannot find module `./portableTextToMarkdown`.

- [ ] **Step 3: Write the implementation**

Create `packages/website/app/lib/portableTextToMarkdown.ts`:

```ts
export interface PtSpan {
  _type: 'span';
  text: string;
  marks?: string[];
}

export interface PtMarkDef {
  _key: string;
  _type: string;
  href?: string;
}

export interface PtBlock {
  _type: 'block';
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  children?: PtSpan[];
  markDefs?: PtMarkDef[];
}

export interface PtImage {
  _type: 'image';
  asset?: { _ref: string };
  alt?: string;
  caption?: string;
}

export type PtNode =
  | PtBlock
  | PtImage
  | { _type: 'gameEmbed'; gameSlug?: string; title?: string }
  | { _type: 'audioPlayer'; audioUrl?: string; title?: string }
  | { _type: string; [key: string]: unknown };

export interface ToMarkdownOptions {
  resolveImageUrl?: (value: PtImage) => string;
  siteUrl?: string;
}

const DECORATORS: Record<string, string> = {
  strong: '**',
  em: '*',
  code: '`',
};

function serializeSpan(span: PtSpan, markDefs: PtMarkDef[]): string {
  let text = span.text ?? '';
  const marks = span.marks ?? [];
  for (const mark of marks) {
    const wrap = DECORATORS[mark];
    if (wrap) text = `${wrap}${text}${wrap}`;
  }
  for (const mark of marks) {
    const def = markDefs.find((d) => d._key === mark);
    if (def && def._type === 'link' && def.href) {
      text = `[${text}](${def.href})`;
    }
  }
  return text;
}

function serializeBlock(block: PtBlock): string {
  const markDefs = block.markDefs ?? [];
  const inner = (block.children ?? []).map((c) => serializeSpan(c, markDefs)).join('');
  if (block.listItem) {
    const indent = '  '.repeat(Math.max(0, (block.level ?? 1) - 1));
    const bullet = block.listItem === 'number' ? '1.' : '-';
    return `${indent}${bullet} ${inner}`;
  }
  switch (block.style) {
    case 'h1':
      return `# ${inner}`;
    case 'h2':
      return `## ${inner}`;
    case 'h3':
      return `### ${inner}`;
    case 'h4':
      return `#### ${inner}`;
    case 'blockquote':
      return `> ${inner}`;
    default:
      return inner;
  }
}

export function portableTextToMarkdown(
  blocks: PtNode[] | undefined | null,
  options: ToMarkdownOptions = {}
): string {
  if (!blocks || blocks.length === 0) return '';
  const siteUrl = options.siteUrl ?? 'https://kynantokoro.com';
  const items: { md: string; list: boolean }[] = [];

  for (const node of blocks) {
    switch (node._type) {
      case 'block':
        items.push({ md: serializeBlock(node as PtBlock), list: Boolean((node as PtBlock).listItem) });
        break;
      case 'image': {
        const img = node as PtImage;
        const url = options.resolveImageUrl ? options.resolveImageUrl(img) : img.asset?._ref ?? '';
        let md = `![${img.alt ?? ''}](${url})`;
        if (img.caption) md += `\n\n*${img.caption}*`;
        items.push({ md, list: false });
        break;
      }
      case 'gameEmbed': {
        const g = node as { gameSlug?: string; title?: string };
        if (g.gameSlug) items.push({ md: `[▶ Play: ${g.title ?? 'Game'}](${siteUrl}/projects/${g.gameSlug})`, list: false });
        break;
      }
      case 'audioPlayer': {
        const a = node as { audioUrl?: string; title?: string };
        if (a.audioUrl) items.push({ md: `[🔊 Audio: ${a.title ?? 'Audio'}](${a.audioUrl})`, list: false });
        break;
      }
      default:
        break;
    }
  }

  let out = '';
  for (let i = 0; i < items.length; i++) {
    if (i > 0) out += items[i].list && items[i - 1].list ? '\n' : '\n\n';
    out += items[i].md;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test portableTextToMarkdown`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/website/app/lib/portableTextToMarkdown.ts packages/website/app/lib/portableTextToMarkdown.test.ts
git commit -m "feat: add PortableText to Markdown serializer"
```

---

## Task 3: Tag aggregation helpers

**Files:**
- Create: `packages/website/app/lib/tags.ts`
- Test: `packages/website/app/lib/tags.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/website/app/lib/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { uniqueTags, aggregateTags, filterByTag, type TagEntry } from './tags';

const entries: TagEntry[] = [
  { slug: 'a', title: { en: 'A' }, date: '2026-01-01', tags: ['rust', 'gamedev'] },
  { slug: 'b', title: { en: 'B' }, date: '2026-02-01', tags: ['rust'] },
  { slug: 'c', title: { en: 'C' }, date: '2026-03-01', tags: [] },
];

describe('uniqueTags', () => {
  it('returns sorted unique tags', () => {
    expect(uniqueTags(entries)).toEqual(['gamedev', 'rust']);
  });
});

describe('aggregateTags', () => {
  it('groups entries by tag with counts', () => {
    const grouped = aggregateTags(entries);
    expect(grouped.rust.count).toBe(2);
    expect(grouped.rust.entries.map((e) => e.slug)).toEqual(['a', 'b']);
    expect(grouped.gamedev.count).toBe(1);
  });
});

describe('filterByTag', () => {
  it('returns all entries when tag is null', () => {
    expect(filterByTag(entries, null)).toHaveLength(3);
  });
  it('filters entries by tag', () => {
    expect(filterByTag(entries, 'rust').map((e) => e.slug)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tags`
Expected: FAIL — cannot find module `./tags`.

- [ ] **Step 3: Write the implementation**

Create `packages/website/app/lib/tags.ts`:

```ts
export interface TagEntry {
  slug: string;
  title: { en?: string; ja?: string };
  date: string;
  summary?: { en?: string; ja?: string };
  tags?: string[];
}

export interface TagGroup {
  count: number;
  entries: TagEntry[];
}

export function uniqueTags(entries: TagEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) for (const t of e.tags ?? []) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function aggregateTags(entries: TagEntry[]): Record<string, TagGroup> {
  const out: Record<string, TagGroup> = {};
  for (const e of entries) {
    for (const t of e.tags ?? []) {
      if (!out[t]) out[t] = { count: 0, entries: [] };
      out[t].count += 1;
      out[t].entries.push(e);
    }
  }
  return out;
}

export function filterByTag(entries: TagEntry[], tag: string | null): TagEntry[] {
  if (!tag) return entries;
  return entries.filter((e) => (e.tags ?? []).includes(tag));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tags`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/website/app/lib/tags.ts packages/website/app/lib/tags.test.ts
git commit -m "feat: add tag aggregation helpers"
```

---

## Task 4: JSON-LD builders

**Files:**
- Create: `packages/website/app/lib/jsonLd.ts`
- Test: `packages/website/app/lib/jsonLd.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/website/app/lib/jsonLd.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { blogPostingLd, blogLd } from './jsonLd';
import type { TagEntry } from './tags';

const entry: TagEntry = {
  slug: 'hello',
  title: { en: 'Hello', ja: 'こんにちは' },
  date: '2026-01-02',
  summary: { en: 'a post', ja: '投稿' },
  tags: ['rust', 'gamedev'],
};

describe('blogPostingLd', () => {
  it('builds a BlogPosting with localized fields', () => {
    const ld = blogPostingLd(entry, { lang: 'ja', siteUrl: 'https://s.test' });
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline).toBe('こんにちは');
    expect(ld.description).toBe('投稿');
    expect(ld.inLanguage).toBe('ja');
    expect(ld.keywords).toBe('rust, gamedev');
    expect(ld.url).toBe('https://s.test/ja/entry/hello');
    expect(ld.datePublished).toBe('2026-01-02');
  });

  it('falls back to en when the language is missing', () => {
    const ld = blogPostingLd({ ...entry, title: { en: 'Only EN' } }, { lang: 'ja', siteUrl: 'https://s.test' });
    expect(ld.headline).toBe('Only EN');
  });
});

describe('blogLd', () => {
  it('builds a Blog with an ItemList of posts', () => {
    const ld = blogLd([entry], { lang: 'en', siteUrl: 'https://s.test' });
    expect(ld['@type']).toBe('Blog');
    expect(ld.blogPost).toHaveLength(1);
    expect(ld.blogPost[0].url).toBe('https://s.test/en/entry/hello');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test jsonLd`
Expected: FAIL — cannot find module `./jsonLd`.

- [ ] **Step 3: Write the implementation**

Create `packages/website/app/lib/jsonLd.ts`:

```ts
import type { TagEntry } from './tags';

export interface LdContext {
  lang: string;
  siteUrl?: string;
}

function pick(obj: { en?: string; ja?: string } | undefined, lang: string): string {
  if (!obj) return '';
  return (obj as Record<string, string | undefined>)[lang] || obj.en || obj.ja || '';
}

export function blogPostingLd(entry: TagEntry, ctx: LdContext) {
  const siteUrl = ctx.siteUrl ?? 'https://kynantokoro.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: pick(entry.title, ctx.lang),
    description: pick(entry.summary, ctx.lang),
    datePublished: entry.date,
    inLanguage: ctx.lang,
    keywords: (entry.tags ?? []).join(', '),
    url: `${siteUrl}/${ctx.lang}/entry/${entry.slug}`,
    author: { '@type': 'Person', name: 'Kynan Tokoro' },
  };
}

export function blogLd(entries: TagEntry[], ctx: LdContext) {
  const siteUrl = ctx.siteUrl ?? 'https://kynantokoro.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Kynan Tokoro',
    inLanguage: ctx.lang,
    url: `${siteUrl}/${ctx.lang}`,
    blogPost: entries.map((e) => ({
      '@type': 'BlogPosting',
      headline: pick(e.title, ctx.lang),
      datePublished: e.date,
      url: `${siteUrl}/${ctx.lang}/entry/${e.slug}`,
      keywords: (e.tags ?? []).join(', '),
    })),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test jsonLd`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/website/app/lib/jsonLd.ts packages/website/app/lib/jsonLd.test.ts
git commit -m "feat: add JSON-LD builders"
```

---

## Task 5: Update Sanity schema (drop entryType/week, add summary)

**Files:**
- Modify: `packages/website-cms/schemaTypes/entry.ts`

- [ ] **Step 1: Remove the `entryType` field**

In `packages/website-cms/schemaTypes/entry.ts`, delete the entire `defineField({ name: 'entryType', ... })` block (the first field, including its `// Entry type selector` comment).

- [ ] **Step 2: Remove the `week` field**

Delete the entire `defineField({ name: 'week', ... })` block (including the `// Weekly Project-specific fields (hidden for blog posts)` comment).

- [ ] **Step 3: Add the `summary` field**

After the `content` field's `defineField({ name: 'content', ... })` block, add:

```ts
    defineField({
      name: 'summary',
      type: 'object',
      title: 'Summary',
      description: 'Short summary used for the tag index, structured data, and Markdown output (AX). Optional.',
      fields: [
        defineField({name: 'en', type: 'text', rows: 2, title: 'English'}),
        defineField({name: 'ja', type: 'text', rows: 2, title: 'Japanese'}),
      ],
    }),
```

- [ ] **Step 4: Fix the preview**

Replace the entire `preview` block at the bottom of the file with:

```ts
  preview: {
    select: {
      titleEn: 'title.en',
      titleJa: 'title.ja',
      date: 'date',
    },
    prepare({titleEn, titleJa, date}) {
      const title = titleEn || titleJa || 'Untitled'
      return {
        title,
        subtitle: date,
      }
    },
  },
```

- [ ] **Step 5: Commit**

```bash
git add packages/website-cms/schemaTypes/entry.ts
git commit -m "feat: simplify entry schema to a single blog post type with summary"
```

---

## Task 6: Migration script (one-off, run locally)

**Files:**
- Create: `packages/website/scripts/migrate-remove-entrytype.ts`

This script is **destructive** (it unsets fields). It is intended to be run **locally** by the maintainer against a backed-up dataset, not in CI. It is written now so it lives in the repo; running it is a manual step (see Task 13).

- [ ] **Step 1: Write the script**

Create `packages/website/scripts/migrate-remove-entrytype.ts`:

```ts
import { createClient } from '@sanity/client';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_TOKEN;

if (!projectId || !dataset || !token) {
  console.error('Set SANITY_PROJECT_ID, SANITY_DATASET and SANITY_TOKEN in the environment.');
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: '2023-05-03', token, useCdn: false });

async function main() {
  // Default 'raw' perspective returns both published and drafts.* ids.
  const ids: string[] = await client.fetch(
    `*[_type == "entry" && (defined(entryType) || defined(week))]._id`
  );
  console.log(`Found ${ids.length} entries with entryType/week to clean.`);
  if (ids.length === 0) return;

  let tx = client.transaction();
  for (const id of ids) {
    tx = tx.patch(id, (p) => p.unset(['entryType', 'week']));
  }
  const res = await tx.commit();
  console.log(`Patched ${res.results?.length ?? 0} documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck the script compiles**

Run (from `packages/website`): `pnpm exec tsx --eval "import('./scripts/migrate-remove-entrytype.ts')" 2>&1 | head -5` is NOT reliable (it would execute). Instead just verify syntax with:

Run: `pnpm exec tsc --noEmit scripts/migrate-remove-entrytype.ts 2>&1 | head -20`
Expected: no errors related to this file (module-resolution warnings from `tsc` invoked standalone are acceptable; there must be no syntax/type errors in the script's own code).

- [ ] **Step 3: Commit**

```bash
git add packages/website/scripts/migrate-remove-entrytype.ts
git commit -m "feat: add one-off migration to unset entryType/week"
```

---

## Task 7: Update GROQ queries

**Files:**
- Modify: `packages/website/app/lib/sanity.ts`

- [ ] **Step 1: Update `allEntries`**

In `packages/website/app/lib/sanity.ts`, replace the `allEntries` query so it drops `entryType` and `week` and adds `summary`:

```ts
  // Get all entries sorted by date
  allEntries: `*[_type == "entry"] | order(date desc) {
    _id,
    "slug": slug.current,
    title,
    date,
    emoji,
    imageSeed,
    tags,
    summary,
    enIsTranslated,
    jaIsTranslated,
    "hasEn": defined(content.en) && length(content.en) > 0,
    "hasJa": defined(content.ja) && length(content.ja) > 0
  }`,
```

- [ ] **Step 2: Update `entryBySlug`**

Replace the `entryBySlug` query so it drops `entryType` and `week` and adds `summary`:

```ts
  // Get single entry by slug
  entryBySlug: `*[_type == "entry" && slug.current == $slug][0] {
    _id,
    "slug": slug.current,
    title,
    date,
    emoji,
    imageSeed,
    tags,
    summary,
    content,
    enIsTranslated,
    jaIsTranslated,
    "hasEn": defined(content.en) && length(content.en) > 0,
    "hasJa": defined(content.ja) && length(content.ja) > 0
  }`,
```

- [ ] **Step 3: Verify typecheck**

Run (from `packages/website`): `pnpm typecheck`
Expected: This will surface type errors in `home.tsx` and `entry.$slug.tsx` that still reference `entryType`/`week`. That is expected — those are fixed in Tasks 9 and 10. Confirm the **only** new errors are about `entryType`/`week`/`type` in those two files. (If you prefer a clean checkpoint, defer the full `pnpm typecheck` until after Task 10.)

- [ ] **Step 4: Commit**

```bash
git add packages/website/app/lib/sanity.ts
git commit -m "feat: drop entryType/week from queries, add summary"
```

---

## Task 8: Update EntryCard (drop week/contentType)

**Files:**
- Modify: `packages/website/app/components/EntryCard.tsx`

- [ ] **Step 1: Update the props interface**

In `packages/website/app/components/EntryCard.tsx`, remove `week?: number;` and `contentType: 'weekly-project' | 'blog';` from `EntryCardProps`. The interface becomes:

```ts
interface EntryCardProps {
  slug: string;
  title: {
    en: string;
    ja: string;
  };
  date: string;
  emoji?: number;
  imageSeed?: number;
  tags: string[];
}
```

- [ ] **Step 2: Update the function signature**

Change the destructured params:

```ts
export default function EntryCard({ slug, title, date, emoji, imageSeed, tags }: EntryCardProps) {
```

- [ ] **Step 3: Remove the Week badge**

Delete this block (the `flex items-baseline` wrapper that only held the Week label):

```tsx
          <div className="flex items-baseline gap-2 mb-1">
            {contentType === 'weekly-project' && week && (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 font-serif">
                Week {week}
              </span>
            )}
          </div>
```

(The `<h2>` title directly below it stays.)

- [ ] **Step 4: Verify typecheck of the component**

Run (from `packages/website`): `pnpm exec tsc --noEmit 2>&1 | grep EntryCard`
Expected: no errors mentioning `EntryCard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add packages/website/app/components/EntryCard.tsx
git commit -m "feat: remove weekly-project badge from EntryCard"
```

---

## Task 9: Replace type filter with tag filter on the home page

**Files:**
- Modify: `packages/website/app/routes/home.tsx`

- [ ] **Step 1: Update imports and loader mapping**

In `packages/website/app/routes/home.tsx`, add imports near the top (after the existing imports):

```ts
import { uniqueTags, filterByTag, type TagEntry } from '../lib/tags';
import { blogLd } from '../lib/jsonLd';
```

In the `loader`, change the entry mapping so each entry carries `summary` and `tags` and drops `week`/`type`:

```ts
  const entries = sanityEntries.map((entry: any) => ({
    slug: entry.slug,
    metadata: {
      title: entry.title,
      date: entry.date,
      tags: entry.tags || [],
      emoji: entry.emoji || 1,
      imageSeed: entry.imageSeed ?? 0,
      summary: entry.summary,
    },
    hasEn: entry.hasEn,
    hasJa: entry.hasJa,
  }));
```

- [ ] **Step 2: Add JSON-LD via `meta`**

Replace the `meta()` function's `return [ ... ]` array's final closing so it includes the Blog JSON-LD. Change the `meta` signature to receive `params` and `data`, and append one descriptor:

```ts
export function meta({ params, data }: Route.MetaArgs) {
  const title = "Kynan Tokoro";
  const description = "Building software, making music, hobby game dev. Works in Japanese and English. Based in Tokyo.";
  const url = "https://kynantokoro.com";
  const ogImage = `${url}/og-image.jpg`;
  const lang = params.lang === 'ja' ? 'ja' : 'en';
  const tagEntries: TagEntry[] = (data?.entries ?? []).map((e: any) => ({
    slug: e.slug,
    title: e.metadata.title,
    date: e.metadata.date,
    summary: e.metadata.summary,
    tags: e.metadata.tags,
  }));

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: "Kynan Tokoro" },
    { property: "og:locale", content: "en_US" },
    { property: "og:locale:alternate", content: "ja_JP" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
    { "script:ld+json": blogLd(tagEntries, { lang }) },
  ];
}
```

- [ ] **Step 3: Replace the filter type, state, and types**

Remove the old `type Filter = 'all' | 'weekly-project' | 'blog';` and the `Entry` type's `week`/`type` fields. Replace the `type Entry` block with:

```ts
type Entry = {
  slug: string;
  metadata: {
    title: { en: string; ja: string };
    date: string;
    tags: string[];
    emoji: number;
    imageSeed: number;
    summary?: { en?: string; ja?: string };
  };
  hasEn: boolean;
  hasJa: boolean;
};
```

- [ ] **Step 4: Replace the filter logic in the component**

Inside `export default function Home(...)`, replace the filter state/effect/filtering block (everything from `const filterFromUrl = ...` through the `const filterLabels = { ... };` declaration) with:

```ts
  // Selected tag from URL (?tag=...), or null for "All"
  const [selectedTag, setSelectedTag] = useState<string | null>(searchParams.get('tag'));

  useEffect(() => {
    setSelectedTag(searchParams.get('tag'));
  }, [searchParams]);

  const allTags = uniqueTags(
    entries.map((e: Entry) => ({
      slug: e.slug,
      title: e.metadata.title,
      date: e.metadata.date,
      tags: e.metadata.tags,
    }))
  );

  const filteredEntries = entries.filter((entry: Entry) =>
    selectedTag ? (entry.metadata.tags || []).includes(selectedTag) : true
  );
```

(Note: `filterByTag` is imported for reuse/tests but the inline filter above keeps the full `Entry` shape; either is acceptable. Keep the import only if used — otherwise remove it to satisfy lint.)

- [ ] **Step 5: Replace the filter buttons UI**

Replace the entire `{/* Filter */}` `<section>` block with a tag filter bar:

```tsx
      {/* Tag filter */}
      {allTags.length > 0 && (
        <section className="pb-4 px-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSearchParams({}, { replace: true, preventScrollReset: true })}
                className={`px-4 py-2 text-sm font-serif rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 ${
                  !selectedTag
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {language === 'ja' ? 'すべて' : 'All'}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSearchParams({ tag }, { replace: true, preventScrollReset: true })}
                  className={`px-4 py-2 text-sm font-serif rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 ${
                    selectedTag === tag
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
```

- [ ] **Step 6: Update the `EntryCard` usage**

In the entries `.map(...)`, remove the `week={...}` and `contentType={...}` props so it matches the new `EntryCard` interface:

```tsx
                <EntryCard
                  key={entry.slug}
                  slug={entry.slug}
                  title={entry.metadata.title}
                  date={entry.metadata.date}
                  emoji={entry.metadata.emoji}
                  imageSeed={entry.metadata.imageSeed}
                  tags={entry.metadata.tags || []}
                />
```

- [ ] **Step 7: Verify build of the route**

Run (from `packages/website`): `pnpm exec tsc --noEmit 2>&1 | grep -E "home.tsx"`
Expected: no errors mentioning `home.tsx`.

- [ ] **Step 8: Commit**

```bash
git add packages/website/app/routes/home.tsx
git commit -m "feat: replace type filter with tag filter on home"
```

---

## Task 10: Update the entry detail page (drop week, add .md link + JSON-LD)

**Files:**
- Modify: `packages/website/app/routes/entry.$slug.tsx`

- [ ] **Step 1: Add imports**

In `packages/website/app/routes/entry.$slug.tsx`, after the existing imports add:

```ts
import { blogPostingLd } from '../lib/jsonLd';
import type { TagEntry } from '../lib/tags';
```

- [ ] **Step 2: Update the loader mapping**

In the `loader`, remove `type: sanityEntry.entryType,` and `week: sanityEntry.week,` and add `summary` to `metadata`:

```ts
  const entry = {
    slug: sanityEntry.slug,
    metadata: {
      title: sanityEntry.title || { en: 'Untitled', ja: 'Untitled' },
      date: sanityEntry.date,
      tags: sanityEntry.tags || [],
      emoji: sanityEntry.emoji || 1,
      imageSeed: sanityEntry.imageSeed ?? 0,
      summary: sanityEntry.summary,
      enIsTranslated: sanityEntry.enIsTranslated || false,
      jaIsTranslated: sanityEntry.jaIsTranslated || false,
    },
    content: sanityEntry.content || { en: [], ja: [] },
    hasEn: sanityEntry.hasEn,
    hasJa: sanityEntry.hasJa,
  };
```

- [ ] **Step 3: Update `meta` to add the Markdown alternate link and JSON-LD**

Replace the `meta` function with:

```ts
export function meta({ params, data }: Route.MetaArgs) {
  const lang = params.lang === 'ja' ? 'ja' : 'en';
  const title = data?.entry?.metadata?.title?.[lang] || data?.entry?.metadata?.title?.en;
  const url = `https://kynantokoro.com/${lang}/entry/${params.slug}`;
  const mdUrl = `${url}.md`;
  const ogImage = "https://kynantokoro.com/og-image.jpg";

  const tags: TagEntry | null = data?.entry
    ? {
        slug: data.entry.slug,
        title: data.entry.metadata.title,
        date: data.entry.metadata.date,
        summary: data.entry.metadata.summary,
        tags: data.entry.metadata.tags,
      }
    : null;

  return [
    { title },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: "Kynan Tokoro" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
    { tagName: "link", rel: "alternate", type: "text/markdown", href: mdUrl },
    ...(tags ? [{ "script:ld+json": blogPostingLd(tags, { lang }) }] : []),
  ];
}
```

- [ ] **Step 4: Remove the Week display**

Delete the `const isWeeklyProject = entry.type === 'weekly-project';` line, and delete the Week display block:

```tsx
            {/* Show week number only for Weekly Project entries */}
            {isWeeklyProject && entry.metadata.week && (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 font-serif">
                Week {entry.metadata.week}
              </span>
            )}
```

(The date `<span>` directly after it stays.)

- [ ] **Step 5: Full typecheck**

Run (from `packages/website`): `pnpm typecheck`
Expected: PASS (no errors). This is the first clean checkpoint after the schema/query/UI changes.

- [ ] **Step 6: Commit**

```bash
git add packages/website/app/routes/entry.$slug.tsx
git commit -m "feat: drop week display, add markdown alternate link and JSON-LD"
```

---

## Task 11: Markdown resource route (`/:lang/entry/:slug.md`)

**Files:**
- Create: `packages/website/app/routes/entry-md.tsx`
- Modify: `packages/website/app/routes.ts`

- [ ] **Step 1: Create the resource route**

Create `packages/website/app/routes/entry-md.tsx`:

```ts
import type { Route } from "./+types/entry-md";
import { createSanityClient, createUrlFor, queries, type SanityEnv } from '../lib/sanity';
import { portableTextToMarkdown, type PtImage } from '../lib/portableTextToMarkdown';

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;
  const lang = params.lang === 'ja' ? 'ja' : 'en';

  const client = createSanityClient(env);
  const entry = await client.fetch(queries.entryBySlug, { slug: params.slug });
  if (!entry) {
    throw new Response("Not Found", { status: 404 });
  }

  const urlFor = createUrlFor(client);
  const blocks = entry.content?.[lang] ?? [];
  const body = portableTextToMarkdown(blocks, {
    resolveImageUrl: (img: PtImage) => urlFor(img).url(),
  });

  const title = entry.title?.[lang] || entry.title?.en || entry.title?.ja || 'Untitled';
  const tagsLine = (entry.tags ?? []).join(', ');
  const summary = entry.summary?.[lang] || entry.summary?.en || entry.summary?.ja || '';

  const frontmatter = [
    '---',
    `title: ${title}`,
    `date: ${entry.date}`,
    tagsLine ? `tags: ${tagsLine}` : null,
    summary ? `summary: ${summary}` : null,
    '---',
  ].filter(Boolean).join('\n');

  const markdown = `${frontmatter}\n\n# ${title}\n\n${body}\n`;

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
```

- [ ] **Step 2: Register the route**

In `packages/website/app/routes.ts`, add this **above** the `layout(...)` call (so it is a top-level resource route that does not render the language layout), after the `sitemap.xml` line:

```ts
  route(":lang/entry/:slug.md", "routes/entry-md.tsx"),
```

- [ ] **Step 3: Typecheck (regenerates route types)**

Run (from `packages/website`): `pnpm typecheck`
Expected: PASS. (`react-router typegen` generates `+types/entry-md`.)

- [ ] **Step 4: Verify the route serves Markdown**

Start the dev server in a separate terminal (`pnpm dev`), then run:

```bash
curl -s -i "http://localhost:5173/en/entry/lovejs-webgl2.md" | head -20
```

Expected: `HTTP/1.1 200`, `Content-Type: text/markdown; charset=utf-8`, and a body starting with `---\ntitle: ...`. If the route returns 404 with a "no route matches" error (not the Sanity 404), the `:slug.md` suffix pattern is not matching — fall back to registering the route as `route(":lang/entry/:slug[.]md", "routes/entry-md.tsx")` and re-run typecheck + curl.

- [ ] **Step 5: Commit**

```bash
git add packages/website/app/routes/entry-md.tsx packages/website/app/routes.ts
git commit -m "feat: add Markdown resource route for entries"
```

---

## Task 12: `tags.json` resource route and `/:lang/tags` index page

**Files:**
- Create: `packages/website/app/routes/tags[.]json.tsx`
- Create: `packages/website/app/routes/tags.tsx`
- Modify: `packages/website/app/routes.ts`

- [ ] **Step 1: Create the `tags.json` resource route**

Create `packages/website/app/routes/tags[.]json.tsx`:

```ts
import type { Route } from "./+types/tags[.]json";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';

export async function loader({ context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;
  const client = createSanityClient(env);
  const raw = (await client.fetch(queries.allEntries)) || [];

  const entries: TagEntry[] = raw.map((e: any) => ({
    slug: e.slug,
    title: e.title,
    date: e.date,
    summary: e.summary,
    tags: e.tags ?? [],
  }));

  const grouped = aggregateTags(entries);

  return new Response(JSON.stringify(grouped, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
```

- [ ] **Step 2: Create the human tag index page**

Create `packages/website/app/routes/tags.tsx`:

```tsx
import type { Route } from "./+types/tags";
import { Link } from "react-router";
import { useLanguage } from "../contexts/language-context";
import Header from "../components/Header";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';

export function meta() {
  return [
    { title: "Tags · Kynan Tokoro" },
    { name: "description", content: "Browse posts by tag." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;
  const client = createSanityClient(env);
  const raw = (await client.fetch(queries.allEntries)) || [];
  const entries: TagEntry[] = raw.map((e: any) => ({
    slug: e.slug,
    title: e.title,
    date: e.date,
    summary: e.summary,
    tags: e.tags ?? [],
  }));
  return { grouped: aggregateTags(entries) };
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=3600" };
}

export default function Tags({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const { grouped } = loaderData;
  const tags = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="min-h-screen">
      <Header showBackButton />
      <div className="max-w-3xl mx-auto px-8 pb-24">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 font-serif my-8">
          {language === 'ja' ? 'タグ' : 'Tags'}
        </h1>
        {tags.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 font-serif">
            {language === 'ja' ? 'タグがありません。' : 'No tags yet.'}
          </p>
        ) : (
          tags.map((tag) => (
            <section key={tag} className="mb-10">
              <Link
                to={`/${language}?tag=${encodeURIComponent(tag)}`}
                className="text-xl font-semibold text-gray-900 dark:text-gray-100 font-serif hover:opacity-60"
              >
                {tag}{' '}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({grouped[tag].count})
                </span>
              </Link>
              <ul className="mt-3 space-y-2">
                {grouped[tag].entries.map((entry) => {
                  const title =
                    entry.title?.[language as 'en' | 'ja'] || entry.title?.en || entry.title?.ja || 'Untitled';
                  const summary = entry.summary?.[language as 'en' | 'ja'] || '';
                  return (
                    <li key={entry.slug}>
                      <Link
                        to={`/${language}/entry/${entry.slug}`}
                        className="text-gray-800 dark:text-gray-200 font-serif hover:opacity-60"
                      >
                        {title}
                      </Link>
                      {summary && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-serif">{summary}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register both routes**

In `packages/website/app/routes.ts`:
- Add the top-level resource route after the `tags`/`sitemap` lines (above `layout(...)`):

```ts
  route("tags.json", "routes/tags[.]json.tsx"),
```

- Add the human page inside the `:lang` children (alongside `index` and `entry/:slug`):

```ts
      route("tags", "routes/tags.tsx"),
```

The final `routes.ts` should read:

```ts
import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect.tsx"),
  route("api/theme", "routes/api.theme.ts"),
  route("sitemap.xml", "routes/sitemap[.]xml.tsx"),
  route("tags.json", "routes/tags[.]json.tsx"),
  route(":lang/entry/:slug.md", "routes/entry-md.tsx"),
  layout("routes/language-layout.tsx", [
    route(":lang", "routes/index.tsx", [
      index("routes/home.tsx"),
      route("tags", "routes/tags.tsx"),
      route("entry/:slug", "routes/entry.$slug.tsx"),
    ])
  ])
] satisfies RouteConfig;
```

- [ ] **Step 4: Typecheck**

Run (from `packages/website`): `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Verify both routes**

With `pnpm dev` running:

```bash
curl -s -i "http://localhost:5173/tags.json" | head -15
curl -s -i "http://localhost:5173/en/tags" | head -15
```

Expected: `tags.json` returns `200` + `application/json` with a `{ "<tag>": { "count": N, "entries": [...] } }` object. `/en/tags` returns `200` HTML containing tag headings.

- [ ] **Step 6: Commit**

```bash
git add packages/website/app/routes/tags[.]json.tsx packages/website/app/routes/tags.tsx packages/website/app/routes.ts
git commit -m "feat: add tags.json API and tag index page"
```

---

## Task 13: Full verification, data migration, and hand-off

**Files:** none (verification + manual steps)

- [ ] **Step 1: Run the full test suite**

Run (from `packages/website`): `pnpm test`
Expected: PASS — all library tests (Markdown serializer, tags, JSON-LD) green.

- [ ] **Step 2: Typecheck and build**

Run (from `packages/website`):

```bash
pnpm typecheck && pnpm build
```

Expected: both succeed with no errors.

- [ ] **Step 3: Run the data migration locally (destructive — back up first)**

> Run this **once**, locally, by the maintainer. It unsets `entryType`/`week` on all existing Sanity documents (published + drafts). Take a dataset backup or export first.

Optional backup:

```bash
cd packages/website && set -a && . ./.env && set +a && \
  pnpm exec sanity dataset export "$SANITY_DATASET" ./backup-$SANITY_DATASET.tar.gz 2>/dev/null || \
  echo "If sanity CLI is unavailable, export via the Sanity dashboard before proceeding."
```

Run the migration:

```bash
cd packages/website && set -a && . ./.env && set +a && \
  pnpm exec tsx scripts/migrate-remove-entrytype.ts
```

Expected: `Found 3 entries with entryType/week to clean.` (the three former weekly entries; possibly more if drafts also carried the field), then `Patched N documents.` Re-running prints `Found 0 ...`.

- [ ] **Step 4: Verify migration via the running site**

With `pnpm dev` running, confirm the three former weekly entries now render as plain blog posts (no "Week N" badge):

```bash
curl -s "http://localhost:5173/en/entry/lovejs-webgl2.md" | head -8
```

Expected: Markdown front-matter with title/date/tags and **no** week metadata.

- [ ] **Step 5: Push the branch for Claude Code Web hand-off**

```bash
cd /Users/kynan/Dev/kynantokoro-com
git push -u origin feature/tech-blog-simplification
```

Then in Claude Code Web: open `kynantokoro/kynantokoro-com`, select the `feature/tech-blog-simplification` branch, and continue from there. (If the implementation itself is being done on Web rather than locally, push only the spec + this plan first, then execute the tasks above in the Web session. The migration in Step 3 still needs Sanity secrets — run it locally, or configure `SANITY_PROJECT_ID`/`SANITY_DATASET`/`SANITY_TOKEN` in the Web sandbox environment.)

- [ ] **Step 6: Open a PR (optional)**

```bash
gh pr create --base main --head feature/tech-blog-simplification \
  --title "Simplify to tag-centric tech blog with AX support" \
  --body "Removes weekly-project/blog dual-type; adds tag filter, tag index, tags.json, Markdown endpoints, and JSON-LD. See docs/superpowers/plans/2026-06-14-tech-blog-simplification.md"
```

---

## Self-Review

**Spec coverage check (each spec requirement → task):**
- Schema: drop `entryType`/`week`, add `summary`, fix preview → Task 5 ✓
- Data migration (unset on all docs incl. drafts) → Task 6 (script) + Task 13 Step 3 (run) ✓
- GROQ queries drop `entryType`/`week`, add `summary` → Task 7 ✓
- Home: type filter → tag filter, `?tag=` URL sync, derived tag set → Task 9 ✓
- EntryCard: drop `week`/`contentType`, drop badge → Task 8 ✓ (clickable-tags deviation documented in File Structure)
- Entry page: drop week display → Task 10 ✓
- M. Markdown `.md` route + serializer + alternate link → Task 2 (serializer) + Task 11 (route) + Task 10 Step 3 (link) ✓
- D. JSON-LD (BlogPosting on entry, Blog+ItemList on home) → Task 4 (builders) + Task 9/10 (injection) ✓
- B. Tag index page → Task 12 ✓
- F. `tags.json` → Task 12 ✓
- C. `summary` field used by `.md`/JSON-LD/tag index → Task 5 + threaded through Tasks 7/9/10/11/12 ✓
- i18n: per-language `.md`, `inLanguage`, language-neutral `tags.json` → Tasks 11/4/12 ✓
- Testing (TDD on pure libs) → Tasks 1–4 ✓
- Error handling (404 on missing slug, cache headers, summary fallback) → Tasks 11/12 + serializer/jsonLd fallbacks ✓
- Out of scope (llms.txt, robots.txt, test-data cleanup, multi-select tags) → not implemented ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `TagEntry` shape is identical across `tags.ts`, `jsonLd.ts`, and all route mappings (`slug`, `title{en,ja}`, `date`, `summary{en,ja}?`, `tags[]`). `portableTextToMarkdown(blocks, options)` signature matches its call in `entry-md.tsx`. `PtImage` is exported from the serializer and imported by `entry-md.tsx`. ✓

**Known risk flagged for the executor:** The `:slug.md` suffix route pattern (Task 11) has a documented fallback (`:slug[.]md`) verified by curl, since React Router's matching of a partial-dynamic segment should be confirmed at runtime.
