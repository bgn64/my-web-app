import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getSession()
{
	return auth.api.getSession({
		headers: await headers(),
	});
}

export async function requireUser(next = "/play")
{
	const session = await getSession();

	if (!session)
	{
		redirect(`/sign-in?next=${encodeURIComponent(next)}`);
	}

	return session.user;
}
