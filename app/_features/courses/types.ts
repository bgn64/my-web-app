export type Yardage = {
	name: string;
	yards: number;
};

export type ScorecardHole = {
	hole_number: number;
	par: number;
	handicap: number;
	yardages: Yardage[];
};

export type Course = {
	id: number;
	name: string;
	location: string;
};

export type CourseCatalogPage = {
	courses: Course[];
	total: number;
	query: string;
	page: number;
};

export type TeeRating = {
	key: string;
	gender: string | null;
	color: string | null;
	courseRating: number | null;
	slope: number | null;
	par: number | null;
	reportedYards: number | null;
};

export type PhysicalTee = {
	key: string;
	name: string;
	playable: boolean;
	totalYards: number | null;
	yardages: Record<string, number>;
	ratings: TeeRating[];
};

export type NormalizedScorecard = {
	holeCount: number;
	totalPar: number;
	holes: ScorecardHole[];
	tees: PhysicalTee[];
};

export type CourseScorecard = NormalizedScorecard & {
	id: number;
	externalId: string;
	name: string;
	location: string;
	warnings: string[];
};
