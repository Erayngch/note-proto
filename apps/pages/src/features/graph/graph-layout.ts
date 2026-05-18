import type { GraphData } from "core";

/**
 * BFS from every node, treating edges as undirected for layout purposes.
 * Disconnected pairs simply have no entry in the inner map.
 */
export const computeAllPairsDistance = (data: GraphData): Map<string, Map<string, number>> => {
  const adjacency = new Map<string, string[]>();
  for (const node of data.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of data.edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const result = new Map<string, Map<string, number>>();
  for (const start of data.nodes) {
    const distances = new Map<string, number>([[start.id, 0]]);
    const queue: string[] = [start.id];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++]!;
      const currentDist = distances.get(current)!;
      for (const next of adjacency.get(current) ?? []) {
        if (!distances.has(next)) {
          distances.set(next, currentDist + 1);
          queue.push(next);
        }
      }
    }
    result.set(start.id, distances);
  }
  return result;
};

/**
 * Smooth saturating map from graph distance to desired spatial distance.
 *   d = 1 → minDistance
 *   d → ∞ → maxDistance
 * The asymptote keeps disconnected/very-far pairs from pushing each other
 * past the visible viewport, without picking a hard cutoff K.
 */
export const desiredDistance = (d: number, minDistance: number, maxDistance: number): number => {
  if (d <= 0) return 0;
  if (!Number.isFinite(d)) return maxDistance;
  return maxDistance - (maxDistance - minDistance) / d;
};
