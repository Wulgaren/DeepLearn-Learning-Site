/**
 * Verify Supabase Auth access tokens (ES256 / JWKS) on the edge.
 * @see https://supabase.com/docs/guides/auth/jwts
 */
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6?target=deno";

function supabaseProjectUrl(): string {
  return (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
}

function authIssuer(): string {
  return `${supabaseProjectUrl()}/auth/v1`;
}

function jwksUrl(): URL {
  return new URL(`${supabaseProjectUrl()}/auth/v1/.well-known/jwks.json`);
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(jwksUrl());
  return jwks;
}

/** Returns `sub` when signature, issuer, audience, and expiry are valid for a logged-in user. */
export async function verifySupabaseUserAccessToken(token: string): Promise<string | null> {
  const base = supabaseProjectUrl();
  if (!base) return null;
  const t = token.trim();
  if (!t || t.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(t, getJwks(), {
      issuer: authIssuer(),
      audience: "authenticated",
    });
    if (payload.role !== "authenticated") return null;
    const sub = payload.sub;
    return typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}
