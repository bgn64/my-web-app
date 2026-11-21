"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { normalizeStatName } from "../../../../../_features/stats/contracts";
import { availableOptions, configurationOptions } from "./configuration-draft";
import type { StatConfigurationController } from "./use-stat-configuration";

type Props = {
	rowKey: string;
	name: string;
	displayName?: string;
	label: string;
	controller: StatConfigurationController;
};

export function StatSelector({ rowKey, name, displayName, label, controller }: Props)
{
	const input = useRef<HTMLInputElement>(null);
	const popup = useRef<HTMLDivElement>(null);
	const [highlighted, setHighlighted] = useState(0);
	const [isExpanded, setIsExpanded] = useState(false);
	const isActive = controller.activeRow === rowKey;
	const isOpen = isActive && isExpanded && !controller.creation && !controller.confirmation;
	const session = controller.session;
	const choices = session ? availableOptions(session, rowKey, controller.query) : [];
	const normalized = normalizeStatName(controller.query);
	const count = choices.length + (normalized ? 1 : 0);
	const listId = `stat-options-${rowKey}`;
	const hasExactName = session && configurationOptions(session)
		.some((option) => option.name.toLocaleLowerCase() === normalized?.toLocaleLowerCase());
	const createLabel = hasExactName ? `Create another “${normalized}”` : `Create “${normalized}”`;

	useEffect(() =>
	{
		if (rowKey === "add")
		{
			input.current?.focus({ preventScroll: true });
			input.current?.scrollIntoView({ block: "nearest" });
		}
	}, [rowKey]);

	useLayoutEffect(() =>
	{
		const element = popup.current;
		const field = input.current;

		if (!isOpen || !element || !field)
		{
			return;
		}

		function position()
		{
			if (!element || !field)
			{
				return;
			}

			const bounds = field.getBoundingClientRect();
			const viewport = window.visualViewport;
			const height = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
			const below = height - bounds.bottom - 12;
			const above = bounds.top - (viewport?.offsetTop ?? 0) - 12;
			const opensBelow = below >= Math.min(220, above);
			element.style.width = `${bounds.width}px`;
			element.style.left = `${bounds.left}px`;
			element.style.maxHeight = `${Math.max(44, opensBelow ? below : above)}px`;
			element.style.top = opensBelow ? `${bounds.bottom + 6}px` : "auto";
			element.style.bottom = opensBelow ? "auto" : `${window.innerHeight - bounds.top + 6}px`;
		}

		position();
		element.showPopover();
		window.addEventListener("resize", position);
		window.addEventListener("scroll", position, true);
		window.visualViewport?.addEventListener("resize", position);
		window.visualViewport?.addEventListener("scroll", position);

		return () =>
		{
			element.hidePopover();
			window.removeEventListener("resize", position);
			window.removeEventListener("scroll", position, true);
			window.visualViewport?.removeEventListener("resize", position);
			window.visualViewport?.removeEventListener("scroll", position);
		};
	}, [isOpen]);

	function open(value: string)
	{
		setHighlighted(0);
		setIsExpanded(true);
		controller.search(rowKey, value);
	}

	function choose(index: number)
	{
		if (index < choices.length)
		{
			controller.select(choices[index]);
		}
		else if (normalized)
		{
			controller.openCreation();
		}
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>)
	{
		if (event.key === "Escape" && isActive)
		{
			event.preventDefault();
			event.stopPropagation();
			controller.cancelSelector();
		}
		else if (event.key === "ArrowDown" || event.key === "ArrowUp")
		{
			event.preventDefault();

			if (!isOpen)
			{
				open(isActive ? controller.query : name);
				return;
			}

			const next = Math.max(0, Math.min(count - 1, highlighted + (event.key === "ArrowDown" ? 1 : -1)));
			setHighlighted(next);
			document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
		}
		else if (event.key === "Enter")
		{
			event.preventDefault();

			if (isOpen)
			{
				choose(highlighted);
			}
			else
			{
				open(name);
			}
		}
	}

	return (
		<div className="stat-selector-field">
			<input
				ref={input}
				id={`stat-selector-${rowKey}`}
				className="stat-selector"
				role="combobox"
				aria-label={label}
				aria-autocomplete="list"
				aria-expanded={isOpen}
				aria-controls={isOpen ? listId : undefined}
				aria-activedescendant={isOpen && count ? `${listId}-${Math.min(highlighted, count - 1)}` : undefined}
				autoComplete="off"
				placeholder="Find or create a stat"
				value={isActive ? controller.query : displayName ?? name}
				disabled={controller.pending}
				onClick={() => !isOpen && open(isActive ? controller.query : name)}
				onFocus={(event) => event.currentTarget.select()}
				onChange={(event) => open(event.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={(event) =>
				{
					setIsExpanded(false);

					if (!popup.current?.contains(event.relatedTarget) && controller.query === name)
					{
						controller.cancelSelector();
					}
				}}
			/>
			{isActive && !isOpen && controller.query !== name && (
				<span className="selector-unresolved">
					Choose a result or{" "}
					<button type="button" className="inline-button" onClick={controller.cancelSelector}>cancel this edit</button>
				</span>
			)}
			{isOpen && (
				<div ref={popup} popover="manual" className="stat-suggestions" id={listId} role="listbox"
					aria-label="Choose a stat" onPointerDown={(event) => event.preventDefault()}>
					{choices.map((option, index) => (
						<div key={option.key} id={`${listId}-${index}`} role="option"
							aria-selected={highlighted === index} onClick={() => choose(index)}>
							{option.label}
						</div>
					))}
					{normalized && (
						<div id={`${listId}-${choices.length}`} className="stat-create-option" role="option"
							aria-selected={highlighted === choices.length} onClick={() => controller.openCreation()}>
							<span aria-hidden="true">+ </span>{createLabel}
						</div>
					)}
					{!count && (
						<p role={controller.query.trim() ? "alert" : undefined}>
							{controller.query.trim()
								? "Use a name of 1–80 characters."
								: "Type a name to find or create a stat."}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
