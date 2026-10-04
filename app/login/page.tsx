"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { springSoft } from "@/components/motion";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springSoft}
        className="flex w-full max-w-[340px] flex-col items-center"
      >
        <img src="/icon.svg" alt="" className="mb-6 size-20 rounded-[22px] shadow-[var(--shadow-float)]" />
        <h1 className="display text-[28px] font-bold tracking-tight text-label">Disponible</h1>
        <p className="mt-1 text-[15px] text-label-2">Ingresa tu contraseña</p>

        <form action={action} className="mt-8 w-full">
          <motion.input
            key={state.error ? "error" : "ok"}
            animate={state.error ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
            transition={{ duration: 0.4 }}
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            placeholder="Contraseña"
            className="h-[52px] w-full rounded-2xl bg-grouped-2 px-4 text-center text-[17px] text-label outline-none placeholder:text-label-3 focus:ring-2 focus:ring-ios-blue"
          />
          <p className="mt-2 h-5 text-center text-[13px] text-ios-red" aria-live="polite">
            {state.error}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="mt-2 h-[52px] w-full rounded-2xl bg-ios-blue text-[17px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-50"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}
