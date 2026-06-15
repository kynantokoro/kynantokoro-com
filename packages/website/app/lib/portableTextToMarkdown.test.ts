import { describe, it, expect } from 'vitest';
import { portableTextToMarkdown } from './portableTextToMarkdown';

describe('portableTextToMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(portableTextToMarkdown([])).toBe('');
    expect(portableTextToMarkdown(undefined)).toBe('');
  });

  it('serializes headings and paragraphs', () => {
    const blocks = [
      { _type: 'block', style: 'h2', children: [{ _type: 'span', text: 'Title' }] },
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: 'Hello world' }] },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('## Title\n\nHello world');
  });

  it('applies decorators and link annotations', () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        markDefs: [{ _key: 'l1', _type: 'link', href: 'https://x.test' }],
        children: [
          { _type: 'span', text: 'bold', marks: ['strong'] },
          { _type: 'span', text: ' and ' },
          { _type: 'span', text: 'link', marks: ['l1'] },
        ],
      },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('**bold** and [link](https://x.test)');
  });

  it('serializes tight lists', () => {
    const blocks = [
      { _type: 'block', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'a' }] },
      { _type: 'block', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'b' }] },
    ];
    expect(portableTextToMarkdown(blocks)).toBe('- a\n- b');
  });

  it('serializes images with resolver and caption', () => {
    const blocks = [
      { _type: 'image', asset: { _ref: 'image-abc' }, alt: 'pic', caption: 'cap' },
    ];
    const md = portableTextToMarkdown(blocks, { resolveImageUrl: () => 'https://cdn/x.png' });
    expect(md).toBe('![pic](https://cdn/x.png)\n\n*cap*');
  });

  it('serializes game embeds and audio players as links', () => {
    const blocks = [
      { _type: 'gameEmbed', gameSlug: 'my-game', title: 'My Game' },
      { _type: 'audioPlayer', audioUrl: 'https://a/x.mp3', title: 'Track' },
    ];
    expect(portableTextToMarkdown(blocks, { siteUrl: 'https://s.test' })).toBe(
      '[▶ Play: My Game](https://s.test/projects/my-game)\n\n[🔊 Audio: Track](https://a/x.mp3)'
    );
  });
});
