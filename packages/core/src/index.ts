export type {
  Note,
  NoteWithContent,
  Link,
  LinkDirection,
  GraphNode,
  GraphEdge,
  GraphData,
  Result,
  CreateNoteError,
  RenameNoteError,
  CreateLinkError,
} from "./types.js";

export type { StorageAdapter } from "./adapter.js";

export { validateTitle } from "./validation.js";

export { createKnowledgeGraph } from "./knowledge-graph.js";
export type { KnowledgeGraph, KnowledgeGraphConfig } from "./knowledge-graph.js";
