"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { headers } from "next/headers";
import { auth } from "./auth";

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("You must be logged in.");
  }

  return session;
}

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
  await requireSession();

  const value = formData.get("title");

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A todo title is required.");
  }

  await getDb().query(
    "INSERT INTO todos (title) VALUES ($1)",
    [value.trim()],
  );

  revalidatePath("/");
}

export async function toggleTodo(formData: FormData) {
  await requireSession();

  const result = await getDb().query(
    "UPDATE todos SET completed = 1 - completed WHERE id = $1",
    [getId(formData)],
  );

  if (result.rowCount !== 1) {
    throw new Error("Todo not found.");
  }

  revalidatePath("/");
}

export async function deleteTodo(formData: FormData) {
  await requireSession();
  
  const result = await getDb().query(
    "DELETE FROM todos WHERE id = $1",
    [getId(formData)],
  );

  if (result.rowCount !== 1) {
    throw new Error("Todo not found.");
  }

  revalidatePath("/");
}