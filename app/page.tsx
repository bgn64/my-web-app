import { Suspense } from "react";
import { connection } from "next/server";
import { addTodo, deleteTodo, toggleTodo } from "./actions";
import { getDb, type Todo } from "./db";
import { headers } from "next/headers";
import { auth } from "./auth";
import { AuthForm, LogoutButton } from "./auth-controls";

async function TodoList() {
  await connection();

  const result = await getDb().query<Todo>(
    "SELECT id, title, completed FROM todos ORDER BY id DESC",
  );

  const todos = result.rows;

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

async function SharedTodos() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <main>
        <h1>Todos</h1>
        <AuthForm />
      </main>
    );
  }

  return (
    <main>
      <h1>Todos</h1>
      <p>Signed in as {session.user.email}</p>
      <LogoutButton />

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

export default function Home() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SharedTodos />
    </Suspense>
  );
}
