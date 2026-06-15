/**
 * Build YAML frontmatter for the Markdown (`.md`) representation of an entry.
 *
 * The values come from CMS free-text fields — titles often contain a colon
 * ("Sokol: a tiny library"), summaries are multi-line, and tags are arbitrary
 * strings. Interpolating them raw produces invalid YAML (a `: ` or a newline
 * silently corrupts the frontmatter for anything that parses it). JSON is a
 * subset of YAML, so `JSON.stringify` yields a valid YAML flow node: strings
 * become double-quoted scalars (handling `:` and escaping newlines) and arrays
 * become flow sequences.
 */

export interface FrontmatterFields {
  title: string;
  date?: string;
  tags?: string[];
  summary?: string;
}

/** Serialize a string or string[] as a YAML-safe flow node. */
export function yamlValue(value: string | string[]): string {
  return JSON.stringify(value);
}

export function buildFrontmatter(fields: FrontmatterFields): string {
  const lines = ['---', `title: ${yamlValue(fields.title)}`];
  if (fields.date) lines.push(`date: ${yamlValue(fields.date)}`);
  const tags = (fields.tags ?? []).filter((t) => t.length > 0);
  if (tags.length > 0) lines.push(`tags: ${yamlValue(tags)}`);
  if (fields.summary) lines.push(`summary: ${yamlValue(fields.summary)}`);
  lines.push('---');
  return lines.join('\n');
}
