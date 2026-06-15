import { parseTagLayout, type TagCluster, type TagLayout } from './tagLayout';

/**
 * Deterministic pieces of the tag-layout generator, split out from the CI
 * script so they can be unit-tested without an API key or network access.
 * The script (scripts/generate-tag-layout.ts) wires these to Sanity + Anthropic.
 */

/** Build the clustering prompt sent to the model. */
export function buildClusterPrompt(tags: string[]): string {
  return `You are grouping blog tags into a small number of semantic clusters for a "tag map".
Tags (JSON): ${JSON.stringify(tags)}

Return ONLY a JSON object of this exact shape:
{"clusters":[{"id":"<kebab-slug>","name":{"en":"...","ja":"..."},"tags":["..."]}]}
Rules:
- Partition EVERY input tag into exactly one cluster (omit none, invent none, no duplicates).
- 4 to 8 clusters, grouped by topic/genre similarity.
- "id" is a short kebab-case slug; "name" is a short human label in English and Japanese.
- Output JSON only: no prose, no code fences.`;
}

/** Pull a JSON object out of a model response (tolerates code fences / prose). */
export function extractJson(text: string): { clusters?: unknown } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output.');
  return JSON.parse(raw.slice(start, end + 1));
}

/** Validate raw model text into TagClusters (shape-checked via the runtime schema). */
export function clustersFromModelText(text: string, model: string): TagCluster[] {
  const obj = extractJson(text);
  const validated = parseTagLayout({ hash: '', generatedAt: '', model, clusters: obj.clusters });
  return validated.clusters;
}

/** Drop unknown/duplicate tags and sweep any missing tag into an `other` cluster. */
export function ensureCoverage(tags: string[], clusters: TagCluster[]): TagCluster[] {
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

/** Full transform: raw model text + the canonical tag set → a validated, fully-covering layout. */
export function layoutFromModelText(
  text: string,
  tags: string[],
  opts: { model: string; hash: string; generatedAt?: string }
): TagLayout {
  const clusters = ensureCoverage(tags, clustersFromModelText(text, opts.model));
  const layout: TagLayout = {
    hash: opts.hash,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    model: opts.model,
    clusters,
  };
  return parseTagLayout(layout); // final validation
}
