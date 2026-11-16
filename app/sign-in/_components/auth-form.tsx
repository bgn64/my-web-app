"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "../../_features/auth/auth-client";

type AuthFormProps = {
	next?: string;
};

export function AuthForm({ next = "/play" }: AuthFormProps)
{
	const [signup, setSignup] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(event: FormEvent<HTMLFormElement>)
	{
		event.preventDefault();

		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "");
		const password = String(data.get("password") ?? "");
		const name = String(data.get("name") ?? "");

		setPending(true);
		setError("");

		try
		{
			const result = signup
				? await authClient.signUp.email({
					name,
					email,
					password,
				})
				: await authClient.signIn.email({
					email,
					password,
				});

			if (result.error)
			{
				setError(result.error.message ?? "Authentication failed.");
				return;
			}

			window.location.assign(next);
		}
		catch (error)
		{
			setError(error instanceof Error ? error.message : "Unable to contact the server.");
		}
		finally
		{
			setPending(false);
		}
	}

	function handleToggleSignup()
	{
		setSignup(!signup);
		setError("");
	}

	let submitLabel = signup ? "Sign up" : "Log in";

	if (pending)
	{
		submitLabel = "Please wait...";
	}

	return (
		<section className="auth-form">
			<h2>{signup ? "Create your account" : "Welcome back"}</h2>
			<p className="muted">{signup ? "Start keeping track of your rounds." : "Sign in to pick up where you left off."}</p>

			<form onSubmit={handleSubmit}>
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
							<input name="email" type="email" autoComplete="email" required />
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

					<button className="button button-primary full-width" type="submit">
						{submitLabel}
					</button>

					<button className="text-button full-width" type="button" onClick={handleToggleSignup}>
						{signup ? "Already have an account?" : "Create an account"}
					</button>
				</fieldset>

				{error && <p role="alert">{error}</p>}
			</form>
		</section>
	);
}
