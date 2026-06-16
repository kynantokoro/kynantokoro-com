import { byCodePoint, parseTagLayout, type TagCluster, type TagLayout } from './tagLayout';

/**
 * Deterministic pieces of the tag-layout generator, split out from the CI
 * script so they can be unit-tested without an API key or network access.
 * The script (scripts/generate-tag-layout.ts) wires these to Sanity + Anthropic.
 *
 * Regeneration is *anchored* on the previously committed layout: existing tags
 * keep their cluster (id, name, membership) regardless of what the model returns,
 * and only genuinely new tags adopt a placement. This keeps day-to-day diffs
 * minimal and stable instead of the model re-shuffling everything. A canonical
 * sort keeps the serialized JSON tidy.
 */

/** Build the clustering prompt sent to the model. */
export function buildClusterPrompt(tags: string[], existing?: TagCluster[]): string {
  if (existing && existing.length > 0) {
    const known = new Set(existing.flatMap((c) => c.tags));
    const newTags = tags.filter((t) => !known.has(t));
    return `You are maintaining the semantic clustering of blog tags for a "tag map".

Existing clusters (keep them stable):
${JSON.stringify({ clusters: existing })}

New tags to place: ${JSON.stringify(newTags)}

Return ONLY a JSON object of this exact shape:
{"clusters":[{"id":"<kebab-slug>","name":{"en":"...","ja":"..."},"tags":["..."]}]}
Rules:
- Keep every existing cluster's id, name, and already-assigned tags unchanged.
- Put each NEW tag into the most appropriate existing cluster, or create a new cluster only if none fits well.
- Do not rename, merge, split, drop, or reorder existing clusters.
- Output JSON only: no prose, no code fences.`;
  }
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
  if (missing.length) {
    const other = cleaned.find((c) => c.id === 'other');
    if (other) other.tags.push(...missing); // merge into a model-provided `other` rather than duplicate it
    else cleaned.push({ id: 'other', name: { en: 'Other', ja: 'その他' }, tags: missing });
  }
  return cleaned;
}

/** Canonical ordering so unchanged layouts serialize identically (tidy diffs). */
export function sortClusters(clusters: TagCluster[]): TagCluster[] {
  return clusters
    .map((c) => ({ ...c, tags: [...c.tags].sort(byCodePoint) }))
    .sort((a, b) => byCodePoint(a.id, b.id));
}

/**
 * Anchor a freshly generated clustering against the committed one: existing tags
 * keep their cluster/id/name no matter what the model returned, and only NEW tags
 * adopt the model's placement (an existing cluster, or a model-proposed new one).
 * Removed tags are dropped; anything unplaced falls into `other`.
 */
export function reconcileClusters(
  currentTags: string[],
  modelClusters: TagCluster[],
  existing: TagCluster[]
): TagCluster[] {
  const current = new Set(currentTags);
  const known = new Set(existing.flatMap((c) => c.tags));
  const newTags = currentTags.filter((t) => !known.has(t));

  // Preserve existing clusters verbatim, minus tags that no longer exist; drop any that empty out
  // so a stale id/name can't be revived by a new tag the model happens to place under that id.
  const byId = new Map<string, TagCluster>();
  for (const c of existing) {
    const tags = c.tags.filter((t) => current.has(t));
    if (tags.length) byId.set(c.id, { ...c, tags });
  }

  // Place each new tag wherever the model put it (existing cluster or a new one).
  for (const tag of newTags) {
    const target = modelClusters.find((c) => c.tags.includes(tag));
    if (!target) continue; // ensureCoverage will sweep it into `other`
    const dest = byId.get(target.id);
    if (dest) {
      if (!dest.tags.includes(tag)) dest.tags.push(tag);
    } else {
      byId.set(target.id, { id: target.id, name: target.name, tags: [tag] });
    }
  }

  return ensureCoverage(currentTags, Array.from(byId.values()));
}

/** Full transform: raw model text + the canonical tag set → a validated, fully-covering layout. */
export function layoutFromModelText(
  text: string,
  tags: string[],
  opts: { model: string; hash: string; generatedAt?: string; existing?: TagCluster[] }
): TagLayout {
  const modelClusters = clustersFromModelText(text, opts.model);
  const clusters = sortClusters(
    opts.existing && opts.existing.length > 0
      ? reconcileClusters(tags, modelClusters, opts.existing)
      : ensureCoverage(tags, modelClusters)
  );
  return parseTagLayout({
    hash: opts.hash,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    model: opts.model,
    clusters,
  });
}

/** Deterministically update a layout with no model call (only tags were removed). */
export function layoutFromExisting(
  tags: string[],
  opts: { model: string; hash: string; generatedAt?: string; existing: TagCluster[] }
): TagLayout {
  const clusters = sortClusters(ensureCoverage(tags, opts.existing));
  return parseTagLayout({
    hash: opts.hash,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    model: opts.model,
    clusters,
  });
}
