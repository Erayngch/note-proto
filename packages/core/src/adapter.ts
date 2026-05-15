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
  /** Returns every link between {aId, bId}, regardless of argument order or direction */
  findLinksBetween: (aId: string, bId: string) => Promise<Link[]>;
  insertLink: (link: Link) => Promise<void>;
  updateLink: (
    id: string,
    fields: { sourceId: string; targetId: string; direction: Link["direction"] },
  ) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
};
