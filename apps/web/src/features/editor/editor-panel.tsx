import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowLeftToLine, Trash2 } from "lucide-react";
import { validateTitle as validateTitleCore } from "core";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
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

type RelatedNote = {
  id: string;
  label: string;
};

export const EditorPanel = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === undefined;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing note
  const { data: note } = useQuery({
    queryKey: queryKeys.note(id ?? ""),
    queryFn: () => api.getNote(id!),
    enabled: !isNew && !!id,
  });

  // Load graph data so we can compute related notes (backlinks / outbound).
  // The graph endpoint is already used by the canvas, so this query is
  // typically warm in cache.
  const { data: graphData } = useQuery({
    queryKey: queryKeys.graph,
    queryFn: api.getGraph,
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

  const createNoteMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const created = await api.createNote(title);
      if (content) {
        await api.saveContent(created.id, content);
      }
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const renameNoteMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameNote(id, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.note(id!) });
    },
  });

  const saveContentMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.saveContent(id, content),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.graph });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
    },
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    setTitleError(validateTitle(value));
  };

  const handleTitleBlur = () => {
    if (!isNew && id && note && title !== note.title) {
      const error = validateTitle(title);
      if (!error) {
        renameNoteMutation.mutate({ id, title });
      }
    }
  };

  const handleContentChange = useCallback(
    (markdown: string) => {
      setContent(markdown);
      // Auto-save with debounce for existing notes
      if (!isNew && id) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveContentMutation.mutate({ id, content: markdown });
        }, 500);
      }
    },
    [isNew, id, saveContentMutation],
  );

  const handleBack = async () => {
    if (isNew) {
      // New note: empty title + empty content → discard
      if (title === "" && content === "") {
        void navigate("/");
        return;
      }
      // New note: empty title + has content → error
      if (title === "") {
        setTitleError("タイトルは必須です");
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

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between p-4">
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
        ) : (
          <span aria-hidden />
        )}
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          戻る
        </button>
      </div>
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 pb-12">
        <div className="mb-6">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            placeholder="タイトル"
            className="w-full text-3xl font-bold bg-transparent outline-none border-none"
          />
          {titleError && <p className="text-sm text-destructive mt-1">{titleError}</p>}
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
