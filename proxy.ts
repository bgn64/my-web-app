import { NextResponse } from "next/server";

export function proxy()
{
	if (process.env.APP_ENV !== "development")
	{
		return new NextResponse(null, { status: 404 });
	}

	return NextResponse.next();
}

export const config = {
	matcher: "/mockups/:path*",
};
