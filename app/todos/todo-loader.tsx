"use client";

import dynamic from "next/dynamic";

const TodoApp = dynamic(() => import("./todo-app"), {
  ssr: false,
  loading: () => <p>Loading todo application...</p>,
});

export function TodoLoader({ userId }: { userId: string }) {
  return <TodoApp userId={userId} />;
}