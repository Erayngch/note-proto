import { useRef, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphData, LinkDirection } from "core";
import { computeAllPairsDistance, desiredDistance } from "./graph-layout";

export type SimNode = SimulationNodeDatum & {
  id: string;
  label: string;
};

export type SimLink = SimulationLinkDatum<SimNode> & {
  id: string;
  direction: LinkDirection;
};

type PairLink = SimulationLinkDatum<SimNode> & {
  id: string;
  desired: number;
};

// Direct neighbors sit about this far apart. Sized so the 12px label above
// each node has room without overlapping its sibling.
const MIN_DISTANCE = 100;

// Real edges should win when they fight the virtual all-pairs springs;
// virtual links use their own (lower) strength.
const PAIR_STRENGTH = 0.04;

const computeMaxDistance = (width: number, height: number) =>
  Math.max(Math.min(width, height) / 3, MIN_DISTANCE * 2);

export const useGraphSimulation = (
  width: number,
  height: number,
  onTick: (nodes: SimNode[], links: SimLink[]) => void,
  onEnd?: (nodes: SimNode[]) => void,
) => {
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const update = useCallback(
    (data: GraphData) => {
      const oldPositions = new Map(
        nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]),
      );

      const newNodes: SimNode[] = data.nodes.map((n) => {
        const old = oldPositions.get(n.id);
        return old
          ? { id: n.id, label: n.label, x: old.x, y: old.y, vx: old.vx, vy: old.vy }
          : { id: n.id, label: n.label };
      });

      const newLinks: SimLink[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        direction: e.direction,
      }));

      const maxDistance = computeMaxDistance(width, height);
      const distances = computeAllPairsDistance(data);

      const pairLinks: PairLink[] = [];
      for (let i = 0; i < newNodes.length; i++) {
        for (let j = i + 1; j < newNodes.length; j++) {
          const a = newNodes[i]!;
          const b = newNodes[j]!;
          const d = distances.get(a.id)?.get(b.id) ?? Infinity;
          pairLinks.push({
            id: `${a.id}__${b.id}`,
            source: a.id,
            target: b.id,
            desired: desiredDistance(d, MIN_DISTANCE, maxDistance),
          });
        }
      }

      linksRef.current = newLinks;
      nodesRef.current = newNodes;

      simRef.current?.stop();
      simRef.current = forceSimulation<SimNode>(newNodes)
        .force(
          "link",
          forceLink<SimNode, SimLink>(newLinks)
            .id((d) => d.id)
            .distance(MIN_DISTANCE),
        )
        .force(
          "pair",
          forceLink<SimNode, PairLink>(pairLinks)
            .id((d) => d.id)
            .distance((l) => l.desired)
            .strength(PAIR_STRENGTH),
        )
        .force("collide", forceCollide(60))
        .force("center", forceCenter(width / 2, height / 2).strength(0.02))
        .on("tick", () => onTick([...nodesRef.current], [...linksRef.current]))
        .on("end", () => onEndRef.current?.([...nodesRef.current]));
    },
    [width, height, onTick],
  );

  const stop = useCallback(() => {
    simRef.current?.stop();
  }, []);

  return { update, stop, nodesRef, linksRef };
};
