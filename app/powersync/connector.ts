import type {
  PowerSyncBackendConnector,
  PowerSyncDatabase,
} from "@powersync/web";

export class BackendConnector implements PowerSyncBackendConnector {
  constructor(private readonly userId: string) {}

  async fetchCredentials() {
    const response = await fetch("/api/powersync/token", {
      cache: "no-store",
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Sync authentication failed: ${response.status}`);
    }

    const credentials = await response.json();

    if (
      credentials.userId !== this.userId ||
      typeof credentials.token !== "string" ||
      typeof credentials.endpoint !== "string"
    ) {
      throw new Error("Sync credentials do not match this account.");
    }

    return {
      token: credentials.token,
      endpoint: credentials.endpoint,
    };
  }

  async uploadData(database: PowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    const response = await fetch("/api/powersync/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: this.userId,
        batch: transaction.crud.map((entry) => ({
          op: entry.op,
          table: entry.table,
          id: entry.id,
          data: entry.opData,
        })),
      }),
    });

    if (!response.ok && response.status !== 422) {
      throw new Error(
        `Upload failed: ${response.status}. Changes remain queued on this device.`,
      );
    }

    const result = await response.json();

    if (response.status === 422 || result.status === "rejected") {
      const message =
        typeof result.message === "string"
          ? result.message
          : "The server rejected these changes.";

      throw new Error(
        `${message} Changes remain queued on this device. ` +
          "This rejection must be resolved before queued changes can upload.",
      );
    } else if (result.status !== "ok") {
      throw new Error("Unexpected upload response.");
    }

    await transaction.complete();
  }
}