import { Suspense } from "react";
import { connection } from "next/server";
import { addTodo, deleteTodo, toggleTodo } from "./actions";
import { getDb, type Todo } from "./db";

async function TodoList() {
  await connection();

  const todos = getDb()
    .prepare("SELECT id, title, completed FROM todos ORDER BY id DESC")
    .all() as Todo[];

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          {todo.completed ? <s>{todo.title}</s> : todo.title}

          <form action={toggleTodo}>
            <input type="hidden" name="id" value={todo.id} />
            <button type="submit">
              {todo.completed ? "Mark incomplete" : "Complete"}
            </button>
          </form>

          <form action={deleteTodo}>
            <input type="hidden" name="id" value={todo.id} />
            <button type="submit">Delete</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main>
      <h1>Todos</h1>

      <form action={addTodo}>
        <input name="title" aria-label="New todo" required />
        <button type="submit">Add</button>
      </form>

      <Suspense fallback={<p>Loading todos...</p>}>
        <TodoList />
      </Suspense>
    </main>
  );
}
