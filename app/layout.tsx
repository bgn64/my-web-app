import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Tee Time | Your round, simply",
	description: "A simple scorecard for every round.",
	icons: {
		icon: "/tee-time-logo.svg",
		apple: "/tee-time-logo.svg",
	},
};

export default function RootLayout({ children }: LayoutProps<"/">)
{
	return (
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
			<body className="min-h-full flex flex-col">{children}</body>
		</html>
	);
}
