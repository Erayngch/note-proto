import { useEffect } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type {
  SetOp,
  SubgraphQuery,
  SubgraphResult,
  SubgraphSource,
  TraversalDirection,
} from "core";
import type { DisplayMode } from "./use-subgraph-query";

type SubgraphPanelProps = {
  query: SubgraphQuery;
  result: SubgraphResult | null;
  displayMode: DisplayMode;
  updateSource: (index: number, patch: Partial<SubgraphSource>) => void;
  addSource: (op?: SetOp) => void;
  removeSource: (index: number) => void;
  updateOp: (opIndex: number, op: SetOp) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  clear: () => void;
  onClose: () => void;
};

const DIRECTION_OPTIONS: { value: TraversalDirection; label: string; aria: string }[] = [
  { value: "outgoing", label: "→", aria: "outgoing" },
  { value: "incoming", label: "←", aria: "incoming" },
  { value: "both", label: "↔", aria: "both" },
];

const SET_OP_OPTIONS: { value: SetOp; label: string; aria: string }[] = [
  { value: "union", label: "∪", aria: "和集合" },
  { value: "intersect", label: "∩", aria: "積集合" },
  { value: "difference", label: "\\", aria: "差集合" },
];

const DisplayModeToggle = ({
  mode,
  onChange,
}: {
  mode: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}) => (
  <div
    role="group"
    aria-label="表示モード"
    className="inline-flex items-center rounded-md border border-border overflow-hidden text-xs"
  >
    {(["highlight", "filter"] as const).map((m) => (
      <button
        key={m}
        type="button"
        aria-pressed={mode === m}
        data-testid={`subgraph-display-${m}`}
        onClick={() => onChange(m)}
        className={`px-3 py-1 leading-none ${
          mode === m
            ? "bg-accent text-accent-foreground"
            : "bg-transparent hover:bg-accent/50 text-muted-foreground"
        }`}
      >
        {m === "highlight" ? "ハイライト" : "絞り込み"}
      </button>
    ))}
  </div>
);

const DirectionPicker = ({
  value,
  onChange,
}: {
  value: TraversalDirection;
  onChange: (value: TraversalDirection) => void;
}) => (
  <div
    role="group"
    aria-label="辿る方向"
    className="inline-flex items-center rounded-md border border-border overflow-hidden text-sm"
  >
    {DIRECTION_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        aria-label={opt.aria}
        aria-pressed={value === opt.value}
        data-testid={`subgraph-direction-${opt.value}`}
        onClick={() => onChange(opt.value)}
        className={`px-2 py-0.5 leading-none ${
          value === opt.value
            ? "bg-accent text-accent-foreground"
            : "bg-transparent hover:bg-accent/50"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const SetOpPicker = ({ value, onChange }: { value: SetOp; onChange: (value: SetOp) => void }) => (
  <div
    role="group"
    aria-label="集合演算"
    className="inline-flex items-center rounded-md border border-border overflow-hidden text-sm"
  >
    {SET_OP_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        aria-label={opt.aria}
        aria-pressed={value === opt.value}
        data-testid={`subgraph-op-${opt.value}`}
        onClick={() => onChange(opt.value)}
        className={`px-2 py-0.5 leading-none ${
          value === opt.value
            ? "bg-accent text-accent-foreground"
            : "bg-transparent hover:bg-accent/50"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const SourceCard = ({
  index,
  source,
  canRemove,
  onUpdate,
  onRemove,
}: {
  index: number;
  source: SubgraphSource;
  canRemove: boolean;
  onUpdate: (patch: Partial<SubgraphSource>) => void;
  onRemove: () => void;
}) => {
  const unlimited = source.maxHops === undefined;
  return (
    <div className="rounded-md border border-border p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">シード {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            aria-label="このシードグループを削除"
            className="p-1 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onRemove}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <textarea
        value={source.seedTitles.join("\n")}
        onChange={(e) => {
          const lines = e.target.value.split("\n");
          onUpdate({ seedTitles: lines });
        }}
        placeholder="ノートのタイトル（1行に1つ）"
        rows={Math.min(Math.max(source.seedTitles.length, 1), 4)}
        data-testid={`subgraph-seed-textarea-${index}`}
        className="w-full px-2 py-1.5 text-sm bg-transparent border border-border rounded-sm outline-none focus:ring-1 focus:ring-ring resize-y"
      />

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground w-10">方向</span>
        <DirectionPicker
          value={source.direction}
          onChange={(direction) => onUpdate({ direction })}
        />
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground w-10">深さ</span>
        <input
          type="number"
          min={1}
          value={unlimited ? "" : source.maxHops}
          disabled={unlimited}
          onChange={(e) => {
            const v = e.target.value;
            const n = v === "" ? undefined : Math.max(1, Number(v));
            onUpdate({ maxHops: n });
          }}
          data-testid={`subgraph-hops-${index}`}
          className="w-16 px-2 py-0.5 bg-transparent border border-border rounded-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <label className="flex items-center gap-1 select-none">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onUpdate({ maxHops: e.target.checked ? undefined : 1 })}
            data-testid={`subgraph-unlimited-${index}`}
          />
          <span>無制限</span>
        </label>
      </div>

      <label className="flex items-center gap-1 text-xs select-none">
        <input
          type="checkbox"
          checked={source.leavesOnly ?? false}
          onChange={(e) => onUpdate({ leavesOnly: e.target.checked })}
          data-testid={`subgraph-leaves-${index}`}
        />
        <span>葉のみ（有向リンクで out-degree 0）</span>
      </label>
    </div>
  );
};

export const SubgraphPanel = ({
  query,
  result,
  displayMode,
  updateSource,
  addSource,
  removeSource,
  updateOp,
  setDisplayMode,
  clear,
  onClose,
}: SubgraphPanelProps) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="absolute top-6 right-6 z-40 w-[360px] max-h-[calc(100vh-3rem)] flex flex-col rounded-md border border-border bg-popover shadow-md"
      onClick={(e) => e.stopPropagation()}
      data-testid="subgraph-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">サブグラフ抽出</span>
        <button
          type="button"
          aria-label="パネルを閉じる"
          className="p-1 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {query.sources.map((source, i) => (
          <div key={i} className="space-y-2">
            {i > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-10">演算</span>
                <SetOpPicker
                  value={query.ops[i - 1] ?? "union"}
                  onChange={(op) => updateOp(i - 1, op)}
                />
              </div>
            )}
            <SourceCard
              index={i}
              source={source}
              canRemove={query.sources.length > 1}
              onUpdate={(patch) => updateSource(i, patch)}
              onRemove={() => removeSource(i)}
            />
          </div>
        ))}

        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:bg-accent hover:text-foreground"
          onClick={() => addSource()}
          data-testid="subgraph-add-source"
        >
          <Plus size={12} />
          シードグループを追加
        </button>
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {result ? (
          <div className="text-xs text-muted-foreground" data-testid="subgraph-result-summary">
            {result.nodeIds.size} ノード / {result.edgeIds.size} エッジ
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">タイトルを入力すると抽出されます</div>
        )}

        {result && result.unresolvedTitles.length > 0 && (
          <div
            className="text-xs text-destructive"
            data-testid="subgraph-unresolved-warning"
            role="status"
          >
            未解決: {result.unresolvedTitles.map((t) => `"${t}"`).join(", ")}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <DisplayModeToggle mode={displayMode} onChange={setDisplayMode} />
          <button
            type="button"
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={clear}
            data-testid="subgraph-clear"
          >
            クリア
          </button>
        </div>
      </div>
    </div>
  );
};
