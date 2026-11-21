import { notFound, redirect } from "next/navigation";
import { parseId } from "../../../../_lib/parse-id";
import { requireUser } from "../../../../_features/auth/session";
import { getRound } from "../../../../_features/rounds/data";
import { getRoundStats } from "../../../../_features/stats/data";
import { Scorecard } from "./_components/scorecard";

type ScorecardPageProps = {
	params: Promise<{
		roundId: string;
	}>;
};

export default async function ScorecardPage({ params }: ScorecardPageProps)
{
	const { roundId } = await params;
	const id = parseId(roundId);

	if (!id)
	{
		notFound();
	}

	const user = await requireUser(`/rounds/${id}/scorecard`);
	const round = await getRound(user.id, id);

	if (!round)
	{
		notFound();
	}

	if (round.finished_at)
	{
		redirect(`/rounds/${id}`);
	}

	if (!round.holes.length)
	{
		throw new Error("Round has no scorecard.");
	}

	const stats = await getRoundStats(user.id, id);
	if (!stats)
	{
		notFound();
	}

	return <Scorecard roundId={id} courseName={round.course_name} initialHoles={round.holes} initialStats={stats} />;
}
