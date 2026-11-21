import Link from "next/link";
import { scoringExamples } from "./scoring-examples";

export default function MockupsPage()
{
	return (
		<main className="mockups-gallery">
			<header className="mockups-introduction">
				<span className="eyebrow">TEE TIME / DESIGN REVIEW</span>
				<h1>UI mockups</h1>
				<p>
					Static screens with sample data. Controls are visual only; scrolling, hover,
					and focus work normally. Use your browser&apos;s Back button to return here.
				</p>
			</header>
			<section aria-labelledby="scoring-heading">
				<div className="mockups-section-heading">
					<h2 id="scoring-heading">Scoring</h2>
					<span>{scoringExamples.length} visual states</span>
				</div>
				<div className="mockups-gallery-grid">
					{scoringExamples.map((example, index) => (
						<Link
							key={example.slug}
							href={`/mockups/scoring/${example.slug}`}
							prefetch={false}
							className="mockups-card"
						>
							<span className="mockups-card-number">{String(index + 1).padStart(2, "0")}</span>
							<h3>{example.title}</h3>
							<p>{example.description}</p>
							<span className="mockups-open">View mockup <span aria-hidden="true">&rarr;</span></span>
						</Link>
					))}
				</div>
			</section>
		</main>
	);
}
