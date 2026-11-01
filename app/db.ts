import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let database: Database.Database | undefined;

export function getDb() {
  if (!database) {
    const directory = join(process.cwd(), "data");
    mkdirSync(directory, { recursive: true });

    database = new Database(join(directory, "todos.sqlite"));

    database.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
          CHECK (completed IN (0, 1))
      )
    `);
  }

  return database;
}

export type Todo = {
  id: number;
  title: string;
  completed: number;
};
