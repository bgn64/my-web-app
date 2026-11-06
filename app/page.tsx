import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { AuthForm } from "./auth-controls";
import { TodoLoader } from "./todos/todo-loader";

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
      <TodoLoader userId={session.user.id} />
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