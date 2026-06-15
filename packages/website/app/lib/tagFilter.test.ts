import { describe, it, expect } from 'vitest';
import { getActiveTags, buildTagSearch, matchesAllTags } from './tagFilter';

const sp = (s: string) => new URLSearchParams(s);

describe('getActiveTags', () => {
  it('returns all tag params', () => {
    expect(getActiveTags(sp('tag=a&tag=b'))).toEqual(['a', 'b']);
  });
  it('returns empty when none', () => {
    expect(getActiveTags(sp('view=list'))).toEqual([]);
  });
});

describe('buildTagSearch', () => {
  it('adds a tag', () => {
    expect(getActiveTags(sp(buildTagSearch(sp(''), { add: 'a' })))).toEqual(['a']);
  });
  it('appends without duplicating', () => {
    expect(getActiveTags(sp(buildTagSearch(sp('tag=a'), { add: 'a' })))).toEqual(['a']);
  });
  it('adds to existing (AND set)', () => {
    expect(getActiveTags(sp(buildTagSearch(sp('tag=a'), { add: 'b' }))).sort()).toEqual(['a', 'b']);
  });
  it('removes a tag', () => {
    expect(getActiveTags(sp(buildTagSearch(sp('tag=a&tag=b'), { remove: 'a' })))).toEqual(['b']);
  });
  it('preserves non-tag params', () => {
    const p = sp(buildTagSearch(sp('view=list&tag=a'), { add: 'b' }));
    expect(p.get('view')).toBe('list');
    expect(getActiveTags(p).sort()).toEqual(['a', 'b']);
  });
  it('returns empty string when nothing left', () => {
    expect(buildTagSearch(sp('tag=a'), { remove: 'a' })).toBe('');
  });
  it('round-trips special characters', () => {
    const r = buildTagSearch(sp(''), { add: 'Sanity CMS' });
    expect(getActiveTags(sp(r))).toEqual(['Sanity CMS']);
  });
});

describe('matchesAllTags', () => {
  it('requires every active tag (AND)', () => {
    expect(matchesAllTags(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
    expect(matchesAllTags(['a', 'c'], ['a', 'b'])).toBe(false);
  });
  it('matches everything when no active tags', () => {
    expect(matchesAllTags(['a'], [])).toBe(true);
    expect(matchesAllTags(undefined, [])).toBe(true);
  });
  it('does not match when entry has no tags but a filter is active', () => {
    expect(matchesAllTags(undefined, ['a'])).toBe(false);
  });
});
