"use client";

type AppErrorProps = {
	error: Error & {
		digest?: string;
	};
	reset: () => void;
};

export default function AppError({ reset }: AppErrorProps)
{
	return (
		<div className="empty-state">
			<h2>Something went wrong</h2>
			<p>We couldn&apos;t load this page. Please try again.</p>
			<button className="button button-primary" onClick={reset}>Try again</button>
		</div>
	);
}
