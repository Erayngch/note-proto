import { describe, test, expect } from "vite-plus/test";
import { evaluateSubgraph } from "../src/subgraph.ts";
import type { GraphData, GraphEdge } from "../src/index.ts";

const buildGraph = (nodeMap: Record<string, string>, edges: GraphEdge[]): GraphData => ({
  nodes: Object.entries(nodeMap).map(([id, label]) => ({ id, label })),
  edges,
});

const directedEdge = (id: string, source: string, target: string): GraphEdge => ({
  id,
  source,
  target,
  direction: "directed",
});

const undirectedEdge = (id: string, source: string, target: string): GraphEdge => ({
  id,
  source,
  target,
  direction: "undirected",
});

describe("evaluateSubgraph - traversal", () => {
  test("outgoing one hop returns direct successors only", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C", D: "D" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
      directedEdge("e3", "C", "D"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A"], direction: "outgoing", maxHops: 1 }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B"]);
    expect([...result.edgeIds].sort()).toEqual(["e1"]);
  });

  test("outgoing unlimited reaches all descendants", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C", D: "D" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
      directedEdge("e3", "C", "D"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A"], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C", "D"]);
    expect([...result.edgeIds].sort()).toEqual(["e1", "e2", "e3"]);
  });

  test("incoming reaches predecessors", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C", X: "X" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
      directedEdge("e3", "X", "C"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["C"], direction: "incoming" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C", "X"]);
  });

  test("both follows directed edges in either direction", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["B"], direction: "both" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C"]);
  });

  test("undirected edge is bidirectional even in outgoing mode", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C" }, [
      undirectedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A"], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C"]);
  });

  test("respects maxHops", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C", D: "D" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
      directedEdge("e3", "C", "D"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A"], direction: "outgoing", maxHops: 2 }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C"]);
  });

  test("handles cycles without infinite loop", () => {
    const graph = buildGraph({ A: "A", B: "B", C: "C" }, [
      directedEdge("e1", "A", "B"),
      directedEdge("e2", "B", "C"),
      directedEdge("e3", "C", "A"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A"], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("evaluateSubgraph - leaves", () => {
  test("leavesOnly keeps only nodes with no outgoing directed edges", () => {
    // Project -> Task1 -> SubA; Project -> Task2; Task1 -> SubB
    const graph = buildGraph({ p: "Project", t1: "Task1", t2: "Task2", a: "SubA", b: "SubB" }, [
      directedEdge("e1", "p", "t1"),
      directedEdge("e2", "p", "t2"),
      directedEdge("e3", "t1", "a"),
      directedEdge("e4", "t1", "b"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["Project"], direction: "outgoing", leavesOnly: true }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["a", "b", "t2"]);
  });

  test("undirected outgoing edges do not disqualify a node from being a leaf", () => {
    // P -> Y (directed); X -- Y (undirected)
    const graph = buildGraph({ p: "Project", x: "X", y: "Y" }, [
      directedEdge("e1", "p", "y"),
      undirectedEdge("e2", "x", "y"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["Project"], direction: "outgoing", leavesOnly: true }],
      ops: [],
    });
    // Reachable = {p, y, x}. Global leaves (no directed out) = {y, x}. Project has directed out → not leaf.
    expect([...result.nodeIds].sort()).toEqual(["x", "y"]);
  });

  test("leavesOnly + maxHops is intersection of in-range and global leaves", () => {
    // P -> A -> B -> C
    const graph = buildGraph({ p: "P", a: "A", b: "B", c: "C" }, [
      directedEdge("e1", "p", "a"),
      directedEdge("e2", "a", "b"),
      directedEdge("e3", "b", "c"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["P"], direction: "outgoing", maxHops: 2, leavesOnly: true }],
      ops: [],
    });
    // Range = {p, a, b}. Global leaves = {c}. Intersection = empty.
    expect([...result.nodeIds]).toEqual([]);
  });

  test("isolated seed node is itself a leaf", () => {
    const graph = buildGraph({ l: "Lonely" }, []);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["Lonely"], direction: "outgoing", leavesOnly: true }],
      ops: [],
    });
    expect([...result.nodeIds]).toEqual(["l"]);
  });
});

describe("evaluateSubgraph - set ops", () => {
  // P1 -> A; P1 -> B; P2 -> B; P2 -> C
  const graph = buildGraph({ p1: "P1", p2: "P2", a: "A", b: "B", c: "C" }, [
    directedEdge("e1", "p1", "a"),
    directedEdge("e2", "p1", "b"),
    directedEdge("e3", "p2", "b"),
    directedEdge("e4", "p2", "c"),
  ]);

  test("union", () => {
    const result = evaluateSubgraph(graph, {
      sources: [
        { seedTitles: ["P1"], direction: "outgoing" },
        { seedTitles: ["P2"], direction: "outgoing" },
      ],
      ops: ["union"],
    });
    expect([...result.nodeIds].sort()).toEqual(["a", "b", "c", "p1", "p2"]);
  });

  test("intersect", () => {
    const result = evaluateSubgraph(graph, {
      sources: [
        { seedTitles: ["P1"], direction: "outgoing" },
        { seedTitles: ["P2"], direction: "outgoing" },
      ],
      ops: ["intersect"],
    });
    expect([...result.nodeIds]).toEqual(["b"]);
  });

  test("difference", () => {
    const result = evaluateSubgraph(graph, {
      sources: [
        { seedTitles: ["P1"], direction: "outgoing" },
        { seedTitles: ["P2"], direction: "outgoing" },
      ],
      ops: ["difference"],
    });
    expect([...result.nodeIds].sort()).toEqual(["a", "p1"]);
  });

  test("left-fold of three sources: (P1 ∪ P2) ∩ A", () => {
    const result = evaluateSubgraph(graph, {
      sources: [
        { seedTitles: ["P1"], direction: "outgoing" },
        { seedTitles: ["P2"], direction: "outgoing" },
        { seedTitles: ["A"], direction: "outgoing" },
      ],
      ops: ["union", "intersect"],
    });
    expect([...result.nodeIds]).toEqual(["a"]);
  });
});

describe("evaluateSubgraph - title resolution", () => {
  test("unresolved titles are reported", () => {
    const graph = buildGraph({ a: "A" }, []);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["A", "Missing"], direction: "outgoing" }],
      ops: [],
    });
    expect(result.unresolvedTitles).toEqual(["Missing"]);
  });

  test("same title with multiple hits expands all matching seeds", () => {
    // Two distinct nodes share label "Dup"
    const graph = buildGraph({ d1: "Dup", d2: "Dup", x: "X", y: "Y" }, [
      directedEdge("e1", "d1", "x"),
      directedEdge("e2", "d2", "y"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["Dup"], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["d1", "d2", "x", "y"]);
  });

  test("empty seedTitles produces empty result without unresolved entries", () => {
    const graph = buildGraph({ a: "A" }, []);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: [], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds]).toEqual([]);
    expect(result.unresolvedTitles).toEqual([]);
  });

  test("whitespace-only and blank-line titles are skipped silently", () => {
    const graph = buildGraph({ a: "A" }, []);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["", "   ", "\t"], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds]).toEqual([]);
    expect(result.unresolvedTitles).toEqual([]);
  });

  test("titles are trimmed before lookup", () => {
    const graph = buildGraph({ a: "Project" }, []);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["  Project  "], direction: "outgoing" }],
      ops: [],
    });
    expect([...result.nodeIds]).toEqual(["a"]);
  });
});

describe("evaluateSubgraph - edge induction", () => {
  test("only includes edges with both endpoints in the result", () => {
    // P -> A -> B; A -> X
    const graph = buildGraph({ p: "P", a: "A", b: "B", x: "X" }, [
      directedEdge("e1", "p", "a"),
      directedEdge("e2", "a", "b"),
      directedEdge("e3", "a", "x"),
    ]);
    const result = evaluateSubgraph(graph, {
      sources: [{ seedTitles: ["P"], direction: "outgoing", maxHops: 1 }],
      ops: [],
    });
    expect([...result.nodeIds].sort()).toEqual(["a", "p"]);
    expect([...result.edgeIds]).toEqual(["e1"]);
  });
});

describe("evaluateSubgraph - empty queries", () => {
  test("zero sources returns empty result", () => {
    const graph = buildGraph({ a: "A" }, []);
    const result = evaluateSubgraph(graph, { sources: [], ops: [] });
    expect([...result.nodeIds]).toEqual([]);
    expect([...result.edgeIds]).toEqual([]);
    expect(result.unresolvedTitles).toEqual([]);
  });
});
