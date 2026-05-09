import { Hono } from "hono";
import { graph } from "../graph.js";

export const notesRouter = new Hono();

notesRouter.get("/", async (c) => {
  const notes = await graph.getNotes();
  return c.json(notes);
});

notesRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const notes = await graph.searchNotes(q);
  return c.json(notes);
});

notesRouter.get("/:id", async (c) => {
  const note = await graph.getNote(c.req.param("id"));
  return note ? c.json(note) : c.json({ error: "Not found" }, 404);
});

notesRouter.post("/", async (c) => {
  const { title } = await c.req.json<{ title: string }>();
  const result = await graph.createNote(title);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  return c.json(result.value, 201);
});

notesRouter.patch("/:id", async (c) => {
  const { title } = await c.req.json<{ title: string }>();
  const result = await graph.renameNote(c.req.param("id"), title);
  if (!result.ok) {
    const status = result.error === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: result.error }, status);
  }
  return c.json(result.value);
});

notesRouter.delete("/:id", async (c) => {
  const result = await graph.deleteNote(c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, 404);
  return c.json({ ok: true });
});

notesRouter.put("/:id/content", async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  const result = await graph.saveContent(c.req.param("id"), content);
  if (!result.ok) return c.json({ error: result.error }, 404);
  return c.json({ ok: true });
});
