import { describe, it, expect } from 'vitest';
import {
  buildClusterPrompt,
  extractJson,
  clustersFromModelText,
  ensureCoverage,
  sortClusters,
  reconcileClusters,
  layoutFromModelText,
  layoutFromExisting,
} from './tagLayoutGen';

describe('buildClusterPrompt', () => {
  it('embeds the tags and asks for JSON-only clusters', () => {
    const p = buildClusterPrompt(['rust', 'gamedev']);
    expect(p).toContain('["rust","gamedev"]');
    expect(p).toContain('"clusters"');
    expect(p).toContain('Output JSON only');
  });

  it('builds an incremental prompt that anchors on existing clusters', () => {
    const existing = [{ id: 'web', name: { en: 'Web', ja: 'ウェブ' }, tags: ['http'] }];
    const p = buildClusterPrompt(['http', 'rust'], existing);
    expect(p).toContain('Existing clusters');
    expect(p).toContain('"http"'); // existing layout serialized
    expect(p).toContain('["rust"]'); // only the new tag is to be placed
    expect(p).toContain('unchanged');
  });
});

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"clusters":[]}')).toEqual({ clusters: [] });
  });
  it('parses JSON inside a ```json fence', () => {
    const t = 'Here you go:\n```json\n{"clusters":[{"id":"a","tags":["x"]}]}\n```\nDone.';
    expect(extractJson(t)).toEqual({ clusters: [{ id: 'a', tags: ['x'] }] });
  });
  it('parses JSON inside a bare fence', () => {
    expect(extractJson('```\n{"clusters":[]}\n```')).toEqual({ clusters: [] });
  });
  it('parses JSON surrounded by prose', () => {
    expect(extractJson('blah blah {"clusters":[]} trailing words')).toEqual({ clusters: [] });
  });
  it('throws when there is no JSON object', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('clustersFromModelText', () => {
  it('returns validated clusters', () => {
    const t = '{"clusters":[{"id":"web","name":{"en":"Web","ja":"ウェブ"},"tags":["http"]}]}';
    const clusters = clustersFromModelText(t, 'test-model');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toBe('web');
    expect(clusters[0].tags).toEqual(['http']);
  });
  it('throws on an invalid cluster shape', () => {
    expect(() => clustersFromModelText('{"clusters":[{"id":123}]}', 'm')).toThrow();
  });
});

describe('ensureCoverage', () => {
  const tags = ['a', 'b', 'c'];

  it('keeps known tags and dedupes across clusters', () => {
    const out = ensureCoverage(tags, [
      { id: 'x', tags: ['a', 'b'] },
      { id: 'y', tags: ['b', 'c'] }, // 'b' already seen → dropped from y
    ]);
    expect(out.find((c) => c.id === 'x')?.tags).toEqual(['a', 'b']);
    expect(out.find((c) => c.id === 'y')?.tags).toEqual(['c']);
    expect(out.find((c) => c.id === 'other')).toBeUndefined();
  });

  it('drops unknown tags and sweeps missing ones into `other`', () => {
    const out = ensureCoverage(tags, [{ id: 'x', tags: ['a', 'zzz'] }]);
    expect(out.find((c) => c.id === 'x')?.tags).toEqual(['a']);
    const other = out.find((c) => c.id === 'other');
    expect(other?.tags).toEqual(['b', 'c']);
    expect(other?.name).toEqual({ en: 'Other', ja: 'その他' });
  });

  it('drops clusters that become empty and adds no `other` when fully covered', () => {
    const out = ensureCoverage(tags, [
      { id: 'empty', tags: ['zzz'] }, // all unknown → cluster dropped
      { id: 'x', tags: ['a', 'b', 'c'] },
    ]);
    expect(out.find((c) => c.id === 'empty')).toBeUndefined();
    expect(out.find((c) => c.id === 'other')).toBeUndefined();
    expect(out).toHaveLength(1);
  });

  it('merges swept-up tags into a model-provided `other` instead of duplicating it', () => {
    const out = ensureCoverage(tags, [{ id: 'other', name: { en: 'Other', ja: 'その他' }, tags: ['a'] }]);
    const others = out.filter((c) => c.id === 'other');
    expect(others).toHaveLength(1);
    expect(others[0].tags).toEqual(['a', 'b', 'c']);
  });
});

describe('sortClusters', () => {
  it('sorts clusters by id and tags within each cluster', () => {
    const out = sortClusters([
      { id: 'b', tags: ['z', 'a'] },
      { id: 'a', tags: ['m', 'c'] },
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
    expect(out[0].tags).toEqual(['c', 'm']);
    expect(out[1].tags).toEqual(['a', 'z']);
  });

  it('orders by code point, not locale (matches the hash convention)', () => {
    const out = sortClusters([{ id: 'x', tags: ['a', 'B', 'c'] }]);
    expect(out[0].tags).toEqual(['B', 'a', 'c']); // 'B'(66) < 'a'(97) < 'c'(99)
  });
});

describe('reconcileClusters', () => {
  const existing = [
    { id: 'web', name: { en: 'Web', ja: 'ウェブ' }, tags: ['http', 'css'] },
    { id: 'lang', name: { en: 'Languages', ja: '言語' }, tags: ['rust'] },
  ];

  it('keeps existing tags put even when the model moved or renamed them', () => {
    const model = [
      { id: 'web-renamed', name: { en: 'X', ja: 'X' }, tags: ['css'] },
      { id: 'lang', name: { en: 'Different', ja: '別' }, tags: ['rust', 'http'] },
    ];
    const out = reconcileClusters(['http', 'css', 'rust'], model, existing);
    expect(out.find((c) => c.id === 'web')?.tags.slice().sort()).toEqual(['css', 'http']);
    expect(out.find((c) => c.id === 'web')?.name).toEqual({ en: 'Web', ja: 'ウェブ' });
    expect(out.find((c) => c.id === 'lang')?.tags).toEqual(['rust']);
  });

  it('places a new tag into the existing cluster the model chose', () => {
    const model = [{ id: 'web', tags: ['ts'] }];
    const out = reconcileClusters(['http', 'css', 'rust', 'ts'], model, existing);
    expect(out.find((c) => c.id === 'web')?.tags.slice().sort()).toEqual(['css', 'http', 'ts']);
  });

  it('adopts a model-proposed new cluster for a new tag', () => {
    const model = [{ id: 'audio', name: { en: 'Audio', ja: '音' }, tags: ['daw'] }];
    const out = reconcileClusters(['http', 'css', 'rust', 'daw'], model, existing);
    const audio = out.find((c) => c.id === 'audio');
    expect(audio?.tags).toEqual(['daw']);
    expect(audio?.name).toEqual({ en: 'Audio', ja: '音' });
  });

  it('drops removed tags and sweeps unplaced new tags into other', () => {
    const out = reconcileClusters(['http', 'newbie'], [], existing);
    expect(out.find((c) => c.id === 'web')?.tags).toEqual(['http']);
    expect(out.find((c) => c.id === 'lang')).toBeUndefined(); // emptied → dropped
    expect(out.find((c) => c.id === 'other')?.tags).toEqual(['newbie']);
  });

  it('does not revive an emptied cluster with its stale name when the model reuses its id', () => {
    const model = [{ id: 'lang', name: { en: 'Systems', ja: 'システム' }, tags: ['go'] }];
    const out = reconcileClusters(['http', 'css', 'go'], model, existing); // 'rust' removed → 'lang' empties
    const lang = out.find((c) => c.id === 'lang');
    expect(lang?.tags).toEqual(['go']);
    expect(lang?.name).toEqual({ en: 'Systems', ja: 'システム' }); // fresh model name, not stale 'Languages'
  });
});

describe('layoutFromModelText', () => {
  it('builds a fully-covering, validated layout from raw model text', () => {
    const tags = ['rust', 'gamedev', 'music'];
    const text =
      'Sure!\n```json\n{"clusters":[{"id":"code","name":{"en":"Code","ja":"コード"},"tags":["rust","gamedev"]}]}\n```';
    const layout = layoutFromModelText(text, tags, {
      model: 'test-model',
      hash: 'abc123',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(layout.hash).toBe('abc123');
    expect(layout.model).toBe('test-model');
    expect(layout.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    const covered = layout.clusters.flatMap((c) => c.tags).sort();
    expect(covered).toEqual(['gamedev', 'music', 'rust']);
    expect(layout.clusters.find((c) => c.id === 'other')?.tags).toEqual(['music']);
  });

  it('anchors on existing clusters, only adding new tags', () => {
    const existing = [{ id: 'web', name: { en: 'Web', ja: 'ウェブ' }, tags: ['http'] }];
    const text = '{"clusters":[{"id":"web","name":{"en":"Web","ja":"ウェブ"},"tags":["http","ts"]}]}';
    const layout = layoutFromModelText('blah ' + text, ['http', 'ts'], {
      model: 'm',
      hash: 'h',
      generatedAt: 't',
      existing,
    });
    expect(layout.clusters.find((c) => c.id === 'web')?.tags).toEqual(['http', 'ts']);
  });
});

describe('layoutFromExisting', () => {
  it('prunes removed tags without a model call and sorts', () => {
    const existing = [
      { id: 'web', name: { en: 'Web', ja: 'ウェブ' }, tags: ['http', 'css'] },
      { id: 'lang', name: { en: 'Lang', ja: '言語' }, tags: ['rust'] },
    ];
    const layout = layoutFromExisting(['http'], { model: 'manual', hash: 'h', existing, generatedAt: 't' });
    expect(layout.clusters.map((c) => c.id)).toEqual(['web']); // lang emptied → dropped
    expect(layout.clusters[0].tags).toEqual(['http']);
    expect(layout.model).toBe('manual');
  });
});
