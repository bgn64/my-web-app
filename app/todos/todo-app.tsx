"use client";

import { useState, type FormEvent } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { PowerSyncProvider } from "../powersync/provider";
import { SyncControls } from "../powersync/sync-controls";
import type { Todo } from "../powersync/schema";

function TodoList() {
  const database = usePowerSync();

  const { data: todos, error: queryError } = useQuery<Todo>(
    "SELECT id, title, completed FROM todos ORDER BY id",
  );

  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setError("");

    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "The operation failed.",
      );
    }
  }

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = title.trim();

    if (!value) {
      setError("A todo title is required.");
      return;
    }

    await run(async () => {
      await database.execute(
        "INSERT INTO todos (id, title, completed) VALUES (?, ?, ?)",
        [crypto.randomUUID(), value, 0],
      );

      setTitle("");
    });
  }

  return (
    <section>
      <p>
        Shared todo demo: every signed-in user can read and edit this list.
      </p>

      {error && <p role="alert">{error}</p>}
      {queryError && <p role="alert">{queryError.message}</p>}

      <div>
        <form onSubmit={addTodo}>
          <input
            aria-label="New todo"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
          <button type="submit">Add</button>
        </form>

        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>
              {todo.completed ? <s>{todo.title}</s> : todo.title}

              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await database.execute(
                      "UPDATE todos SET completed = ? WHERE id = ?",
                      [todo.completed ? 0 : 1, todo.id],
                    );
                  })
                }
              >
                {todo.completed ? "Mark incomplete" : "Complete"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    await database.execute(
                      "DELETE FROM todos WHERE id = ?",
                      [todo.id],
                    );
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function TodoApp({ userId }: { userId: string }) {
  return (
    <PowerSyncProvider userId={userId}>
      <SyncControls userId={userId}>
        <TodoList />
      </SyncControls>
    </PowerSyncProvider>
  );
}