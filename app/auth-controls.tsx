"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "./auth-client";

export function AuthForm() {
  const [signup, setSignup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "");

    setPending(true);
    setError("");

    try {
      const result = signup
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed.");
        return;
      }

      window.location.assign("/");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to contact the server.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Your shared workspace</p>
      <h2 id="auth-title">{signup ? "Join the club." : "Welcome back."}</h2>
      <p className="muted">
        {signup
          ? "Create an account to start adding to the shared list."
          : "Log in to pick up where you left off."}
      </p>

      <form className="auth-form" onSubmit={submit} aria-busy={pending}>
        <fieldset className="form-fields" disabled={pending}>
          {signup && (
            <p>
              <label className="form-label">
                Name
                <input className="text-input" name="name" autoComplete="name" required />
              </label>
            </p>
          )}

          <p>
            <label className="form-label">
              Email
              <input
                className="text-input"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
          </p>

          <p>
            <label className="form-label">
              Password
              <input
                className="text-input"
                name="password"
                type="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </label>
          </p>

          <button className="button" type="submit">
            {pending ? "Please wait..." : signup ? "Sign up" : "Log in"}
          </button>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Already have an account?" : "Create an account"}
          </button>
        </fieldset>

        {error && <p className="alert" role="alert">{error}</p>}
      </form>
    </section>
  );
}
