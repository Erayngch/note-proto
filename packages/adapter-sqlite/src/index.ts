import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import type { StorageAdapter, Note, Link } from "core";

type NoteRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  source_id: string;
  target_id: string;
  direction: "undirected" | "directed";
};

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toLink = (row: LinkRow): Link => ({
  id: row.id,
  sourceId: row.source_id,
  targetId: row.target_id,
  direction: row.direction,
});

export type SqliteAdapterConfig = {
  vaultDir: string;
};

export const createSqliteAdapter = (config: SqliteAdapterConfig): StorageAdapter => {
  const notesDir = path.join(config.vaultDir, "notes");
  const dbPath = path.join(config.vaultDir, "graph.db");

  fs.mkdirSync(config.vaultDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id         TEXT PRIMARY KEY,
      source_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      target_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      direction  TEXT NOT NULL CHECK (direction IN ('undirected', 'directed')),
      CHECK (direction = 'directed' OR source_id < target_id)
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS links_directed_unique
      ON links(source_id, target_id) WHERE direction = 'directed'
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS links_undirected_unique
      ON links(source_id, target_id) WHERE direction = 'undirected'
  `);

  const notePath = (id: string) => path.join(notesDir, `${id}.md`);

  return {
    getAllNotes: async () => {
      const rows = db.prepare("SELECT * FROM notes ORDER BY updated_at DESC").all() as NoteRow[];
      return rows.map(toNote);
    },

    getNoteById: async (id) => {
      const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
      return row ? toNote(row) : undefined;
    },

    insertNote: async (note) => {
      db.prepare("INSERT INTO notes (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
        note.id,
        note.title,
        note.createdAt,
        note.updatedAt,
      );
    },

    updateNote: async (id, fields) => {
      if (fields.title !== undefined) {
        db.prepare("UPDATE notes SET title = ?, updated_at = ? WHERE id = ?").run(
          fields.title,
          fields.updatedAt,
          id,
        );
      } else {
        db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run(fields.updatedAt, id);
      }
    },

    deleteNote: async (id) => {
      db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    },

    getContent: async (id) => {
      const file = notePath(id);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
    },

    saveContent: async (id, content) => {
      fs.writeFileSync(notePath(id), content, "utf-8");
    },

    deleteContent: async (id) => {
      const file = notePath(id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    },

    getAllLinks: async () => {
      const rows = db.prepare("SELECT * FROM links").all() as LinkRow[];
      return rows.map(toLink);
    },

    getLinkById: async (id) => {
      const row = db.prepare("SELECT * FROM links WHERE id = ?").get(id) as LinkRow | undefined;
      return row ? toLink(row) : undefined;
    },

    findLinksBetween: async (aId, bId) => {
      const rows = db
        .prepare(
          "SELECT * FROM links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)",
        )
        .all(aId, bId, bId, aId) as LinkRow[];
      return rows.map(toLink);
    },

    insertLink: async (link) => {
      db.prepare("INSERT INTO links (id, source_id, target_id, direction) VALUES (?, ?, ?, ?)").run(
        link.id,
        link.sourceId,
        link.targetId,
        link.direction,
      );
    },

    deleteLink: async (id) => {
      db.prepare("DELETE FROM links WHERE id = ?").run(id);
    },
  };
};
