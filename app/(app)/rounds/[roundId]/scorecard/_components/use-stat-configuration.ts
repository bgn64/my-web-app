"use client";

import { useCallback, useRef, useState } from "react";
import { saveStatsConfiguration } from "../../../../../_features/stats/actions";
import { normalizeStatName } from "../../../../../_features/stats/contracts";
import type { StatDefinition, StatKind, StatsSnapshot } from "../../../../../_features/stats/contracts";
import {
	chooseOption,
	configurationChanged,
	configurationDraft,
	configurationOptions,
	createConfiguration,
	removedAnswers,
	selectionKey,
} from "./configuration-draft";
import type { ConfigurationState, StatOption } from "./configuration-draft";

export function focusStatSelector(key: string)
{
	requestAnimationFrame(() => document.getElementById(`stat-selector-${key}`)?.focus({ preventScroll: true }));
}

export function useStatConfiguration(roundId: number, onClose: (snapshot?: StatsSnapshot) => void)
{
	const [session, setSession] = useState<ConfigurationState | null>(null);
	const [activeRow, setActiveRow] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [creation, setCreation] = useState<{ rowKey: string; name: string } | null>(null);
	const [confirmation, setConfirmation] = useState<"remove" | "discard" | null>(null);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [conflict, setConflict] = useState(false);
	const saving = useRef(false);
	const isChanged = session !== null && configurationChanged(session);
	const activeSelection = session?.rows.find((row) => row.key === activeRow)?.selection;
	const activeName = session && activeSelection
		? configurationOptions(session).find((option) => option.key === selectionKey(activeSelection))?.name ?? ""
		: "";
	const hasDraft = isChanged || (activeRow !== null && query !== activeName) || creation !== null;

	const abandon = useCallback(() =>
	{
		setSession(null);
		setActiveRow(null);
		setCreation(null);
		setConfirmation(null);
		setMessage("");
		setConflict(false);
	}, []);

	function begin(initial: StatsSnapshot, library: StatDefinition[])
	{
		abandon();
		setSession(createConfiguration(initial, library));
	}

	function search(key: string, value: string)
	{
		if (activeRow !== null && activeRow !== key && query !== activeName)
		{
			setMessage("Choose a stat or cancel the current field before editing another.");
			focusStatSelector(activeRow);
			return;
		}

		setActiveRow(key);
		setQuery(value);
		setMessage("");
	}

	function cancelSelector()
	{
		setActiveRow(null);
		setQuery("");
	}

	function select(option: StatOption)
	{
		if (!session || activeRow === null)
		{
			return;
		}

		const key = activeRow === "add" ? crypto.randomUUID() : activeRow;
		setSession(chooseOption(session, activeRow, option, key));
		cancelSelector();
		focusStatSelector(key);
	}

	function remove(key: string)
	{
		setSession((current) => current && ({
			...current,
			rows: current.rows.filter((row) => row.key !== key),
		}));
		cancelSelector();
		requestAnimationFrame(() => document.getElementById("add-round-stat")?.focus({ preventScroll: true }));
	}

	function openCreation()
	{
		if (activeRow === null)
		{
			return;
		}

		setCreation({ rowKey: activeRow, name: query });
		cancelSelector();
	}

	function cancelCreation()
	{
		if (creation)
		{
			search(creation.rowKey, creation.name);
			focusStatSelector(creation.rowKey);
		}

		setCreation(null);
	}

	function create(name: string, kind: StatKind)
	{
		const normalized = normalizeStatName(name);

		if (!session || !creation || !normalized)
		{
			setMessage("Enter a stat name of 1–80 characters.");
			return;
		}

		const definitionKey = `new:${crypto.randomUUID()}`;
		const next = {
			...session,
			library: [...session.library, { key: definitionKey, id: null, name: normalized, kind }],
		};
		const option: StatOption = {
			key: `definition:${definitionKey}`,
			name: normalized,
			label: normalized,
			kind,
			selection: { kind: "definition", definitionKey },
		};
		const key = creation.rowKey === "add" ? crypto.randomUUID() : creation.rowKey;
		setSession(chooseOption(next, creation.rowKey, option, key));
		setCreation(null);
		focusStatSelector(key);
	}

	function finish(snapshot?: StatsSnapshot)
	{
		abandon();
		onClose(snapshot);
	}

	function cancel()
	{
		if (pending)
		{
			return;
		}

		if (hasDraft)
		{
			setConfirmation("discard");
			return;
		}

		finish();
	}

	async function commit()
	{
		if (!session || saving.current || conflict)
		{
			return;
		}

		saving.current = true;
		setPending(true);
		setMessage("");

		try
		{
			const result = await saveStatsConfiguration(roundId, configurationDraft(session));

			if (result.ok)
			{
				finish(result.snapshot);
				return;
			}

			setMessage(result.error);
			setConflict(Boolean(result.conflict));
			setConfirmation(null);
		}
		catch
		{
			setMessage("The save result is uncertain. Your draft is here; reload and review before trying again.");
			setConflict(true);
			setConfirmation(null);
		}
		finally
		{
			saving.current = false;
			setPending(false);
		}
	}

	function save()
	{
		if (!session || !isChanged || activeRow !== null || creation || pending || conflict)
		{
			return;
		}

		if (removedAnswers(session).length > 0)
		{
			setConfirmation("remove");
		}
		else
		{
			void commit();
		}
	}

	return {
		session, activeRow, query, creation, confirmation, pending, message, conflict, hasDraft,
		canSave: isChanged && activeRow === null && creation === null && !pending && !conflict,
		begin, abandon, search, cancelSelector, select, remove, openCreation, cancelCreation, create, cancel, save,
		closeConfirmation: () => setConfirmation(null),
		confirm: () => confirmation === "discard" ? finish() : void commit(),
	};
}

export type StatConfigurationController = ReturnType<typeof useStatConfiguration>;
