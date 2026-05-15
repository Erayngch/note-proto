import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGraph } from "../../lib/graph";
import { unwrap } from "../../lib/unwrap";
import { queryKeys } from "../../lib/query";
import type { Note } from "core";

type LinkPickerProps = {
  sourceNodeId: string;
  sourceLabel: string;
  onClose: () => void;
};

type DirectionChoice = "undirected" | "forward" | "backward";

const DIRECTION_OPTIONS: { value: DirectionChoice; label: string; aria: string }[] = [
  { value: "undirected", label: "−", aria: "無向" },
  { value: "forward", label: "→", aria: "source から target へ" },
  { value: "backward", label: "←", aria: "target から source へ" },
];

export const LinkPicker = ({ sourceNodeId, sourceLabel, onClose }: LinkPickerProps) => {
  const graph = useGraph();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [direction, setDirection] = useState<DirectionChoice>("undirected");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const trimmed = search.trim();

  const { data: results = [] } = useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: () => graph.searchNotes(trimmed),
    enabled: trimmed.length > 0,
  });

  const filtered = results.filter((note: Note) => note.id !== sourceNodeId);

  const createLinkMutation = useMutation({
    mutationFn: async ({ targetId }: { targetId: string }) => {
      // For "backward" we flip source/target so the stored link points target → source.
      if (direction === "backward") {
        return unwrap(await graph.createLink(targetId, sourceNodeId, "directed"));
      }
      const dir = direction === "forward" ? "directed" : "undirected";
      return unwrap(await graph.createLink(sourceNodeId, targetId, dir));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      onClose();
    },
  });

  const handleSelect = useCallback(
    (targetId: string) => {
      createLinkMutation.mutate({ targetId });
    },
    [createLinkMutation],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      handleSelect(filtered[selectedIndex].id);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        className="bg-popover border border-border rounded-lg shadow-xl w-[460px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span
            className="text-sm font-medium truncate max-w-[160px]"
            title={sourceLabel}
            data-testid="link-picker-source"
          >
            {sourceLabel}
          </span>
          <div
            role="group"
            aria-label="リンクの向き"
            className="inline-flex items-center rounded-md border border-border overflow-hidden"
          >
            {DIRECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-label={opt.aria}
                aria-pressed={direction === opt.value}
                data-testid={`link-direction-${opt.value}`}
                onClick={() => setDirection(opt.value)}
                className={`px-3 py-1 text-sm leading-none ${
                  direction === opt.value
                    ? "bg-accent text-accent-foreground"
                    : "bg-transparent hover:bg-accent/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">target</span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="ノートを検索..."
          className="w-full px-4 py-3 bg-transparent border-b border-border outline-none text-sm"
          autoFocus
        />
        {trimmed && filtered.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.map((note: Note, index: number) => (
              <button
                key={note.id}
                className={`w-full text-left px-4 py-2 text-sm ${
                  index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
                }`}
                onClick={() => handleSelect(note.id)}
              >
                {note.title}
              </button>
            ))}
          </div>
        )}
        {trimmed && filtered.length === 0 && (
          <div className="px-4 py-3 text-sm text-muted-foreground">該当するノートがありません</div>
        )}
      </div>
    </div>
  );
};
