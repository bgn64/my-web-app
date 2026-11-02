import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/app/auth";

export const { GET, POST } = toNextJsHandler(auth);