import type { StorageAdapter } from "./adapter.js";
import type {
  Note,
  NoteWithContent,
  Link,
  LinkDirection,
  GraphData,
  Result,
  CreateNoteError,
  RenameNoteError,
  CreateLinkError,
} from "./types.js";
import { validateTitle } from "./validation.js";

export type KnowledgeGraphConfig = {
  adapter: StorageAdapter;
  generateId?: () => string;
  now?: () => string;
};

export type KnowledgeGraph = {
  getNotes: () => Promise<Note[]>;
  getNote: (id: string) => Promise<NoteWithContent | undefined>;
  searchNotes: (query: string) => Promise<Note[]>;
  createNote: (title: string) => Promise<Result<Note, CreateNoteError>>;
  renameNote: (id: string, title: string) => Promise<Result<Note, RenameNoteError>>;
  deleteNote: (id: string) => Promise<Result<{ ok: true }, "NOT_FOUND">>;
  saveContent: (id: string, content: string) => Promise<Result<{ ok: true }, "NOT_FOUND">>;
  createLink: (
    sourceId: string,
    targetId: string,
    direction?: LinkDirection,
  ) => Promise<Result<Link, CreateLinkError>>;
  deleteLink: (id: string) => Promise<Result<{ ok: true }, "NOT_FOUND">>;
  getGraph: () => Promise<GraphData>;
};

export const createKnowledgeGraph = (config: KnowledgeGraphConfig): KnowledgeGraph => {
  const { adapter } = config;
  const generateId = config.generateId ?? (() => crypto.randomUUID());
  const now = config.now ?? (() => new Date().toISOString());

  return {
    getNotes: () => adapter.getAllNotes(),

    getNote: async (id) => {
      const note = await adapter.getNoteById(id);
      if (!note) return undefined;
      const content = await adapter.getContent(id);
      return { ...note, content };
    },

    searchNotes: async (query) => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const needle = trimmed.toLowerCase();
      const notes = await adapter.getAllNotes();
      const contents = await Promise.all(notes.map((n) => adapter.getContent(n.id)));

      return notes.filter((note, i) => {
        const haystack = `${note.title}\n${contents[i] ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      });
    },

    createNote: async (title) => {
      const titleError = validateTitle(title);
      if (titleError) return { ok: false, error: titleError };

      const id = generateId();
      const timestamp = now();
      const note: Note = { id, title, createdAt: timestamp, updatedAt: timestamp };

      await adapter.insertNote(note);
      await adapter.saveContent(id, "");

      return { ok: true, value: note };
    },

    renameNote: async (id, title) => {
      const titleError = validateTitle(title);
      if (titleError) return { ok: false, error: titleError };

      const note = await adapter.getNoteById(id);
      if (!note) return { ok: false, error: "NOT_FOUND" };

      const timestamp = now();
      await adapter.updateNote(id, { title, updatedAt: timestamp });

      return { ok: true, value: { ...note, title, updatedAt: timestamp } };
    },

    deleteNote: async (id) => {
      const note = await adapter.getNoteById(id);
      if (!note) return { ok: false, error: "NOT_FOUND" };

      await adapter.deleteNote(id);
      await adapter.deleteContent(id);

      return { ok: true, value: { ok: true as const } };
    },

    saveContent: async (id, content) => {
      const note = await adapter.getNoteById(id);
      if (!note) return { ok: false, error: "NOT_FOUND" };

      const timestamp = now();
      await adapter.updateNote(id, { updatedAt: timestamp });
      await adapter.saveContent(id, content);

      return { ok: true, value: { ok: true as const } };
    },

    createLink: async (sourceId, targetId, direction = "undirected") => {
      if (sourceId === targetId) return { ok: false, error: "SELF_LINK" };

      const source = await adapter.getNoteById(sourceId);
      if (!source) return { ok: false, error: "SOURCE_NOT_FOUND" };

      const target = await adapter.getNoteById(targetId);
      if (!target) return { ok: false, error: "TARGET_NOT_FOUND" };

      const existing = await adapter.findLinksBetween(sourceId, targetId);

      // Undirected and directed links cannot coexist between the same pair.
      // For a directed insert, an existing same-direction link is a duplicate.
      const conflict =
        direction === "undirected"
          ? existing.length > 0
          : existing.some(
              (l) =>
                l.direction === "undirected" ||
                (l.sourceId === sourceId && l.targetId === targetId),
            );
      if (conflict) return { ok: false, error: "DUPLICATE_LINK" };

      // Canonicalize undirected links so {a, b} always stores with sourceId < targetId.
      const [s, t] =
        direction === "undirected" && sourceId > targetId
          ? [targetId, sourceId]
          : [sourceId, targetId];

      const id = generateId();
      const link: Link = { id, sourceId: s, targetId: t, direction };
      await adapter.insertLink(link);

      return { ok: true, value: link };
    },

    deleteLink: async (id) => {
      const link = await adapter.getLinkById(id);
      if (!link) return { ok: false, error: "NOT_FOUND" };

      await adapter.deleteLink(id);

      return { ok: true, value: { ok: true as const } };
    },

    getGraph: async () => {
      const [notes, links] = await Promise.all([adapter.getAllNotes(), adapter.getAllLinks()]);

      return {
        nodes: notes.map((n) => ({ id: n.id, label: n.title })),
        edges: links.map((l) => ({
          id: l.id,
          source: l.sourceId,
          target: l.targetId,
          direction: l.direction,
        })),
      };
    },
  };
};
