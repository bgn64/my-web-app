import "server-only";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export function getDb() {
  if (!globalForDb.postgresPool) {
    for (const name of [
      "PGHOST",
      "PGDATABASE",
      "PGUSER",
      "PGPASSWORD",
    ]) {
      if (!process.env[name]) {
        throw new Error(`Missing database environment variable: ${name}`);
      }
    }

    const pool = new Pool();

    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error:", error);
    });

    globalForDb.postgresPool = pool;
  }

  return globalForDb.postgresPool;
}

export type Todo = {
  id: number;
  title: string;
  completed: number;
};