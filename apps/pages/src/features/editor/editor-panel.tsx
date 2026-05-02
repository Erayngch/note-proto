import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Pencil } from "lucide-react";
import { validateTitle as validateTitleCore } from "core";
import { useGraph } from "../../lib/graph";
import { unwrap } from "../../lib/unwrap";
import { queryKeys } from "../../lib/query";
import { useDocumentTitle } from "../../lib/use-document-title";
import { MilkdownEditor } from "./milkdown-editor";

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

  // Initialize state from loaded note
  if (note && !initialized) {
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

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTitle(value);
    setTitleError(validateTitle(value));
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
    [isNew, id, saveContentMutation, beginSave, endSave],
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
        <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} isNew={isNew} />
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
            placeholder="タイトル"
            className="w-full text-3xl font-bold bg-transparent outline-none border-none"
          />
          {titleError && <p className="text-sm text-destructive mt-1">{titleError}</p>}
        </div>
        {(isNew || initialized) && (
          <MilkdownEditor defaultValue={content} onChange={handleContentChange} />
        )}
      </div>
    </div>
  );
};
