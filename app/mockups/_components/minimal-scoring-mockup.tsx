import type { MockupStat } from "../scoring-examples";
import { Arrow } from "./scoring-mockup";

function MinimalStatRow({ stat }: { stat: MockupStat })
{
	const value = stat.values.find((entry) => entry.hole === 4)?.value ?? null;

	return (
		<li className="minimal-stat-row">
			<span className="minimal-stat-name">{stat.name}</span>
			<div className="minimal-stat-answers" role="group" aria-label={`${stat.name} for hole 4`}>
				{stat.kind === "number" ? (
					<>
						<button type="button" aria-label={`Decrease ${stat.name}`} disabled={value === null || value === 0}>
							&minus;
						</button>
						<input
							aria-label={`${stat.name} for hole 4`}
							value={value === null ? "" : String(value)}
							placeholder="—"
							inputMode="numeric"
							readOnly
						/>
						<button type="button" aria-label={`Increase ${stat.name}`}>+</button>
					</>
				) : (
					<>
						<button type="button" aria-pressed={value === true}>Yes</button>
						<button type="button" aria-pressed={value === false}>No</button>
					</>
				)}
				<button
					type="button"
					className="minimal-clear"
					aria-label={`Clear ${stat.name}`}
					disabled={value === null}
				>
					&times;
				</button>
			</div>
		</li>
	);
}

function MinimalStats({ stats }: { stats: MockupStat[] })
{
	if (stats.length === 0)
	{
		return (
			<div className="minimal-track-prompt">
				<button type="button"><span aria-hidden="true">+</span> Track stats</button>
			</div>
		);
	}

	return (
		<section className="minimal-stats" aria-label="Hole statistics">
			<div className="minimal-stats-heading">
				<h2>Stats</h2>
				<div>
					<button type="button">Totals</button>
					<button type="button" aria-label="Edit stats">Edit</button>
				</div>
			</div>
			<div className="minimal-stats-scroll" tabIndex={0} aria-label="Hole stat entries">
				<ul>
					{stats.map((stat) => <MinimalStatRow key={stat.id} stat={stat} />)}
				</ul>
			</div>
		</section>
	);
}

export function MinimalScoringMockup({ stats, isAppStyled = false }: {
	stats: MockupStat[];
	isAppStyled?: boolean;
})
{
	return (
		<main className={`minimal-scoring${isAppStyled ? " minimal-app-styled" : ""}`}>
			<header className="minimal-header">
				<button type="button" aria-label="Back to Play"><Arrow direction="back" /></button>
				<span title="Cedar Ridge Golf Club">Cedar Ridge Golf Club</span>
				<button type="button" className="minimal-menu" aria-label="Round actions">&hellip;</button>
			</header>
			<div className="minimal-progress" aria-label="4 of 18 holes scored. Even par.">
				<div><span>4 / 18 scored</span><span>Even</span></div>
				<div className="minimal-progress-track"><span /></div>
			</div>
			<div className="minimal-scoring-content">
				<div className="minimal-scoring-body">
					<section className="minimal-score" aria-label="Hole 4 scoring">
						<h1>Hole 4</h1>
						<p>Par 4 <span aria-hidden="true">&middot;</span> Blue 385 <span aria-hidden="true">&middot;</span> Red 310 yd</p>
						<div className="minimal-score-stepper">
							<button type="button" aria-label="Decrease score">&minus;</button>
							<div className="minimal-score-value" aria-label="Score 4">4</div>
							<button type="button" aria-label="Increase score">+</button>
						</div>
					</section>
					<MinimalStats stats={stats} />
				</div>
			</div>
			<footer className="minimal-footer" aria-label="Hole navigation">
				<button type="button" aria-label="Previous hole"><Arrow direction="previous" /></button>
				<button type="button" className="minimal-hole-picker" aria-label="Hole 4 of 18, jump to hole">
					4 <span>/ 18</span><Arrow direction="down" />
				</button>
				<button type="button" className="minimal-next" aria-label="Next hole">
					Next <Arrow direction="next" />
				</button>
			</footer>
		</main>
	);
}
