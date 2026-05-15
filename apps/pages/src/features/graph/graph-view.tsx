import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus, ZoomIn, ZoomOut, Maximize2, X, Filter } from "lucide-react";
import { useGraph } from "../../lib/graph";
import { unwrap } from "../../lib/unwrap";
import { queryKeys } from "../../lib/query";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { EditLinkDirection } from "core";
import { useGraphSimulation, type SimNode, type SimLink } from "./use-graph-simulation";
import { LinkPicker } from "../../features/link-picker/link-picker";
import { SearchPalette } from "../../features/search-palette/search-palette";
import { SubgraphPanel } from "../../features/subgraph/subgraph-panel";
import { useSubgraphQuery } from "../../features/subgraph/use-subgraph-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";

const CANVAS_HINT_STORAGE_KEY = "graph-canvas-hint-dismissed";
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;
const NODE_RADIUS = 20;

type ContextMenu = {
  x: number;
  y: number;
} & ({ type: "node"; nodeId: string } | { type: "edge"; edgeId: string });

export const GraphView = () => {
  const graph = useGraph();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement>(null);

  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [linkPickerNodeId, setLinkPickerNodeId] = useState<string | null>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const [subgraphPanelOpen, setSubgraphPanelOpen] = useState(false);

  const subgraph = useSubgraphQuery();

  useDocumentTitle(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K opens the search palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Viewport transform for pan/zoom
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // First-visit hint overlay (dismissible, persisted in localStorage)
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(CANVAS_HINT_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      window.localStorage.setItem(CANVAS_HINT_STORAGE_KEY, "1");
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, []);

  const onTick = useCallback((newNodes: SimNode[], newLinks: SimLink[]) => {
    setNodes(newNodes);
    setLinks(newLinks);
  }, []);

  // Compute a transform that fits all given nodes into the viewport with padding.
  const computeFitTransform = useCallback((targetNodes: SimNode[]) => {
    const svg = svgRef.current;
    if (!svg || targetNodes.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;
    if (viewW <= 0 || viewH <= 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of targetNodes) {
      if (n.x == null || n.y == null) continue;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    // Account for node radius + label above
    const nodePad = 48;
    minX -= nodePad;
    minY -= nodePad;
    maxX += nodePad;
    maxY += nodePad;

    const boxW = Math.max(maxX - minX, 1);
    const boxH = Math.max(maxY - minY, 1);
    const viewportPad = 40;
    const scale = Math.min(
      (viewW - viewportPad * 2) / boxW,
      (viewH - viewportPad * 2) / boxH,
      1, // never zoom in further than 1:1
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const x = viewW / 2 - cx * scale;
    const y = viewH / 2 - cy * scale;
    return { x, y, scale: Math.max(scale, 0.1) };
  }, []);

  // Flag: when true, the next simulation "end" (or subsequent tick burst) should fit the view.
  const fitRequestedRef = useRef(true);
  const prevNodeCountRef = useRef(0);

  const onSimulationEnd = useCallback(
    (endNodes: SimNode[]) => {
      if (!fitRequestedRef.current) return;
      const next = computeFitTransform(endNodes);
      if (next) {
        fitRequestedRef.current = false;
        setTransform(next);
      }
    },
    [computeFitTransform],
  );

  const { update, nodesRef } = useGraphSimulation(
    window.innerWidth,
    window.innerHeight,
    onTick,
    onSimulationEnd,
  );

  const { data: graphData } = useQuery({
    queryKey: queryKeys.graph,
    queryFn: () => graph.getGraph(),
  });

  // Update simulation when graph data changes
  const prevDataRef = useRef<typeof graphData>(undefined);
  if (graphData && graphData !== prevDataRef.current) {
    prevDataRef.current = graphData;
    // If node count changed (e.g. user added a new note), request a fitView
    // so the new node ends up visible instead of landing off-screen.
    if (graphData.nodes.length !== prevNodeCountRef.current) {
      fitRequestedRef.current = true;
      prevNodeCountRef.current = graphData.nodes.length;
    }
    update(graphData);
  }

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await graph.deleteNote(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await graph.deleteLink(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
    },
  });

  const updateLinkDirectionMutation = useMutation({
    mutationFn: async ({ id, change }: { id: string; change: EditLinkDirection }) =>
      unwrap(await graph.updateLinkDirection(id, change)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
    },
  });

  const handleNodeClick = (nodeId: string) => {
    if (!dragNode) {
      void navigate(`/notes/${nodeId}`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, menu: ContextMenu) => {
    e.preventDefault();
    setContextMenu(menu);
  };

  const handleDeleteNote = (nodeId: string) => {
    setDeleteNodeId(nodeId);
    setContextMenu(null);
  };

  const confirmDeleteNote = () => {
    if (deleteNodeId) {
      deleteNoteMutation.mutate(deleteNodeId);
    }
    setDeleteNodeId(null);
  };

  // Resolve the title of the node currently targeted for deletion so the
  // confirmation dialog can name it explicitly. Falls back to "このノート"
  // when the node is missing a label (untitled drafts, race conditions).
  const deleteTargetLabel = (() => {
    if (!deleteNodeId) return null;
    const node = nodes.find((n) => n.id === deleteNodeId);
    const label = node?.label?.trim();
    return label && label.length > 0 ? label : null;
  })();

  const handleDeleteLink = (edgeId: string) => {
    deleteLinkMutation.mutate(edgeId);
    setContextMenu(null);
  };

  const handleEditLinkDirection = (edgeId: string, change: EditLinkDirection) => {
    updateLinkDirectionMutation.mutate({ id: edgeId, change });
    setContextMenu(null);
  };

  const handleAddLink = (nodeId: string) => {
    setLinkPickerNodeId(nodeId);
    setContextMenu(null);
  };

  const handleSeedFromNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    const label = node?.label?.trim();
    if (!label) return;
    subgraph.seedFromTitle(label);
    setSubgraphPanelOpen(true);
    setContextMenu(null);
  };

  // Subgraph filter state — derived once per render so the link/node loops can branch cheaply.
  const subgraphActive = subgraph.result !== null;
  const matchedNodeIds = subgraph.result?.nodeIds;
  const matchedEdgeIds = subgraph.result?.edgeIds;
  const isFilterMode = subgraphActive && subgraph.displayMode === "filter";
  const isHighlightMode = subgraphActive && subgraph.displayMode === "highlight";

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const mx = e.clientX - svgRect.left;
    const my = e.clientY - svgRect.top;
    // User is actively zooming — cancel any pending auto-fit so we don't snap back on them.
    fitRequestedRef.current = false;
    setTransform((prev) => {
      const newScale = Math.min(Math.max(prev.scale * delta, 0.1), 5);
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * ratio,
        y: my - (my - prev.y) * ratio,
      };
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const zoomAroundCenter = useCallback((factor: number) => {
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const cx = svgRect.width / 2;
    const cy = svgRect.height / 2;
    // Manual zoom should also stop any pending auto-fit.
    fitRequestedRef.current = false;
    setTransform((prev) => {
      const newScale = Math.min(Math.max(prev.scale * factor, ZOOM_MIN), ZOOM_MAX);
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  }, []);

  const handleZoomIn = useCallback(() => zoomAroundCenter(ZOOM_STEP), [zoomAroundCenter]);
  const handleZoomOut = useCallback(() => zoomAroundCenter(1 / ZOOM_STEP), [zoomAroundCenter]);

  const handleFitView = useCallback(() => {
    // User explicitly asked to fit; consume any pending auto-fit and apply now.
    fitRequestedRef.current = false;
    const next = computeFitTransform(nodesRef.current);
    if (next) {
      setTransform(next);
    } else {
      setTransform({ x: 0, y: 0, scale: 1 });
    }
  }, [computeFitTransform, nodesRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as SVGElement).tagName === "svg") {
      isPanning.current = true;
      // User is actively panning — cancel any pending auto-fit.
      fitRequestedRef.current = false;
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }));
    }
    if (dragNode) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const x = (e.clientX - svgRect.left - transform.x) / transform.scale;
      const y = (e.clientY - svgRect.top - transform.y) / transform.scale;
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) {
        node.fx = x;
        node.fy = y;
      }
    }
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    if (dragNode) {
      const node = nodesRef.current.find((n) => n.id === dragNode);
      if (node) {
        node.fx = null;
        node.fy = null;
      }
      setDragNode(null);
    }
  };

  const handleBackgroundClick = () => {
    setContextMenu(null);
  };

  const getLinkCoords = (link: SimLink) => {
    const source =
      typeof link.source === "object" ? link.source : nodes.find((n) => n.id === link.source);
    const target =
      typeof link.target === "object" ? link.target : nodes.find((n) => n.id === link.target);
    const sx = source?.x ?? 0;
    const sy = source?.y ?? 0;
    const tx = target?.x ?? 0;
    const ty = target?.y ?? 0;
    if (link.direction !== "directed") {
      return { x1: sx, y1: sy, x2: tx, y2: ty };
    }
    // Pull the endpoint back by the node radius so the arrowhead lands on the
    // circle's edge instead of being swallowed by it.
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const offset = NODE_RADIUS + 4;
    return {
      x1: sx,
      y1: sy,
      x2: tx - (dx / len) * offset,
      y2: ty - (dy / len) * offset,
    };
  };

  return (
    <>
      <div className="relative w-full h-screen overflow-hidden" onClick={handleBackgroundClick}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {links.map((link) => {
              const matched = !subgraphActive || matchedEdgeIds?.has(link.id) === true;
              if (isFilterMode && !matched) return null;
              const coords = getLinkCoords(link);
              const opacity = isHighlightMode && !matched ? 0.15 : 1;
              return (
                <line
                  key={link.id}
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  opacity={opacity}
                  markerEnd={link.direction === "directed" ? "url(#graph-arrow)" : undefined}
                  data-direction={link.direction}
                  className="cursor-pointer"
                  onContextMenu={(e) =>
                    handleContextMenu(e, {
                      type: "edge",
                      edgeId: link.id,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                />
              );
            })}
            {nodes.map((node) => {
              const matched = !subgraphActive || matchedNodeIds?.has(node.id) === true;
              if (isFilterMode && !matched) return null;
              const opacity = isHighlightMode && !matched ? 0.15 : 1;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                  opacity={opacity}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node.id);
                  }}
                  onContextMenu={(e) =>
                    handleContextMenu(e, {
                      type: "node",
                      nodeId: node.id,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  onMouseDown={(e) => {
                    if (e.button === 0) {
                      e.stopPropagation();
                      setDragNode(node.id);
                      const n = nodesRef.current.find((n) => n.id === node.id);
                      if (n) {
                        n.fx = n.x;
                        n.fy = n.y;
                      }
                    }
                  }}
                >
                  <circle r={NODE_RADIUS} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={2} />
                  <text
                    dy={-28}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#1e293b"
                    className="pointer-events-none select-none"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="absolute bg-popover border border-border rounded-md shadow-md py-1 min-w-[140px] z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === "node" && (
              <>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => handleAddLink(contextMenu.nodeId)}
                >
                  リンクを追加
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => handleSeedFromNode(contextMenu.nodeId)}
                  data-testid="node-menu-seed-subgraph"
                >
                  このノートをシードに
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                  onClick={() => handleDeleteNote(contextMenu.nodeId)}
                >
                  削除
                </button>
              </>
            )}
            {contextMenu.type === "edge" &&
              (() => {
                const edge = links.find((l) => l.id === contextMenu.edgeId);
                if (!edge) return null;
                const sourceId =
                  typeof edge.source === "object" ? edge.source.id : (edge.source as string);
                const targetId =
                  typeof edge.target === "object" ? edge.target.id : (edge.target as string);
                const sourceLabel = nodes.find((n) => n.id === sourceId)?.label ?? "";
                const targetLabel = nodes.find((n) => n.id === targetId)?.label ?? "";
                const isUndirected = edge.direction === "undirected";
                const isForward = edge.direction === "directed";
                const options: { value: EditLinkDirection; label: string; pressed: boolean }[] = [
                  { value: "undirected", label: "−", pressed: isUndirected },
                  { value: "forward", label: "→", pressed: isForward },
                  { value: "backward", label: "←", pressed: false },
                ];
                return (
                  <>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
                      <span
                        className="truncate max-w-[80px]"
                        title={sourceLabel}
                        data-testid="edge-menu-source"
                      >
                        {sourceLabel}
                      </span>
                      <div
                        role="group"
                        aria-label="リンクの向き"
                        className="inline-flex items-center rounded-md border border-border overflow-hidden"
                      >
                        {options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={opt.pressed}
                            data-testid={`edge-direction-${opt.value}`}
                            onClick={() => handleEditLinkDirection(contextMenu.edgeId, opt.value)}
                            className={`px-2 py-0.5 leading-none ${
                              opt.pressed
                                ? "bg-accent text-accent-foreground"
                                : "bg-transparent hover:bg-accent/50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <span
                        className="truncate max-w-[80px]"
                        title={targetLabel}
                        data-testid="edge-menu-target"
                      >
                        {targetLabel}
                      </span>
                    </div>
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                      onClick={() => handleDeleteLink(contextMenu.edgeId)}
                    >
                      削除
                    </button>
                  </>
                );
              })()}
          </div>
        )}

        {/* Link Picker */}
        {linkPickerNodeId && (
          <LinkPicker
            sourceNodeId={linkPickerNodeId}
            sourceLabel={nodes.find((n) => n.id === linkPickerNodeId)?.label ?? ""}
            onClose={() => setLinkPickerNodeId(null)}
          />
        )}

        {/* Search Palette (Cmd+K / Ctrl+K) */}
        {searchPaletteOpen && <SearchPalette onClose={() => setSearchPaletteOpen(false)} />}

        {/* Subgraph extraction panel */}
        {subgraphPanelOpen && (
          <SubgraphPanel
            query={subgraph.query}
            result={subgraph.result}
            displayMode={subgraph.displayMode}
            updateSource={subgraph.updateSource}
            addSource={subgraph.addSource}
            removeSource={subgraph.removeSource}
            updateOp={subgraph.updateOp}
            setDisplayMode={subgraph.setDisplayMode}
            clear={subgraph.clear}
            onClose={() => setSubgraphPanelOpen(false)}
          />
        )}

        {/* Zoom / Fit-to-view controls */}
        <div
          className="absolute bottom-6 left-6 z-40 flex flex-col rounded-md border border-border bg-popover shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="サブグラフ抽出"
            title="サブグラフ抽出"
            data-testid="subgraph-open"
            className={`flex h-9 w-9 items-center justify-center border-b border-border hover:bg-accent ${
              subgraphActive ? "text-primary" : "text-foreground"
            }`}
            onClick={() => setSubgraphPanelOpen((v) => !v)}
          >
            <Filter size={16} />
          </button>
          <button
            type="button"
            aria-label="拡大"
            title="拡大"
            className="flex h-9 w-9 items-center justify-center border-b border-border text-foreground hover:bg-accent"
            onClick={handleZoomIn}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            aria-label="縮小"
            title="縮小"
            className="flex h-9 w-9 items-center justify-center border-b border-border text-foreground hover:bg-accent"
            onClick={handleZoomOut}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            aria-label="全体表示"
            title="全体表示"
            className="flex h-9 w-9 items-center justify-center text-foreground hover:bg-accent"
            onClick={handleFitView}
          >
            <Maximize2 size={16} />
          </button>
        </div>

        {/* First-visit canvas hint */}
        {!hintDismissed && (
          <div
            className="absolute left-1/2 top-6 z-40 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-start gap-3 rounded-md border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-md"
            role="status"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 space-y-1">
              <p className="font-medium">キャンバスの操作</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>ドラッグで移動 / ホイールでズーム</li>
                <li>ノードを右クリックでメニュー（リンク追加・削除）</li>
                <li>左下ボタンで拡大・縮小・全体表示</li>
              </ul>
            </div>
            <button
              type="button"
              aria-label="ヒントを閉じる"
              className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={dismissHint}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* FAB - New Note Button */}
      <button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity z-50"
        onClick={() => navigate("/notes/new")}
      >
        <Plus size={24} />
      </button>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={!!deleteNodeId} onOpenChange={(open) => !open && setDeleteNodeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ノートを削除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetLabel ? (
                <>
                  「<span className="font-medium text-foreground">{deleteTargetLabel}</span>
                  」を削除しますか？この操作は取り消せません。
                </>
              ) : (
                <>このノートを削除しますか？この操作は取り消せません。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteNote}>
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
