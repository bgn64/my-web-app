export function Brand()
{
	return (
		<span className="wordmark" aria-label="Tee Time">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0M2 22h6" />
			</svg>
			<span>
				tee time<span className="brand-period">.</span>
			</span>
		</span>
	);
}
