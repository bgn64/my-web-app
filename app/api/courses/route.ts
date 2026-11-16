import { getSession } from "../../_features/auth/session";
import { getCourses } from "../../_features/courses/data";

export async function GET(request: Request)
{
	if (!await getSession())
	{
		return Response.json({
			error: "Please sign in again.",
		}, {
			status: 401,
		});
	}

	const params = new URL(request.url).searchParams;
	const query = params.get("q") ?? "";
	const page = Number(params.get("page") ?? 1);

	if (query.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 100000)
	{
		return Response.json({
			error: "Invalid course search.",
		}, {
			status: 400,
		});
	}

	try
	{
		return Response.json(await getCourses(query, page), {
			headers: {
				"Cache-Control": "private, no-store",
			},
		});
	}
	catch (error)
	{
		console.error("Could not search courses:", error);
		return Response.json({
			error: "Could not load courses. Please retry.",
		}, {
			status: 500,
		});
	}
}
