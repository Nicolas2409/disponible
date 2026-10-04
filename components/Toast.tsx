"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { spring } from "./motion";

type ToastInput = {
  message: string;
  tone?: "default" | "error";
  action?: { label: string; onAction: () => void | Promise<void> };
};
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...t, id });
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 4200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
        style={{ bottom: "calc(max(env(safe-area-inset-bottom), 12px) + 76px)" }}
      >
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={spring}
              className="material pointer-events-auto flex min-h-12 items-center gap-1 rounded-full py-1.5 pr-1.5 pl-5 shadow-[var(--shadow-float)]"
            >
              {toast.tone === "error" ? (
                <span className="size-2 shrink-0 rounded-full bg-ios-red" aria-hidden />
              ) : (
                <svg viewBox="0 0 20 20" className="size-[18px] shrink-0 text-ios-green" aria-hidden>
                  <circle cx="10" cy="10" r="9" fill="currentColor" />
                  <path d="M6 10.4l2.6 2.6L14 7.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="ml-1.5 text-[15px] font-semibold">{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  onClick={async () => {
                    const a = toast.action;
                    setToast(null);
                    await a?.onAction();
                  }}
                  className="ml-2 h-9 rounded-full bg-fill-2 px-4 text-[15px] font-semibold text-ios-blue active:opacity-60"
                >
                  {toast.action.label}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
