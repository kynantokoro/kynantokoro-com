/**
 * Regenerate the semantic tag layout (app/data/tag-layout.json) used by the
 * Tag Search bubble map. Runs in CI; only calls Claude when the *set* of tags
 * changed (hash mismatch), then commits the result. Counts/bubble sizes are
 * computed at runtime from live data, so they are intentionally NOT stored here.
 */
import { createClient } from '@sanity/client';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  computeTagSetHash,
  parseTagLayout,
  type TagLayout,
  type TagCluster,
} from '../app/lib/tagLayout';

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

function extractJson(text: string): { clusters?: unknown } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output.');
  return JSON.parse(raw.slice(start, end + 1));
}

async function clusterWithClaude(tags: string[]): Promise<TagCluster[]> {
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is required to regenerate the layout.');
  const client = new Anthropic({ apiKey: anthropicKey });
  const prompt = `You are grouping blog tags into a small number of semantic clusters for a "tag map".
Tags (JSON): ${JSON.stringify(tags)}

Return ONLY a JSON object of this exact shape:
{"clusters":[{"id":"<kebab-slug>","name":{"en":"...","ja":"..."},"tags":["..."]}]}
Rules:
- Partition EVERY input tag into exactly one cluster (omit none, invent none, no duplicates).
- 4 to 8 clusters, grouped by topic/genre similarity.
- "id" is a short kebab-case slug; "name" is a short human label in English and Japanese.
- Output JSON only: no prose, no code fences.`;

  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');

  const obj = extractJson(text);
  // Reuse the runtime schema for cluster-shape validation.
  const validated = parseTagLayout({ hash: '', generatedAt: '', model, clusters: obj.clusters });
  return validated.clusters;
}

/** Drop unknown/duplicate tags and sweep any missing tag into an `other` cluster. */
function ensureCoverage(tags: string[], clusters: TagCluster[]): TagCluster[] {
  const allowed = new Set(tags);
  const seen = new Set<string>();
  const cleaned: TagCluster[] = [];
  for (const c of clusters) {
    const ts = c.tags.filter((t) => allowed.has(t) && !seen.has(t));
    ts.forEach((t) => seen.add(t));
    if (ts.length) cleaned.push({ ...c, tags: ts });
  }
  const missing = tags.filter((t) => !seen.has(t));
  if (missing.length) cleaned.push({ id: 'other', name: { en: 'Other', ja: 'その他' }, tags: missing });
  return cleaned;
}

async function main() {
  const tags = await fetchTags();
  if (tags.length === 0) {
    console.log('No tags found; nothing to do.');
    return;
  }
  const hash = computeTagSetHash(tags);
  const existing = readExisting();
  if (existing && existing.hash === hash) {
    console.log(`Tag set unchanged (hash ${hash}); layout is up to date.`);
    return;
  }

  console.log(`Tag set changed (hash ${hash}); regenerating via ${model}...`);
  const rawClusters = await clusterWithClaude(tags);
  const clusters = ensureCoverage(tags, rawClusters);
  const layout: TagLayout = { hash, generatedAt: new Date().toISOString(), model, clusters };
  parseTagLayout(layout); // final validation

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(layout, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT}: ${clusters.length} clusters covering ${tags.length} tags.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
