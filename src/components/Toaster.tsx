"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
import { subscribeToast, type ToastMessage, type ToastType } from "@/hooks/useToast";

const AUTO_DISMISS_MS = 6000;

const CONFIG: Record<ToastType, {
  Icon: React.ElementType;
  label: string;
  bar: string;
  iconColor: string;
  textColor: string;
  bg: string;
  border: string;
}> = {
  error: {
    Icon: AlertCircle,
    label: "Erro",
    bar: "bg-red-500",
    iconColor: "text-red-500",
    textColor: "text-red-700 dark:text-red-300",
    bg: "bg-white dark:bg-[#1e1e1e]",
    border: "border-red-200 dark:border-red-800",
  },
  success: {
    Icon: CheckCircle,
    label: "Sucesso",
    bar: "bg-emerald-500",
    iconColor: "text-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-white dark:bg-[#1e1e1e]",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  warning: {
    Icon: AlertTriangle,
    label: "Atenção",
    bar: "bg-amber-500",
    iconColor: "text-amber-500",
    textColor: "text-amber-700 dark:text-amber-300",
    bg: "bg-white dark:bg-[#1e1e1e]",
    border: "border-amber-200 dark:border-amber-800",
  },
  info: {
    Icon: Info,
    label: "Informação",
    bar: "bg-slate-500",
    iconColor: "text-slate-500",
    textColor: "text-slate-700 dark:text-slate-300",
    bg: "bg-white dark:bg-[#1e1e1e]",
    border: "border-slate-200 dark:border-slate-700",
  },
};

interface ActiveToast extends ToastMessage {
  exiting: boolean;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    return subscribeToast((msg) => {
      setToasts((prev) => [...prev, { ...msg, exiting: false }]);

      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === msg.id ? { ...t, exiting: true } : t))
        );
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== msg.id));
        }, 300);
      }, AUTO_DISMISS_MS);
    });
  }, []);

  function dismiss(id: string) {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2" style={{ width: "clamp(280px, 22rem, calc(100vw - 2rem))" }}>
      {toasts.map((t) => {
        const { Icon, label, bar, iconColor, textColor, bg, border } = CONFIG[t.type];
        return (
          <div
            key={t.id}
            className={`relative overflow-hidden rounded-xl border shadow-lg ${bg} ${border} ${
              t.exiting ? "animate-toast-out" : "animate-toast-in"
            }`}
          >
            {/* coloured left bar */}
            <div className={`absolute inset-y-0 left-0 w-1 ${bar}`} />

            <div className="flex items-start gap-3 px-4 py-3 pl-5">
              <Icon size={16} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold leading-none mb-1 ${textColor}`}>{label}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed break-words">{t.message}</p>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-0.5"
                aria-label="Fechar"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
