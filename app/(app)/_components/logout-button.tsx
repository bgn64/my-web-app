"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../_features/auth/auth-client";

export function LogoutButton()
{
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();

	async function handleLogout()
	{
		setPending(true);
		setError("");

		try
		{
			const result = await authClient.signOut();

			if (result.error)
			{
				setError(result.error.message ?? "Logout failed.");
				return;
			}

			router.push("/sign-in");
			router.refresh();
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

	return (
		<div>
			<button className="menu-button" type="button" onClick={handleLogout} disabled={pending}>
				{pending ? "Logging out..." : "Log out"}
			</button>
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
