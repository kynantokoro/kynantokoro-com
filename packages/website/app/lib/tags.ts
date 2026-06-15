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
