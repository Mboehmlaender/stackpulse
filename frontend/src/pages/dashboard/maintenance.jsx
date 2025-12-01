import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useMaintenance } from "@/components/MaintenanceProvider";
import { useAuth } from "@/components/AuthProvider.jsx";
import { useToast } from "@/components/ToastProvider.jsx";

import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Switch,
  Input,
  Alert,
  Chip,
  Select,
  Option
} from "@material-tailwind/react";
import { PaginationControls, usePage } from "@/components/PageProvider.jsx";

const UPDATE_STATUS_LABELS = {
  idle: "Bereit",
  running: "Läuft",
  success: "Erfolgreich",
  error: "Fehlgeschlagen"
};

const UPDATE_STATUS_STYLES = {
  idle: "bg-stormGrey-700 text-gray-200",
  running: "bg-arcticBlue-600 text-white",
  success: "bg-mossGreen-600 text-white",
  error: "bg-sunsetCoral-600 text-white"
};

const UPDATE_STAGE_LABELS = {
  initializing: "Vorbereitung",
  "activating-maintenance": "Wartungsmodus aktivieren",
  "executing-script": "Skript wird ausgeführt",
  waiting: "Warte auf Portainer",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen"
};

const LOG_LEVEL_STYLES = {
  info: "text-arcticBlue-700",
  success: "text-mossGreen-700",
  warning: "text-warmAmberGlow-700",
  error: "text-sunsetCoral-700",
  stdout: "text-stormGrey-700",
  stderr: "text-warmAmberGlow-700",
  debug: "text-lavenderSmoke-700"
};

const formatLogTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

const formatCreatedAt = (value) => {
  if (!value && value !== 0) return "-";

  const normalizeToDate = (input) => {
    if (input instanceof Date) return input;

    if (typeof input === "number") {
      const epoch = input > 1e12 ? input : input * 1000;
      return new Date(epoch);
    }

    if (typeof input === "string") {
      const numeric = Number(input);
      if (!Number.isNaN(numeric)) {
        const epoch = numeric > 1e12 ? numeric : numeric * 1000;
        return new Date(epoch);
      }
      return new Date(input);
    }

    return null;
  };

  const date = normalizeToDate(value);
  if (!date || Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

const createEmptySshDraft = () => ({
  host: '',
  port: '22',
  username: '',
  password: '',
  extraSshArgs: ''
});

export function Maintenance() {
  const navigate = useNavigate();
  const { hasPermission, user: authUser, serverAssignments } = useAuth();
  const { showToast } = useToast();
  const {
    maintenance: maintenanceMeta,
    update: updateState,
    script: scriptConfig,
    ssh: sshConfig,
    loading: maintenanceLoading,
    error: maintenanceError,
    setMaintenanceMode,
    triggerUpdate,
    saveScript,
    resetScript,
    saveSshConfig,
    deleteSshConfig,
    testSshConnection,
    fetchSetupStatus,
    deleteSetupServer,
    updateSetupApiKey,
    updateSelfStackId,
    removeSuperuserAccount
  } = useMaintenance();

  const isSuperuserAccount = Boolean(authUser?.isSuperuser);
  const canViewMaintenance = Boolean(isSuperuserAccount || hasPermission("maintenance-access", "read"));
  const canControlMaintenance = Boolean(isSuperuserAccount || hasPermission("maintenance-access", "full"));
  const canViewServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-manage", "read"));
  const canEditServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-edit", "full"));
  const canDeleteServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-delete", "full"));
  const canDeleteSuperuser = Boolean(isSuperuserAccount || hasPermission("maintenance-superuser-delete", "full"));
  const canViewPortainer = false;
  const canManagePortainerUpdate = false;
  const canViewSsh = false;
  const canManageSsh = false;
  const showPortainerSection = false;

  const maintenanceActive = Boolean(maintenanceMeta?.active);
  const maintenanceMessage = maintenanceMeta?.message;
  const maintenanceExtraType = maintenanceMeta?.extra?.type;
  const updateRunning = Boolean(updateState?.running);
  const maintenanceLocked = maintenanceActive || updateRunning;

  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptSaving, setScriptSaving] = useState(false);
  const [updateActionLoading, setUpdateActionLoading] = useState(false);
  const [updateActionError, setUpdateActionError] = useState("");
  const [maintenanceToggleLoading, setMaintenanceToggleLoading] = useState(false);
  const [sshDraft, setSshDraft] = useState(() => createEmptySshDraft());
  const [sshPasswordStored, setSshPasswordStored] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sshSaving, setSshSaving] = useState(false);
  const [sshTesting, setSshTesting] = useState(false);
  const [sshDeleting, setSshDeleting] = useState(false);
  const [sshTestResult, setSshTestResult] = useState(null);

  useEffect(() => {
    if (!scriptConfig) return;
    const nextValue = scriptConfig.custom ?? scriptConfig.default ?? scriptConfig.effective ?? "";
    setScriptDraft(nextValue);
  }, [scriptConfig]);

  useEffect(() => {
    if (!sshConfig) {
      setSshDraft(createEmptySshDraft());
      setSshPasswordStored(false);
      setShowPassword(false);
      setSshTestResult(null);
      return;
    }
    setSshDraft({
      host: sshConfig.host ?? '',
      port: String(sshConfig.port ?? '22'),
      username: sshConfig.username ?? '',
      password: '',
      extraSshArgs: Array.isArray(sshConfig.extraSshArgs) ? sshConfig.extraSshArgs.join('\n') : ''
    });
    setSshPasswordStored(Boolean(sshConfig.passwordStored));
    setShowPassword(false);
    setSshTestResult(null);
  }, [sshConfig]);

  const scriptBaseline = useMemo(() => {
    if (!scriptConfig) return "";
    if (scriptConfig.source === "custom" && typeof scriptConfig.custom === "string") {
      return scriptConfig.custom;
    }
    return scriptConfig.default ?? scriptConfig.effective ?? "";
  }, [scriptConfig]);

  const scriptIsDirty = scriptConfig ? scriptDraft !== scriptBaseline : false;
  const scriptSourceLabel = scriptConfig?.source === "custom" ? "Benutzerdefiniert" : "Standard";

  const [superuserStatusLoading, setSuperuserStatusLoading] = useState(true);
  const [superuserExists, setSuperuserExists] = useState(false);
  const [superuserSummary, setSuperuserSummary] = useState(null);
  const [superuserStatusError, setSuperuserStatusError] = useState("");
  const [superuserDeleteLoading, setSuperuserDeleteLoading] = useState(false);
  const [setupResources, setSetupResources] = useState(null);
  const [setupResourcesLoading, setSetupResourcesLoading] = useState(true);
  const [setupResourcesError, setSetupResourcesError] = useState("");
  const [createServerName, setCreateServerName] = useState("");
  const [createServerUrl, setCreateServerUrl] = useState("");
  const [createServerApiKey, setCreateServerApiKey] = useState("");
  const [createServerError, setCreateServerError] = useState("");
  const [creatingServer, setCreatingServer] = useState(false);
  const [apiKeyDrafts, setApiKeyDrafts] = useState({});
  const [apiKeyUpdatingId, setApiKeyUpdatingId] = useState(null);
  const [serverDeleteId, setServerDeleteId] = useState(null);
  const [selfStackDraft, setSelfStackDraft] = useState("");
  const [selfStackSaving, setSelfStackSaving] = useState(false);
  const [selfStackError, setSelfStackError] = useState("");

  const setupServers = useMemo(() => {
    const items = Array.isArray(setupResources?.servers?.items) ? setupResources.servers.items : [];
    const assignments = Array.isArray(serverAssignments) && serverAssignments.length
      ? serverAssignments
      : Array.isArray(authUser?.serverAssignments)
        ? authUser.serverAssignments
        : [];
    const allowedIds = assignments
      .map((entry) => Number(entry?.serverId ?? entry?.server_id))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (allowedIds.length === 0) {
      return items;
    }
    const allowedSet = new Set(allowedIds);
    return items.filter((server) => allowedSet.has(Number(server.id)));
  }, [setupResources, authUser]);
  const apiKeyInfoMap = useMemo(() => {
    const items = setupResources?.apiKeys?.items ?? [];
    return new Map(items.map((entry) => [entry.serverId, entry]));
  }, [setupResources]);
  const setupComplete = useMemo(() => Boolean(setupResources?.setupComplete), [setupResources]);
  const selfStackInfo = setupResources?.selfStack ?? null;
  const currentSelfStackValue = selfStackInfo?.current ?? "";
  const envSelfStackValue = setupResources?.envDefaults?.selfStackId ?? "";

  const {
    page,
    perPage,
    perPageOptions,
    perPageIsAll,
    handlePerPageChange,
    setPage,
    setTotals,
    resetPagination
  } = usePage();

  useEffect(() => () => resetPagination(), [resetPagination]);

  const [searchQuery, setSearchQuery] = useState("");

  const [portainerStatus, setPortainerStatus] = useState(null);
  const [portainerLoading, setPortainerLoading] = useState(false);
  const [portainerError, setPortainerError] = useState("");
  const [portainerRefreshing, setPortainerRefreshing] = useState(false);
  const [portainerUpdatedAt, setPortainerUpdatedAt] = useState(null);
  const portainerRequestRef = useRef(null);

  const loadSuperuserStatus = useCallback(async () => {
    setSuperuserStatusLoading(true);
    setSuperuserStatusError("");
    try {
      const response = await axios.get("/api/auth/superuser/status");
      const exists = Boolean(response.data?.exists);
      setSuperuserExists(exists);
      setSuperuserSummary(exists ? response.data?.user ?? null : null);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Superuser-Status konnte nicht geladen werden";
      setSuperuserExists(false);
      setSuperuserSummary(null);
      setSuperuserStatusError(message);
    } finally {
      setSuperuserStatusLoading(false);
    }
  }, []);

  const loadSetupResources = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setSetupResourcesLoading(true);
    }
    setSetupResourcesError("");
    try {
      const data = await fetchSetupStatus();
      setSetupResources(data);
      setApiKeyDrafts({});
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Setup-Daten konnten nicht geladen werden";
      setSetupResourcesError(message);
      if (!silent) {
        showToast({
          variant: "error",
          title: "Setup-Daten",
          description: message
        });
      }
    } finally {
      setSetupResourcesLoading(false);
    }
  }, [fetchSetupStatus, showToast]);

  const fetchPortainerStatus = useCallback(async ({ silent = false } = {}) => {
    if (portainerRequestRef.current) {
      return portainerRequestRef.current;
    }

    const requestPromise = (async () => {
      if (silent) {
        setPortainerRefreshing(true);
      } else {
        setPortainerLoading(true);
      }
      setPortainerError("");

      try {
        const response = await axios.get("/api/maintenance/portainer-status");
        const payload = response.data ?? {};
        setPortainerStatus(payload);
        setPortainerUpdatedAt(new Date());
      } catch (err) {
        const message = err.response?.data?.error || err.message || "Fehler beim Prüfen des Portainer-Status";
        setPortainerError(message);
        showToast({ variant: "error", title: "Statusaktualisierung fehlgeschlagen", description: message });
      } finally {
        if (silent) {
          setPortainerRefreshing(false);
        } else {
          setPortainerLoading(false);
        }
        portainerRequestRef.current = null;
      }
    })();

    portainerRequestRef.current = requestPromise;
    return requestPromise;
  }, [showToast]);

  useEffect(() => {
    loadSuperuserStatus({ silent: true });
  }, [loadSuperuserStatus]);

  useEffect(() => {
    loadSetupResources();
  }, [loadSetupResources]);

  const filteredServers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return setupServers;
    }
    return setupServers.filter((server) => {
      const haystacks = [server.name, server.url].map((value) => String(value || "").toLowerCase());
      return haystacks.some((value) => value.includes(query));
    });
  }, [searchQuery, setupServers]);

  useEffect(() => {
    setTotals(filteredServers.length);
  }, [filteredServers.length, setTotals]);

  const paginatedServers = useMemo(() => {
    if (perPageIsAll) {
      return filteredServers;
    }
    const start = (page - 1) * perPage;
    return filteredServers.slice(start, start + perPage);
  }, [filteredServers, page, perPage, perPageIsAll]);

  useEffect(() => {
    setSelfStackDraft(currentSelfStackValue || "");
    setSelfStackError("");
  }, [currentSelfStackValue]);

  const selfStackDirty = selfStackDraft !== currentSelfStackValue;
  const handleSearchChange = useCallback((event) => {
    setSearchQuery(event.target.value);
  }, []);

  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    }
  }, [searchQuery, page, setPage]);

  const handleCreateServer = useCallback(async () => {
    if (!canEditServers || creatingServer) return;
    const name = (createServerName || "").trim();
    const url = (createServerUrl || "").trim();
    const apiKey = (createServerApiKey || "").trim();
    if (!url || !apiKey) {
      setCreateServerError("Bitte Name, URL und API-Key angeben.");
      return;
    }
    setCreateServerError("");
    setCreatingServer(true);
    try {
      await axios.post("/api/setup/servers", { name, url, apiKey });
      setCreateServerName("");
      setCreateServerUrl("");
      setCreateServerApiKey("");
      await loadSetupResources({ silent: true });
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message || "Server konnte nicht angelegt werden.";
      setCreateServerError(message);
    } finally {
      setCreatingServer(false);
    }
  }, [canEditServers, createServerApiKey, createServerName, createServerUrl, creatingServer, loadSetupResources]);

  const handleResetCreateServer = useCallback(() => {
    if (creatingServer) return;
    setCreateServerName("");
    setCreateServerUrl("");
    setCreateServerApiKey("");
    setCreateServerError("");
  }, [creatingServer]);

  const handleSshDraftChange = useCallback((field, value) => {
    if (!canManageSsh) return;
    setSshDraft((prev) => ({ ...prev, [field]: value }));
    if (field === 'password') {
      setSshPasswordStored(false);
    }
  }, [canManageSsh]);

  const normalizedSshDraft = useMemo(() => {
    const normalized = {
      host: sshDraft.host.trim(),
      port: Number.parseInt(sshDraft.port, 10) || 22,
      username: sshDraft.username.trim(),
      extraSshArgs: (sshDraft.extraSshArgs || '')
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    };

    const rawPassword = sshDraft.password ?? '';
    if (rawPassword) {
      normalized.password = rawPassword;
    } else if (!sshPasswordStored) {
      normalized.password = '';
    }

    return normalized;
  }, [sshDraft, sshPasswordStored]);

  const handleScriptSave = useCallback(async () => {
    if (!canManageSsh) return;
    if (!scriptConfig) return;
    try {
      setScriptSaving(true);
      await saveScript(scriptDraft);
      showToast({
        variant: "success",
        title: "Skript gespeichert",
        description: "Das benutzerdefinierte Portainer-Update-Skript wurde aktualisiert."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Skript konnte nicht gespeichert werden";
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setScriptSaving(false);
    }
  }, [canManageSsh, saveScript, scriptDraft, scriptConfig, showToast]);

  const handleScriptReset = useCallback(async () => {
    if (!canManageSsh) return;
    try {
      setScriptSaving(true);
      await resetScript();
      showToast({
        variant: "info",
        title: "Standardskript wiederhergestellt",
        description: "Es wird wieder das Standard-Update-Skript verwendet."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Standardskript konnte nicht wiederhergestellt werden";
      showToast({ variant: "error", title: "Zurücksetzen fehlgeschlagen", description: message });
    } finally {
      setScriptSaving(false);
    }
  }, [canManageSsh, resetScript, showToast]);

  const handleSshSaveConfig = useCallback(async () => {
    if (!canManageSsh) return;
    try {
      setSshSaving(true);
      await saveSshConfig(normalizedSshDraft);
      setSshTestResult(null);
      setShowPassword(false);
      showToast({
        variant: "success",
        title: "SSH-Konfiguration gespeichert",
        description: "Verbindungseinstellungen wurden aktualisiert."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "SSH-Konfiguration konnte nicht gespeichert werden";
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setSshSaving(false);
    }
  }, [canManageSsh, normalizedSshDraft, saveSshConfig, showToast]);

  const handleSshTestConnection = useCallback(async () => {
    if (!canManageSsh) return;
    try {
      setSshTesting(true);
      const result = await testSshConnection(normalizedSshDraft);
      setSshTestResult({ success: true, timestamp: new Date(), details: result?.result });
      showToast({
        variant: "success",
        title: "SSH-Verbindung erfolgreich",
        description: "Verbindung zum Portainer-Host wurde hergestellt."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "SSH-Verbindung fehlgeschlagen";
      setSshTestResult({ success: false, timestamp: new Date(), error: message });
      showToast({ variant: "error", title: "SSH-Test fehlgeschlagen", description: message });
    } finally {
      setSshTesting(false);
    }
  }, [canManageSsh, normalizedSshDraft, testSshConnection, showToast]);

  const handleSshDeleteConfig = useCallback(async () => {
    if (!canManageSsh) return;
    try {
      setSshDeleting(true);
      await deleteSshConfig();
      setSshDraft(createEmptySshDraft());
      setSshPasswordStored(false);
      setShowPassword(false);
      setSshTestResult(null);
      showToast({
        variant: "info",
        title: "SSH-Konfiguration gelöscht",
        description: "Die Verbindungseinstellungen wurden zurückgesetzt."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "SSH-Konfiguration konnte nicht gelöscht werden";
      showToast({ variant: "error", title: "Löschen fehlgeschlagen", description: message });
    } finally {
      setSshDeleting(false);
    }
  }, [canManageSsh, deleteSshConfig, showToast]);

  const handleSuperuserDelete = useCallback(async () => {
    if (!canDeleteSuperuser || superuserDeleteLoading || superuserStatusLoading || !superuserExists) {
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Superuser und zugehörige Gruppe wirklich löschen?\nDies setzt die Superuser-Einrichtung zurück."
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      setSuperuserDeleteLoading(true);
      const response = await removeSuperuserAccount();
      const removedUsers = Number(response?.usersRemoved ?? 0);
      showToast({
        variant: "success",
        title: "Superuser gelöscht",
        description: removedUsers > 1
          ? `${removedUsers} Konten aus der Superuser-Gruppe wurden entfernt.`
          : "Superuser-Konto wurde entfernt."
      });
      await loadSuperuserStatus({ silent: true });
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        await loadSuperuserStatus({ silent: true });
        showToast({
          variant: "info",
          title: "Kein Superuser vorhanden",
          description: "Es ist kein Superuser mehr vorhanden."
        });
      } else {
        const message = err.response?.data?.error || err.message || "Superuser konnte nicht gelöscht werden";
        showToast({ variant: "error", title: "Löschen fehlgeschlagen", description: message });
      }
    } finally {
      setSuperuserDeleteLoading(false);
    }
  }, [canDeleteSuperuser, superuserDeleteLoading, superuserStatusLoading, superuserExists, removeSuperuserAccount, loadSuperuserStatus, showToast]);

  const handleDeleteServer = useCallback(async (serverId) => {
    if (!canDeleteServers) {
      return;
    }
    if (serverDeleteId === serverId) {
      return;
    }
    const target = setupServers.find((entry) => entry.id === serverId);
    if (!target) {
      return;
    }
    const label = target.name || target.url || `Server ${serverId}`;
    const confirmMessage = [
      `Server "${label}" wirklich löschen?`,
      "Das System benötigt anschließend erneut einen gültigen Server im Setup."
    ].filter(Boolean).join("\n");

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) {
        return;
      }
    }

    setServerDeleteId(serverId);
    try {
      await deleteSetupServer(serverId);
      showToast({
        variant: "success",
        title: "Server gelöscht",
        description: `Server "${label}" wurde entfernt.`
      });
      await loadSetupResources({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Server konnte nicht gelöscht werden.";
      showToast({
        variant: "error",
        title: "Server löschen fehlgeschlagen",
        description: message
      });
    } finally {
      setServerDeleteId(null);
    }
  }, [canDeleteServers, deleteSetupServer, loadSetupResources, serverDeleteId, setupServers, showToast]);

  const handleApiKeyDraftChange = useCallback((serverId, value) => {
    if (!canEditServers) return;
    setApiKeyDrafts((prev) => ({
      ...prev,
      [serverId]: value
    }));
  }, [canEditServers]);

  const handleApiKeyUpdate = useCallback(async (serverId) => {
    if (!canEditServers) {
      return;
    }
    const draft = (apiKeyDrafts[serverId] ?? "").trim();
    if (!draft) {
      showToast({
        variant: "warning",
        title: "API-Key fehlt",
        description: "Bitte gib einen API-Key ein."
      });
      return;
    }
    if (apiKeyUpdatingId === serverId) {
      return;
    }

    setApiKeyUpdatingId(serverId);
    try {
      await updateSetupApiKey(serverId, draft);
      showToast({
        variant: "success",
        title: "API-Key aktualisiert",
        description: "Der API-Key wurde gespeichert."
      });
      setApiKeyDrafts((prev) => ({
        ...prev,
        [serverId]: ""
      }));
      await loadSetupResources({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "API-Key konnte nicht aktualisiert werden.";
      showToast({
        variant: "error",
        title: "Aktualisierung fehlgeschlagen",
        description: message
      });
    } finally {
      setApiKeyUpdatingId(null);
    }
  }, [apiKeyDrafts, apiKeyUpdatingId, canEditServers, loadSetupResources, showToast, updateSetupApiKey]);

  const handleSelfStackDraftChange = useCallback((value) => {
    if (!canEditServers) return;
    setSelfStackDraft(value);
    setSelfStackError("");
  }, [canEditServers]);

  const handleSelfStackSave = useCallback(async () => {
    if (!canEditServers || !selfStackDirty) {
      return;
    }
    setSelfStackSaving(true);
    setSelfStackError("");
    const normalizedValue = typeof selfStackDraft === "string" ? selfStackDraft.trim() : "";
    try {
      await updateSelfStackId(normalizedValue);
      showToast({
        variant: "success",
        title: "Self-Stack-ID gespeichert",
        description: normalizedValue
          ? `Self-Stack-ID wurde auf "${normalizedValue}" gesetzt.`
          : "Self-Stack-ID wurde entfernt."
      });
      await loadSetupResources({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Self-Stack-ID konnte nicht aktualisiert werden.";
      setSelfStackError(message);
      showToast({
        variant: "error",
        title: "Self-Stack-ID",
        description: message
      });
    } finally {
      setSelfStackSaving(false);
    }
  }, [canEditServers, loadSetupResources, selfStackDirty, selfStackDraft, showToast, updateSelfStackId]);

  const handleSelfStackRemove = useCallback(async () => {
    if (!canEditServers) {
      return;
    }
    if (!selfStackDraft && !currentSelfStackValue) {
      return;
    }
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Self-Stack-ID wirklich entfernen?");
      if (!confirmed) {
        return;
      }
    }
    setSelfStackSaving(true);
    setSelfStackError("");
    try {
      await updateSelfStackId("");
      setSelfStackDraft("");
      showToast({
        variant: "success",
        title: "Self-Stack-ID entfernt",
        description: "Die Self-Stack-ID wurde gelöscht."
      });
      await loadSetupResources({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Self-Stack-ID konnte nicht entfernt werden.";
      setSelfStackError(message);
      showToast({
        variant: "error",
        title: "Self-Stack-ID",
        description: message
      });
    } finally {
      setSelfStackSaving(false);
    }
  }, [canEditServers, currentSelfStackValue, loadSetupResources, selfStackDraft, showToast, updateSelfStackId]);

  const handleMaintenanceToggle = useCallback(async (nextActive) => {
    if (!canControlMaintenance) return;
    if (maintenanceLoading || maintenanceToggleLoading) return;
    if (nextActive === maintenanceActive) return;
    if (updateRunning) {
      showToast({
        variant: "warning",
        title: "Aktion nicht möglich",
        description: "Während eines laufenden Updates kann der Wartungsmodus nicht geändert werden."
      });
      return;
    }

    setMaintenanceToggleLoading(true);
    try {
      const shouldPreserveMessage = nextActive && Boolean(maintenanceExtraType);
      const payload = { active: nextActive };

      if (shouldPreserveMessage && maintenanceMessage) {
        payload.message = maintenanceMessage;
      } else {
        payload.message = null;
      }

      await setMaintenanceMode(payload);
      showToast({
        variant: nextActive ? "info" : "success",
        title: nextActive ? "Wartungsmodus aktiviert" : "Wartungsmodus deaktiviert",
        description: nextActive
          ? "Benutzer sehen jetzt die Wartungsseite."
          : "StackPulse steht wieder zur Verfügung."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Wartungsmodus konnte nicht geändert werden";
      showToast({ variant: "error", title: "Änderung fehlgeschlagen", description: message });
    } finally {
      setMaintenanceToggleLoading(false);
    }
  }, [canControlMaintenance, maintenanceLoading, maintenanceToggleLoading, maintenanceActive, updateRunning, setMaintenanceMode, maintenanceMessage, maintenanceExtraType, showToast]);

  const handleTriggerUpdate = useCallback(async () => {
    if (!canManagePortainerUpdate) {
      return;
    }
    if (maintenanceActive || updateRunning) {
      showToast({
        variant: "warning",
        title: "Update nicht möglich",
        description: "Während eines aktiven Wartungsmodus kann kein weiteres Update gestartet werden."
      });
      return;
    }

    const targetVersion = portainerStatus?.latestVersion ?? portainerStatus?.currentVersion ?? "unbekannt";
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Portainer-Update starten?\nZielversion: ${targetVersion}.\nWährend des Updates befindet sich StackPulse im Wartungsmodus.\nFortfahren?`
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      setUpdateActionError("");
      setUpdateActionLoading(true);
      await triggerUpdate();
      showToast({
        variant: "info",
        title: "Update gestartet",
        description: "Das Portainer-Update wurde gestartet."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Portainer-Update konnte nicht gestartet werden";
      setUpdateActionError(message);
      showToast({ variant: "error", title: "Update fehlgeschlagen", description: message });
    } finally {
      setUpdateActionLoading(false);
    }
  }, [canManagePortainerUpdate, maintenanceActive, updateRunning, portainerStatus, triggerUpdate, showToast]);

  const maintenanceActivatedAt = maintenanceMeta?.activatedAt ? formatCreatedAt(maintenanceMeta.activatedAt) : null;
  const maintenanceUpdatedAt = maintenanceMeta?.updatedAt ? formatCreatedAt(maintenanceMeta.updatedAt) : null;

  const updateStatusKey = updateState?.status ?? (updateRunning ? "running" : "idle");
  const updateStatusLabel = UPDATE_STATUS_LABELS[updateStatusKey] ?? updateStatusKey;
  const updateBadgeClass = UPDATE_STATUS_STYLES[updateStatusKey] ?? UPDATE_STATUS_STYLES.idle;
  const updateStageLabel = updateState?.stage
    ? UPDATE_STAGE_LABELS[updateState.stage] ?? updateState.stage
    : "–";
  const updateLogs = updateState?.logs ?? [];
  const updateTargetVersion = updateState?.targetVersion ?? "-";
  const updateResultVersion = updateState?.resultVersion ?? "-";
  const updateStartedAt = updateState?.startedAt ? formatCreatedAt(updateState.startedAt) : "-";
  const updateFinishedAt = updateState?.finishedAt ? formatCreatedAt(updateState.finishedAt) : "-";
  const updateStatusMessage = updateState?.message ?? (updateRunning ? "Update läuft…" : "");

  const disableUpdateButton = updateRunning || scriptSaving || maintenanceLoading;

  if (!canViewMaintenance) {
    return null;
  }

  return (

    <div className="mt-12 mb-8 flex flex-col gap-12">
      {(maintenanceActive || updateRunning) && (
        <div className="rounded-lg border border-cyan-500/60 bg-cyan-900/30 px-4 py-3 text-sm text-bluegray-100">
          <div className="flex flex-col gap-1">
            <span>
              Wartungsmodus aktiv{maintenanceMessage ? ` – ${maintenanceMessage}` : updateRunning ? " – Portainer-Update läuft" : ""}.
            </span>
            {updateRunning && (
              <span className="text-xs text-indigo-900">
                Phase: {updateStageLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {canViewMaintenance && (
        <Card>
          <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
            <Typography
              variant="h6"
              color="white"
              className="flex items-center justify-between"
            >
              <span>Wartungsmodus</span>

            </Typography>
          </CardHeader>
          <CardBody className="flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm antialiased font-sans text-sm font-light leading-normal text-inherit">
                  Schaltet StackPulse für Benutzer in den Wartungsmodus.
                </p>
              </div>
              <Switch
                checked={maintenanceActive}
                disabled={!canControlMaintenance || maintenanceToggleLoading || maintenanceLoading || updateRunning}
                onChange={(event) => handleMaintenanceToggle(event.target.checked)}
                ripple={false}
                color="amber"
              />
            </div>
            {maintenanceToggleLoading && (
              <p className="text-xs text-stormGrey-500">Wartungsmodus wird aktualisiert…</p>
            )}
          </CardBody>
        </Card>
      )}

      {canViewMtls && (
        <Card>
          <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
            <Typography variant="h6" color="white">
              mTLS-Serverzertifikate (Backend)
            </Typography>
          </CardHeader>
          <CardBody className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <Typography variant="small" color="blue-gray" className="font-semibold uppercase">
                  Status
                </Typography>
                <p className="text-sm text-stormGrey-600">
                  {mtlsMeta.available ? "Zertifikate vorhanden" : "Keine Zertifikate geladen"}
                </p>
                <p className="text-xs text-stormGrey-500">
                  Quelle: {mtlsMeta.source || "unbekannt"} {mtlsMeta.updatedAt ? `– aktualisiert ${formatCreatedAt(mtlsMeta.updatedAt)}` : ""} {mtlsMeta.validTo ? `– gültig bis ${formatCreatedAt(mtlsMeta.validTo)}` : ""}
                </p>
              </div>
              <Chip
                value={mtlsMeta.available ? "Verfügbar" : "Nicht verfügbar"}
                color={mtlsMeta.available ? "green" : "red"}
                size="sm"
                variant="ghost"
                className="w-fit px-3"
              />
            </div>
            {mtlsError && (
              <p className="text-xs text-sunsetCoral-600">{mtlsError}</p>
            )}
            {mtlsSecret && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-blue-gray-500">Server-Key</span>
                  <textarea
                    readOnly
                    value={mtlsSecret.key || ""}
                    className="w-full rounded-md border border-blue-gray-100 p-2 font-mono text-xs text-blue-gray-800"
                    rows={8}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-blue-gray-500">Server-Zertifikat</span>
                  <textarea
                    readOnly
                    value={mtlsSecret.cert || ""}
                    className="w-full rounded-md border border-blue-gray-100 p-2 font-mono text-xs text-blue-gray-800"
                    rows={8}
                  />
                </div>
              </div>
            )}
            {!mtlsSecret && (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-blue-gray-100 bg-blue-gray-50/60 p-3 text-sm text-blue-gray-500">
                  <span className="font-mono">******</span>
                </div>
                <div className="rounded-md border border-blue-gray-100 bg-blue-gray-50/60 p-3 text-sm text-blue-gray-500">
                  <span className="font-mono">******</span>
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3 md:items-end">
              <Input
                type="password"
                label="Benutzerpasswort"
                value={mtlsPassword}
                onChange={(e) => setMtlsPassword(e.target.value)}
                disabled={!canRevealMtls || mtlsLoading || mtlsDownloadLoading}
              />
              <Button
                color="blue"
                onClick={handleRevealMtls}
                disabled={!canRevealMtls || !mtlsPassword || mtlsLoading}
              >
                {mtlsLoading ? "Prüfe…" : "Anzeigen"}
              </Button>
              <Button
                variant="outlined"
                color="gray"
                onClick={handleDownloadMtls}
                disabled={!canRevealMtls || !mtlsPassword || mtlsDownloadLoading}
              >
                {mtlsDownloadLoading ? "Bereite Download vor…" : "Als ZIP herunterladen"}
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              <Typography variant="small" color="blue-gray" className="font-semibold uppercase">
                Eigene Zertifikate hochladen
              </Typography>
              <p className="text-xs text-stormGrey-600">
                Lade Private Key und Zertifikat (PEM) hoch. Beide Felder sind Pflicht. Bestehende Custom-Zertifikate werden nicht mehr überschrieben.
              </p>
              <div className="grid gap-2">
                <Input
                  type="file"
                  accept=".pem"
                  crossOrigin=""
                  label="Private Key (.pem)"
                  className="cursor-pointer [&::-webkit-file-upload-button]:hidden [&::file-selector-button]:hidden"
                  inputRef={(el) => { fileInputs.current[0] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setMtlsUpload((prev) => ({ ...prev, key: ev.target?.result || "" }));
                    };
                    reader.readAsText(file);
                  }}
                  disabled={mtlsUploadLoading}
                />
              </div>
              <div className="grid gap-2">
                <Input
                  type="file"
                  accept=".pem"
                  crossOrigin=""
                  label="Zertifikat (.pem)"
                  className="cursor-pointer [&::-webkit-file-upload-button]:hidden [&::file-selector-button]:hidden"
                  inputRef={(el) => { fileInputs.current[1] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setMtlsUpload((prev) => ({ ...prev, cert: ev.target?.result || "" }));
                    };
                    reader.readAsText(file);
                  }}
                  disabled={mtlsUploadLoading}
                />
              </div>
              {mtlsUploadError && <p className="text-xs text-sunsetCoral-600">{mtlsUploadError}</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  color="blue"
                  onClick={handleUploadMtls}
                  disabled={mtlsUploadLoading || !mtlsUpload.key.trim() || !mtlsUpload.cert.trim()}
                  className="w-full sm:w-auto"
                >
                  {mtlsUploadLoading ? "Lade hoch…" : "Zertifikate speichern"}
                </Button>
                <Button
                  variant="outlined"
                  color="gray"
                  onClick={handleResetMtls}
                  disabled={mtlsResetLoading || mtlsMeta.source !== "custom"}
                  className="w-full sm:w-auto"
                >
                  {mtlsResetLoading ? "Erzeuge neu…" : "Custom-Zertifikate löschen & neu generieren"}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {canViewServers && (
        <Card>
          <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
            <Typography variant="h6" color="white" className="flex items-center justify-between">
              <span>Server</span>
              <Typography variant="small" color="white">
                {setupServers.length} vorhanden
              </Typography>
            </Typography>
          </CardHeader>
          <CardBody className="p-4">
            {canEditServers && (
              <div className="mb-8 rounded-lg border border-blue-gray-50 p-4">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  Neuen Server hinzufügen
                </Typography>
                <p className="text-sm text-stormGrey-600 mb-4">
                  Hinterlege deine Portainer-Instanz. Die Verbindung wird beim Speichern automatisch geprüft.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <Input
                    label="Servername"
                    value={createServerName}
                    onChange={(event) => setCreateServerName(event.target.value)}
                    disabled={creatingServer || maintenanceLocked}
                    crossOrigin=""
                  />
                  <Input
                    label="Server-URL oder IP"
                    value={createServerUrl}
                    onChange={(event) => setCreateServerUrl(event.target.value)}
                    disabled={creatingServer || maintenanceLocked}
                    crossOrigin=""
                  />
                  <Input
                    type="password"
                    label="Portainer API-Key"
                    value={createServerApiKey}
                    onChange={(event) => setCreateServerApiKey(event.target.value)}
                    disabled={creatingServer || maintenanceLocked}
                    crossOrigin=""
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    color="green"
                    onClick={handleCreateServer}
                    disabled={creatingServer || maintenanceLocked}
                  >
                    {creatingServer ? "Verifiziere …" : "Server anlegen"}
                  </Button>
                  <Button
                    variant="text"
                    color="blue-gray"
                    onClick={handleResetCreateServer}
                    disabled={creatingServer}
                  >
                    Formular zurücksetzen
                  </Button>
                </div>
                {createServerError && (
                  <p className="mt-2 text-sm text-sunsetCoral-600">{createServerError}</p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="md:flex-1">
                <Input
                  label="Suchen nach Name oder URL"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  crossOrigin=""
                />
              </div>
              <div className="md:mt-0 mt-4 md:flex-1">
                <Select variant="static" label="Einträge pro Seite" onChange={handlePerPageChange} value={perPage}>
                  {perPageOptions.map(({ value, label }) => (
                    <Option key={value} value={value}>
                      {label}
                    </Option>
                  ))}
                </Select>
              </div>
            </div>

            {setupResourcesError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {setupResourcesError}
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-blue-gray-50 mt-6">
              <table className="w-full min-w-[520px] table-auto text-left">
                <thead>
                  <tr className="bg-blue-gray-50/50 text-xs uppercase tracking-wide text-stormGrey-400">
                    <th className="px-6 py-4 font-semibold">Name</th>
                    <th className="px-6 py-4 font-semibold">IP / Host</th>
                    <th className="px-6 py-4 font-semibold text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {setupResourcesLoading ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-blue-gray-400">
                        Server werden geladen ...
                      </td>
                    </tr>
                  ) : filteredServers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-blue-gray-400">
                        Keine Server gefunden.
                      </td>
                    </tr>
                  ) : (
                    paginatedServers.map((server, index) => {
                      const rowClass = index === paginatedServers.length - 1 ? "" : "border-b border-blue-gray-50";
                      const hostLabel = (() => {
                        try {
                          const parsed = new URL(server.url);
                          return parsed.hostname || server.url;
                        } catch {
                          return server.url;
                        }
                      })();
                      return (
                        <tr key={server.id} className={`text-sm text-stormGrey-700 ${rowClass}`}>
                          <td className="px-6 py-4">
                            <Typography variant="small" className="font-medium text-stormGrey-900">
                              {server.name || "–"}
                            </Typography>
                            <Typography variant="small" className="text-xs text-stormGrey-500">
                              {server.url}
                            </Typography>
                          </td>
                          <td className="px-6 py-4">
                            <Typography variant="small">{hostLabel || "–"}</Typography>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outlined"
                                color="blue-gray"
                                onClick={() => navigate(`/dashboard/maintenance/servers/${server.id}`)}
                                disabled={!canEditServers}
                              >
                                Bearbeiten
                              </Button>
                              <Button
                                size="sm"
                                variant="text"
                                color="red"
                                onClick={() => handleDeleteServer(server.id)}
                                disabled={maintenanceLocked || !canDeleteServers || serverDeleteId === server.id}
                              >
                                {serverDeleteId === server.id ? "Lösche…" : "Löschen"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Typography variant="small" color="blue-gray" className="text-sm">
                {perPageIsAll ? "Alle Server" : `${paginatedServers.length} von ${filteredServers.length}`} angezeigt
              </Typography>
              <PaginationControls />
            </div>
          </CardBody>
        </Card>
      )}

      {canDeleteSuperuser && (
        <Card>
          <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
            <Typography
              variant="h6"
              color="white"
              className="flex items-center justify-between"
            >
              <span>Superuser</span>

            </Typography>
          </CardHeader>
          <CardBody className="flex flex-col gap-4 p-4">
            <div className="space-y-2">
              {superuserStatusLoading && (
                <p className="text-sm text-stormGrey-500">Status wird geladen…</p>
              )}
              {!superuserStatusLoading && superuserStatusError && (
                <p className="text-sm text-sunsetCoral-600">{superuserStatusError}</p>
              )}
              {!superuserStatusLoading && !superuserStatusError && superuserExists && (
                <div className="space-y-1">
                  <p className="text-sm">Superuser ist angelegt.</p>
                  <p className="text-xs text-stormGrey-500">
                    Benutzername: <span className="font-medium text-stormGrey-900">{superuserSummary?.username ?? "unbekannt"}</span>
                    {superuserSummary?.email ? ` - ${superuserSummary.email}` : ""}
                  </p>
                </div>
              )}
              {!superuserStatusLoading && !superuserStatusError && !superuserExists && (
                <p className="text-sm">Es ist kein Superuser vorhanden.</p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                color="red"
                onClick={handleSuperuserDelete}
                disabled={maintenanceLocked || !canDeleteSuperuser || superuserStatusLoading || superuserDeleteLoading || !superuserExists}
                className="w-full sm:w-auto"
              >
                {superuserDeleteLoading ? "Wird gelöscht…" : "Superuser löschen"}
              </Button>
            </div>
            <span className="text-xs text-stormGrey-500">
              Entfernt das Superuser-Konto samt zugehöriger Gruppe. Danach kann der Erstbenutzer bei Bedarf erneut angelegt werden.
            </span>
          </CardBody>
        </Card>
      )}

    </div>
  );


}

export default Maintenance;
