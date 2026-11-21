import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoringMockup } from "../../_components/scoring-mockup";
import { MinimalScoringMockup } from "../../_components/minimal-scoring-mockup";
import { minimalStats, scoringExamples } from "../../scoring-examples";

export function generateStaticParams()
{
	return scoringExamples.map((example) => ({
		variant: example.slug,
	}));
}

export async function generateMetadata({ params }: PageProps<"/mockups/scoring/[variant]">): Promise<Metadata>
{
	const { variant } = await params;
	const example = scoringExamples.find((item) => item.slug === variant);

	if (!example)
	{
		notFound();
	}

	return {
		title: `${example.title} | Tee Time mockups`,
	};
}

export default async function ScoringMockupPage({ params }: PageProps<"/mockups/scoring/[variant]">)
{
	const { variant } = await params;
	const example = scoringExamples.find((item) => item.slug === variant);

	if (!example)
	{
		notFound();
	}

	if (example.slug === "minimal" || example.slug === "minimal-empty" ||
		example.slug === "minimal-one" || example.slug === "minimal-styled")
	{
		return (
			<MinimalScoringMockup
				stats={minimalStats[example.slug]}
				isAppStyled={example.slug === "minimal-styled"}
			/>
		);
	}

	return <ScoringMockup variant={example.slug} />;
}
