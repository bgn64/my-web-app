import { CoursePicker } from "./_components/course-picker";
import { requireUser } from "../../../_features/auth/session";
import { getCourses } from "../../../_features/courses/data";

type CoursesPageProps = {
	searchParams: Promise<{
		q?: string;
		page?: string;
	}>;
};

export default async function CoursesPage({ searchParams }: CoursesPageProps)
{
	await requireUser("/play/courses");
	const params = await searchParams;
	const query = params.q ?? "";
	const requestedPage = Number(params.page ?? 1);

	if (typeof query !== "string" || query.length > 200 || !Number.isSafeInteger(requestedPage) ||
		requestedPage < 1 || requestedPage > 100000)
	{
		return (
			<div className="page">
				<p role="alert">Invalid course search. Enter a search of at most 200 characters and a valid page number.</p>
			</div>
		);
	}

	const catalog = await getCourses(query, requestedPage);

	return (
		<div className="page">
			<div className="page-intro">
				<span className="eyebrow">START A ROUND</span>
				<h1>Where are<br /><em>you playing?</em></h1>
				<p>Find a course to get your scorecard ready.</p>
			</div>
			<CoursePicker initialCatalog={catalog} />
		</div>
	);
}
