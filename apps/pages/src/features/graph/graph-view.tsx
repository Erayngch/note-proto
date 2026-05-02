import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { useGraph } from "../../lib/graph";
import { unwrap } from "../../lib/unwrap";
import { queryKeys } from "../../lib/query";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useGraphSimulation, type SimNode, type SimLink } from "./use-graph-simulation";
import { LinkPicker } from "../../features/link-picker/link-picker";
import { SearchPalette } from "../../features/search-palette/search-palette";
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

  const handleAddLink = (nodeId: string) => {
    setLinkPickerNodeId(nodeId);
    setContextMenu(null);
  };

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
    return {
      x1: source?.x ?? 0,
      y1: source?.y ?? 0,
      x2: target?.x ?? 0,
      y2: target?.y ?? 0,
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
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {links.map((link) => {
              const coords = getLinkCoords(link);
              return (
                <line
                  key={link.id}
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke="#94a3b8"
                  strokeWidth={2}
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
            {nodes.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
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
                <circle r={20} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={2} />
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
            ))}
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
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                  onClick={() => handleDeleteNote(contextMenu.nodeId)}
                >
                  削除
                </button>
              </>
            )}
            {contextMenu.type === "edge" && (
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-destructive"
                onClick={() => handleDeleteLink(contextMenu.edgeId)}
              >
                削除
              </button>
            )}
          </div>
        )}

        {/* Link Picker */}
        {linkPickerNodeId && (
          <LinkPicker sourceNodeId={linkPickerNodeId} onClose={() => setLinkPickerNodeId(null)} />
        )}

        {/* Search Palette (Cmd+K / Ctrl+K) */}
        {searchPaletteOpen && <SearchPalette onClose={() => setSearchPaletteOpen(false)} />}
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
