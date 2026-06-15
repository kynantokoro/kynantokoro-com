import { describe, it, expect } from 'vitest';
import { blogPostingLd, blogLd } from './jsonLd';
import type { TagEntry } from './tags';

const entry: TagEntry = {
  slug: 'hello',
  title: { en: 'Hello', ja: 'こんにちは' },
  date: '2026-01-02',
  summary: { en: 'a post', ja: '投稿' },
  tags: ['rust', 'gamedev'],
};

describe('blogPostingLd', () => {
  it('builds a BlogPosting with localized fields', () => {
    const ld = blogPostingLd(entry, { lang: 'ja', siteUrl: 'https://s.test' });
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline).toBe('こんにちは');
    expect(ld.description).toBe('投稿');
    expect(ld.inLanguage).toBe('ja');
    expect(ld.keywords).toBe('rust, gamedev');
    expect(ld.url).toBe('https://s.test/ja/entry/hello');
    expect(ld.datePublished).toBe('2026-01-02');
  });

  it('falls back to en when the language is missing', () => {
    const ld = blogPostingLd({ ...entry, title: { en: 'Only EN' } }, { lang: 'ja', siteUrl: 'https://s.test' });
    expect(ld.headline).toBe('Only EN');
  });
});

describe('blogLd', () => {
  it('builds a Blog with an ItemList of posts', () => {
    const ld = blogLd([entry], { lang: 'en', siteUrl: 'https://s.test' });
    expect(ld['@type']).toBe('Blog');
    expect(ld.blogPost).toHaveLength(1);
    expect(ld.blogPost[0].url).toBe('https://s.test/en/entry/hello');
  });
});
