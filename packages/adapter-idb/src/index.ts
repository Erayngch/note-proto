import type { StorageAdapter, Note, Link } from "core";

export type IdbAdapterConfig = {
  dbName?: string;
};

const DB_VERSION = 1;

const req = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const tx = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

const openDb = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      const notes = db.createObjectStore("notes", { keyPath: "id" });
      notes.createIndex("updatedAt", "updatedAt", { unique: false });

      db.createObjectStore("content", { keyPath: "id" });

      const links = db.createObjectStore("links", { keyPath: "id" });
      links.createIndex("sourceId", "sourceId", { unique: false });
      links.createIndex("targetId", "targetId", { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const createIdbAdapter = async (config?: IdbAdapterConfig): Promise<StorageAdapter> => {
  const db = await openDb(config?.dbName ?? "knowledge-graph");

  const store = (name: string, mode: IDBTransactionMode) => {
    const t = db.transaction(name, mode);
    return t.objectStore(name);
  };

  return {
    getAllNotes: async () => {
      const rows: Note[] = await req(store("notes", "readonly").getAll());
      return rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    getNoteById: async (id) => {
      const row = await req(store("notes", "readonly").get(id));
      return row as Note | undefined;
    },

    insertNote: async (note) => {
      const s = store("notes", "readwrite");
      s.add(note);
      await tx(s.transaction);
    },

    updateNote: async (id, fields) => {
      const s = store("notes", "readwrite");
      const existing = await req(s.get(id));
      if (!existing) return;
      const updated = { ...existing, ...fields };
      s.put(updated);
      await tx(s.transaction);
    },

    deleteNote: async (id) => {
      const s = store("notes", "readwrite");
      s.delete(id);
      await tx(s.transaction);
    },

    getContent: async (id) => {
      const row = await req(store("content", "readonly").get(id));
      return row ? (row as { id: string; content: string }).content : "";
    },

    saveContent: async (id, content) => {
      const s = store("content", "readwrite");
      s.put({ id, content });
      await tx(s.transaction);
    },

    deleteContent: async (id) => {
      const s = store("content", "readwrite");
      s.delete(id);
      await tx(s.transaction);
    },

    getAllLinks: async () => {
      const rows: Link[] = await req(store("links", "readonly").getAll());
      return rows;
    },

    getLinkById: async (id) => {
      const row = await req(store("links", "readonly").get(id));
      return row as Link | undefined;
    },

    findLink: async (sourceId, targetId) => {
      const all: Link[] = await req(store("links", "readonly").getAll());
      return all.find(
        (l) =>
          (l.sourceId === sourceId && l.targetId === targetId) ||
          (l.sourceId === targetId && l.targetId === sourceId),
      );
    },

    insertLink: async (link) => {
      const s = store("links", "readwrite");
      s.add(link);
      await tx(s.transaction);
    },

    deleteLink: async (id) => {
      const s = store("links", "readwrite");
      s.delete(id);
      await tx(s.transaction);
    },
  };
};
