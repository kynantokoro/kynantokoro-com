import { describe, it, expect } from 'vitest';
import {
  buildClusterPrompt,
  extractJson,
  clustersFromModelText,
  ensureCoverage,
  layoutFromModelText,
} from './tagLayoutGen';

describe('buildClusterPrompt', () => {
  it('embeds the tags and asks for JSON-only clusters', () => {
    const p = buildClusterPrompt(['rust', 'gamedev']);
    expect(p).toContain('["rust","gamedev"]');
    expect(p).toContain('"clusters"');
    expect(p).toContain('Output JSON only');
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
    // every input tag is covered exactly once
    const covered = layout.clusters.flatMap((c) => c.tags).sort();
    expect(covered).toEqual(['gamedev', 'music', 'rust']);
    // the un-clustered 'music' was swept into 'other'
    expect(layout.clusters.find((c) => c.id === 'other')?.tags).toEqual(['music']);
  });
});
