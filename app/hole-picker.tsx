import {
	useEffect,
	useRef,
	type MouseEvent,
	type KeyboardEvent,
	type SyntheticEvent,
	type RefObject,
} from "react";
import type { RoundHole } from "./golf-types";

type HolePickerProps = {
	holes: RoundHole[];
	index: number;
	triggerRef: RefObject<HTMLButtonElement | null>;
	onChoose: (index: number) => void;
	onClose: () => void;
};

export function HolePicker({ holes, index, triggerRef, onChoose, onClose }: HolePickerProps)
{
	const dialog = useRef<HTMLDialogElement>(null);
	const currentButton = useRef<HTMLButtonElement>(null);

	useEffect(() =>
	{
		const element = dialog.current;
		const trigger = triggerRef.current;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		element?.showModal();
		currentButton.current?.focus({ preventScroll: true });
		currentButton.current?.scrollIntoView({ block: "nearest" });

		return () =>
		{
			element?.close();
			document.body.style.overflow = previousOverflow;
			trigger?.focus({ preventScroll: true });
		};
	}, [triggerRef]);

	function handleCancel(event: SyntheticEvent<HTMLDialogElement>)
	{
		event.preventDefault();
		onClose();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>)
	{
		if (event.key === "Escape")
		{
			event.preventDefault();
			event.stopPropagation();
			onClose();
		}
	}

	function handleBackdropClick(event: MouseEvent<HTMLDialogElement>)
	{
		if (event.target === event.currentTarget)
		{
			onClose();
		}
	}

	return (
		<dialog
			ref={dialog}
			id="hole-picker"
			className="dialog hole-picker"
			aria-labelledby="hole-picker-title"
			aria-describedby="hole-picker-description"
			onCancel={handleCancel}
			onKeyDown={handleKeyDown}
			onClick={handleBackdropClick}
		>
			<div className="hole-picker-panel">
				<div className="hole-picker-header">
					<div>
						<h2 id="hole-picker-title">Jump to hole</h2>
						<p id="hole-picker-description">Choose any hole. Your scores are shown below.</p>
					</div>
					<button
						type="button"
						className="picker-close"
						aria-label="Close hole picker"
						onClick={onClose}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
							<path d="m6 6 12 12M6 18 18 6" />
						</svg>
					</button>
				</div>
				<div className="hole-picker-list" role="group" aria-label="Holes">
					{holes.map((item, i) =>
					{
						const scoreLabel = item.strokes === null ? "not scored" : `score ${item.strokes}`;
						const currentLabel = i === index ? ", current hole" : "";

						return (
							<button
								key={item.hole_number}
								ref={i === index ? currentButton : undefined}
								type="button"
								className="hole-picker-option"
								aria-current={i === index ? "step" : undefined}
								aria-label={`Hole ${item.hole_number}, par ${item.par}, ${scoreLabel}${currentLabel}`}
								onClick={() => onChoose(i)}
							>
								<span className="picker-hole">
									<strong>Hole {item.hole_number}</strong>
									<span>Par {item.par}</span>
								</span>
								{i === index && <span className="picker-current">Current</span>}
								<span className="picker-score">
									<strong>{item.strokes ?? "—"}</strong>
									<span>{item.strokes === null ? "Not scored" : "Strokes"}</span>
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</dialog>
	);
}
