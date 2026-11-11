import Link from "next/link";
import { getRounds, requireUser } from "../../golf-data";
import { summarize } from "../../golf-summary";

export default async function PlayPage() {
  const user = await requireUser("/play");
  const active = (await getRounds(user.id, true))[0];
  const progress = active ? summarize(active.holes) : null;

  return (
    <div className="page">
      <div className="welcome"><span className="eyebrow">YOUR GOLF COMPANION</span><h1>Ready when<br /><em>you are.</em></h1><p>A little less scorekeeping. A lot more golf.</p></div>
      <div className="section-heading"><span>{active ? "YOUR ROUND" : "LET'S PLAY"}</span><span>{active ? "IN PROGRESS" : "THE FIRST TEE"}</span></div>
      {active && progress ? (
        <div className="feature-card">
          <div className="feature-top"><span className="feature-label"><span className="live-dot" /> ROUND IN PROGRESS</span><span className="feature-symbol">↗</span></div>
          <h2>{active.course_name}</h2><p>{active.course_location}</p>
          <div className="feature-stats"><div><strong>{progress.played}<small> / {progress.total}</small></strong><span>HOLES SCORED</span></div><div><strong>{progress.played ? progress.strokes : "—"}</strong><span>STROKES</span></div></div>
          <Link className="button button-light full-width" href={`/rounds/${active.id}/scorecard`}>Resume round <span>→</span></Link>
        </div>
      ) : (
        <div className="feature-card">
          <div className="feature-top"><span className="feature-label">A GOOD DAY FOR GOLF</span><span className="feature-symbol">↗</span></div>
          <h2>Let&apos;s get out there.</h2><p>Choose a course and keep your score, one hole at a time.</p>
          <div className="feature-art" aria-hidden="true"><span>⛳</span><span className="feature-art-line" /></div>
          <Link className="button button-light full-width" href="/play/courses">Start a round <span>→</span></Link>
        </div>
      )}
      <div className="tip-card"><span className="tip-icon">✦</span><div><strong>Play your way</strong><p>Score any holes you like, in any order. We&apos;ll keep your place.</p></div></div>
    </div>
  );
}
