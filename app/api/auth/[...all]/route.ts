import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/app/_features/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);