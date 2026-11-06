import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "./auth";
import { AuthForm } from "./auth-controls";
import { TodoLoader } from "./todos/todo-loader";

async function SharedTodos() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <AuthForm />;
  }

  return (
    <div>
      <p className="muted account-note">Signed in as {session.user.email}</p>
      <TodoLoader userId={session.user.id} />
    </div>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="wordmark" href="/" aria-label="Todo Club home">
          todo club<span>.</span>
        </Link>
        <span className="header-note">A little room to get things done</span>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">Small steps. Shared progress.</p>
        <h1 id="welcome-title">Make space for what matters.</h1>
        <p className="hero-description">
          A simple shared todo list. Capture a thought, check off a task,
          and keep your day moving.
        </p>
      </section>

      <Suspense fallback={<p className="card muted" role="status">Opening your workspace...</p>}>
        <SharedTodos />
      </Suspense>

      <footer className="app-footer">
        Built for learning. Made for a little everyday progress.
      </footer>
    </main>
  );
}