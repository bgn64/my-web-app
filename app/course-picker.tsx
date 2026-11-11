"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Course } from "./golf-data";
import { startRound } from "./golf-actions";

export function CoursePicker({ courses }: { courses: Course[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const visible = courses.filter((course) => `${course.name} ${course.location}`.toLowerCase().includes(query.toLowerCase().trim()));

  async function start() {
    if (selected === null || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await startRound(String(selected));
      if (!result.ok) setError(result.error);
      else if (result.roundId) router.push(`/rounds/${result.roundId}/scorecard`);
      else setError("The round was created, but its scorecard could not be opened. Check Play.");
    } catch (error) {
      console.error("Could not start round:", error);
      setError("Could not reach the server. Check Play before trying again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <label className="search-label" htmlFor="course-search">Search courses</label>
      <input id="course-search" className="search-input" type="search" placeholder="Search by course name" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="section-heading"><span>AVAILABLE COURSES</span><span>{visible.length}</span></div>
      {visible.length === 0 ? <div className="empty-state"><p>No courses match your search.</p></div> : (
        <div className="course-list" aria-label="Select a course">
          {visible.map((course) => (
            <button type="button" aria-pressed={selected === course.id} className={`course-option ${selected === course.id ? "selected" : ""}`} key={course.id} onClick={() => setSelected(course.id)}>
              <span className="course-icon">⛳</span><span className="course-copy"><strong>{course.name}</strong><small>{course.location}</small></span><span className="course-holes">{course.hole_count} holes</span><span className="radio-dot" />
            </button>
          ))}
        </div>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="button button-primary full-width start-button" disabled={selected === null || pending} onClick={start}>{pending ? "Starting..." : "Start round"} <span aria-hidden="true">→</span></button>
      <p className="helper-text">You can score any hole, in any order.</p>
    </>
  );
}
