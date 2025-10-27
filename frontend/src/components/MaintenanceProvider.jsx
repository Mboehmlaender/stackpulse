import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const MaintenanceContext = createContext(null);

const INITIAL_STATE = {
  maintenance: null,
  update: null,
  script: null,
  ssh: null,
  loading: true,
  error: "",
  lastUpdated: null
};

export default function MaintenanceProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);
  const pollingRef = useRef(null);
  const wasRunningRef = useRef(false);

  const applyState = useCallback((partial) => {
    setState((prev) => ({
      ...prev,
      ...partial
    }));
  }, []);

  const fetchConfig = useCallback(async () => {
    applyState({ loading: true, error: "" });
    try {
      const response = await axios.get("/api/maintenance/config");
      const data = response.data ?? {};
      applyState({
        maintenance: data.maintenance ?? null,
        update: data.update ?? null,
        script: data.script ?? null,
        ssh: data.ssh ?? null,
        loading: false,
        error: "",
        lastUpdated: new Date()
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Fehler beim Laden der Wartungsdaten";
      applyState({ loading: false, error: message });
    }
  }, [applyState]);

  const refreshUpdateStatus = useCallback(async () => {
    try {
      const response = await axios.get("/api/maintenance/update-status");
      const data = response.data ?? {};
      setState((prev) => ({
        ...prev,
        maintenance: data.maintenance ?? prev.maintenance,
        update: data.update ?? prev.update,
        error: ""
      }));
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Fehler beim Aktualisieren des Wartungsstatus";
      setState((prev) => ({ ...prev, error: message }));
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (state.update?.running) {
      refreshUpdateStatus();
      const intervalId = setInterval(() => {
        refreshUpdateStatus();
      }, 5000);
      pollingRef.current = intervalId;
      return () => clearInterval(intervalId);
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return undefined;
  }, [state.update?.running, refreshUpdateStatus]);

  useEffect(() => {
    const currentlyRunning = Boolean(state.update?.running);
    if (!currentlyRunning && wasRunningRef.current) {
      fetchConfig();
    }
    wasRunningRef.current = currentlyRunning;
  }, [state.update?.running, fetchConfig]);

  const triggerUpdate = useCallback(async (payload = {}) => {
    await axios.post("/api/maintenance/portainer-update", payload);
    await refreshUpdateStatus();
  }, [refreshUpdateStatus]);

  const saveScript = useCallback(async (script) => {
    await axios.put("/api/maintenance/update-script", { script });
    await fetchConfig();
  }, [fetchConfig]);

  const resetScript = useCallback(async () => {
    await axios.delete("/api/maintenance/update-script");
    await fetchConfig();
  }, [fetchConfig]);

  const saveSshConfig = useCallback(async (config) => {
    await axios.put("/api/maintenance/ssh-config", config);
    await fetchConfig();
  }, [fetchConfig]);

  const deleteSshConfig = useCallback(async () => {
    await axios.delete("/api/maintenance/ssh-config");
    await fetchConfig();
  }, [fetchConfig]);

  const setMaintenanceMode = useCallback(async ({ active, message } = {}) => {
    const payload = { active: Boolean(active) };
    if (message !== undefined) {
      payload.message = message;
    }

    const response = await axios.post("/api/maintenance/mode", payload);
    const nextMaintenance = response.data?.maintenance ?? null;
    applyState({ maintenance: nextMaintenance, error: "" });
    return nextMaintenance;
  }, [applyState]);

  const testSshConnection = useCallback(async (config) => {
    const response = await axios.post("/api/maintenance/test-ssh", config ?? {});
    return response.data;
  }, []);

  const fetchSuperuserStatus = useCallback(async () => {
    const response = await axios.get("/api/auth/superuser/status");
    const data = response.data ?? {};
    return {
      exists: Boolean(data.exists),
      user: data.user ?? null
    };
  }, []);

  const fetchSetupStatus = useCallback(async () => {
    const response = await axios.get("/api/setup/status");
    return response.data ?? {};
  }, []);

  const deleteSetupEndpoint = useCallback(async (endpointId) => {
    const response = await axios.delete(`/api/setup/endpoints/${endpointId}`);
    return response.data ?? { success: false };
  }, []);

  const deleteSetupServer = useCallback(async (serverId) => {
    const response = await axios.delete(`/api/setup/servers/${serverId}`);
    return response.data ?? { success: false };
  }, []);

  const updateSetupApiKey = useCallback(async (serverId, apiKey) => {
    const response = await axios.put(`/api/setup/servers/${serverId}/api-key`, { apiKey });
    return response.data ?? { success: false };
  }, []);

  const removeSuperuserAccount = useCallback(async () => {
    const response = await axios.delete("/api/auth/superuser");
    return response.data ?? { success: false };
  }, []);

  const value = useMemo(() => ({
    maintenance: state.maintenance,
    update: state.update,
    script: state.script,
    ssh: state.ssh,
    loading: state.loading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    refreshConfig: fetchConfig,
    refreshUpdateStatus,
    setMaintenanceMode,
    triggerUpdate,
    saveScript,
    resetScript,
    saveSshConfig,
    deleteSshConfig,
    testSshConnection,
    fetchSuperuserStatus,
    fetchSetupStatus,
    deleteSetupEndpoint,
    deleteSetupServer,
    updateSetupApiKey,
    removeSuperuserAccount
  }), [state, fetchConfig, refreshUpdateStatus, setMaintenanceMode, triggerUpdate, saveScript, resetScript, saveSshConfig, deleteSshConfig, testSshConnection, fetchSuperuserStatus, fetchSetupStatus, deleteSetupEndpoint, deleteSetupServer, updateSetupApiKey, removeSuperuserAccount]);

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
}
