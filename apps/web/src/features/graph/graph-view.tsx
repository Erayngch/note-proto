import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { useGraphSimulation, type SimNode, type SimLink } from "./use-graph-simulation";
import { LinkPicker } from "../../features/link-picker/link-picker";
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
const FIT_PADDING = 80;

type ContextMenu = {
  x: number;
  y: number;
} & ({ type: "node"; nodeId: string } | { type: "edge"; edgeId: string });

export const GraphView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement>(null);

  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [links, setLinks] = useState<SimLink[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [linkPickerNodeId, setLinkPickerNodeId] = useState<string | null>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Keyboard shortcut: Cmd+K / Ctrl+K opens link picker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && selectedNodeId) {
        e.preventDefault();
        setLinkPickerNodeId(selectedNodeId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId]);

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

  const { update, nodesRef } = useGraphSimulation(window.innerWidth, window.innerHeight, onTick);

  const { data: graphData } = useQuery({
    queryKey: queryKeys.graph,
    queryFn: api.getGraph,
  });

  // Update simulation when graph data changes
  const prevDataRef = useRef<typeof graphData>(undefined);
  if (graphData && graphData !== prevDataRef.current) {
    prevDataRef.current = graphData;
    update(graphData);
  }

  const deleteNoteMutation = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: api.deleteLink,
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
    if (menu.type === "node") {
      setSelectedNodeId(menu.nodeId);
    }
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
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const current = nodesRef.current;
    if (current.length === 0) {
      setTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of current) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    // Single-node fallback: center it at scale 1
    if (current.length === 1 || (maxX === minX && maxY === minY)) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setTransform({
        x: svgRect.width / 2 - cx,
        y: svgRect.height / 2 - cy,
        scale: 1,
      });
      return;
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const availW = Math.max(svgRect.width - FIT_PADDING * 2, 1);
    const availH = Math.max(svgRect.height - FIT_PADDING * 2, 1);
    const scale = Math.min(Math.max(Math.min(availW / contentW, availH / contentH), ZOOM_MIN), 1);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setTransform({
      x: svgRect.width / 2 - cx * scale,
      y: svgRect.height / 2 - cy * scale,
      scale,
    });
  }, [nodesRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && (e.target as SVGElement).tagName === "svg") {
      isPanning.current = true;
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

        {/* Zoom / Fit-to-view controls */}
        <div
          className="absolute bottom-6 left-6 z-40 flex flex-col rounded-md border border-border bg-popover shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
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
