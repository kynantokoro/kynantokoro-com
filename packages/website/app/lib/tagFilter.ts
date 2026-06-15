/**
 * Helpers for the multi-tag AND filter that the home feed uses (driven by
 * repeated `?tag=` search params). Pure + framework-agnostic so they can be
 * unit-tested and reused by cards, the entry page, and the search palette.
 */

export function getActiveTags(params: URLSearchParams): string[] {
  return params.getAll('tag');
}

/**
 * Build a `?...` search string derived from `params`, adding and/or removing a
 * tag. Non-tag params (e.g. `view`) are preserved. Returns '' when empty.
 */
export function buildTagSearch(
  params: URLSearchParams,
  opts: { add?: string; remove?: string } = {}
): string {
  let tags = params.getAll('tag');
  if (opts.remove) tags = tags.filter((t) => t !== opts.remove);
  if (opts.add && !tags.includes(opts.add)) tags = [...tags, opts.add];

  const out = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key !== 'tag') out.append(key, value);
  }
  for (const tag of tags) out.append('tag', tag);

  const s = out.toString();
  return s ? `?${s}` : '';
}

/** AND semantics: the entry must carry every active tag. */
export function matchesAllTags(entryTags: string[] | undefined, active: string[]): boolean {
  if (active.length === 0) return true;
  const set = new Set(entryTags ?? []);
  return active.every((t) => set.has(t));
}
