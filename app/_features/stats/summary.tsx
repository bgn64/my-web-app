import { statDisplayName, summarizeStat } from "./contracts";
import type { RoundStat } from "./contracts";

type Props = {
	stats: RoundStat[];
	holeCount: number;
};

export function RoundStatsSummary({ stats, holeCount }: Props)
{
	if (!stats.length)
	{
		return null;
	}

	return (
		<section className="stats-summary" aria-label="Round stats">
			<h2>Round stats</h2>
			{stats.map((stat) =>
			{
				const summary = summarizeStat(stat);
				const value = summary.answered === 0
					? "—"
					: stat.kind === "boolean" ? `${summary.total} / ${summary.answered}` : summary.total;
				return (
					<div className="stats-summary-row" key={stat.id}>
						<div>
							<strong>{statDisplayName(stats, stat)}</strong>
							<small>
								{summary.answered ? `${summary.answered} of ${holeCount} holes recorded` : "No entries yet"}
								{summary.answered > 0 && (stat.kind === "boolean" ? " · Yes / Answered" : " · Total")}
							</small>
						</div>
						<b>{value}</b>
					</div>
				);
			})}
		</section>
	);
}
