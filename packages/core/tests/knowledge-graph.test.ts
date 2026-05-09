import { describe, test, expect, beforeEach } from "vite-plus/test";
import { createKnowledgeGraph } from "../src/knowledge-graph.ts";
import type { StorageAdapter, Note, Link } from "../src/index.ts";

const createMemoryAdapter = (): StorageAdapter => {
  const notes = new Map<string, Note>();
  const contents = new Map<string, string>();
  const links = new Map<string, Link>();

  return {
    getAllNotes: async () =>
      [...notes.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    getNoteById: async (id) => notes.get(id),
    insertNote: async (note) => {
      notes.set(note.id, note);
    },
    updateNote: async (id, fields) => {
      const cur = notes.get(id);
      if (!cur) return;
      notes.set(id, {
        ...cur,
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        updatedAt: fields.updatedAt,
      });
    },
    deleteNote: async (id) => {
      notes.delete(id);
    },
    getContent: async (id) => contents.get(id) ?? "",
    saveContent: async (id, content) => {
      contents.set(id, content);
    },
    deleteContent: async (id) => {
      contents.delete(id);
    },
    getAllLinks: async () => [...links.values()],
    getLinkById: async (id) => links.get(id),
    findLink: async (sourceId, targetId) =>
      [...links.values()].find(
        (l) =>
          (l.sourceId === sourceId && l.targetId === targetId) ||
          (l.sourceId === targetId && l.targetId === sourceId),
      ),
    insertLink: async (link) => {
      links.set(link.id, link);
    },
    deleteLink: async (id) => {
      links.delete(id);
    },
  };
};

describe("searchNotes", () => {
  let graph: ReturnType<typeof createKnowledgeGraph>;
  let idCounter = 0;

  beforeEach(async () => {
    idCounter = 0;
    graph = createKnowledgeGraph({
      adapter: createMemoryAdapter(),
      generateId: () => `id-${++idCounter}`,
      now: () => new Date(2026, 0, idCounter).toISOString(),
    });
  });

  test("empty query returns no results", async () => {
    await graph.createNote("TODO");
    expect(await graph.searchNotes("")).toEqual([]);
    expect(await graph.searchNotes("   ")).toEqual([]);
  });

  test("matches ASCII title regardless of case", async () => {
    await graph.createNote("TODO");
    await graph.createNote("Shopping");

    const byUpper = await graph.searchNotes("TODO");
    expect(byUpper.map((n) => n.title)).toEqual(["TODO"]);

    const byLower = await graph.searchNotes("todo");
    expect(byLower.map((n) => n.title)).toEqual(["TODO"]);

    const partial = await graph.searchNotes("shop");
    expect(partial.map((n) => n.title)).toEqual(["Shopping"]);
  });

  test("matches Japanese title", async () => {
    await graph.createNote("買い物メモ");
    const hits = await graph.searchNotes("買");
    expect(hits.map((n) => n.title)).toEqual(["買い物メモ"]);
  });

  test("matches by body content", async () => {
    const created = await graph.createNote("買い物メモ");
    if (!created.ok) throw new Error("setup failed");
    await graph.saveContent(created.value.id, "仕事のタスク\n牛乳");

    const byBodyJa = await graph.searchNotes("仕事");
    expect(byBodyJa.map((n) => n.title)).toEqual(["買い物メモ"]);

    const byBodyMixedCase = await graph.searchNotes("牛乳");
    expect(byBodyMixedCase.map((n) => n.title)).toEqual(["買い物メモ"]);
  });

  test("matches ASCII body case-insensitively", async () => {
    const created = await graph.createNote("ノートA");
    if (!created.ok) throw new Error("setup failed");
    await graph.saveContent(created.value.id, "Remember the Milk");

    expect((await graph.searchNotes("milk")).map((n) => n.title)).toEqual(["ノートA"]);
    expect((await graph.searchNotes("MILK")).map((n) => n.title)).toEqual(["ノートA"]);
  });

  test("returns empty when no note matches", async () => {
    await graph.createNote("TODO");
    expect(await graph.searchNotes("xyz-not-present")).toEqual([]);
  });
});
