import { z } from 'zod';
import type { TagGroup } from './tags';

export interface TagCluster {
  id: string;
  name?: { en?: string; ja?: string };
  tags: string[];
}

export interface TagLayout {
  hash: string;
  generatedAt: string;
  model: string;
  clusters: TagCluster[];
}

export interface BubbleNode {
  tag: string;
  count: number;
  radius: number;
  clusterId: string;
  clusterIndex: number;
  x: number;
  y: number;
}

// --- hashing (change-detector only; not cryptographic) ---------------------

function fnv1aInt(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fnv1aHex(str: string): string {
  return fnv1aInt(str).toString(16).padStart(8, '0');
}

/**
 * Hash of the *set* of tags (order/duplicate independent) plus its size.
 * Used by the CI generator to decide whether the semantic layout must be
 * regenerated. Deterministic across Node and the Worker runtime.
 */
export function computeTagSetHash(tags: string[]): string {
  const uniq = Array.from(new Set(tags)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = uniq.join('\n') + '|' + uniq.length;
  return fnv1aHex(canonical);
}

// --- layout artifact parsing ----------------------------------------------

const clusterSchema = z.object({
  id: z.string(),
  name: z.object({ en: z.string().optional(), ja: z.string().optional() }).optional(),
  tags: z.array(z.string()),
});

const layoutSchema = z.object({
  hash: z.string(),
  generatedAt: z.string(),
  model: z.string(),
  clusters: z.array(clusterSchema),
});

export function parseTagLayout(data: unknown): TagLayout {
  return layoutSchema.parse(data);
}

// --- bubble geometry -------------------------------------------------------

/** Logical canvas size the bubble map is laid out in (matches the SVG viewBox). */
export const MAP_WIDTH = 900;
export const MAP_HEIGHT = 600;

export function radiusFor(
  count: number,
  maxCount: number,
  opts: { minR: number; maxR: number } = { minR: 18, maxR: 60 }
): number {
  const { minR, maxR } = opts;
  if (maxCount <= 0) return minR;
  const t = Math.sqrt(Math.max(0, count) / maxCount);
  return minR + (maxR - minR) * t;
}

/** n cluster centroids evenly placed on a circle (deterministic). */
export function clusterCentroids(
  n: number,
  size: { width: number; height: number }
): { x: number; y: number }[] {
  const cx = size.width / 2;
  const cy = size.height / 2;
  if (n <= 1) return [{ x: cx, y: cy }];
  const r = Math.min(size.width, size.height) * 0.3;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Small deterministic offset from a tag string, so seeds don't overlap. */
function jitter(tag: string): { dx: number; dy: number } {
  const h = fnv1aInt(tag);
  const ang = (h % 360) * (Math.PI / 180);
  const mag = 8 + (h % 24);
  return { dx: Math.cos(ang) * mag, dy: Math.sin(ang) * mag };
}

/**
 * Turn aggregated tag counts + the committed semantic layout into seeded
 * force-simulation nodes. Tags not present in any cluster (e.g. added after
 * the last CI run) fall back to a synthetic `other` cluster.
 */
export function buildBubbleNodes(
  grouped: Record<string, TagGroup>,
  layout: TagLayout,
  size: { width: number; height: number }
): BubbleNode[] {
  const tags = Object.keys(grouped);
  const maxCount = tags.reduce((m, t) => Math.max(m, grouped[t].count), 0);

  const tagToCluster = new Map<string, { id: string; index: number }>();
  layout.clusters.forEach((c, i) => {
    for (const t of c.tags) if (!tagToCluster.has(t)) tagToCluster.set(t, { id: c.id, index: i });
  });
  const otherIndex = layout.clusters.length;
  const centroids = clusterCentroids(layout.clusters.length + 1, size);

  return tags.map((tag) => {
    const cluster = tagToCluster.get(tag) ?? { id: 'other', index: otherIndex };
    const c = centroids[cluster.index] ?? centroids[centroids.length - 1];
    const j = jitter(tag);
    return {
      tag,
      count: grouped[tag].count,
      radius: radiusFor(grouped[tag].count, maxCount),
      clusterId: cluster.id,
      clusterIndex: cluster.index,
      x: c.x + j.dx,
      y: c.y + j.dy,
    };
  });
}
