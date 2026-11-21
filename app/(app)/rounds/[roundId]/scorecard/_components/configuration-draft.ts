import type {
	ConfigDraft,
	LibraryDraft,
	StatDefinition,
	StatKind,
	StatSelection,
	StatsSnapshot,
} from "../../../../../_features/stats/contracts";

export type ConfigurationRow = {
	key: string;
	selection: StatSelection;
};

export type ConfigurationState = {
	initial: StatsSnapshot;
	baseline: StatDefinition[];
	library: LibraryDraft[];
	rows: ConfigurationRow[];
};

export type StatOption = {
	key: string;
	name: string;
	label: string;
	kind: StatKind;
	selection: StatSelection;
};

export function selectionKey(selection: StatSelection)
{
	return selection.kind === "round"
		? `round:${selection.roundStatId}`
		: `definition:${selection.definitionKey}`;
}

export function createConfiguration(initial: StatsSnapshot, library: StatDefinition[]): ConfigurationState
{
	return {
		initial,
		baseline: library,
		library: library.map((item) => ({
			...item,
			key: `existing:${item.id}`,
		})),
		rows: initial.stats.map((stat) => ({
			key: `round:${stat.id}`,
			selection: {
				kind: "round",
				roundStatId: stat.id,
			},
		})),
	};
}

export function configurationOptions(state: ConfigurationState): StatOption[]
{
	const roundOptions: StatOption[] = state.initial.stats.map((stat) => ({
		key: `round:${stat.id}`,
		name: stat.name,
		label: stat.name,
		kind: stat.kind,
		selection: {
			kind: "round",
			roundStatId: stat.id,
		},
	}));
	const sources = new Set(state.initial.stats.map((stat) => stat.source_definition_id));
	const savedOptions: StatOption[] = state.library.filter((item) => item.id === null || !sources.has(item.id))
		.map((item) => ({
			key: `definition:${item.key}`,
			name: item.name,
			label: item.name,
			kind: item.kind,
			selection: {
				kind: "definition",
				definitionKey: item.key,
			},
		}));
	const options = [...roundOptions, ...savedOptions];
	const totals = new Map<string, number>();
	const ordinals = new Map<string, number>();

	for (const option of options)
	{
		totals.set(option.name, (totals.get(option.name) ?? 0) + 1);
	}

	return options.map((option) =>
	{
		const ordinal = (ordinals.get(option.name) ?? 0) + 1;
		ordinals.set(option.name, ordinal);
		const label = (totals.get(option.name) ?? 0) > 1
			? `${option.name} (${ordinal})`
			: option.name;

		return { ...option, label };
	});
}

export function availableOptions(state: ConfigurationState, rowKey: string, query: string)
{
	const used = new Set(state.rows.filter((row) => row.key !== rowKey).map((row) => selectionKey(row.selection)));
	const search = query.trim().toLocaleLowerCase();

	return configurationOptions(state).filter((option) =>
		!used.has(option.key) && option.name.toLocaleLowerCase().includes(search));
}

export function chooseOption(state: ConfigurationState, rowKey: string, option: StatOption, newRowKey: string)
{
	const row = { key: newRowKey, selection: option.selection };

	return {
		...state,
		rows: rowKey === "add"
			? [...state.rows, row]
			: state.rows.map((item) => item.key === rowKey ? { ...item, selection: option.selection } : item),
	};
}

export function configurationDraft(state: ConfigurationState): ConfigDraft
{
	const order = state.rows.map((row) => row.selection);

	return {
		revision: state.initial.revision,
		baseline: state.baseline,
		library: state.library,
		deleted: [],
		retained: order.flatMap((item) => item.kind === "round" ? [item.roundStatId] : []),
		added: order.flatMap((item) => item.kind === "definition" ? [item.definitionKey] : []),
		order,
		removalCounts: Object.fromEntries(state.initial.stats.map((stat) => [stat.id, stat.values.length])),
	};
}

export function configurationChanged(state: ConfigurationState)
{
	return state.library.length !== state.baseline.length ||
		state.rows.length !== state.initial.stats.length ||
		state.rows.some((row, index) => selectionKey(row.selection) !== `round:${state.initial.stats[index]?.id}`);
}

export function removedAnswers(state: ConfigurationState)
{
	const retained = configurationDraft(state).retained;
	return state.initial.stats.filter((stat) => !retained.includes(stat.id) && stat.values.length > 0);
}
