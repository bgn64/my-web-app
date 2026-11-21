import { NextResponse } from "next/server";

export function proxy()
{
	if (process.env.APP_ENV !== "development")
	{
		return new NextResponse("Not Found", {
			status: 404,
			headers: {
				"Cache-Control": "no-store",
				"X-Robots-Tag": "noindex, nofollow",
			},
		});
	}

	return NextResponse.next();
}

export const config = {
	matcher: "/mockups/:path*",
};
