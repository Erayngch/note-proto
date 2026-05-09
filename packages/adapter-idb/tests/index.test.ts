import "fake-indexeddb/auto";
import { describe, test, expect, beforeEach } from "vite-plus/test";
import { createIdbAdapter } from "../src/index.js";
import type { StorageAdapter } from "core";

let adapter: StorageAdapter;
let dbCounter = 0;

beforeEach(async () => {
  adapter = await createIdbAdapter({ dbName: `test-db-${dbCounter++}` });
});

const note = (id: string, title: string) => ({
  id,
  title,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
});

describe("notes", () => {
  test("insertNote and getAllNotes", async () => {
    await adapter.insertNote(note("1", "Hello"));
    await adapter.insertNote(note("2", "World"));
    const all = await adapter.getAllNotes();
    expect(all).toHaveLength(2);
  });

  test("getAllNotes returns sorted by updatedAt desc", async () => {
    await adapter.insertNote({
      id: "1",
      title: "Old",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    await adapter.insertNote({
      id: "2",
      title: "New",
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    });
    const all = await adapter.getAllNotes();
    expect(all[0]!.id).toBe("2");
    expect(all[1]!.id).toBe("1");
  });

  test("getNoteById", async () => {
    await adapter.insertNote(note("1", "Hello"));
    expect(await adapter.getNoteById("1")).toEqual(note("1", "Hello"));
    expect(await adapter.getNoteById("999")).toBeUndefined();
  });

  test("updateNote title", async () => {
    await adapter.insertNote(note("1", "Hello"));
    await adapter.updateNote("1", { title: "Updated", updatedAt: "2024-02-01T00:00:00Z" });
    const updated = await adapter.getNoteById("1");
    expect(updated!.title).toBe("Updated");
    expect(updated!.updatedAt).toBe("2024-02-01T00:00:00Z");
  });

  test("updateNote without title", async () => {
    await adapter.insertNote(note("1", "Hello"));
    await adapter.updateNote("1", { updatedAt: "2024-02-01T00:00:00Z" });
    const updated = await adapter.getNoteById("1");
    expect(updated!.title).toBe("Hello");
    expect(updated!.updatedAt).toBe("2024-02-01T00:00:00Z");
  });

  test("deleteNote", async () => {
    await adapter.insertNote(note("1", "Hello"));
    await adapter.deleteNote("1");
    expect(await adapter.getNoteById("1")).toBeUndefined();
  });
});

describe("content", () => {
  test("getContent returns empty string for missing", async () => {
    expect(await adapter.getContent("nonexistent")).toBe("");
  });

  test("saveContent and getContent", async () => {
    await adapter.saveContent("1", "# Hello World");
    expect(await adapter.getContent("1")).toBe("# Hello World");
  });

  test("saveContent overwrites", async () => {
    await adapter.saveContent("1", "old");
    await adapter.saveContent("1", "new");
    expect(await adapter.getContent("1")).toBe("new");
  });

  test("deleteContent", async () => {
    await adapter.saveContent("1", "content");
    await adapter.deleteContent("1");
    expect(await adapter.getContent("1")).toBe("");
  });
});

describe("links", () => {
  const link = (id: string, sourceId: string, targetId: string) => ({ id, sourceId, targetId });

  test("insertLink and getAllLinks", async () => {
    await adapter.insertLink(link("l1", "a", "b"));
    await adapter.insertLink(link("l2", "b", "c"));
    const all = await adapter.getAllLinks();
    expect(all).toHaveLength(2);
  });

  test("getLinkById", async () => {
    await adapter.insertLink(link("l1", "a", "b"));
    expect(await adapter.getLinkById("l1")).toEqual(link("l1", "a", "b"));
    expect(await adapter.getLinkById("missing")).toBeUndefined();
  });

  test("findLink forward direction", async () => {
    await adapter.insertLink(link("l1", "a", "b"));
    const found = await adapter.findLink("a", "b");
    expect(found).toEqual(link("l1", "a", "b"));
  });

  test("findLink reverse direction", async () => {
    await adapter.insertLink(link("l1", "a", "b"));
    const found = await adapter.findLink("b", "a");
    expect(found).toEqual(link("l1", "a", "b"));
  });

  test("findLink returns undefined when not found", async () => {
    expect(await adapter.findLink("x", "y")).toBeUndefined();
  });

  test("deleteLink", async () => {
    await adapter.insertLink(link("l1", "a", "b"));
    await adapter.deleteLink("l1");
    expect(await adapter.getLinkById("l1")).toBeUndefined();
  });
});
