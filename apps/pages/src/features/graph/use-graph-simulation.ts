import { useRef, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphData, LinkDirection } from "core";

export type SimNode = SimulationNodeDatum & {
  id: string;
  label: string;
};

export type SimLink = SimulationLinkDatum<SimNode> & {
  id: string;
  direction: LinkDirection;
};

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

      const nodesChanged =
        newNodes.length !== nodesRef.current.length ||
        newNodes.some((n) => !oldPositions.has(n.id));

      linksRef.current = newLinks;

      if (nodesChanged || !simRef.current) {
        nodesRef.current = newNodes;
        simRef.current?.stop();
        simRef.current = forceSimulation<SimNode>(newNodes)
          .force(
            "link",
            forceLink<SimNode, SimLink>(newLinks)
              .id((d) => d.id)
              .distance(200),
          )
          .force("charge", forceManyBody().strength(-500))
          .force("center", forceCenter(width / 2, height / 2))
          .force("collide", forceCollide(60))
          .on("tick", () => onTick([...nodesRef.current], [...linksRef.current]))
          .on("end", () => onEndRef.current?.([...nodesRef.current]));
      } else {
        // Only links changed — update link force and reheat gently
        const linkForce = simRef.current.force("link") as ReturnType<
          typeof forceLink<SimNode, SimLink>
        >;
        linkForce.links(newLinks);
        simRef.current.alpha(0.3).restart();
      }
    },
    [width, height, onTick],
  );

  const stop = useCallback(() => {
    simRef.current?.stop();
  }, []);

  return { update, stop, nodesRef, linksRef };
};
