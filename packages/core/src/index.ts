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
  EditLinkDirection,
  EditLinkError,
} from "./types.js";

export type { StorageAdapter } from "./adapter.js";

export { validateTitle } from "./validation.js";

export { createKnowledgeGraph } from "./knowledge-graph.js";
export type { KnowledgeGraph, KnowledgeGraphConfig } from "./knowledge-graph.js";

export { evaluateSubgraph } from "./subgraph.js";
export type {
  TraversalDirection,
  SubgraphSource,
  SetOp,
  SubgraphQuery,
  SubgraphResult,
} from "./subgraph.js";
