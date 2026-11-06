"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PowerSyncContext } from "@powersync/react";
import { BackendConnector } from "./connector";
import { getDatabase } from "./database";

let initialization: Promise<void> | undefined;
let connection: Promise<void> | undefined;

export function PowerSyncProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [database] = useState(() => getDatabase(userId));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    initialization ??= database.init();

    initialization.then(
      () => {
        if (cancelled) {
          return;
        }

        setReady(true);

        connection ??= database.connect(new BackendConnector(userId));

        connection.catch((error: unknown) => {
          if (!cancelled) {
            setError(
              error instanceof Error
                ? error.message
                : "Unable to start synchronization.",
            );
          }
        });
      },
      (error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to open the local database.",
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [database, userId]);

  return (
    <>
      {error && <p role="alert">{error}</p>}

      {ready ? (
        <PowerSyncContext.Provider value={database}>
          {children}
        </PowerSyncContext.Provider>
      ) : (
        <p>Opening local database...</p>
      )}
    </>
  );
}