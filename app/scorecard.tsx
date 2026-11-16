"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { closeRound, saveScore } from "./golf-actions";
import type { RoundHole } from "./golf-types";
import { relativeScore, summarize } from "./golf-summary";
import { HolePicker } from "./hole-picker";
import { ScoreSaveQueue } from "./score-save-queue";

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
			"will remain blank. Finished rounds cannot be edited."
		: "This active round and its scores will be permanently removed.";

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
function useUnsavedScoreWarning(saveQueue: ScoreSaveQueue)
{
	useEffect(() =>
	{
		function beforeUnload(event: BeforeUnloadEvent)
		{
			if (saveQueue.getSnapshot().hasUnsavedChanges)
			{
				event.preventDefault();
			}
		}

		function warnBeforeNavigation(event: MouseEvent)
		{
			if (!saveQueue.getSnapshot().hasUnsavedChanges)
			{
				return;
			}

			if (!(event.target instanceof Element) || !event.target.closest("a[href]"))
			{
				return;
			}

			if (!window.confirm("Your scores have not been saved yet. Leave this page?"))
			{
				event.preventDefault();
			}
		}

		window.addEventListener("beforeunload", beforeUnload);
		document.addEventListener("click", warnBeforeNavigation, true);

		return () =>
		{
			window.removeEventListener("beforeunload", beforeUnload);
			document.removeEventListener("click", warnBeforeNavigation, true);
		};
	}, [saveQueue]);
}

type ScorecardProps = {
	roundId: number;
	initialHoles: RoundHole[];
};

export function Scorecard({ roundId, initialHoles }: ScorecardProps)
{
	const [holes, setHoles] = useState(initialHoles);
	const latestHoles = useRef(initialHoles);
	const [index, setIndex] = useState(0);
	const [pickerOpen, setPickerOpen] = useState(false);
	const pickerTrigger = useRef<HTMLButtonElement>(null);
	const [saveQueue] = useState(() => new ScoreSaveQueue((hole, strokes) => saveScore(roundId, hole, strokes)));
	const { error: saveError } = useSyncExternalStore(saveQueue.subscribe, saveQueue.getSnapshot, saveQueue.getSnapshot);
	const [closing, setClosing] = useState<"finish" | "discard" | null>(null);
	const [pending, setPending] = useState(false);
	const [closeError, setCloseError] = useState("");
	const closingInFlight = useRef(false);
	const router = useRouter();
	const hole = holes[index];
	const summary = summarize(holes);

	useUnsavedScoreWarning(saveQueue);

	function save(update: (current: RoundHole) => number | null)
	{
		if (closingInFlight.current)
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
		if (!closing || closingInFlight.current)
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
				setCloseError("Some scores could not be saved. Choose Keep playing, then Retry before finishing.");
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
		setIndex(next);
		setPickerOpen(false);
	}

	function handleDismissConfirm()
	{
		setClosing(null);
		setCloseError("");
	}

	return (
		<>
			<ScoreProgress summary={summary} />
			{saveError && (
				<p className="save-status error-message" role="alert">
					{saveError}{" "}
					<button className="inline-button" disabled={pending} onClick={() => saveQueue.retry()}>
						Retry
					</button>
				</p>
			)}

			<div className="hole-card">
				<div className="hole-card-header">
					<div>
						<span className="eyebrow">NOW PLAYING</span>
						<h2 aria-live="polite" aria-atomic="true">Hole {hole.hole_number}</h2>
					</div>
					<div className="par-badge">PAR {hole.par}</div>
				</div>
				<div className="hole-meta">
					<span>
						Handicap{" "}
						<strong>{hole.handicap}</strong>
					</span>
					<span>Yardage by tee</span>
				</div>
				<div className="tee-row">
					{hole.yardages.map((tee) => (
						<div key={tee.name}>
							<span>{tee.name}</span>
							<strong>
								{tee.yards}{" "}
								<small>yds</small>
							</strong>
						</div>
					))}
				</div>
				<div className="score-entry">
					<span className="eyebrow">YOUR SCORE</span>
					<div className="stepper">
						<button
							type="button"
							aria-label="Decrease score"
							disabled={pending || hole.strokes === null || hole.strokes <= 1}
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
							disabled={pending || hole.strokes === 99}
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
									disabled={pending}
									aria-label={`${score} strokes`}
									aria-pressed={hole.strokes === score}
									onClick={() => save(() => score)}
								>{score}</button>
							);
						})}
					</div>
					{hole.strokes !== null && (
						<button type="button" className="inline-button" disabled={pending} onClick={() => save(() => null)}>
							Clear score
						</button>
					)}
				</div>
				<div className="hole-navigator" role="group" aria-label="Hole navigation">
					<button
						type="button"
						className="hole-previous"
						aria-label="Previous hole"
						disabled={index === 0 || pending}
						onClick={() => setIndex(index - 1)}
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
						disabled={pending}
						onClick={() => setPickerOpen(true)}
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
						disabled={index === holes.length - 1 || pending}
						onClick={() => setIndex(index + 1)}
					>
						Next{" "}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
							<path d="M4 12h16m-6-6 6 6-6 6" />
						</svg>
					</button>
				</div>
			</div>
			{pickerOpen && (
				<HolePicker
					holes={holes}
					index={index}
					triggerRef={pickerTrigger}
					onChoose={handleChooseHole}
					onClose={() => setPickerOpen(false)}
				/>
			)}
			<button
				className="button button-primary full-width finish-button"
				disabled={pending}
				onClick={() => setClosing("finish")}
			>
				Finish round
			</button>
			<button
				className="text-button full-width discard-button"
				disabled={pending}
				onClick={() => setClosing("discard")}
			>
				Discard round
			</button>
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
		</>
	);
}
