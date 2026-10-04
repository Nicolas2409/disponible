// Sesión mínima de un solo usuario: cookie firmada con HMAC usando APP_PASSWORD.
// Cambiar APP_PASSWORD cierra todas las sesiones. Usa Web Crypto (sirve en proxy y servidor).

export const SESSION_COOKIE = "disp_session";
export const SESSION_DAYS = 365;

const enc = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sin APP_PASSWORD la app queda abierta solo en local; en Vercel se bloquea. */
const openWithoutPassword = () => !process.env.VERCEL;

export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmac(process.env.APP_PASSWORD!, `session:${expires}`)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return openWithoutPassword();
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await hmac(password, `session:${expires}`));
}

export async function checkPassword(input: string): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return openWithoutPassword();
  // Comparar hashes para que la longitud no filtre información.
  const [a, b] = await Promise.all([hmac("pw", input), hmac("pw", password)]);
  return safeEqual(a, b);
}
