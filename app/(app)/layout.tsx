import { Suspense } from "react";
import { AppShell } from "../app-shell";
import { getSession } from "../golf-data";

type AppLayoutProps = {
	children: React.ReactNode;
};

async function AuthenticatedShell({ children }: AppLayoutProps)
{
	const session = await getSession();

	if (!session)
	{
		return children;
	}

	return <AppShell name={session.user.name} email={session.user.email}>{children}</AppShell>;
}

export default function AppLayout({ children }: AppLayoutProps)
{
	return (
		<Suspense fallback={<div className="loading-screen">Loading your clubhouse...</div>}>
			<AuthenticatedShell>{children}</AuthenticatedShell>
		</Suspense>
	);
}
