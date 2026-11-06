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
    <section>
      <h2>{signup ? "Create an account" : "Log in"}</h2>

      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          {signup && (
            <p>
              <label>
                Name
                <input name="name" autoComplete="name" required />
              </label>
            </p>
          )}

          <p>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </label>
          </p>

          <p>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </label>
          </p>

          <button type="submit">
            {pending ? "Please wait..." : signup ? "Sign up" : "Log in"}
          </button>

          <button
            type="button"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Already have an account?" : "Create an account"}
          </button>
        </fieldset>

        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
