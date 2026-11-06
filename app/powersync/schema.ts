import { column, Schema, Table } from "@powersync/web";

export const schema = new Schema({
  todos: new Table({
    title: column.text,
    completed: column.integer,
  }),
});

export type Todo = {
  id: string;
  title: string;
  completed: number;
};