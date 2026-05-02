import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowLeftToLine,
  Check,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { validateTitle as validateTitleCore } from "core";
import { useGraph } from "../../lib/graph";
import { unwrap } from "../../lib/unwrap";
import { queryKeys } from "../../lib/query";
import { useDocumentTitle } from "../../lib/use-document-title";
import { MilkdownEditor } from "./milkdown-editor";
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

const ERROR_MESSAGES: Record<string, string> = {
  TITLE_REQUIRED: "タイトルは必須です",
  TITLE_INVALID: "空白文字は使用できません",
};

const validateTitle = (title: string): string | null => {
  const error = validateTitleCore(title);
  return error ? (ERROR_MESSAGES[error] ?? error) : null;
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved";

const formatSavedAt = (from: Date, now: Date): string => {
  const diffSec = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (diffSec < 5) return "たった今 自動保存しました";
  if (diffSec < 60) return `${diffSec}秒前に自動保存`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前に自動保存`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前に自動保存`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前に自動保存`;
};

type SaveStatusIndicatorProps = {
  status: SaveStatus;
  lastSavedAt: Date | null;
  isNew: boolean;
};

const SaveStatusIndicator = ({ status, lastSavedAt, isNew }: SaveStatusIndicatorProps) => {
  // Re-render every 10s so the relative time stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !lastSavedAt) return;
    const interval = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(interval);
  }, [status, lastSavedAt]);

  if (status === "saving") {
    return (
      <span
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="save-status"
      >
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        保存中…
      </span>
    );
  }

  if (status === "saved" && lastSavedAt) {
    return (
      <span
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="save-status"
      >
        <Check size={14} aria-hidden="true" />
        {formatSavedAt(lastSavedAt, new Date())}
      </span>
    );
  }

  if (status === "dirty") {
    return (
      <span
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-live="polite"
        data-testid="save-status"
      >
        <Pencil size={14} aria-hidden="true" />
        編集中…
      </span>
    );
  }

  // idle
  return (
    <span className="text-sm text-muted-foreground" data-testid="save-status">
      {isNew ? "未保存" : "変更なし"}
    </span>
  );
};

type RelatedNote = {
  id: string;
  label: string;
};

export const EditorPanel = () => {
  const graph = useGraph();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === undefined;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSavesRef = useRef(0);

  // Reflect the note name in the browser tab. Fall back to a placeholder so an
  // empty title (e.g. a brand-new note) still beats the bare app name.
  const trimmedTitle = title.trim();
  useDocumentTitle(trimmedTitle === "" ? (isNew ? "新しいノート" : null) : trimmedTitle);

  // Load existing note
  const { data: note } = useQuery({
    queryKey: queryKeys.note(id ?? ""),
    queryFn: () => graph.getNote(id!),
    enabled: !isNew && !!id,
  });

  // Load graph data so we can compute related notes (backlinks / outbound).
  // The graph endpoint is already used by the canvas, so this query is
  // typically warm in cache.
  const { data: graphData } = useQuery({
    queryKey: queryKeys.graph,
    queryFn: () => graph.getGraph(),
    enabled: !isNew && !!id,
  });

  // Reset local state when navigating between notes (e.g. via the related
  // notes section). Without this, switching from /notes/A to /notes/B would
  // briefly show A's title while B loads, and Milkdown would not refresh.
  useEffect(() => {
    setTitle("");
    setContent("");
    setTitleError(null);
    setInitialized(false);
    setSaveStatus("idle");
    setLastSavedAt(null);
    inFlightSavesRef.current = 0;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [id]);

  // Initialize state from loaded note
  if (note && !initialized && note.id === id) {
    setTitle(note.title);
    setContent(note.content);
    setInitialized(true);
  }

  const beginSave = useCallback(() => {
    inFlightSavesRef.current += 1;
    setSaveStatus("saving");
  }, []);

  const endSave = useCallback((ok: boolean) => {
    inFlightSavesRef.current = Math.max(0, inFlightSavesRef.current - 1);
    if (inFlightSavesRef.current === 0) {
      if (ok) {
        setLastSavedAt(new Date());
        setSaveStatus("saved");
      } else {
        // On failure, fall back to "dirty" so the user knows changes are not yet stored.
        setSaveStatus("dirty");
      }
    }
  }, []);

  const createNoteMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const created = unwrap(await graph.createNote(title));
      if (content) {
        unwrap(await graph.saveContent(created.id, content));
      }
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const renameNoteMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      unwrap(await graph.renameNote(id, title)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.note(id!) });
    },
  });

  const saveContentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) =>
      unwrap(await graph.saveContent(id, content)),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => unwrap(await graph.deleteNote(noteId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    // For new notes, only surface the "required" error once the user actually
    // typed something — we don't want to scold them on the empty initial state.
    if (isNew && value === "") {
      setTitleError(null);
    } else {
      setTitleError(validateTitle(value));
    }
    if (!isNew) {
      setSaveStatus("dirty");
    }
  };

  const handleTitleBlur = () => {
    if (!isNew && id && note && title !== note.title) {
      const error = validateTitle(title);
      if (!error) {
        beginSave();
        renameNoteMutation.mutate(
          { id, title },
          {
            onSuccess: () => endSave(true),
            onError: () => endSave(false),
          },
        );
      }
    }
  };

  const handleContentChange = useCallback(
    (markdown: string) => {
      setContent(markdown);
      // For a new note, surface the title-required hint as soon as the user
      // starts typing the body without a title — so they don't first hit it
      // when pressing the back button.
      if (isNew && markdown !== "" && title === "") {
        setTitleError("タイトルは必須です");
      }
      // Auto-save with debounce for existing notes
      if (!isNew && id) {
        setSaveStatus("dirty");
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          beginSave();
          saveContentMutation.mutate(
            { id, content: markdown },
            {
              onSuccess: () => endSave(true),
              onError: () => endSave(false),
            },
          );
        }, 500);
      }
    },
    [isNew, id, title, saveContentMutation, beginSave, endSave],
  );

  const handleBack = async () => {
    if (isNew) {
      // New note: empty title + empty content → discard
      if (title === "" && content === "") {
        void navigate("/");
        return;
      }
      // New note: empty title + has content → offer a discard escape hatch
      // instead of just blocking the user with an error.
      if (title === "") {
        setTitleError("タイトルは必須です");
        setDiscardDialogOpen(true);
        return;
      }
      // New note: valid title → save and go back
      const error = validateTitle(title);
      if (error) {
        setTitleError(error);
        return;
      }
      await createNoteMutation.mutateAsync({ title, content });
      void navigate("/");
    } else {
      // Existing note: validate title
      const error = validateTitle(title);
      if (error) {
        setTitleError(error);
        return;
      }
      // Save pending content
      if (id && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        await saveContentMutation.mutateAsync({ id, content });
      }
      // Save title if changed
      if (id && note && title !== note.title) {
        await renameNoteMutation.mutateAsync({ id, title });
      }
      void navigate("/");
    }
  };

  const confirmDiscard = () => {
    setDiscardDialogOpen(false);
    void navigate("/");
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    // Cancel any pending content save before deletion to avoid 404s.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await deleteNoteMutation.mutateAsync(id);
    setDeleteDialogOpen(false);
    void navigate("/");
  };

  // Compute related notes (incoming + outgoing) from cached graph data.
  // Memoised so the editor doesn't recompute on every keystroke.
  const { backlinks, outlinks } = useMemo<{
    backlinks: RelatedNote[];
    outlinks: RelatedNote[];
  }>(() => {
    if (!graphData || !id) return { backlinks: [], outlinks: [] };
    const labelById = new Map(graphData.nodes.map((n) => [n.id, n.label]));
    const back: RelatedNote[] = [];
    const out: RelatedNote[] = [];
    for (const edge of graphData.edges) {
      if (edge.target === id && edge.source !== id) {
        const label = labelById.get(edge.source);
        if (label !== undefined) back.push({ id: edge.source, label });
      } else if (edge.source === id && edge.target !== id) {
        const label = labelById.get(edge.target);
        if (label !== undefined) out.push({ id: edge.target, label });
      }
    }
    const byLabel = (a: RelatedNote, b: RelatedNote) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
    back.sort(byLabel);
    out.sort(byLabel);
    return { backlinks: back, outlinks: out };
  }, [graphData, id]);

  const showRelated = !isNew && initialized;

  // Decide the back-button label so users understand whether changes will be preserved.
  const backButtonLabel = (() => {
    if (isNew) {
      // New note with no input → discard, otherwise save.
      if (title === "" && content === "") return "戻る";
      return "保存して戻る";
    }
    return "保存して戻る";
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-between items-center p-4 gap-3">
        <div className="flex items-center gap-3">
          {!isNew && id ? (
            <button
              type="button"
              aria-label="ノートを削除"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 size={16} />
              削除
            </button>
          ) : null}
          <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} isNew={isNew} />
        </div>
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          {backButtonLabel}
        </button>
      </div>
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 pb-12">
        <div className="mb-6">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder="タイトル（必須）"
            aria-label="タイトル（必須）"
            aria-required="true"
            aria-invalid={titleError ? "true" : undefined}
            className="w-full text-3xl font-bold bg-transparent outline-none border-none"
          />
          {titleError ? (
            <p className="text-sm text-destructive mt-1" role="alert">
              {titleError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">タイトルは必須です</p>
          )}
        </div>
        {(isNew || initialized) && (
          <MilkdownEditor key={id ?? "new"} defaultValue={content} onChange={handleContentChange} />
        )}
        {showRelated && (
          <section
            aria-label="リンク"
            className="mt-12 border-t border-border pt-6 space-y-6 text-sm"
          >
            <RelatedNotesList
              title="このノートからリンクしているノート"
              icon={<ArrowRight size={14} aria-hidden />}
              emptyLabel="まだリンクはありません"
              notes={outlinks}
            />
            <RelatedNotesList
              title="このノートにリンクしているノート"
              icon={<ArrowLeftToLine size={14} aria-hidden />}
              emptyLabel="他のノートからのリンクはありません"
              notes={backlinks}
            />
          </section>
        )}
      </div>

      <AlertDialog
        open={discardDialogOpen}
        onOpenChange={(open) => {
          if (!open) setDiscardDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>タイトルが未入力です</AlertDialogTitle>
            <AlertDialogDescription>
              タイトルを入力していないため保存できません。編集中の内容を破棄して戻りますか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>編集を続ける</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              破棄して戻る
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ノートを削除</AlertDialogTitle>
            <AlertDialogDescription>
              {note?.title ? (
                <>
                  「<span className="font-medium text-foreground">{note.title}</span>
                  」を削除しますか？この操作は取り消せません。
                </>
              ) : (
                <>このノートを削除しますか？この操作は取り消せません。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

type RelatedNotesListProps = {
  title: string;
  icon: React.ReactNode;
  emptyLabel: string;
  notes: RelatedNote[];
};

const RelatedNotesList = ({ title, icon, emptyLabel, notes }: RelatedNotesListProps) => (
  <div>
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {title}
      <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">
        ({notes.length})
      </span>
    </h2>
    {notes.length === 0 ? (
      <p className="mt-2 text-sm text-muted-foreground/70">{emptyLabel}</p>
    ) : (
      <ul className="mt-2 space-y-1">
        {notes.map((n) => (
          <li key={n.id}>
            <RouterLink
              to={`/notes/${n.id}`}
              className="inline-block rounded px-2 py-1 -mx-2 text-foreground hover:bg-accent hover:text-foreground"
            >
              {n.label || "(無題)"}
            </RouterLink>
          </li>
        ))}
      </ul>
    )}
  </div>
);
