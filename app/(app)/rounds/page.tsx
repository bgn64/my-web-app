import Link from "next/link";
import { getRounds, requireUser } from "../../golf-data";
import { relativeScore, summarize } from "../../golf-summary";

export default async function RoundsPage() {
  const user = await requireUser("/rounds");
  const rounds = await getRounds(user.id, false);
  return (
    <div className="page">
      <div className="page-intro"><span className="eyebrow">YOUR SCORECARDS</span><h1>Rounds <em>played.</em></h1><p>A record of the good days out.</p></div>
      <div className="section-heading"><span>COMPLETED ROUNDS</span><span>{rounds.length}</span></div>
      {rounds.length === 0 ? <div className="empty-state"><div className="empty-icon">◌</div><h2>No rounds yet</h2><p>Once you finish a round, you&apos;ll find it here.</p><Link className="button button-primary" href="/play">Let&apos;s play →</Link></div> : (
        <div className="round-list">{rounds.map((round) => {
          const summary = summarize(round.holes);
          return <Link className="round-card" href={`/rounds/${round.id}`} key={round.id}>
            <div className="round-card-main"><span className="eyebrow">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(round.finished_at!))}</span><h2>{round.course_name}</h2><p>{summary.played} of {summary.total} holes scored{summary.played < summary.total ? " · Partial round" : ""}</p></div>
            <div className="round-card-score"><strong>{summary.played ? summary.strokes : "—"}</strong><span>{summary.played ? relativeScore(summary.relative) : "NO SCORE"}</span></div><span className="round-arrow">›</span>
          </Link>;
        })}</div>
      )}
    </div>
  );
}
