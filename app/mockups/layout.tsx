import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./scoring-frame.css";
import "./mockups.css";
import "./minimal-scoring.css";

export const metadata: Metadata = {
	title: "UI mockups | Tee Time",
	robots: {
		index: false,
		follow: false,
	},
};

export default function MockupsLayout({ children }: { children: ReactNode })
{
	return <div className="mockups-root">{children}</div>;
}
