import { Suspense } from "react";
import { AuthForm } from "../auth-controls";

async function SignInForm({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next : "/play";
  return <AuthForm next={destination} />;
}

export default function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand-mark">F</div>
        <p className="eyebrow">FAIRWAY</p>
        <h1>Your round,<br />simply.</h1>
        <p className="auth-intro">Less time keeping score. More time enjoying the game.</p>
        <Suspense fallback={<p>Loading sign in...</p>}>
          <SignInForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
