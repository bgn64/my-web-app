import { notFound, redirect } from "next/navigation";
import { parseId } from "../../../_lib/parse-id";
import { requireUser } from "../../../_features/auth/session";
import { getRound } from "../../../_features/rounds/data";
import { relativeScore, summarize } from "../../../_features/rounds/golf-summary";
import { getRoundStats } from "../../../_features/stats/data";
import { RoundStatsSummary } from "../../../_features/stats/summary";
import { statDisplayName } from "../../../_features/stats/contracts";

type RoundDetailPageProps = {
	params: Promise<{
		roundId: string;
	}>;
};

export default async function RoundDetailPage({ params }: RoundDetailPageProps)
{
	const { roundId } = await params;
	const id = parseId(roundId);

	if (!id)
	{
		notFound();
	}

	const user = await requireUser(`/rounds/${id}`);
	const round = await getRound(user.id, id);

	if (!round)
	{
		notFound();
	}

	if (!round.finished_at)
	{
		redirect(`/rounds/${id}/scorecard`);
	}

	const summary = summarize(round.holes);
	const stats = await getRoundStats(user.id, id);
	if (!stats)
	{
		notFound();
	}

	return (
		<div className="page">
			<div className="page-intro">
				<span className="eyebrow">COMPLETED ROUND</span>
				<h1>{round.course_name}</h1>
				<p>{new Intl.DateTimeFormat("en-US", {
					dateStyle: "long",
					timeZone: "UTC",
				}).format(new Date(round.finished_at))} · {round.course_location}</p>
			</div>
			<div className="summary-card">
				<div>
					<span>STROKES</span>
					<strong>{summary.played ? summary.strokes : "—"}</strong>
				</div>
				<div>
					<span>TO PAR</span>
					<strong>{summary.played ? relativeScore(summary.relative) : "—"}</strong>
				</div>
				<div>
					<span>HOLES SCORED</span>
					<strong>{summary.played}<small> / {summary.total}</small></strong>
				</div>
			</div>
			{summary.played < summary.total && (
				<p className="partial-note">Partial round · Totals include scored holes only.</p>
			)}
			<RoundStatsSummary stats={stats.stats} holeCount={round.holes.length} />
			<div className="section-heading">
				<span>YOUR SCORECARD</span>
				<span>READ ONLY</span>
			</div>
			<div className="history-holes">
				{round.holes.map((hole) => (
					<div className="history-hole" key={hole.hole_number}>
						<div className="history-hole-top">
							<strong>Hole {hole.hole_number}</strong>
							<span>Par {hole.par} · HCP {hole.handicap}</span>
							<b>{hole.strokes ?? "—"}</b>
						</div>
						<div className="history-yardages">
							{hole.yardages.map((tee) => <span key={tee.name}>{tee.name} <strong>{tee.yards} yds</strong></span>)}
						</div>
						{stats.stats.length > 0 && (
							<div className="history-stats">
								{stats.stats.map((stat) =>
								{
									const value = stat.values.find((entry) => entry.hole === hole.hole_number)?.value;
									const text = value === undefined ? "—" : typeof value === "boolean" ? (value ? "Yes" : "No") : value;
									return <div key={stat.id}><span>{statDisplayName(stats.stats, stat)}</span><strong>{text}</strong></div>;
								})}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
