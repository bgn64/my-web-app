"use client";

import { useState, type FormEvent } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { PowerSyncProvider } from "../powersync/provider";
import { SyncControls } from "../powersync/sync-controls";
import type { Todo } from "../powersync/schema";

function TodoList() {
  const database = usePowerSync();

  const { data: todos, error: queryError, isLoading } = useQuery<Todo>(
    "SELECT id, title, completed FROM todos ORDER BY id",
  );

  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const completedCount = todos.filter((todo) => todo.completed).length;

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
    <section className="card" aria-labelledby="todo-title">
      <div className="section-heading">
        <h2 id="todo-title">The shared list</h2>
        {!isLoading && !queryError && (
          <span className="task-count">{completedCount} of {todos.length} done</span>
        )}
      </div>
      <p className="muted todo-description">
        Every signed-in user can read and edit these todos.
      </p>

      {error && <p className="alert" role="alert">{error}</p>}
      {queryError && <p className="alert" role="alert">{queryError.message}</p>}

      <div>
        <form className="todo-form" onSubmit={addTodo}>
          <label className="form-label" htmlFor="new-todo">New todo</label>
          <div className="input-row">
            <input
              className="text-input"
              id="new-todo"
              placeholder="What would you like to get done?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
            <button className="button" type="submit">Add todo</button>
          </div>
        </form>

        {isLoading && <p className="muted" role="status">Loading your list...</p>}
        {!isLoading && !queryError && todos.length === 0 && (
          <div className="empty-state">
            <p>A fresh start.</p>
            <p className="muted">Add the first todo above. Small steps count.</p>
          </div>
        )}

        <ul className="todo-list">
          {todos.map((todo) => (
            <li className={`todo-row${todo.completed ? " todo-completed" : ""}`} key={todo.id}>
              <span className="todo-title">
                {todo.completed ? <s>{todo.title}</s> : todo.title}
              </span>

              <div className="todo-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  aria-label={`${todo.completed ? "Mark incomplete" : "Complete"}: ${todo.title}`}
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
                  className="button button-danger"
                  type="button"
                  aria-label={`Delete: ${todo.title}`}
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
              </div>
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