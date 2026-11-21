export type MockupStat = {
	id: number;
	name: string;
	kind: "number" | "boolean";
	values: {
		hole: number;
		value: number | boolean;
	}[];
};

export const scoringExamples = [
	{
		slug: "minimal-styled",
		title: "Minimal scoring / app styling",
		description: "The centered minimal layout with Tee Time's rounded controls and navy-and-mint styling.",
	},
	{
		slug: "minimal",
		title: "Minimal scoring",
		description: "A quieter alternative: a prominent score and compact, content-sized stat rows.",
	},
	{
		slug: "minimal-empty",
		title: "Minimal scoring / no stats",
		description: "Scoring without a reserved stats panel; just a quiet option to start tracking.",
	},
	{
		slug: "minimal-one",
		title: "Minimal scoring / one stat",
		description: "A single compact row rather than a mostly empty scrolling panel.",
	},
	{
		slug: "recording",
		title: "Recording",
		description: "The scoring workspace with recorded, No, and unanswered stat values.",
	},
	{
		slug: "editing",
		title: "Editing stats",
		description: "Inline selection, blank answer previews, removal controls, and Add stat.",
	},
	{
		slug: "search",
		title: "Finding a stat",
		description: "An open selector with matching names and a create-from-query option.",
	},
	{
		slug: "create-dialog",
		title: "Creating a stat",
		description: "A prepopulated creation dialog over the complete configuration screen.",
	},
	{
		slug: "totals",
		title: "Running totals",
		description: "Numeric sums and Yes/answered counts inside the same scoring frame.",
	},
	{
		slug: "empty",
		title: "No tracked stats",
		description: "The scoring workspace before any stats have been selected.",
	},
	{
		slug: "many",
		title: "Many stats and long names",
		description: "Fifty stat rows, including a long label, in the bounded scrolling region.",
	},
] as const;

export type ScoringExample = typeof scoringExamples[number]["slug"];
export type MinimalScoringExample = Extract<ScoringExample, "minimal" | "minimal-empty" | "minimal-one" | "minimal-styled">;

export const sampleStats: MockupStat[] = [
	{
		id: 1,
		name: "Putts",
		kind: "number",
		values: [
			{ hole: 1, value: 2 },
			{ hole: 2, value: 2 },
			{ hole: 3, value: 1 },
			{ hole: 4, value: 2 },
		],
	},
	{
		id: 2,
		name: "Green in regulation",
		kind: "boolean",
		values: [
			{ hole: 1, value: true },
			{ hole: 2, value: false },
			{ hole: 3, value: true },
			{ hole: 4, value: false },
		],
	},
	{
		id: 3,
		name: "Penalty strokes",
		kind: "number",
		values: [
			{ hole: 1, value: 0 },
			{ hole: 2, value: 1 },
			{ hole: 3, value: 0 },
		],
	},
];

export const sampleTotals = [
	{ name: "Putts", value: "7", coverage: "4 of 18 holes recorded · Total" },
	{ name: "Green in regulation", value: "2 / 4", coverage: "4 of 18 holes recorded · Yes / Answered" },
	{ name: "Penalty strokes", value: "1", coverage: "3 of 18 holes recorded · Total" },
];

export const minimalStats: Record<MinimalScoringExample, MockupStat[]> = {
	"minimal-styled": sampleStats,
	minimal: sampleStats,
	"minimal-empty": [],
	"minimal-one": sampleStats.slice(0, 1),
};

export const manyStats: MockupStat[] = [
	sampleStats[0],
	{
		...sampleStats[1],
		name: "Followed my complete pre-shot routine without rushing when the group was waiting",
	},
	sampleStats[2],
	...Array.from({ length: 47 }, (_, index): MockupStat => ({
		id: index + 4,
		name: `Practice stat ${index + 4}`,
		kind: index % 3 === 0 ? "boolean" : "number",
		values: [],
	})),
];
