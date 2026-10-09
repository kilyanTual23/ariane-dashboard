export const AUTH_COOKIE_NAME = "ariane_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

export async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_ariane_secure_auth_salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyToken(token: string, password: string): Promise<boolean> {
  if (!token || !password) return false;
  const expected = await hashToken(password);
  return token === expected;
}
