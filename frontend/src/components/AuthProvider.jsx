import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const LEVEL_PRIORITY = {
  none: 0,
  read: 1,
  full: 2,
};

const AuthContext = createContext(null);
AuthContext.displayName = "AuthContext";

const normalizePermissions = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (typeof key !== "string" || !key) {
      return acc;
    }
    const normalizedValue = typeof value === "string" ? value : String(value ?? "").trim();
    acc[key] = normalizedValue || "none";
    return acc;
  }, {});
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    permissions: {},
    loading: false,
    error: null,
    lastErrorCode: null,
    initialized: false,
  });

  const setSession = useCallback((payload) => {
    const user = payload?.user ?? null;
    const permissions = normalizePermissions(payload?.permissions);
    setState({
      user,
      permissions,
      loading: false,
      error: null,
      lastErrorCode: null,
      initialized: true,
    });
  }, []);

  const clearSession = useCallback(() => {
    setState((prev) => ({
      user: null,
      permissions: {},
      loading: false,
      error: null,
      lastErrorCode: null,
      initialized: prev.initialized || true,
    }));
  }, []);

  const refreshSession = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      lastErrorCode: null,
    }));

    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState({
          user: null,
          permissions: {},
          loading: false,
          error: payload?.error ?? null,
          lastErrorCode: payload?.error ?? null,
          initialized: true,
        });
        return { ok: false, status: response.status, error: payload?.error ?? null };
      }

      setSession(payload);
      return { ok: true, data: payload };
    } catch (err) {
      const message = err?.message || "NETWORK_ERROR";
      setState({
        user: null,
        permissions: {},
        loading: false,
        error: message,
        lastErrorCode: "NETWORK_ERROR",
        initialized: true,
      });
      return { ok: false, error: message };
    }
  }, [setSession]);

  const logout = useCallback(async () => {
    let capturedError = null;
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const logoutError = new Error(payload?.error || "LOGOUT_FAILED");
        logoutError.code = payload?.error || `STATUS_${response.status}`;
        throw logoutError;
      }
    } catch (err) {
      capturedError = err;
    } finally {
      clearSession();
    }
    if (capturedError) {
      throw capturedError;
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permissionKey, requiredLevel = "full") => {
      if (!permissionKey) {
        return true;
      }
      if (state.user?.isSuperuser) {
        return true;
      }
      const current = state.permissions?.[permissionKey] ?? "none";
      const currentPriority = LEVEL_PRIORITY[current] ?? 0;
      const requiredPriority = LEVEL_PRIORITY[requiredLevel] ?? LEVEL_PRIORITY.full;
      return currentPriority >= requiredPriority;
    },
    [state.permissions, state.user]
  );

  const value = useMemo(
    () => ({
      user: state.user,
      permissions: state.permissions,
      loading: state.loading,
      error: state.error,
      lastErrorCode: state.lastErrorCode,
      initialized: state.initialized,
      isAuthenticated: Boolean(state.user),
      refreshSession,
      setSession,
      clearSession,
      logout,
      hasPermission,
    }),
    [state, refreshSession, setSession, clearSession, logout, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export const AuthContextDisplayName = "/src/components/AuthProvider.jsx";
