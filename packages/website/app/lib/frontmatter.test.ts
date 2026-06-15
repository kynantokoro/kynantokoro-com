import { describe, it, expect } from 'vitest';
import { buildFrontmatter, yamlValue } from './frontmatter';

/**
 * Parse a `key: <json>` frontmatter body into an object. Each value is a JSON
 * (⊂ YAML) node on a single physical line, so splitting on newlines is safe
 * even for multi-line values (their newlines are escaped inside the scalar).
 */
function parseFrontmatter(md: string): Record<string, unknown> {
  const lines = md.split('\n');
  expect(lines[0]).toBe('---');
  const end = lines.indexOf('---', 1);
  expect(end).toBeGreaterThan(0);
  const out: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const i = line.indexOf(': ');
    out[line.slice(0, i)] = JSON.parse(line.slice(i + 2));
  }
  return out;
}

describe('buildFrontmatter', () => {
  it('escapes titles containing a colon (would break plain YAML)', () => {
    const fm = buildFrontmatter({ title: 'Sokol: a tiny library', date: '2026-06-14' });
    const parsed = parseFrontmatter(fm);
    expect(parsed.title).toBe('Sokol: a tiny library');
    expect(parsed.date).toBe('2026-06-14');
  });

  it('escapes multi-line summaries onto a single safe line', () => {
    const summary = 'First line.\nSecond line.';
    const fm = buildFrontmatter({ title: 'T', summary });
    expect(parseFrontmatter(fm).summary).toBe(summary);
  });

  it('serializes tags as a flow sequence and round-trips', () => {
    const tags = ['c', 'wasm', 'a: b'];
    const fm = buildFrontmatter({ title: 'T', tags });
    expect(parseFrontmatter(fm).tags).toEqual(tags);
  });

  it('omits empty/blank tags and empty summary', () => {
    const fm = buildFrontmatter({ title: 'T', tags: ['', 'x'], summary: '' });
    const parsed = parseFrontmatter(fm);
    expect(parsed.tags).toEqual(['x']);
    expect('summary' in parsed).toBe(false);
  });

  it('omits date when absent', () => {
    expect('date' in parseFrontmatter(buildFrontmatter({ title: 'T' }))).toBe(false);
  });

  it('opens and closes with a --- fence', () => {
    const lines = buildFrontmatter({ title: 'T', date: '2026-06-14' }).split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[lines.length - 1]).toBe('---');
  });
});

describe('yamlValue', () => {
  it('quotes strings as JSON (valid YAML flow scalars)', () => {
    expect(yamlValue('hello')).toBe('"hello"');
    expect(yamlValue('a: b')).toBe('"a: b"');
  });
});
