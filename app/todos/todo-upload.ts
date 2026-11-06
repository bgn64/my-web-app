import "server-only";
import type { PoolClient } from "pg";

type Fields = { title?: string; completed?: number };
type TodoEntry =
  | {
      op: "PUT";
      table: "todos";
      id: string;
      data: { title: string; completed: number };
    }
  | { op: "PATCH"; table: "todos"; id: string; data: Fields }
  | { op: "DELETE"; table: "todos"; id: string; data?: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTodoEntry(value: unknown): value is TodoEntry {
  if (
    !isRecord(value) ||
    value.table !== "todos" ||
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
  ) {
    return false;
  }

  if (value.op === "DELETE") {
    return value.data === undefined || value.data === null;
  }

  if (
    (value.op !== "PUT" && value.op !== "PATCH") ||
    !isRecord(value.data)
  ) {
    return false;
  }

  const data = value.data;

  if (
    Object.keys(data).some((key) => key !== "title" && key !== "completed") ||
    ("title" in data &&
      (typeof data.title !== "string" || !data.title.trim())) ||
    ("completed" in data && data.completed !== 0 && data.completed !== 1)
  ) {
    return false;
  }

  return value.op === "PUT"
    ? typeof data.title === "string" && typeof data.completed === "number"
    : Object.keys(data).length > 0;
}

export function parseTodoBatch(value: unknown): TodoEntry[] | null {
  return Array.isArray(value) && value.every(isTodoEntry) ? value : null;
}

export async function applyTodoChange(client: PoolClient, entry: TodoEntry) {
  if (entry.op === "PUT") {
    await client.query(
      `INSERT INTO todos (id, title, completed)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, completed = EXCLUDED.completed`,
      [entry.id, entry.data.title, entry.data.completed],
    );
  } else if (entry.op === "PATCH") {
    await client.query(
      `UPDATE todos
       SET title = COALESCE($2::text, title),
           completed = COALESCE($3::integer, completed)
       WHERE id = $1`,
      [entry.id, entry.data.title ?? null, entry.data.completed ?? null],
    );
  } else {
    await client.query("DELETE FROM todos WHERE id = $1", [entry.id]);
  }
}
