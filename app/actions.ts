"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";

function getId(formData: FormData) {
  const value = formData.get("id");

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error("Invalid todo ID.");
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new Error("Invalid todo ID.");
  }

  return id;
}

export async function addTodo(formData: FormData) {
  const value = formData.get("title");

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A todo title is required.");
  }

  getDb()
    .prepare("INSERT INTO todos (title) VALUES (?)")
    .run(value.trim());

  revalidatePath("/");
}

export async function toggleTodo(formData: FormData) {
  const result = getDb()
    .prepare("UPDATE todos SET completed = 1 - completed WHERE id = ?")
    .run(getId(formData));

  if (result.changes !== 1) {
    throw new Error("Todo not found.");
  }

  revalidatePath("/");
}

export async function deleteTodo(formData: FormData) {
  const result = getDb()
    .prepare("DELETE FROM todos WHERE id = ?")
    .run(getId(formData));

  if (result.changes !== 1) {
    throw new Error("Todo not found.");
  }

  revalidatePath("/");
}
