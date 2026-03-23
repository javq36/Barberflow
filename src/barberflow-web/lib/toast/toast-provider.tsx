"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  variant: ToastVariant;
  isLeaving: boolean;
};

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const MAX_TOASTS = 3;
const LEAVE_ANIMATION_MS = 280;

const ToastContext = createContext<ToastContextValue | null>(null);

function createToastId() {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, (value) =>
      value.toString(16).padStart(2, "0"),
    );
    return `toast-${hex.join("")}`;
  }

  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AppToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    // Start leave animation
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, isLeaving: true } : toast,
      ),
    );
    // Remove after animation completes
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, LEAVE_ANIMATION_MS);
  }, []);

  const showToast = useCallback(
    ({
      title,
      description,
      variant = "info",
      durationMs = 3200,
    }: ToastInput) => {
      const id = createToastId();

      setToasts((current) => {
        // Enforce max 3 — if already at limit, mark oldest as leaving (will be pruned)
        const pruned =
          current.length >= MAX_TOASTS ? current.slice(-(MAX_TOASTS - 1)) : current;
        return [...pruned, { id, title, description, variant, durationMs, isLeaving: false }];
      });

      window.setTimeout(() => {
        removeToast(id);
      }, durationMs);
    },
    [removeToast],
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      showToast,
    }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <aside
        className="app-toast-viewport"
        aria-live="polite"
        aria-label="Notificaciones"
      >
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`app-toast app-toast-${toast.variant}${toast.isLeaving ? " app-toast-leaving" : ""}`}
            role="status"
          >
            <div className="app-toast-body">
              <div className="app-toast-content">
                <p className="app-toast-title">{toast.title}</p>
                {toast.description ? (
                  <p className="app-toast-description">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Cerrar notificación"
                className="app-toast-close"
              >
                <X size={14} />
              </button>
            </div>
          </article>
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }

  return context;
}
