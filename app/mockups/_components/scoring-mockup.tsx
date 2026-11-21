import { manyStats, sampleStats, sampleTotals } from "../scoring-examples";
import type { MockupStat, ScoringExample } from "../scoring-examples";

type Direction = "back" | "previous" | "next" | "down";

export function Arrow({ direction }: { direction: Direction })
{
	const paths = {
		back: "M19 12H5m7-7-7 7 7 7",
		previous: "m15 18-6-6 6-6",
		next: "M5 12h14m-7-7 7 7-7 7",
		down: "m6 9 6 6 6-6",
	};

	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
			<path d={paths[direction]} />
		</svg>
	);
}

function Header({ editing, unresolved }: { editing: boolean; unresolved: boolean })
{
	return (
		<header className="scoring-header">
			<div className="scoring-leading-action">
				{editing ? (
					<button type="button" className="scoring-header-action">Cancel</button>
				) : (
					<button type="button" className="back-button mockup-back" aria-label="Back to Play">
						<Arrow direction="back" />
					</button>
				)}
			</div>
			<div className="scoring-course" title="Cedar Ridge Golf Club">Cedar Ridge Golf Club</div>
			<div className="scoring-header-actions">
				<button
					type="button"
					className={`scoring-header-action${editing ? " scoring-save" : ""}`}
					aria-label={editing ? "Save stat configuration" : "Edit stats"}
					disabled={unresolved}
				>
					{editing ? "Save" : "Edit"}
				</button>
				<button type="button" className="mockup-round-menu" aria-label="Round actions" disabled={editing}>
					&hellip;
				</button>
			</div>
		</header>
	);
}

function Progress()
{
	return (
		<div className="scoring-progress-block">
			<div className="score-progress">
				<div>
					<span className="eyebrow">YOUR PROGRESS</span>
					<strong>4 <span>/ 18 holes scored</span></strong>
				</div>
				<div className="score-progress-total">
					<span className="eyebrow">TO PAR</span>
					<strong>E</strong>
				</div>
			</div>
			<div className="progress-track"><div className="mockup-progress" /></div>
		</div>
	);
}

function StrokeEntry({ editing }: { editing: boolean })
{
	return (
		<section className="scoring-panel" aria-label="Hole 4 scoring">
			<div className="scoring-hole-context">
				<div className="scoring-hole-heading">
					<h1>Hole 4</h1>
					<span>Par <strong>4</strong></span>
					<span>Hcp <strong>9</strong></span>
				</div>
				<div className="scoring-tee-matrix">
					<div className="scoring-tee-grid">
						<span><span>Blue</span> <strong>385</strong> <span>yd</span></span>
						<span><span>Red</span> <strong>310</strong> <span>yd</span></span>
					</div>
				</div>
			</div>
			<div className="score-entry">
				<span className="eyebrow">YOUR SCORE</span>
				<div className="stepper">
					<button type="button" aria-label="Decrease score" disabled={editing}>&minus;</button>
					<div className="score-value" aria-label="Score 4">4</div>
					<button type="button" aria-label="Increase score" disabled={editing}>+</button>
				</div>
				<div className="quick-scores" role="group" aria-label="Quick scores">
					{[3, 4, 5, 6].map((score) => (
						<button
							key={score}
							type="button"
							disabled={editing}
							aria-label={`${score} strokes`}
							aria-pressed={score === 4}
						>
							{score}
						</button>
					))}
				</div>
			</div>
		</section>
	);
}

function Answer({ stat, preview }: { stat: MockupStat; preview: boolean })
{
	const value = preview ? null : stat.values.find((entry) => entry.hole === 4)?.value ?? null;

	return (
		<div className={`stat-entry-actions${preview ? " stat-preview" : ""}`}>
			{preview && <span className="sr-only">Blank answer preview</span>}
			<div className="stat-controls" role="group" aria-label={`${stat.name} for hole 4`}>
				{stat.kind === "number" ? (
					<>
						<button
							type="button"
							aria-label={`Decrease ${stat.name}`}
							disabled={preview || value === null || value === 0}
						>
							&minus;
						</button>
						<input
							aria-label={`${stat.name} for hole 4`}
							inputMode="numeric"
							value={value === null ? "" : String(value)}
							placeholder="—"
							readOnly
							disabled={preview}
						/>
						<button type="button" aria-label={`Increase ${stat.name}`} disabled={preview}>+</button>
					</>
				) : (
					<>
						<button type="button" aria-pressed={value === true} disabled={preview}>Yes</button>
						<button type="button" aria-pressed={value === false} disabled={preview}>No</button>
					</>
				)}
			</div>
			{preview ? (
				<span className="stat-clear-preview" aria-hidden="true">Clear</span>
			) : (
				<button
					type="button"
					className="inline-button stat-clear"
					aria-label={`Clear ${stat.name}`}
					disabled={value === null}
				>
					Clear
				</button>
			)}
		</div>
	);
}

function StatRows({ stats, editing, search }: { stats: MockupStat[]; editing: boolean; search: boolean })
{
	return (
		<div className={editing ? "inline-stat-configuration" : "stat-entry-list"}>
			{stats.map((stat, index) => (
				<div key={stat.id} className={`stat-entry-row${editing ? " stat-configuration-row" : ""}`}>
					<div className="stat-label-slot">
						{editing ? (
							<>
								<div className={`stat-selector-field${search && index === 0 ? " mockup-search-field" : ""}`}>
									<input
										className="stat-selector"
										role="combobox"
										aria-label={`Choose stat: ${stat.name}`}
										aria-expanded={search && index === 0}
										aria-controls={search && index === 0 ? "mockup-stat-results" : undefined}
										value={search && index === 0 ? "Put" : stat.name}
										readOnly
									/>
								</div>
								<button type="button" className="remove-stat" aria-label={`Remove ${stat.name} from this round`}>
									<span aria-hidden="true">&times;</span>
								</button>
							</>
						) : (
							<strong className="stat-name">{stat.name}</strong>
						)}
					</div>
					<Answer stat={stat} preview={editing} />
				</div>
			))}
			{editing && (
				<div className="stat-add-row">
					<button type="button" className="button button-secondary">
						<span aria-hidden="true">+</span> Add stat
					</button>
				</div>
			)}
		</div>
	);
}

function SearchResults()
{
	return (
		<div
			id="mockup-stat-results"
			className="stat-suggestions mockup-search-results"
			role="listbox"
			aria-label="Choose a stat"
		>
			<div role="option" aria-selected="true">Putts</div>
			<div role="option" aria-selected="false">Long putts</div>
			<div role="option" aria-selected="false" className="stat-create-option">+ Create &ldquo;Put&rdquo;</div>
		</div>
	);
}

function Footer({ editing }: { editing: boolean })
{
	return (
		<footer className="scoring-footer">
			<div className="hole-navigator" role="group" aria-label="Hole navigation">
				<button type="button" className="hole-previous" aria-label="Previous hole" disabled={editing}>
					<Arrow direction="previous" />
				</button>
				<button
					type="button"
					className="hole-picker-trigger"
					aria-label="Hole 4 of 18, jump to hole"
					disabled={editing}
				>
					<span>Hole 4 <span className="hole-count">of 18</span></span>
					<Arrow direction="down" />
				</button>
				<button type="button" className="hole-next" aria-label="Next hole" disabled={editing}>
					Next <Arrow direction="next" />
				</button>
			</div>
		</footer>
	);
}

function CreationDialog()
{
	return (
		<div className="mockup-overlay">
			<section
				className="dialog stat-editor-dialog mockup-creation"
				role="dialog"
				aria-modal="true"
				aria-labelledby="mockup-create-title"
			>
				<h2 id="mockup-create-title">New stat</h2>
				<label htmlFor="mockup-create-name">Name</label>
				<input id="mockup-create-name" value="Approach commitment" readOnly />
				<div className="stat-kind-choices" role="group" aria-label="Answer format">
					<button type="button" aria-pressed="true">Number</button>
					<button type="button" aria-pressed="false">Yes / No</button>
				</div>
				<button type="button" className="button button-primary full-width">Add stat</button>
				<button type="button" className="button button-secondary full-width">Cancel</button>
			</section>
		</div>
	);
}

function StatsTotals()
{
	return (
		<section className="stats-summary" aria-label="Round stats">
			<h2>Round stats</h2>
			{sampleTotals.map((stat) => (
				<div className="stats-summary-row" key={stat.name}>
					<div>
						<strong>{stat.name}</strong>
						<small>{stat.coverage}</small>
					</div>
					<b>{stat.value}</b>
				</div>
			))}
		</section>
	);
}

function StatsContent({ variant, stats, editing }: {
	variant: ScoringExample;
	stats: MockupStat[];
	editing: boolean;
})
{
	if (variant === "empty")
	{
		return <p className="stats-empty">Use Edit to choose the stats you want to track.</p>;
	}

	if (variant === "totals")
	{
		return <StatsTotals />;
	}

	return <StatRows stats={stats} editing={editing} search={variant === "search"} />;
}

export function ScoringMockup({ variant }: { variant: ScoringExample })
{
	const editing = variant === "editing" || variant === "search" || variant === "create-dialog";
	const dialog = variant === "create-dialog";
	const totals = variant === "totals";
	const stats = variant === "many" ? manyStats : sampleStats;
	let statsLabel = "Hole stat entries";

	if (editing)
	{
		statsLabel = "Stat configuration";
	}
	else if (totals)
	{
		statsLabel = "Round stat totals";
	}

	return (
		<>
			<main className="focused-scorecard-shell" inert={dialog}>
				<div className="scorecard-frame">
					<Header editing={editing} unresolved={variant === "search" || dialog} />
					<Progress />
					<StrokeEntry editing={editing} />
					<section className="stats-workspace" aria-label="Round statistics">
						<div className="stats-workspace-heading">
							<h2>{editing ? "Edit stats" : "Stats"}</h2>
							<div className="stats-view-switch" role="group" aria-label="Stats view">
								<button type="button" aria-pressed={!totals} disabled={editing}>This hole</button>
								<button type="button" aria-pressed={totals} disabled={editing}>Totals</button>
							</div>
						</div>
						<div
							className="stats-workspace-scroll"
							tabIndex={0}
							aria-label={statsLabel}
						>
							<StatsContent variant={variant} stats={stats} editing={editing} />
						</div>
					</section>
					<Footer editing={editing} />
				</div>
			</main>
			{variant === "search" && <SearchResults />}
			{dialog && <CreationDialog />}
		</>
	);
}
