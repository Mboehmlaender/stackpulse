import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const VARIANT_STYLES = {
  success: {
    container: "border-mossGreen-500/80 bg-mossGreen-900/90 text-white",
    accent: "bg-mossGreen-400"
  },
  warning: {
    container: "border-warmAmberGlow-500/80 bg-warmAmberGlow-900/90 text-white",
    accent: "bg-warmAmberGlow-400"
  },
  error: {
    container: "border-sunsetCoral-500/80 bg-sunsetCoral-900/90 text-white",
    accent: "bg-sunsetCoral-400"
  },
  info: {
    container: "border-arcticBlue-500 bg-arcticBlue-900/90 text-white",
    accent: "bg-arcticBlue-400"
  }
};

const DEFAULT_DURATION = 6000;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));

    const handle = timeoutsRef.current.get(id);
    if (handle && typeof window !== "undefined") {
      window.clearTimeout(handle);
    }
    timeoutsRef.current.delete(id);
  }, []);

  const showToast = useCallback(({ id, title, description, variant = "info", duration = DEFAULT_DURATION } = {}) => {
    const toastId = id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const normalizedVariant = VARIANT_STYLES[variant] ? variant : "info";

    setToasts((prev) => {
      const withoutExisting = prev.filter((toast) => toast.id !== toastId);
      return [
        ...withoutExisting,
        {
          id: toastId,
          title,
          description,
          variant: normalizedVariant
        }
      ];
    });

    if (duration !== null && duration !== Infinity && typeof window !== "undefined") {
      const timeoutHandle = window.setTimeout(() => {
        dismissToast(toastId);
      }, duration);

      const existingHandle = timeoutsRef.current.get(toastId);
      if (existingHandle) {
        window.clearTimeout(existingHandle);
      }
      timeoutsRef.current.set(toastId, timeoutHandle);
    }

    return toastId;
  }, [dismissToast]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      timeoutsRef.current.forEach((handle) => window.clearTimeout(handle));
      timeoutsRef.current.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-full flex-col gap-3">
        {toasts.map((toast) => {
          const styles = VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto overflow-hidden rounded-lg border px-4 py-3 shadow-xl backdrop-blur ${styles.container}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1 h-2 flex-shrink-0 w-2 rounded-full ${styles.accent}`}></span>
                <div className="flex-1">
                  {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                  {toast.description && <p className="mt-1 text-sm leading-snug text-white/80">{toast.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="ml-2 rounded-md p-1 text-xs uppercase tracking-wide text-white/60 transition hover:text-white/90"
                >
                  Schließen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
