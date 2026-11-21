"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { closeRound, saveScore } from "../../../../../_features/rounds/actions";
import type { RoundHole } from "../../../../../_features/rounds/types";
import { relativeScore, summarize } from "../../../../../_features/rounds/golf-summary";
import { loadStatsConfiguration, saveStatAnswer } from "../../../../../_features/stats/actions";
import { validStatDraft } from "../../../../../_features/stats/contracts";
import type { RoundStat, StatsSnapshot } from "../../../../../_features/stats/contracts";
import { RoundStatsSummary } from "../../../../../_features/stats/summary";
import { HolePicker } from "./hole-picker";
import { ScoreSaveQueue } from "./score-save-queue";
import { StatConfiguration } from "./stat-configuration";
import { StatEntry, statDraftKey } from "./stat-entry";
import { useStatConfiguration } from "./use-stat-configuration";

type ConfirmDialogProps = {
	closing: "finish" | "discard";
	pending: boolean;
	error: string;
	summary: {
		played: number;
		total: number;
	};
	onClose: () => void;
	onConfirm: () => void;
};

function ConfirmDialog({ closing, pending, error, summary, onClose, onConfirm }: ConfirmDialogProps)
{
	const dialog = useRef<HTMLDialogElement>(null);

	useEffect(() =>
	{
		const element = dialog.current;
		element?.showModal();
		return () => element?.close();
	}, []);

	function handleCancel(event: SyntheticEvent<HTMLDialogElement>)
	{
		event.preventDefault();

		if (!pending)
		{
			onClose();
		}
	}

	let confirmLabel = closing === "finish" ? "Finish round" : "Discard round";

	if (pending)
	{
		confirmLabel = "Please wait...";
	}

	const description = closing === "finish"
		? `${summary.played} of ${summary.total} holes scored. ${summary.total - summary.played} unscored holes ` +
			"will remain blank. Finished rounds cannot be edited, including scores and stats."
		: "This active round, its scores, and its stats will be permanently removed.";

	return (
		<dialog ref={dialog} className="dialog" aria-labelledby="confirm-title" onCancel={handleCancel}>
			<h2 id="confirm-title">{closing === "finish" ? "Finish this round?" : "Discard this round?"}</h2>
			<p>{description}</p>
			{error && <p className="error-message" role="alert">{error}</p>}
			<button className="button button-primary full-width" disabled={pending} onClick={onConfirm}>
				{confirmLabel}
			</button>
			<button className="button button-secondary full-width" disabled={pending} onClick={onClose}>
				Keep playing
			</button>
		</dialog>
	);
}

type ScoreProgressProps = {
	summary: ReturnType<typeof summarize>;
};

function ScoreProgress({ summary }: ScoreProgressProps)
{
	return (
		<>
			<div className="score-progress">
				<div>
					<span className="eyebrow">YOUR PROGRESS</span>
					<strong>
						{summary.played}{" "}
						<span>/ {summary.total} holes scored</span>
					</strong>
				</div>
				<div className="score-progress-total">
					<span className="eyebrow">TO PAR</span>
					<strong>{summary.played ? relativeScore(summary.relative) : "—"}</strong>
				</div>
			</div>
			<div className="progress-track">
				<div style={{
					width: `${summary.played / summary.total * 100}%`,
				}} />
			</div>
		</>
	);
}

/** Warn before browser navigation while the score queue still has unsaved work. */
function useUnsavedScoreWarning(saveQueue: ScoreSaveQueue, hasDraft: boolean, onAbandon: () => void)
{
	useEffect(() =>
	{
		let restoringHistory = false;
		let traversalApproved = false;

		function beforeUnload(event: BeforeUnloadEvent)
		{
			if (saveQueue.getSnapshot().hasUnsavedChanges || hasDraft)
			{
				event.preventDefault();
			}
		}

		function warnBeforeNavigation(event: MouseEvent)
		{
			if (!saveQueue.getSnapshot().hasUnsavedChanges && !hasDraft)
			{
				return;
			}

			if (!(event.target instanceof Element) || !event.target.closest("a[href]"))
			{
				return;
			}

			if (!window.confirm("Your scores, stats, or configuration have unsaved changes. Leave this page?"))
			{
				event.preventDefault();
			}
			else
			{
				onAbandon();
			}
		}

		function warnBeforeHistoryNavigation(event: PopStateEvent)
		{
			if (traversalApproved)
			{
				traversalApproved = false;
				return;
			}
			if (restoringHistory)
			{
				restoringHistory = false;
				event.stopImmediatePropagation();
				return;
			}

			if (!hasDraft && !saveQueue.getSnapshot().hasUnsavedChanges)
			{
				return;
			}

			if (!window.confirm("Your scores, stats, or configuration have unsaved changes. Leave this page?"))
			{
				event.stopImmediatePropagation();
				restoringHistory = true;
				window.history.forward();
			}
			else
			{
				onAbandon();
			}
		}

		function warnBeforeTraversal(event: Event)
		{
			if (!("navigationType" in event) || event.navigationType !== "traverse" ||
				!event.cancelable || (!hasDraft && !saveQueue.getSnapshot().hasUnsavedChanges))
			{
				return;
			}

			if (!window.confirm("Your scores, stats, or configuration have unsaved changes. Leave this page?"))
			{
				event.preventDefault();
			}
			else
			{
				traversalApproved = true;
				onAbandon();
			}
		}

		const navigation = "navigation" in window && window.navigation instanceof EventTarget
			? window.navigation : null;
		window.addEventListener("beforeunload", beforeUnload);
		window.addEventListener("popstate", warnBeforeHistoryNavigation, true);
		navigation?.addEventListener("navigate", warnBeforeTraversal, true);
		document.addEventListener("click", warnBeforeNavigation, true);

		return () =>
		{
			window.removeEventListener("beforeunload", beforeUnload);
			window.removeEventListener("popstate", warnBeforeHistoryNavigation, true);
			navigation?.removeEventListener("navigate", warnBeforeTraversal, true);
			document.removeEventListener("click", warnBeforeNavigation, true);
		};
	}, [saveQueue, hasDraft, onAbandon]);
}

type ScorecardProps = {
	roundId: number;
	courseName: string;
	initialHoles: RoundHole[];
	initialStats: StatsSnapshot;
};

export function Scorecard({ roundId, courseName, initialHoles, initialStats }: ScorecardProps)
{
	const [holes, setHoles] = useState(initialHoles);
	const latestHoles = useRef(initialHoles);
	const [index, setIndex] = useState(0);
	const [pickerOpen, setPickerOpen] = useState(false);
	const pickerTrigger = useRef<HTMLButtonElement>(null);
	const [stats, setStats] = useState(initialStats);
	const latestStats = useRef(initialStats);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const configureTrigger = useRef<HTMLButtonElement>(null);
	const roundMenu = useRef<HTMLDetailsElement>(null);
	const [statsView, setStatsView] = useState<"hole" | "totals">("hole");
	const statsScroll = useRef<HTMLDivElement>(null);
	const scrollOffsets = useRef({ hole: 0, totals: 0, configuration: 0 });
	const [configurationLoading, setConfigurationLoading] = useState(false);
	const configurationTransition = useRef(false);
	const [configurationError, setConfigurationError] = useState("");
	const [saveQueue] = useState(() => new ScoreSaveQueue(
		(hole, strokes) => saveScore(roundId, hole, strokes),
		(stat) => saveStatAnswer(roundId, stat.statId, stat.hole, stat.kind, stat.value, stat.revision),
	));
	const { error: saveError } = useSyncExternalStore(
		saveQueue.subscribe, saveQueue.getSnapshot, saveQueue.getSnapshot,
	);
	const [closing, setClosing] = useState<"finish" | "discard" | null>(null);
	const [pending, setPending] = useState(false);
	const [closeError, setCloseError] = useState("");
	const closingInFlight = useRef(false);
	const router = useRouter();
	const hole = holes[index];
	const summary = summarize(holes);
	const hasInvalidDraft = Object.values(drafts).some((text) => !validStatDraft(text));
	const configuration = useStatConfiguration(roundId, closeConfiguration);
	const abandonConfiguration = configuration.abandon;
	const isEditing = configuration.session !== null;
	const isLocked = pending || configurationLoading || isEditing;
	const scrollMode = isEditing ? "configuration" : statsView;

	useLayoutEffect(() =>
	{
		if (statsScroll.current)
		{
			statsScroll.current.scrollTop = scrollOffsets.current[scrollMode];
		}
	}, [scrollMode]);

	useEffect(() =>
	{
		const menu = roundMenu.current;

		if (isLocked && menu)
		{
			menu.open = false;
		}

		function closeOutside(event: PointerEvent)
		{
			if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
			{
				menu.open = false;
			}
		}

		function closeOnEscape(event: KeyboardEvent)
		{
			if (event.key === "Escape" && menu?.open)
			{
				menu.open = false;
				menu.querySelector("summary")?.focus({ preventScroll: true });
			}
		}

		document.addEventListener("pointerdown", closeOutside);
		document.addEventListener("keydown", closeOnEscape);

		return () =>
		{
			document.removeEventListener("pointerdown", closeOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [isLocked]);

	const abandonDraft = useCallback(() =>
	{
		abandonConfiguration();
		configurationTransition.current = false;
		setDrafts({});
	}, [abandonConfiguration]);
	useUnsavedScoreWarning(saveQueue, hasInvalidDraft || configuration.hasDraft, abandonDraft);

	function saveStat(stat: RoundStat, value: number | boolean | null, clearDraft = true)
	{
		if (closingInFlight.current || configurationTransition.current)
		{
			return;
		}
		const holeNumber = latestHoles.current[index].hole_number;
		if (clearDraft)
		{
			setDrafts((current) =>
			{
				const next = { ...current };
				delete next[statDraftKey(stat.id, holeNumber)];
				return next;
			});
		}
		const previous = latestStats.current.stats.find((item) => item.id === stat.id);
		const oldValue = previous?.values.find((entry) => entry.hole === holeNumber)?.value ?? null;
		if (!previous || oldValue === value)
		{
			return;
		}
		const updated = {
			...latestStats.current,
			stats: latestStats.current.stats.map((item) => item.id !== stat.id ? item : {
				...item,
				values: [
					...item.values.filter((entry) => entry.hole !== holeNumber),
					...(value === null ? [] : [{ hole: holeNumber, value }]),
				],
			}),
		};
		latestStats.current = updated;
		setStats(updated);
		if (stat.kind === "number" && (typeof value === "number" || value === null))
		{
			saveQueue.enqueueStat({ statId: stat.id, hole: holeNumber, kind: "number", value, revision: updated.revision });
		}
		else if (stat.kind === "boolean" && (typeof value === "boolean" || value === null))
		{
			saveQueue.enqueueStat({ statId: stat.id, hole: holeNumber, kind: "boolean", value, revision: updated.revision });
		}
	}

	function handleStatDraft(stat: RoundStat, text: string)
	{
		if (configurationTransition.current || closingInFlight.current)
		{
			return;
		}
		const key = statDraftKey(stat.id, hole.hole_number);
		setDrafts((current) => ({ ...current, [key]: text }));
		if (validStatDraft(text))
		{
			saveStat(stat, text === "" ? null : Number(text), false);
		}
	}

	async function configure()
	{
		if (hasInvalidDraft || configurationTransition.current || closingInFlight.current)
		{
			return;
		}
		configurationTransition.current = true;
		setConfigurationLoading(true);
		setConfigurationError("");
		let entered = false;
		try
		{
			if (!await saveQueue.flush())
			{
				setConfigurationError("Some changes are unsaved. Retry saving before configuring.");
				return;
			}
			const result = await loadStatsConfiguration(roundId);
			if (!result.ok)
			{
				setConfigurationError(result.error);
				return;
			}
			if (result.snapshot.revision !== latestStats.current.revision)
			{
				setConfigurationError("Configuration changed elsewhere. Reload the page to review.");
				return;
			}
			latestStats.current = result.snapshot;
			setStats(result.snapshot);
			setDrafts({});
			scrollOffsets.current.configuration = 0;
			configuration.begin(result.snapshot, result.library);
			entered = true;
		}
		catch
		{
			setConfigurationError("Could not load configuration. Check your connection and retry.");
		}
		finally
		{
			if (!entered)
			{
				configurationTransition.current = false;
			}

			setConfigurationLoading(false);
		}
	}

	function reloadForReview()
	{
		if (window.confirm("Reloading discards this local draft or unsaved edits. Continue?"))
		{
			window.location.reload();
		}
	}

	function closeConfiguration(snapshot?: StatsSnapshot)
	{
		if (snapshot)
		{
			latestStats.current = snapshot;
			setStats(snapshot);
		}
		configurationTransition.current = false;
		requestAnimationFrame(() => configureTrigger.current?.focus());
	}

	function save(update: (current: RoundHole) => number | null)
	{
		if (closingInFlight.current || configurationTransition.current)
		{
			return;
		}

		const current = latestHoles.current[index];
		const strokes = update(current);

		if (strokes === current.strokes)
		{
			return;
		}

		const updated = latestHoles.current.map((item, i) => i === index ? {
			...item,
			strokes,
		} : item);
		latestHoles.current = updated;
		setHoles(updated);
		saveQueue.enqueue(current.hole_number, strokes);
	}

	async function handleClose()
	{
		if (!closing || closingInFlight.current || configurationTransition.current || (closing === "finish" && hasInvalidDraft))
		{
			return;
		}

		closingInFlight.current = true;
		setPending(true);
		setCloseError("");
		let closed = false;

		try
		{
			if (closing === "finish" && !await saveQueue.flush())
			{
				setCloseError("Some scores or stats could not be saved. Choose Keep playing, then Retry before finishing.");
				return;
			}

			if (closing === "discard")
			{
				await saveQueue.pause();
			}

			const result = await closeRound(roundId, closing);

			if (!result.ok)
			{
				setCloseError(result.error);
			}
			else
			{
				if (closing === "discard")
				{
					saveQueue.discardPending();
				}

				router.push(closing === "finish" ? `/rounds/${roundId}` : "/play");
				router.refresh();
				closed = true;
			}
		}
		catch (error)
		{
			console.error("Could not close round:", error);
			setCloseError("Could not reach the server. Please check the round before retrying.");
		}
		finally
		{
			if (!closed)
			{
				if (closing === "discard")
				{
					saveQueue.resume();
				}

				closingInFlight.current = false;
				setPending(false);
			}
		}
	}

	function handleChooseHole(next: number)
	{
		if (isLocked || hasInvalidDraft || next < 0 || next >= holes.length)
		{
			return;
		}

		setIndex(next);
		setPickerOpen(false);
	}

	function handleDismissConfirm()
	{
		setClosing(null);
		setCloseError("");
	}

	return (
		<div className="scorecard-frame">
			<header className="scoring-header">
				<div className="scoring-leading-action">
					{isEditing ? (
						<button type="button" className="scoring-header-action" disabled={configuration.pending}
							onClick={configuration.cancel}>Cancel</button>
					) : (
						<Link href="/play" className="back-button" aria-label="Back to Play">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
								<path d="M19 12H5m7-7-7 7 7 7" />
							</svg>
						</Link>
					)}
				</div>
				<div className="scoring-course" title={courseName}>{courseName}</div>
				<div className="scoring-header-actions">
					{isEditing ? (
						<button type="button" className="scoring-header-action scoring-save"
							disabled={!configuration.canSave} onClick={configuration.save}>
							{configuration.pending ? "Saving…" : "Save"}
						</button>
					) : (
						<button ref={configureTrigger} type="button" className="scoring-header-action"
							aria-label="Edit stats" disabled={isLocked || hasInvalidDraft} onClick={configure}>
							{configurationLoading ? "…" : "Edit"}
						</button>
					)}
					<details ref={roundMenu} className="scoring-round-menu" onClick={(event) =>
					{
						if (event.target instanceof Element && event.target.closest("button"))
						{
							event.currentTarget.open = false;
							event.currentTarget.querySelector("summary")?.focus({ preventScroll: true });
						}
					}}>
						<summary aria-label="Round actions" aria-disabled={isLocked} tabIndex={isLocked ? -1 : 0}
							onClick={(event) => isLocked && event.preventDefault()}>⋯</summary>
						<div className="scoring-menu-content">
							<button type="button" disabled={isLocked || hole.strokes === null}
								onClick={() => save(() => null)}>Clear this hole&apos;s score</button>
							<button type="button" disabled={isLocked || hasInvalidDraft}
								onClick={() => !configurationTransition.current && setClosing("finish")}>Finish round</button>
							<button type="button" className="destructive-action" disabled={isLocked}
								onClick={() => !configurationTransition.current && setClosing("discard")}>Discard round</button>
						</div>
					</details>
				</div>
			</header>
			<div className="scoring-progress-block">
				<ScoreProgress summary={summary} />
			</div>
			<section className="scoring-panel" aria-label={`Hole ${hole.hole_number} scoring`}>
				<div className="scoring-hole-context">
					<div className="scoring-hole-heading">
						<h1 aria-live="polite" aria-atomic="true">Hole {hole.hole_number}</h1>
						<span>Par <strong>{hole.par}</strong></span>
						<span>Hcp <strong>{hole.handicap}</strong></span>
					</div>
					<div className="scoring-tee-matrix">
						{holes.map((item, holeIndex) => (
							<div key={item.hole_number} className="scoring-tee-grid" aria-hidden={holeIndex !== index}
								style={{ visibility: holeIndex === index ? "visible" : "hidden" }}>
								{item.yardages.map((tee, teeIndex) => (
									<span key={`${teeIndex}:${tee.name}`}>
										<span>{tee.name}</span> <strong>{tee.yards}</strong> <span>yd</span>
									</span>
								))}
							</div>
						))}
					</div>
				</div>
				<div className="score-entry">
					<span className="eyebrow">YOUR SCORE</span>
					<div className="stepper">
						<button
							type="button"
							aria-label="Decrease score"
							disabled={isLocked || hole.strokes === null || hole.strokes <= 1}
							onClick={() => save((current) => current.strokes === null ? null : Math.max(1, current.strokes - 1))}
						>−</button>
						<div
							className="score-value"
							aria-live="polite"
							aria-atomic="true"
							aria-label={hole.strokes === null ? "No score entered" : `Score ${hole.strokes}`}
						>{hole.strokes ?? "—"}</div>
						<button
							type="button"
							aria-label="Increase score"
							disabled={isLocked || hole.strokes === 99}
							onClick={() => save((current) => current.strokes === null ? current.par : Math.min(99, current.strokes + 1))}
						>+</button>
					</div>
					<div className="quick-scores" role="group" aria-label="Quick scores">
						{[-1, 0, 1, 2].map((offset) =>
						{
							const score = hole.par + offset;
							return (
								<button
									key={offset}
									type="button"
									disabled={isLocked}
									aria-label={`${score} strokes`}
									aria-pressed={hole.strokes === score}
									onClick={() => save(() => score)}
								>{score}</button>
							);
						})}
					</div>
				</div>
			</section>
			<section className="stats-workspace" aria-label="Round statistics">
				<div className="stats-workspace-heading">
					<h2>{isEditing ? "Edit stats" : "Stats"}</h2>
					<div className="stats-view-switch" role="group" aria-label="Stats view">
						<button type="button" aria-pressed={statsView === "hole" || isEditing}
							disabled={isLocked} onClick={() => !isLocked && setStatsView("hole")}>This hole</button>
						<button type="button" aria-pressed={statsView === "totals" && !isEditing}
							disabled={isLocked || hasInvalidDraft}
							onClick={() => !isLocked && !hasInvalidDraft && setStatsView("totals")}>Totals</button>
					</div>
				</div>
				<div ref={statsScroll} className="stats-workspace-scroll" tabIndex={0}
					aria-label={isEditing ? "Stat configuration" : statsView === "hole" ? "Hole stat entries" : "Round stat totals"}
					onScroll={(event) => { scrollOffsets.current[scrollMode] = event.currentTarget.scrollTop; }}>
					{saveError && (
						<div className="workspace-error" role="alert">
							<p>{saveError}</p>
							<button className="inline-button" disabled={pending} onClick={() => saveQueue.retry()}>Retry</button>
							<button className="inline-button" disabled={pending} onClick={reloadForReview}>Reload and review</button>
						</div>
					)}
					{configurationError && (
						<div className="workspace-error" role="alert">
							<p>{configurationError}</p>
							<button type="button" className="inline-button" onClick={configure}>Retry</button>
							<button type="button" className="inline-button" onClick={reloadForReview}>Reload</button>
						</div>
					)}
					{isEditing ? (
						<StatConfiguration controller={configuration} onReload={reloadForReview} />
					) : stats.stats.length === 0 ? (
						<p className="stats-empty">Use Edit to choose the stats you want to track.</p>
					) : statsView === "totals" ? (
						<RoundStatsSummary stats={stats.stats} holeCount={holes.length} />
					) : (
						<StatEntry stats={stats.stats} hole={hole.hole_number} drafts={drafts}
							disabled={isLocked} onDraft={handleStatDraft} onSave={saveStat} />
					)}
					{hasInvalidDraft && <p className="error-message" role="alert">
						Correct or clear the invalid stat before changing holes, configuring, or finishing.
					</p>}
				</div>
			</section>
			<footer className="scoring-footer">
				<div className="hole-navigator" role="group" aria-label="Hole navigation">
					<button
						type="button"
						className="hole-previous"
						aria-label="Previous hole"
						disabled={index === 0 || isLocked || hasInvalidDraft}
						onClick={() => handleChooseHole(index - 1)}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
							<path d="m14 5-7 7 7 7" />
						</svg>
					</button>
					<button
						ref={pickerTrigger}
						type="button"
						className="hole-picker-trigger"
						aria-label={`Hole ${hole.hole_number} of ${holes.length}, jump to hole`}
						aria-haspopup="dialog"
						aria-expanded={pickerOpen}
						aria-controls={pickerOpen ? "hole-picker" : undefined}
						disabled={isLocked || hasInvalidDraft}
						onClick={() => !isLocked && !hasInvalidDraft && setPickerOpen(true)}
					>
						<span>
							Hole {hole.hole_number}{" "}
							<span className="hole-count">of {holes.length}</span>
						</span>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					<button
						type="button"
						className="hole-next"
						aria-label="Next hole"
						disabled={index === holes.length - 1 || isLocked || hasInvalidDraft}
						onClick={() => handleChooseHole(index + 1)}
					>
						Next{" "}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
							<path d="M4 12h16m-6-6 6 6-6 6" />
						</svg>
					</button>
				</div>
			</footer>
			{pickerOpen && (
				<HolePicker
					holes={holes}
					index={index}
					triggerRef={pickerTrigger}
					onChoose={handleChooseHole}
					onClose={() => setPickerOpen(false)}
				/>
			)}
			{closing && (
				<ConfirmDialog
					closing={closing}
					pending={pending}
					error={closeError}
					summary={summary}
					onClose={handleDismissConfirm}
					onConfirm={handleClose}
				/>
			)}
		</div>
	);
}
