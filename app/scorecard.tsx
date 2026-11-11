"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { closeRound, saveScore } from "./golf-actions";
import type { Hole } from "./golf-data";
import { relativeScore, summarize } from "./golf-summary";

function ConfirmDialog({ closing, pending, error, summary, onClose, onConfirm }: {
  closing: "finish" | "discard";
  pending: boolean;
  error: string;
  summary: { played: number; total: number };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="dialog" aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <h2 id="confirm-title">{closing === "finish" ? "Finish this round?" : "Discard this round?"}</h2>
    <p>{closing === "finish" ? `${summary.played} of ${summary.total} holes scored. ${summary.total - summary.played} unscored holes will remain blank. Finished rounds cannot be edited.` : "This active round and its scores will be permanently removed."}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="button button-primary full-width" disabled={pending} onClick={onConfirm}>{pending ? "Please wait..." : closing === "finish" ? "Finish round" : "Discard round"}</button>
    <button className="button button-secondary full-width" disabled={pending} onClick={onClose}>Keep playing</button>
  </dialog>;
}

export function Scorecard({ roundId, initialHoles }: { roundId: number; initialHoles: Hole[] }) {
  const [holes, setHoles] = useState(initialHoles);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("All changes saved");
  const [closing, setClosing] = useState<"finish" | "discard" | null>(null);
  const [pending, setPending] = useState(false);
  const [closeError, setCloseError] = useState("");
  const inFlight = useRef(false);
  const router = useRouter();
  const hole = holes[index];
  const summary = summarize(holes);

  useEffect(() => {
    if (!saving && !failed) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function warnBeforeNavigation(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      if (!window.confirm("Your score has not been saved yet. Leave this page?")) event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", warnBeforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", warnBeforeNavigation, true);
    };
  }, [saving, failed]);

  async function save(value: number | null) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    setMessage("Saving...");
    setHoles((current) => current.map((item, i) => i === index ? { ...item, strokes: value } : item));
    try {
      const result = await saveScore(roundId, hole.hole_number, value);
      if (!result.ok) {
        setFailed(true);
        setMessage(result.error);
      } else {
        setMessage("All changes saved");
      }
    } catch (error) {
      console.error("Could not save score:", error);
      setFailed(true);
      setMessage("Score not saved. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function close() {
    if (!closing || pending || saving || failed) return;
    setPending(true);
    setCloseError("");
    try {
      const result = await closeRound(roundId, closing);
      if (!result.ok) setCloseError(result.error);
      else {
        router.push(closing === "finish" ? `/rounds/${roundId}` : "/play");
        router.refresh();
      }
    } catch (error) {
      console.error("Could not close round:", error);
      setCloseError("Could not reach the server. Please check the round before retrying.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="score-progress">
        <div><span className="eyebrow">YOUR PROGRESS</span><strong>{summary.played} <span>/ {summary.total} holes scored</span></strong></div>
        <div className="score-progress-total"><span className="eyebrow">TO PAR</span><strong>{summary.played ? relativeScore(summary.relative) : "—"}</strong></div>
      </div>
      <div className="progress-track"><div style={{ width: `${summary.played / summary.total * 100}%` }} /></div>
      <p className={failed ? "save-status error-message" : "save-status"} role="status">{message} {failed && <button className="inline-button" onClick={() => save(hole.strokes)}>Retry</button>}</p>

      <div className="section-heading"><span>SELECT A HOLE</span><span>{hole.hole_number} / {holes.length}</span></div>
      <div className="hole-grid" aria-label="Choose a hole">
        {holes.map((item, i) => <button key={item.hole_number} type="button" disabled={saving || failed || pending} className={`hole-chip ${index === i ? "current" : ""} ${item.strokes !== null ? "scored" : ""}`} aria-label={`Hole ${item.hole_number}${item.strokes !== null ? `, score ${item.strokes}` : ", not scored"}`} aria-pressed={index === i} onClick={() => setIndex(i)}>{item.hole_number}</button>)}
      </div>
      <div className="hole-card">
        <div className="hole-card-header"><div><span className="eyebrow">NOW PLAYING</span><h2>Hole {hole.hole_number}</h2></div><div className="par-badge">PAR {hole.par}</div></div>
        <div className="hole-meta"><span>Handicap <strong>{hole.handicap}</strong></span><span>Yardage by tee</span></div>
        <div className="tee-row">{hole.yardages.map((tee) => <div key={tee.name}><span>{tee.name}</span><strong>{tee.yards} <small>yds</small></strong></div>)}</div>
        <div className="score-entry">
          <span className="eyebrow">YOUR SCORE</span>
          <div className="stepper">
            <button type="button" aria-label="Decrease score" disabled={saving || failed || pending || hole.strokes === null || hole.strokes <= 1} onClick={() => save((hole.strokes ?? 2) - 1)}>−</button>
            <div className="score-value" aria-label={hole.strokes === null ? "No score entered" : `Score ${hole.strokes}`}>{hole.strokes ?? "—"}</div>
            <button type="button" aria-label="Increase score" disabled={saving || failed || pending || hole.strokes === 99} onClick={() => save(hole.strokes === null ? hole.par : hole.strokes + 1)}>+</button>
          </div>
          <p>{hole.strokes === null ? "Tap + to start at par" : `${relativeScore(hole.strokes - hole.par)} for this hole`}</p>
          {hole.strokes !== null && <button className="inline-button" disabled={saving || failed || pending} onClick={() => save(null)}>Clear score</button>}
        </div>
      </div>
      <div className="hole-controls">
        <button className="button button-secondary" disabled={index === 0 || saving || failed || pending} onClick={() => setIndex(index - 1)}>← Previous</button>
        <button className="button button-secondary" disabled={index === holes.length - 1 || saving || failed || pending} onClick={() => setIndex(index + 1)}>Next hole →</button>
      </div>
      <button className="button button-primary full-width finish-button" disabled={saving || failed || pending} onClick={() => setClosing("finish")}>Finish round</button>
      <button className="text-button full-width discard-button" disabled={saving || failed || pending} onClick={() => setClosing("discard")}>Discard round</button>
      {closing && <ConfirmDialog closing={closing} pending={pending} error={closeError} summary={summary} onClose={() => { setClosing(null); setCloseError(""); }} onConfirm={close} />}
    </>
  );
}
