import { PowerSyncDatabase } from "@powersync/web";
import { schema } from "./schema";

let instance: PowerSyncDatabase | undefined;
let instanceUserId: string | undefined;

export function getDatabase(userId: string): PowerSyncDatabase {
  if (typeof window === "undefined") {
    throw new Error("PowerSync must be initialized in the browser.");
  }

  if (!userId) {
    throw new Error("A user ID is required.");
  }

  if (instance) {
    if (instanceUserId !== userId) {
      throw new Error(
        "An account's database is already open. Reload before switching accounts.",
      );
    }

    return instance;
  }

  instance = new PowerSyncDatabase({
    schema,
    database: {
      dbFilename: `todos-${encodeURIComponent(userId)}.sqlite`,
      worker: "/@powersync/worker.js",
    },
    sync: {
      worker: "/@powersync/worker.js",
    },
  });

  instanceUserId = userId;
  return instance;
}