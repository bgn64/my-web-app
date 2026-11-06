"use client";

import { useState, type ReactNode } from "react";
import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import { authClient } from "../auth-client";
import { BackendConnector } from "./connector";

export function SyncControls({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const database = usePowerSync();
  const status = useStatus();
  const { data: queue, error: queueError, isLoading } = useQuery<{
    count: number;
  }>("SELECT COUNT(*) AS count FROM ps_crud");
  const pendingCount = queue[0]?.count;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");

    let signedOut = false;

    try {
      await database.disconnect();

      const pending = await database.getUploadQueueStats();

      if (pending.count > 0) {
        throw new Error(
          "Changes are still waiting to upload. Sync them before logging out. " +
            "Your changes remain saved on this device.",
        );
      }

      const result = await authClient.signOut();

      if (result.error) {
        throw new Error(result.error.message ?? "Logout failed.");
      }

      signedOut = true;
      await database.disconnectAndClear();
      window.location.replace("/");
    } catch (error) {
      const message = signedOut
        ? "You are signed out, but clearing local data failed. " +
          "Reload this page before continuing."
        : error instanceof Error
          ? error.message
          : "Logout failed.";

      setError(message);

      if (!signedOut) {
        try {
          await database.connect(new BackendConnector(userId));
        } catch (reconnectError) {
          setError(
            `${message} ${
              reconnectError instanceof Error
                ? reconnectError.message
                : "Unable to restart synchronization."
            }`,
          );
        }
      }
    } finally {
      if (!signedOut) {
        setBusy(false);
      }
    }
  }

  return (
    <section className="workspace" aria-label="Shared todo workspace">
      <div className="card sync-card">
        <div className="sync-heading">
          <div>
            <p className="eyebrow">Local-first, shared together</p>
            <p className="muted">
              {status.connected
                ? "Connected to sync service"
                : "Disconnected: local changes will upload when reconnected"}
            </p>
          </div>
          <span className={`status-badge${status.connected ? "" : " status-offline"}`}>
            {status.connected ? "Connected" : "Offline"}
          </span>
        </div>

      <p className="muted" role="status">
        {queueError
          ? "Unable to determine whether local changes have uploaded."
          : isLoading || pendingCount === undefined
            ? "Checking pending uploads..."
            : pendingCount > 0
              ? `${pendingCount} pending change(s) saved on this device, waiting to upload.`
              : "No local changes waiting to upload."}
      </p>

      {!status.hasSynced && (
        <p className="muted">Initial sync has not finished; downloaded data may be incomplete.</p>
      )}

      {error && <p className="alert" role="alert">{error}</p>}
      {queueError && <p className="alert" role="alert">{queueError.message}</p>}
      {status.uploadError && (
        <p className="alert" role="alert">Upload: {status.uploadError.message}</p>
      )}
      {status.downloadError && (
        <p className="alert" role="alert">Download: {status.downloadError.message}</p>
      )}
      </div>

      <fieldset className="sync-content" disabled={busy}>
        {children}
        <div>
          <button className="button button-secondary" type="button" onClick={() => void logout()}>
            {busy ? "Logging out..." : "Log out"}
          </button>
        </div>
      </fieldset>
    </section>
  );
}
