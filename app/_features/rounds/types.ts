import type { NormalizedScorecard, ScorecardHole } from "../courses/types";

export type RoundHole = ScorecardHole & {
	strokes: number | null;
};

export type GolfRound = {
	id: number;
	course_name: string;
	course_location: string;
	started_at: Date;
	finished_at: Date | null;
	holes: RoundHole[];
	snapshot: RoundSnapshot;
};

export type RoundSnapshot = {
	version: 1;
	course: {
		name: string;
		location: string;
	};
	scorecard: NormalizedScorecard;
};
