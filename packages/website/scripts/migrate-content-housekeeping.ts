/**
 * One-off content housekeeping (2026-06): retire the original "weekly project"
 * framing, fill in missing tags, and clear out leftover test/sample entries.
 *
 * Requires a WRITE-enabled SANITY_TOKEN. The CI/read token is NOT sufficient
 * (it will fail with: Insufficient permissions; permission "update" required).
 *
 * Dry-run by default — prints the plan and writes nothing. Pass --apply to mutate:
 *   pnpm --filter website exec tsx scripts/migrate-content-housekeeping.ts            # dry run
 *   pnpm --filter website exec tsx scripts/migrate-content-housekeeping.ts --apply    # write
 *
 * What it does (one atomic transaction):
 *   1. Delete leftover test/sample entries — test (PUBLISHED, live), draft-only,
 *      title-test-ja-only, title-test-en-only, japanese-only, english-only.
 *   2. week-01: remove the "Making Something Every Week / 毎週何か作る" section and
 *      rename the slug week-01 -> new-personal-website.
 *      ⚠ The old URL /…/entry/week-01 will 404 after you publish (no redirect).
 *   3. hello-world: drop the "weekly project" sentence from "What's next?"; add tags.
 *   4. lovejs-webgl2, custom-webaudio-backend: add tags.
 *
 * Edits to PUBLISHED docs are staged as DRAFTS, so nothing goes live until you hit
 * Publish in the Studio. The 6 test entries are deleted outright. learning-sokol and
 * pixel-art-workflow are intentionally left untouched.
 */
import { createClient, type SanityDocument } from '@sanity/client';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_TOKEN;
const APPLY = process.argv.includes('--apply') || process.env.APPLY === '1';

if (!projectId || !dataset || !token) {
  console.error('Set SANITY_PROJECT_ID, SANITY_DATASET and a WRITE SANITY_TOKEN in the environment.');
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion: '2023-05-03', token, useCdn: false });

// ---- Anchors (verified against live content) ----
const PUBLISHED = {
  week01: '076e482f-1c2f-447e-9602-24bf6c1ceaa3',
  lovejs: '8afc2acc-3771-4c1c-873b-fc789b1efdaa',
  audio: '735d94cd-c8b8-4ffa-bb8f-8d173d325dd0',
};
const HELLO_WORLD_DRAFT = 'drafts.012d951d-775b-4057-8c93-514190d0c261';

/** Base ids of test/sample docs to remove (both published and draft forms are pruned). */
const DELETE_BASES = [
  '05b3b725-fac9-4aac-bd20-1847616e2390', // test (published, live)
  '9a2e28b8-6d67-472a-994d-b9148ecf34aa', // draft-only
  'entry-title-test-ja-only',
  'entry-title-test-en-only',
  'entry-japanese-only',
  'entry-english-only',
];

const NEW_TAGS: Record<string, string[]> = {
  [PUBLISHED.lovejs]: ['programming', 'Love.js', 'WebGL2', 'Emscripten', 'wasm'],
  [PUBLISHED.audio]: ['programming', 'Love.js', 'Web Audio', 'audio', 'wasm'],
  [HELLO_WORLD_DRAFT]: ['blog', 'personal', 'meta'],
};

// Headings whose section (heading + everything after it, to the end) gets removed.
const WEEK01_SECTION_HEADING = { en: 'Making Something Every Week', ja: '毎週何か作る' };
// A single block in hello-world mixes the weekly line with surrounding text; drop only that line.
const isWeeklyLine = (s: string) => /weekly project/i.test(s) || /週刊プロジェクト|毎週/.test(s);

type Block = { _type: string; _key: string; style?: string; children?: { text?: string }[] };
const blockText = (b: Block) => (b.children || []).map((c) => c.text ?? '').join('');
const draftOf = (id: string) => `drafts.${id}`;
const stripSystem = (d: SanityDocument) => {
  const { _rev, _createdAt, _updatedAt, ...rest } = d as Record<string, unknown>;
  return rest as SanityDocument;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function getOrThrow(id: string): Promise<SanityDocument> {
  const d = await client.getDocument(id);
  if (!d) throw new Error(`Expected document not found: ${id}. Content may have changed; re-verify before running.`);
  return d;
}

/** Remove the section starting at the heading (by text) through the end of the array. */
function removeTrailingSection(blocks: Block[], headingText: string, label: string): Block[] {
  const i = blocks.findIndex((b) => b.style === 'h2' && blockText(b).trim() === headingText);
  if (i === -1) {
    throw new Error(`week-01: heading "${headingText}" not found in ${label}; aborting (content changed?).`);
  }
  console.log(`   ${label}: removing ${blocks.length - i} block(s) from "${headingText}" to end.`);
  return blocks.slice(0, i);
}

/** Remove only the weekly line(s) from the one block that contains them. */
function removeWeeklyLine(blocks: Block[], label: string): Block[] {
  const idx = blocks.findIndex((b) => b._type === 'block' && isWeeklyLine(blockText(b)));
  if (idx === -1) {
    throw new Error(`hello-world: weekly line not found in ${label}; aborting (content changed?).`);
  }
  const block = blocks[idx];
  const spans = block.children || [];
  if (spans.length !== 1) {
    throw new Error(`hello-world: ${label} block has ${spans.length} spans; aborting (manual review needed).`);
  }
  const lines = (spans[0].text ?? '').split('\n');
  const removed = lines.filter(isWeeklyLine);
  const newText = lines.filter((l) => !isWeeklyLine(l)).join('\n');
  removed.forEach((r) => console.log(`   ${label}: removing line "${r.slice(0, 70)}…"`));
  const next = clone(blocks);
  next[idx].children = [{ ...spans[0], text: newText }];
  return next;
}

async function main() {
  console.log(`\n=== Content housekeeping (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);
  const tx = client.transaction();

  // 1. Deletions — only delete ids that actually exist.
  const candidates = DELETE_BASES.flatMap((b) => [b, draftOf(b)]);
  const found = (await client.getDocuments(candidates)).filter((d): d is SanityDocument => !!d).map((d) => d._id);
  console.log(`1. Deleting ${found.length} test/sample doc(s):`);
  for (const id of found) {
    console.log(`   - ${id}`);
    tx.delete(id);
  }

  // 2. week-01 -> staged draft: drop section + rename slug.
  {
    const pub = await getOrThrow(PUBLISHED.week01);
    const d = clone(stripSystem(pub)) as SanityDocument & { slug?: { current?: string }; content?: { en?: Block[]; ja?: Block[] } };
    d._id = draftOf(PUBLISHED.week01);
    console.log(`\n2. week-01 -> ${d._id}`);
    console.log(`   slug: "${(pub as any).slug?.current}" -> "new-personal-website"  (⚠ old URL will 404)`);
    d.slug = { ...((pub as any).slug || {}), _type: 'slug', current: 'new-personal-website' } as any;
    d.content = {
      ...d.content,
      en: removeTrailingSection((d.content?.en as Block[]) || [], WEEK01_SECTION_HEADING.en, 'content.en'),
      ja: removeTrailingSection((d.content?.ja as Block[]) || [], WEEK01_SECTION_HEADING.ja, 'content.ja'),
    } as any;
    tx.createOrReplace(d);
  }

  // 3. hello-world (already a draft): drop weekly line + add tags.
  {
    const src = await getOrThrow(HELLO_WORLD_DRAFT);
    const d = clone(stripSystem(src)) as SanityDocument & { tags?: string[]; content?: { en?: Block[]; ja?: Block[] } };
    console.log(`\n3. hello-world -> ${d._id}`);
    d.tags = NEW_TAGS[HELLO_WORLD_DRAFT];
    console.log(`   tags = ${JSON.stringify(d.tags)}`);
    d.content = {
      ...d.content,
      en: removeWeeklyLine((d.content?.en as Block[]) || [], 'content.en'),
      ja: removeWeeklyLine((d.content?.ja as Block[]) || [], 'content.ja'),
    } as any;
    tx.createOrReplace(d);
  }

  // 4. lovejs-webgl2 + custom-webaudio-backend -> staged drafts with tags.
  console.log('\n4. Tag-only drafts:');
  for (const pubId of [PUBLISHED.lovejs, PUBLISHED.audio]) {
    const pub = await getOrThrow(pubId);
    const d = clone(stripSystem(pub)) as SanityDocument & { tags?: string[] };
    d._id = draftOf(pubId);
    d.tags = NEW_TAGS[pubId];
    console.log(`   ${(pub as any).slug?.current} -> ${d._id}  tags=${JSON.stringify(d.tags)}`);
    tx.createOrReplace(d);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply (and a write token) to commit.\n');
    return;
  }

  const res = await tx.commit();
  console.log(`\n✅ Committed. ${res.results?.length ?? 0} mutation result(s).`);
  console.log('Next: open Sanity Studio and Publish the staged drafts (week-01/new-personal-website,');
  console.log('lovejs-webgl2, custom-webaudio-backend) to push them live. hello-world stays a draft.\n');
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message || err);
  process.exit(1);
});
