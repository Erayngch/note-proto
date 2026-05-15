export type Note = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteWithContent = Note & {
  content: string;
};

export type LinkDirection = "undirected" | "directed";

export type Link = {
  id: string;
  sourceId: string;
  targetId: string;
  direction: LinkDirection;
};

export type GraphNode = {
  id: string;
  label: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  direction: LinkDirection;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

export type CreateNoteError = "TITLE_REQUIRED" | "TITLE_INVALID";
export type RenameNoteError = "NOT_FOUND" | "TITLE_REQUIRED" | "TITLE_INVALID";
export type CreateLinkError =
  | "SELF_LINK"
  | "SOURCE_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "DUPLICATE_LINK";
/**
 * UI-level link direction change.
 * - "undirected": make undirected (canonicalize sourceId < targetId)
 * - "forward": directed in current sourceId → targetId orientation
 * - "backward": directed in flipped (targetId → sourceId) orientation
 */
export type EditLinkDirection = "undirected" | "forward" | "backward";
export type EditLinkError = "NOT_FOUND" | "DUPLICATE_LINK";
