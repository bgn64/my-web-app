"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty-state"><h2>Something went wrong</h2><p>We couldn&apos;t load this page. Please try again.</p><button className="button button-primary" onClick={reset}>Try again</button></div>;
}
