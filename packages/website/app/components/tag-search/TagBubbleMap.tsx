import { useEffect, useRef } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { pointer, select } from 'd3-selection';
import { zoom, type ZoomBehavior } from 'd3-zoom';
import { MAP_WIDTH, MAP_HEIGHT, type BubbleNode } from '../../lib/tagLayout';

type SimNode = BubbleNode & SimulationNodeDatum;

// Cursor interaction tuning (in map coordinates; see MAP_WIDTH/HEIGHT).
// The cursor gives a *soft, bounded* nudge to nearby bubbles (no hard wall),
// and the bubble closest to the pointer is "locked" so it can be clicked.
const REPEL_RADIUS = 140; // how far the cursor's push reaches
const REPEL_STRENGTH = 6; // max velocity injected per tick (bounded, gentle)
const CATCH_MARGIN = 14; // pointer within (radius + margin) → lock for clicking

function clusterColor(index: number): string {
  // Golden-ish hue spread per cluster; readable in light & dark.
  const hue = (index * 47) % 360;
  return `hsl(${hue} 60% 55%)`;
}

interface TagBubbleMapProps {
  nodes: BubbleNode[];
  language: 'en' | 'ja';
  onSelect: (tag: string) => void;
}

export default function TagBubbleMap({ nodes, language, onSelect }: TagBubbleMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomGroupRef = useRef<SVGGElement>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());

  useEffect(() => {
    // Stable per-tag targets (cluster centroid + seed jitter). The simulation
    // mutates node.x/node.y, so targets must be captured separately.
    const targets = new Map(nodes.map((n) => [n.tag, { x: n.x, y: n.y }]));
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Pointer position in map coordinates, and the currently "locked" bubble.
    let pointerPos: { x: number; y: number } | null = null;
    let activeTag: string | null = null;

    // Soft, bounded repulsion away from the cursor. The bubble under the
    // pointer (activeTag) is exempt so it stays put and stays clickable.
    const cursorForce = () => {
      if (!pointerPos) return;
      for (const n of simNodes) {
        if (n.tag === activeTag) continue;
        const dx = (n.x ?? 0) - pointerPos.x;
        const dy = (n.y ?? 0) - pointerPos.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0 || dist >= REPEL_RADIUS) continue;
        // Magnitude = STRENGTH * falloff (the 1/dist cancels with dx/dy),
        // so the per-tick nudge is bounded by REPEL_STRENGTH — never explosive.
        const k = (REPEL_STRENGTH * (1 - dist / REPEL_RADIUS)) / dist;
        n.vx = (n.vx ?? 0) + dx * k;
        n.vy = (n.vy ?? 0) + dy * k;
      }
    };

    const sim = forceSimulation<SimNode>(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(-40))
      .force('collide', forceCollide<SimNode>((d) => d.radius + 3).iterations(2))
      .force('x', forceX<SimNode>((d) => targets.get(d.tag)?.x ?? d.x).strength(0.08))
      .force('y', forceY<SimNode>((d) => targets.get(d.tag)?.y ?? d.y).strength(0.08))
      .force('cursor', cursorForce);

    // Lock / unlock the bubble nearest the pointer: pin it so it can't drift,
    // and highlight it so it reads as the click target.
    const setActive = (node: SimNode | null) => {
      const next = node ? node.tag : null;
      if (next === activeTag) return;
      if (activeTag) {
        const prev = simNodes.find((n) => n.tag === activeTag);
        if (prev) {
          prev.fx = null;
          prev.fy = null;
        }
      }
      activeTag = next;
      if (node) {
        node.fx = node.x ?? null;
        node.fy = node.y ?? null;
      }
      for (const n of simNodes) {
        const circle = nodeRefs.current.get(n.tag)?.querySelector('circle');
        if (!(circle instanceof SVGElement)) continue;
        if (n.tag === activeTag) {
          circle.style.opacity = '1';
          circle.style.stroke = '#eab308';
          circle.style.strokeWidth = '3';
        } else {
          circle.style.opacity = '';
          circle.style.stroke = '';
          circle.style.strokeWidth = '';
        }
      }
    };

    const ticked = () => {
      for (const n of simNodes) {
        const el = nodeRefs.current.get(n.tag);
        if (el && n.x != null && n.y != null) el.setAttribute('transform', `translate(${n.x},${n.y})`);
      }
    };
    sim.on('tick', ticked);

    if (reduced) {
      sim.stop();
      sim.tick(200);
      ticked();
    }

    // Pan / zoom.
    let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
    const svg = svgRef.current;
    const g = zoomGroupRef.current;
    if (svg && g) {
      zoomBehavior = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.4, 4])
        .on('zoom', (event) => g.setAttribute('transform', event.transform.toString()));
      const sel = select(svg);
      sel.call(zoomBehavior).on('dblclick.zoom', null);

      if (!reduced) {
        sel
          .on('pointerenter.cursor', () => {
            sim.alphaTarget(0.18).restart();
          })
          .on('pointermove.cursor', (event) => {
            const [mx, my] = pointer(event, g);
            pointerPos = { x: mx, y: my };

            // Lock the nearest bubble once the pointer is close enough.
            let nearest: SimNode | null = null;
            let nearestDist = Infinity;
            for (const n of simNodes) {
              const d = Math.hypot((n.x ?? 0) - mx, (n.y ?? 0) - my);
              if (d < nearestDist) {
                nearestDist = d;
                nearest = n;
              }
            }
            setActive(nearest && nearestDist <= nearest.radius + CATCH_MARGIN ? nearest : null);

            sim.alphaTarget(0.18).restart();
          })
          .on('pointerleave.cursor', () => {
            pointerPos = null;
            setActive(null);
            sim.alphaTarget(0);
          });
      }
    }

    return () => {
      sim.stop();
      if (svg) select(svg).on('.zoom', null).on('.cursor', null);
    };
  }, [nodes]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className="w-full h-full touch-none select-none"
      role="group"
      aria-label={language === 'ja' ? 'タグのバブルマップ' : 'Tag bubble map'}
    >
      <g ref={zoomGroupRef}>
        {nodes.map((n) => {
          const fontSize = Math.max(10, Math.min(18, n.radius / 2.4));
          return (
            <g
              key={n.tag}
              ref={(el) => {
                if (el) nodeRefs.current.set(n.tag, el);
                else nodeRefs.current.delete(n.tag);
              }}
              transform={`translate(${n.x},${n.y})`}
              role="button"
              tabIndex={0}
              aria-label={language === 'ja' ? `${n.tag}（${n.count}件）` : `${n.tag} (${n.count} posts)`}
              className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-yellow-500 [&:focus-visible>circle]:stroke-[3px]"
              onClick={() => onSelect(n.tag)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(n.tag);
                }
              }}
            >
              <circle
                r={n.radius}
                style={{ fill: clusterColor(n.clusterIndex) }}
                className="opacity-80 transition-opacity duration-200 hover:opacity-100 stroke-white/60 dark:stroke-black/30"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize }}
                className="pointer-events-none fill-gray-900 dark:fill-gray-50 font-serif font-medium"
              >
                {`#${n.tag}`}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
