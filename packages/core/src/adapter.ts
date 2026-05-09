import type { Note, Link } from "./types.js";

export type StorageAdapter = {
  // Notes
  getAllNotes: () => Promise<Note[]>;
  getNoteById: (id: string) => Promise<Note | undefined>;
  insertNote: (note: Note) => Promise<void>;
  updateNote: (id: string, fields: { title?: string; updatedAt: string }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  // Content (separate from note metadata)
  getContent: (id: string) => Promise<string>;
  saveContent: (id: string, content: string) => Promise<void>;
  deleteContent: (id: string) => Promise<void>;

  // Links
  getAllLinks: () => Promise<Link[]>;
  getLinkById: (id: string) => Promise<Link | undefined>;
  /** Checks both directions: (sourceId, targetId) and (targetId, sourceId) */
  findLink: (sourceId: string, targetId: string) => Promise<Link | undefined>;
  insertLink: (link: Link) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
};
