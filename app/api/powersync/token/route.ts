import { SignJWT } from "jose";
import { auth } from "../../../auth";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return Response.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const key = process.env.POWERSYNC_DEV_JWK;
  const endpoint = process.env.POWERSYNC_PUBLIC_URL;

  if (!key || !endpoint) {
    throw new Error("Missing PowerSync authentication configuration.");
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", kid: "local-dev" })
    .setSubject(session.user.id)
    .setAudience("powersync-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(Buffer.from(key, "base64url"));

  return Response.json(
    { token, endpoint, userId: session.user.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}