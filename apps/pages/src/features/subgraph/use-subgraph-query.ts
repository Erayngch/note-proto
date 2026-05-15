import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { evaluateSubgraph } from "core";
import type { SetOp, SubgraphQuery, SubgraphResult, SubgraphSource } from "core";
import { useGraph } from "../../lib/graph";
import { queryKeys } from "../../lib/query";

export type DisplayMode = "highlight" | "filter";

const emptySource = (): SubgraphSource => ({
  seedTitles: [],
  direction: "outgoing",
  maxHops: undefined,
  leavesOnly: false,
});

const initialQuery = (): SubgraphQuery => ({
  sources: [emptySource()],
  ops: [],
});

const isQueryActive = (query: SubgraphQuery): boolean =>
  query.sources.some((s) => s.seedTitles.some((t) => t.trim().length > 0));

export const useSubgraphQuery = () => {
  const graph = useGraph();
  const [query, setQuery] = useState<SubgraphQuery>(initialQuery);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("highlight");

  const { data: graphData } = useQuery({
    queryKey: queryKeys.graph,
    queryFn: () => graph.getGraph(),
  });

  const result = useMemo<SubgraphResult | null>(() => {
    if (!graphData || !isQueryActive(query)) return null;
    return evaluateSubgraph(graphData, query);
  }, [graphData, query]);

  const updateSource = useCallback((index: number, patch: Partial<SubgraphSource>) => {
    setQuery((q) => ({
      ...q,
      sources: q.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }, []);

  const addSource = useCallback((op: SetOp = "union") => {
    setQuery((q) => ({
      sources: [...q.sources, emptySource()],
      ops: [...q.ops, op],
    }));
  }, []);

  const removeSource = useCallback((index: number) => {
    setQuery((q) => {
      if (q.sources.length <= 1) return q;
      const sources = q.sources.filter((_, i) => i !== index);
      const opIndex = index === 0 ? 0 : index - 1;
      const ops = q.ops.filter((_, i) => i !== opIndex);
      return { sources, ops };
    });
  }, []);

  const updateOp = useCallback((opIndex: number, op: SetOp) => {
    setQuery((q) => ({
      ...q,
      ops: q.ops.map((o, i) => (i === opIndex ? op : o)),
    }));
  }, []);

  // Append a title to the first source's seed list (dedupe). Used by GraphView right-click menu.
  const seedFromTitle = useCallback((title: string) => {
    setQuery((q) => {
      const first = q.sources[0] ?? emptySource();
      const seedTitles = first.seedTitles.includes(title)
        ? first.seedTitles
        : [...first.seedTitles, title];
      const updated: SubgraphSource = { ...first, seedTitles };
      return { ...q, sources: [updated, ...q.sources.slice(1)] };
    });
  }, []);

  const clear = useCallback(() => {
    setQuery(initialQuery());
  }, []);

  return {
    query,
    displayMode,
    setDisplayMode,
    result,
    updateSource,
    addSource,
    removeSource,
    updateOp,
    seedFromTitle,
    clear,
  };
};

export type UseSubgraphQuery = ReturnType<typeof useSubgraphQuery>;
