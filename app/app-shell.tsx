"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./auth-controls";

function Icon({ name }: { name: "play" | "rounds" | "back" }) {
  if (name === "play") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 21h14M8 21V4l9 3-9 4" /><circle cx="17.5" cy="18" r="2" /></svg>;
  if (name === "rounds") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>;
}

export function AppShell({ children, name, email }: { children: React.ReactNode; name: string; email: string }) {
  const path = usePathname();
  const scorecard = path.endsWith("/scorecard");
  const playActive = path.startsWith("/play") || scorecard;
  const back = path === "/play/courses" ? "/play" : scorecard ? "/play" : path !== "/rounds" && path.startsWith("/rounds/") ? "/rounds" : null;
  const title = path === "/play/courses" ? "Choose a course" : scorecard ? "Scorecard" : path.startsWith("/rounds/") ? "Round details" : path.startsWith("/rounds") ? "Rounds" : "Fairway";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="header-title">
            {back ? <Link className="back-button" href={back} aria-label="Go back"><Icon name="back" /></Link> : <span className="small-brand">F</span>}
            <span>{title}</span>
          </div>
          <details className="account-menu">
            <summary aria-label="Account menu" className="avatar">{initials}</summary>
            <div className="account-popover">
              <span className="account-name">{name}</span>
              <span className="account-email">{email}</span>
              <LogoutButton />
            </div>
          </details>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <Link href="/play" className={playActive ? "nav-link active" : "nav-link"} aria-current={playActive ? "page" : undefined}><Icon name="play" /><span>Play</span></Link>
          <Link href="/rounds" className={!playActive && path.startsWith("/rounds") ? "nav-link active" : "nav-link"} aria-current={!playActive && path.startsWith("/rounds") ? "page" : undefined}><Icon name="rounds" /><span>Rounds</span></Link>
        </div>
      </nav>
    </div>
  );
}
