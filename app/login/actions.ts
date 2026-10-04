"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, checkPassword, createSessionToken } from "@/lib/session";

export async function loginAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  // Pequeña pausa para frenar intentos repetidos.
  await new Promise((r) => setTimeout(r, 400));
  if (!(await checkPassword(String(form.get("password") ?? "")))) {
    return { error: "Contraseña incorrecta" };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect("/");
}
