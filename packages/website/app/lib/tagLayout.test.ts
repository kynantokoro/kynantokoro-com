import { describe, it, expect } from 'vitest';
import {
  computeTagSetHash,
  parseTagLayout,
  radiusFor,
  clusterCentroids,
  buildBubbleNodes,
  type TagLayout,
} from './tagLayout';
import type { TagGroup } from './tags';

describe('computeTagSetHash', () => {
  it('is order- and duplicate-independent', () => {
    expect(computeTagSetHash(['b', 'a', 'a'])).toBe(computeTagSetHash(['a', 'b']));
  });
  it('changes when the set changes', () => {
    expect(computeTagSetHash(['a', 'b'])).not.toBe(computeTagSetHash(['a', 'b', 'c']));
  });
  it('is deterministic and hex', () => {
    const h = computeTagSetHash(['a', 'b']);
    expect(h).toMatch(/^[0-9a-f]+$/);
    expect(computeTagSetHash(['a', 'b'])).toBe(h);
  });
});

describe('parseTagLayout', () => {
  const good = {
    hash: 'x',
    generatedAt: '2026-01-01T00:00:00Z',
    model: 'claude-sonnet-4-6',
    clusters: [{ id: 'web', name: { en: 'Web', ja: 'ウェブ' }, tags: ['a', 'b'] }],
  };
  it('parses a valid layout', () => {
    const l = parseTagLayout(good);
    expect(l.clusters[0].tags).toEqual(['a', 'b']);
  });
  it('throws on invalid layout', () => {
    expect(() => parseTagLayout({ clusters: 'nope' })).toThrow();
    expect(() => parseTagLayout(null)).toThrow();
  });
  it('allows clusters without names', () => {
    const l = parseTagLayout({ ...good, clusters: [{ id: 'x', tags: [] }] });
    expect(l.clusters[0].name).toBeUndefined();
  });
});

describe('radiusFor', () => {
  it('returns minR when maxCount<=0', () => {
    expect(radiusFor(0, 0, { minR: 10, maxR: 50 })).toBe(10);
  });
  it('returns maxR at the max count', () => {
    expect(radiusFor(9, 9, { minR: 10, maxR: 50 })).toBe(50);
  });
  it('scales by sqrt between min and max', () => {
    // count/maxCount = 0.25 -> sqrt = 0.5 -> 10 + 40*0.5 = 30
    expect(radiusFor(1, 4, { minR: 10, maxR: 50 })).toBe(30);
  });
});

describe('clusterCentroids', () => {
  it('returns the center for n<=1', () => {
    expect(clusterCentroids(1, { width: 100, height: 100 })).toEqual([{ x: 50, y: 50 }]);
  });
  it('returns n distinct points on a circle', () => {
    const pts = clusterCentroids(4, { width: 100, height: 100 });
    expect(pts).toHaveLength(4);
    const uniq = new Set(pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(uniq.size).toBe(4);
  });
  it('is deterministic', () => {
    expect(clusterCentroids(3, { width: 200, height: 120 })).toEqual(
      clusterCentroids(3, { width: 200, height: 120 })
    );
  });
});

describe('buildBubbleNodes', () => {
  const grouped: Record<string, TagGroup> = {
    rust: { count: 4, entries: [] },
    gamedev: { count: 1, entries: [] },
    misc: { count: 2, entries: [] },
  };
  const layout: TagLayout = {
    hash: 'x',
    generatedAt: 't',
    model: 'm',
    clusters: [
      { id: 'systems', tags: ['rust'] },
      { id: 'play', tags: ['gamedev'] },
    ],
  };

  it('assigns known tags to their cluster index', () => {
    const nodes = buildBubbleNodes(grouped, layout, { width: 800, height: 600 });
    const rust = nodes.find((n) => n.tag === 'rust')!;
    expect(rust.clusterId).toBe('systems');
    expect(rust.clusterIndex).toBe(0);
    expect(rust.count).toBe(4);
  });

  it('routes unknown tags to the other cluster', () => {
    const nodes = buildBubbleNodes(grouped, layout, { width: 800, height: 600 });
    const misc = nodes.find((n) => n.tag === 'misc')!;
    expect(misc.clusterId).toBe('other');
    expect(misc.clusterIndex).toBe(layout.clusters.length);
  });

  it('produces a node per tag with finite seed coords and count-scaled radius', () => {
    const nodes = buildBubbleNodes(grouped, layout, { width: 800, height: 600 });
    expect(nodes).toHaveLength(3);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.radius).toBeGreaterThan(0);
    }
    const rust = nodes.find((n) => n.tag === 'rust')!;
    const gamedev = nodes.find((n) => n.tag === 'gamedev')!;
    expect(rust.radius).toBeGreaterThan(gamedev.radius);
  });

  it('is deterministic across calls', () => {
    const a = buildBubbleNodes(grouped, layout, { width: 800, height: 600 });
    const b = buildBubbleNodes(grouped, layout, { width: 800, height: 600 });
    expect(a).toEqual(b);
  });
});
