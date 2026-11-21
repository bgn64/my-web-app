import { statDisplayName, validStatDraft } from "../../../../../_features/stats/contracts";
import type { RoundStat, StatKind } from "../../../../../_features/stats/contracts";

type Props = {
	stats: RoundStat[];
	hole: number;
	drafts: Record<string, string>;
	disabled: boolean;
	onDraft: (stat: RoundStat, text: string) => void;
	onSave: (stat: RoundStat, value: number | boolean | null) => void;
};

export function statDraftKey(statId: number, hole: number)
{
	return `${statId}:${hole}`;
}

export function StatControlPreview({ kind }: { kind: StatKind })
{
	return (
		<div className="stat-entry-actions stat-preview">
			<span className="sr-only">{kind === "number" ? "Number answer preview" : "Yes or No answer preview"}</span>
			<div className="stat-controls" aria-hidden="true">
				{kind === "number" ? (
					<>
						<button type="button" disabled tabIndex={-1}>−</button>
						<input disabled tabIndex={-1} value="" placeholder="—" readOnly aria-label="Blank number preview" />
						<button type="button" disabled tabIndex={-1}>+</button>
					</>
				) : (
					<>
						<button type="button" disabled tabIndex={-1}>Yes</button>
						<button type="button" disabled tabIndex={-1}>No</button>
					</>
				)}
			</div>
			<span className="stat-clear-preview" aria-hidden="true">Clear</span>
		</div>
	);
}

export function StatEntry({ stats, hole, drafts, disabled, onDraft, onSave }: Props)
{
	return (
		<div className="stat-entry-list">
			{stats.map((stat) =>
			{
				const value = stat.values.find((entry) => entry.hole === hole)?.value ?? null;
				const key = statDraftKey(stat.id, hole);
				const name = statDisplayName(stats, stat);
				const text = drafts[key] ?? (value === null ? "" : String(value));
				const invalid = stat.kind === "number" && !validStatDraft(text);
				return (
					<div className="stat-entry-row" key={stat.id}>
						<div className="stat-label-slot">
							<strong className="stat-name">{name}</strong>
						</div>
						<div className="stat-entry-actions">
						{stat.kind === "number" ? (
							<>
								<div className="stat-controls">
									<button type="button" disabled={disabled || invalid || value === null || Number(value) <= 0}
										aria-label={`Decrease ${name}`} onClick={() => onSave(stat, Number(value) - 1)}>−</button>
									<input
										aria-label={`${name} for hole ${hole}`}
										aria-invalid={invalid}
										aria-describedby={invalid ? `stat-error-${stat.id}` : undefined}
										inputMode="numeric"
										value={text}
										placeholder="—"
										disabled={disabled}
										onChange={(event) => onDraft(stat, event.target.value)}
									/>
									<button type="button" disabled={disabled || invalid || value === 99}
										aria-label={`Increase ${name}`}
										onClick={() => onSave(stat, value === null ? 1 : Number(value) + 1)}>+</button>
								</div>
							</>
						) : (
							<div className="stat-controls" role="group" aria-label={`${name} for hole ${hole}`}>
								<button type="button" disabled={disabled} aria-pressed={value === true}
									onClick={() => onSave(stat, true)}>Yes</button>
								<button type="button" disabled={disabled} aria-pressed={value === false}
									onClick={() => onSave(stat, false)}>No</button>
							</div>
						)}
						<button type="button" className="inline-button stat-clear" disabled={disabled || (value === null && !invalid)}
							aria-label={`Clear ${name}`} onClick={() => onSave(stat, null)}>Clear</button>
						</div>
						{invalid && <p id={`stat-error-${stat.id}`} className="error-message">Enter a whole number from 0 to 99, or clear it.</p>}
					</div>
				);
			})}
		</div>
	);
}
