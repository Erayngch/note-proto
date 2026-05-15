import type { GraphData, GraphEdge } from "./types.js";

export type TraversalDirection = "outgoing" | "incoming" | "both";

export type SubgraphSource = {
  seedTitles: string[];
  direction: TraversalDirection;
  /** undefined = 葉まで（無制限）。0 以上なら N ホップで打ち切り。 */
  maxHops?: number;
  /** 有向リンクで out-degree 0 のノードのみ残す。無向リンクは判定に含めない。 */
  leavesOnly?: boolean;
};

export type SetOp = "union" | "intersect" | "difference";

/** sources を左から二項で畳み込む。`ops.length === sources.length - 1` を期待。 */
export type SubgraphQuery = {
  sources: SubgraphSource[];
  ops: SetOp[];
};

export type SubgraphResult = {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  unresolvedTitles: string[];
};

const buildTitleIndex = (graph: GraphData): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const list = map.get(node.label);
    if (list) list.push(node.id);
    else map.set(node.label, [node.id]);
  }
  return map;
};

const resolveSeeds = (
  titles: string[],
  index: Map<string, string[]>,
): { ids: Set<string>; unresolved: string[] } => {
  const ids = new Set<string>();
  const unresolved: string[] = [];
  for (const raw of titles) {
    const title = raw.trim();
    if (title.length === 0) continue;
    const hits = index.get(title);
    if (!hits || hits.length === 0) {
      unresolved.push(title);
      continue;
    }
    for (const id of hits) ids.add(id);
  }
  return { ids, unresolved };
};

// Undirected edges are always traversed bidirectionally regardless of the chosen direction.
const stepNeighbors = (
  frontier: Set<string>,
  edges: GraphEdge[],
  direction: TraversalDirection,
): Set<string> => {
  const next = new Set<string>();
  for (const e of edges) {
    if (e.direction === "undirected") {
      if (frontier.has(e.source)) next.add(e.target);
      if (frontier.has(e.target)) next.add(e.source);
      continue;
    }
    if (direction === "outgoing" || direction === "both") {
      if (frontier.has(e.source)) next.add(e.target);
    }
    if (direction === "incoming" || direction === "both") {
      if (frontier.has(e.target)) next.add(e.source);
    }
  }
  return next;
};

const expand = (
  seeds: Set<string>,
  edges: GraphEdge[],
  direction: TraversalDirection,
  maxHops: number | undefined,
): Set<string> => {
  const visited = new Set(seeds);
  let frontier = new Set(seeds);
  let hops = 0;
  while (frontier.size > 0 && (maxHops === undefined || hops < maxHops)) {
    const next = stepNeighbors(frontier, edges, direction);
    const fresh = new Set<string>();
    for (const id of next) {
      if (!visited.has(id)) {
        visited.add(id);
        fresh.add(id);
      }
    }
    frontier = fresh;
    hops += 1;
  }
  return visited;
};

const isGlobalLeaf = (id: string, edges: GraphEdge[]): boolean => {
  for (const e of edges) {
    if (e.direction === "directed" && e.source === id) return false;
  }
  return true;
};

const filterLeaves = (nodes: Set<string>, edges: GraphEdge[]): Set<string> => {
  const out = new Set<string>();
  for (const id of nodes) {
    if (isGlobalLeaf(id, edges)) out.add(id);
  }
  return out;
};

const evaluateSource = (
  source: SubgraphSource,
  graph: GraphData,
  titleIndex: Map<string, string[]>,
): { ids: Set<string>; unresolved: string[] } => {
  const { ids: seeds, unresolved } = resolveSeeds(source.seedTitles, titleIndex);
  if (seeds.size === 0) return { ids: new Set(), unresolved };
  const expanded = expand(seeds, graph.edges, source.direction, source.maxHops);
  const filtered = source.leavesOnly ? filterLeaves(expanded, graph.edges) : expanded;
  return { ids: filtered, unresolved };
};

const applyOp = (a: Set<string>, b: Set<string>, op: SetOp): Set<string> => {
  if (op === "union") {
    const out = new Set(a);
    for (const id of b) out.add(id);
    return out;
  }
  if (op === "intersect") {
    const out = new Set<string>();
    for (const id of a) if (b.has(id)) out.add(id);
    return out;
  }
  const out = new Set(a);
  for (const id of b) out.delete(id);
  return out;
};

const dedupePreserveOrder = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
};

export const evaluateSubgraph = (graph: GraphData, query: SubgraphQuery): SubgraphResult => {
  if (query.sources.length === 0) {
    return { nodeIds: new Set(), edgeIds: new Set(), unresolvedTitles: [] };
  }

  const titleIndex = buildTitleIndex(graph);
  const unresolvedAll: string[] = [];
  const sourceResults: Set<string>[] = [];
  for (const source of query.sources) {
    const r = evaluateSource(source, graph, titleIndex);
    unresolvedAll.push(...r.unresolved);
    sourceResults.push(r.ids);
  }

  let nodeIds = new Set<string>(sourceResults[0] ?? []);
  for (let i = 1; i < sourceResults.length; i += 1) {
    const next = sourceResults[i];
    if (!next) continue;
    const op = query.ops[i - 1] ?? "union";
    nodeIds = applyOp(nodeIds, next, op);
  }

  const edgeIds = new Set<string>();
  for (const e of graph.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) edgeIds.add(e.id);
  }

  return { nodeIds, edgeIds, unresolvedTitles: dedupePreserveOrder(unresolvedAll) };
};
