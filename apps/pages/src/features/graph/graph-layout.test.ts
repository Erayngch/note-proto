import { describe, test, expect } from "vite-plus/test";
import type { GraphData } from "core";
import { computeAllPairsDistance, desiredDistance } from "./graph-layout";

const graph = (
  nodeIds: string[],
  edges: { id: string; s: string; t: string; dir?: "directed" | "undirected" }[],
): GraphData => ({
  nodes: nodeIds.map((id) => ({ id, label: id })),
  edges: edges.map((e) => ({
    id: e.id,
    source: e.s,
    target: e.t,
    direction: e.dir ?? "undirected",
  })),
});

describe("computeAllPairsDistance", () => {
  test("self-distance is 0", () => {
    const result = computeAllPairsDistance(graph(["a"], []));
    expect(result.get("a")?.get("a")).toBe(0);
  });

  test("directly linked pair has distance 1 both ways", () => {
    const result = computeAllPairsDistance(graph(["a", "b"], [{ id: "e1", s: "a", t: "b" }]));
    expect(result.get("a")?.get("b")).toBe(1);
    expect(result.get("b")?.get("a")).toBe(1);
  });

  test("directed edges are walked as undirected for layout purposes", () => {
    const result = computeAllPairsDistance(
      graph(["a", "b"], [{ id: "e1", s: "a", t: "b", dir: "directed" }]),
    );
    expect(result.get("b")?.get("a")).toBe(1);
  });

  test("returns shortest path among multiple routes", () => {
    const result = computeAllPairsDistance(
      graph(
        ["a", "b", "c", "d"],
        [
          { id: "e1", s: "a", t: "b" },
          { id: "e2", s: "b", t: "c" },
          { id: "e3", s: "c", t: "d" },
          { id: "e4", s: "a", t: "d" },
        ],
      ),
    );
    expect(result.get("a")?.get("c")).toBe(2);
    expect(result.get("a")?.get("d")).toBe(1);
  });

  test("disconnected pair has no entry", () => {
    const result = computeAllPairsDistance(graph(["a", "b"], []));
    expect(result.get("a")?.has("b")).toBe(false);
  });
});

describe("desiredDistance", () => {
  test("d=1 returns minDistance", () => {
    expect(desiredDistance(1, 100, 400)).toBe(100);
  });

  test("d=infinity returns maxDistance", () => {
    expect(desiredDistance(Infinity, 100, 400)).toBe(400);
  });

  test("strictly increasing in d", () => {
    const at2 = desiredDistance(2, 100, 400);
    const at5 = desiredDistance(5, 100, 400);
    const at20 = desiredDistance(20, 100, 400);
    expect(at2).toBeLessThan(at5);
    expect(at5).toBeLessThan(at20);
  });

  test("approaches but never reaches maxDistance", () => {
    expect(desiredDistance(1000, 100, 400)).toBeLessThan(400);
    expect(desiredDistance(1000, 100, 400)).toBeGreaterThan(399);
  });
});
