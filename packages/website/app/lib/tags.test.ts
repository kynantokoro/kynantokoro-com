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
