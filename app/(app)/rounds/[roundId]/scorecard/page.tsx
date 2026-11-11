import { notFound, redirect } from "next/navigation";
import { getRound, parseId, requireUser } from "../../../../golf-data";
import { Scorecard } from "../../../../scorecard";

export default async function ScorecardPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const id = parseId(roundId);
  if (!id) notFound();
  const user = await requireUser(`/rounds/${id}/scorecard`);
  const round = await getRound(user.id, id);
  if (!round) notFound();
  if (round.finished_at) redirect(`/rounds/${id}`);
  if (!round.holes.length) throw new Error("Round has no scorecard.");

  return <div className="page scorecard-page"><div className="scorecard-intro"><span className="eyebrow">ROUND IN PROGRESS</span><h1>{round.course_name}</h1><p>{round.course_location}</p></div><Scorecard roundId={id} initialHoles={round.holes} /></div>;
}
