import { notFound, redirect } from "next/navigation";
import { getRound, parseId, requireUser } from "../../../golf-data";
import { relativeScore, summarize } from "../../../golf-summary";

export default async function RoundDetailPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const id = parseId(roundId);
  if (!id) notFound();
  const user = await requireUser(`/rounds/${id}`);
  const round = await getRound(user.id, id);
  if (!round) notFound();
  if (!round.finished_at) redirect(`/rounds/${id}/scorecard`);
  const summary = summarize(round.holes);
  return (
    <div className="page">
      <div className="page-intro"><span className="eyebrow">COMPLETED ROUND</span><h1>{round.course_name}</h1><p>{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(round.finished_at))} · {round.course_location}</p></div>
      <div className="summary-card"><div><span>STROKES</span><strong>{summary.played ? summary.strokes : "—"}</strong></div><div><span>TO PAR</span><strong>{summary.played ? relativeScore(summary.relative) : "—"}</strong></div><div><span>HOLES SCORED</span><strong>{summary.played}<small> / {summary.total}</small></strong></div></div>
      {summary.played < summary.total && <p className="partial-note">Partial round · Totals include scored holes only.</p>}
      <div className="section-heading"><span>YOUR SCORECARD</span><span>READ ONLY</span></div>
      <div className="history-holes">{round.holes.map((hole) => <div className="history-hole" key={hole.hole_number}>
        <div className="history-hole-top"><strong>Hole {hole.hole_number}</strong><span>Par {hole.par} · HCP {hole.handicap}</span><b>{hole.strokes ?? "—"}</b></div>
        <div className="history-yardages">{hole.yardages.map((tee) => <span key={tee.name}>{tee.name} <strong>{tee.yards} yds</strong></span>)}</div>
      </div>)}</div>
    </div>
  );
}
