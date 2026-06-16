/**
 * Regenerate the semantic tag layout (app/data/tag-layout.json) used by the
 * Tag Search bubble map. Runs in CI; only calls Claude when the *set* of tags
 * changed (hash mismatch) or when forced. Counts/bubble sizes are computed at
 * runtime from live data, so they are intentionally NOT stored here.
 *
 * Regeneration is *anchored* on the committed layout: existing tags keep their
 * cluster/id/name and only genuinely new tags are placed, so diffs stay small
 * and the bubble map does not re-shuffle. A removals-only change needs no model
 * call at all. `TAG_LAYOUT_FORCE` ignores the anchor and re-clusters from scratch.
 *
 * The deterministic transform (prompt build, JSON extraction, schema validation,
 * coverage sweeping, anchoring, sorting) lives in app/lib/tagLayoutGen.ts and is
 * unit-tested without any API key. This script only wires it to Sanity + Anthropic + fs.
 *
 * Env:
 *   SANITY_PROJECT_ID, SANITY_DATASET   required — live tag set
 *   SANITY_TOKEN                        optional — drafts/private datasets
 *   ANTHROPIC_API_KEY                   required only when the model is called
 *   TAG_LAYOUT_MODEL                    optional, default claude-sonnet-4-6
 *   TAG_LAYOUT_FORCE=1                  full re-cluster (ignore the committed layout)
 *   TAG_LAYOUT_DRY_RUN=1               print the new layout to stdout, do NOT write
 */
import { createClient } from '@sanity/client';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeTagSetHash, parseTagLayout, type TagLayout } from '../app/lib/tagLayout';
import { buildClusterPrompt, layoutFromModelText, layoutFromExisting } from '../app/lib/tagLayoutGen';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET;
const token = process.env.SANITY_TOKEN;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.TAG_LAYOUT_MODEL || 'claude-sonnet-4-6';

if (!projectId || !dataset) {
  console.error('Set SANITY_PROJECT_ID and SANITY_DATASET in the environment.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'app', 'data', 'tag-layout.json');

const sanity = createClient({ projectId, dataset, apiVersion: '2023-05-03', token, useCdn: false });

function readExisting(): TagLayout | null {
  if (!existsSync(OUT)) return null;
  try {
    return parseTagLayout(JSON.parse(readFileSync(OUT, 'utf8')));
  } catch {
    return null;
  }
}

async function fetchTags(): Promise<string[]> {
  const raw: (string[] | null)[] = await sanity.fetch(`*[_type == "entry"].tags`);
  const flat = (raw ?? []).flat();
  return Array.from(
    new Set(flat.filter((t): t is string => typeof t === 'string' && t.length > 0))
  );
}

/** Thin Anthropic call: prompt → raw model text. (Untested seam; the parsing/anchoring logic it feeds lives in tagLayoutGen.) */
async function completeWithClaude(prompt: string): Promise<string> {
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is required to regenerate the layout.');
  const client = new Anthropic({ apiKey: anthropicKey });
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

async function main() {
  const tags = await fetchTags();
  if (tags.length === 0) {
    console.log('No tags found; nothing to do.');
    return;
  }
  const force = process.env.TAG_LAYOUT_FORCE === '1' || process.env.TAG_LAYOUT_FORCE === 'true';
  const dryRun = process.env.TAG_LAYOUT_DRY_RUN === '1' || process.env.TAG_LAYOUT_DRY_RUN === 'true';
  const hash = computeTagSetHash(tags);
  const existing = readExisting();
  if (!force && existing && existing.hash === hash) {
    console.log(`Tag set unchanged (hash ${hash}); layout is up to date.`);
    return;
  }

  // Anchor on the committed layout unless a full rebuild was forced.
  const anchor = !force && existing && existing.clusters.length > 0 ? existing.clusters : undefined;
  const known = new Set((anchor ?? []).flatMap((c) => c.tags));
  const newTags = tags.filter((t) => !known.has(t));

  let layout: TagLayout;
  if (anchor && newTags.length === 0) {
    // Only removals — update deterministically, no model call.
    console.log(`Tag set changed (hash ${hash}); no new tags — pruning removed tags without the model.`);
    layout = layoutFromExisting(tags, { model: existing?.model ?? model, hash, existing: anchor });
  } else {
    console.log(
      anchor
        ? `Tag set changed (hash ${hash}); placing ${newTags.length} new tag(s) via ${model}...`
        : `Full ${force ? 'forced ' : ''}regeneration (hash ${hash}) via ${model}...`
    );
    const text = await completeWithClaude(buildClusterPrompt(tags, anchor));
    layout = layoutFromModelText(text, tags, { model, hash, existing: anchor });
  }

  if (dryRun) {
    console.log(
      `[dry-run] ${layout.clusters.length} clusters covering ${tags.length} tags — not writing ${OUT}:`
    );
    console.log(JSON.stringify(layout, null, 2));
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(layout, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT}: ${layout.clusters.length} clusters covering ${tags.length} tags.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
