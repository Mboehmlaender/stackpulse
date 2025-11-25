import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider";
import { useToast } from "@/components/ToastProvider.jsx";

import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Alert,
  Chip
} from "@material-tailwind/react";

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
  host: "",
  port: "22",
  username: "",
  password: "",
  extraSshArgs: ""
});

export function ServerDetail() {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const selectedServerId = useMemo(() => {
    const numeric = Number(serverId);
    return Number.isFinite(numeric) ? numeric : null;
  }, [serverId]);

  const { hasPermission, user: authUser } = useAuth();
  const { deleteSetupServer, updateSetupApiKey } = useMaintenance();
  const { showToast } = useToast();

  const isSuperuserAccount = Boolean(authUser?.isSuperuser);
  const canViewServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-manage", "read"));
  const canEditServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-edit", "full"));
  const canDeleteServers = Boolean(isSuperuserAccount || hasPermission("maintenance-server-delete", "full"));
  const canViewSsh = Boolean(isSuperuserAccount || hasPermission("maintenance-ssh-update", "read"));
  const canManageSsh = Boolean(isSuperuserAccount || hasPermission("maintenance-ssh-update", "full"));

  const [serverDetail, setServerDetail] = useState(null);
  const [apiKeyMeta, setApiKeyMeta] = useState(null);
  const [serverLoading, setServerLoading] = useState(true);
  const [serverError, setServerError] = useState("");
  const [serverSaving, setServerSaving] = useState(false);
  const [serverDeleteId, setServerDeleteId] = useState(null);

  const [serverDraft, setServerDraft] = useState({ name: "", url: "" });

  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);

  const [statusData, setStatusData] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusFetchedAt, setStatusFetchedAt] = useState(null);

  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptSaving, setScriptSaving] = useState(false);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [scriptConfig, setServerScriptConfig] = useState(null);

  const [agentConfig, setAgentConfig] = useState(null);
  const [agentDraft, setAgentDraft] = useState({ agentUrl: "", agentToken: "" });
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);

  const [serverSshConfig, setServerSshConfig] = useState(null);
  const [sshDraft, setSshDraft] = useState(() => createEmptySshDraft());
  const [sshPasswordStored, setSshPasswordStored] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sshSaving, setSshSaving] = useState(false);
  const [sshTesting, setSshTesting] = useState(false);
  const [sshDeleting, setSshDeleting] = useState(false);
  const [sshTestResult, setSshTestResult] = useState(null);
  const [sshConfigLoading, setSshConfigLoading] = useState(false);
  const [sshConfigError, setSshConfigError] = useState("");

  const loadServerDetail = useCallback(async () => {
    if (!selectedServerId) {
      setServerDetail(null);
      setApiKeyMeta(null);
      return;
    }
    setServerLoading(true);
    setServerError("");
    try {
      const response = await axios.get(`/api/setup/servers/${selectedServerId}`);
      setServerDetail(response.data?.server ?? null);
      setApiKeyMeta(response.data?.apiKey ?? null);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Serverdetails konnten nicht geladen werden";
      setServerError(message);
      setServerDetail(null);
      setApiKeyMeta(null);
    } finally {
      setServerLoading(false);
    }
  }, [selectedServerId]);

  const loadServerStatus = useCallback(async ({ silent = false } = {}) => {
    if (!selectedServerId) {
      setStatusData(null);
      setStatusError("");
      setStatusFetchedAt(null);
      return;
    }
    if (!silent) {
      setStatusLoading(true);
    }
    setStatusError("");
    try {
      const response = await axios.get(`/api/setup/servers/${selectedServerId}/check`);
      setStatusData(response.data ?? null);
      setStatusFetchedAt(new Date());
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Status konnte nicht ermittelt werden";
      setStatusError(message);
      setStatusData(null);
      setStatusFetchedAt(null);
    } finally {
      setStatusLoading(false);
    }
  }, [selectedServerId]);

  const loadAgentConfig = useCallback(async () => {
    if (!selectedServerId) {
      setAgentConfig(null);
      setAgentDraft({ agentUrl: "", agentToken: "" });
      return;
    }
    setAgentLoading(true);
    setAgentError("");
    try {
      const response = await axios.get(`/api/servers/${selectedServerId}/agent`);
      const payload = response.data ?? null;
      setAgentConfig(payload);
      setAgentDraft({
        agentUrl: payload?.agentUrl ?? "",
        agentToken: payload?.agentToken ?? ""
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Agent konnte nicht geladen werden";
      setAgentError(message);
      setAgentConfig(null);
      setAgentDraft({ agentUrl: "", agentToken: "" });
    } finally {
      setAgentLoading(false);
    }
  }, [selectedServerId]);

  const loadServerScript = useCallback(async () => {
    if (!selectedServerId) {
      setServerScriptConfig(null);
      setScriptDraft("");
      return;
    }
    setScriptLoading(true);
    setScriptError("");
    try {
      const response = await axios.get(`/api/setup/servers/${selectedServerId}/update-script`);
      const payload = response.data?.script ?? null;
      setServerScriptConfig(payload);
      const nextValue = payload?.custom ?? payload?.default ?? payload?.effective ?? "";
      setScriptDraft(nextValue);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Update-Skript konnte nicht geladen werden";
      setScriptError(message);
      setServerScriptConfig(null);
      setScriptDraft("");
    } finally {
      setScriptLoading(false);
    }
  }, [selectedServerId]);

  const loadServerSshConfig = useCallback(async () => {
    if (!selectedServerId) {
      setServerSshConfig(null);
      return;
    }
    setSshConfigLoading(true);
    setSshConfigError("");
    try {
      const response = await axios.get(`/api/setup/servers/${selectedServerId}/ssh-config`);
      setServerSshConfig(response.data?.ssh ?? null);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "SSH-Konfiguration konnte nicht geladen werden";
      setSshConfigError(message);
      setServerSshConfig(null);
    } finally {
      setSshConfigLoading(false);
    }
  }, [selectedServerId]);

  useEffect(() => {
    loadServerDetail();
  }, [loadServerDetail]);

  useEffect(() => {
    loadServerStatus();
  }, [loadServerStatus]);

  useEffect(() => {
    loadServerScript();
  }, [loadServerScript]);

  useEffect(() => {
    loadServerSshConfig();
  }, [loadServerSshConfig]);

  useEffect(() => {
    loadAgentConfig();
  }, [loadAgentConfig]);

  useEffect(() => {
    if (!serverDetail) {
      setServerDraft({ name: "", url: "" });
      return;
    }
    setServerDraft({
      name: serverDetail.name || "",
      url: serverDetail.url || ""
    });
  }, [serverDetail]);

  useEffect(() => {
    if (!serverSshConfig) {
      setSshDraft(createEmptySshDraft());
      setSshPasswordStored(false);
      setShowPassword(false);
      setSshTestResult(null);
      return;
    }
    setSshDraft({
      host: serverSshConfig.host ?? "",
      port: String(serverSshConfig.port ?? "22"),
      username: serverSshConfig.username ?? "",
      password: "",
      extraSshArgs: Array.isArray(serverSshConfig.extraSshArgs) ? serverSshConfig.extraSshArgs.join("\n") : ""
    });
    setSshPasswordStored(Boolean(serverSshConfig.passwordStored));
    setShowPassword(false);
    setSshTestResult(null);
  }, [serverSshConfig]);

  const scriptBaseline = useMemo(() => {
    if (!scriptConfig) return "";
    if (scriptConfig.source === "custom" && typeof scriptConfig.custom === "string") {
      return scriptConfig.custom;
    }
    return scriptConfig.default ?? scriptConfig.effective ?? "";
  }, [scriptConfig]);

  const scriptIsDirty = scriptConfig ? scriptDraft !== scriptBaseline : false;
  const scriptSourceLabel = scriptConfig?.source === "custom" ? "Benutzerdefiniert" : "Standard";

  const serverDirty = serverDetail
    ? (serverDraft.name || "").trim() !== (serverDetail.name || "")
    || (serverDraft.url || "").trim() !== (serverDetail.url || "")
    : false;

  const hostLabel = useMemo(() => {
    if (!serverDetail?.url) return "-";
    try {
      const parsed = new URL(serverDetail.url);
      return parsed.hostname || serverDetail.url;
    } catch {
      return serverDetail.url;
    }
  }, [serverDetail]);
  const portainerEditionLabel = statusData?.portainer?.edition ?? "-";
  const isCommunityEdition = (portainerEditionLabel || "").toLowerCase().includes("community");
  const agentOnline = statusData?.agent?.online ?? agentConfig?.online ?? null;
  const agentStatusLabel = agentOnline === true ? "Agent online" : agentOnline === false ? "Agent offline" : "Unbekannt";

  const normalizedSshDraft = useMemo(() => {
    const normalized = {
      host: sshDraft.host.trim(),
      port: Number.parseInt(sshDraft.port, 10) || 22,
      username: sshDraft.username.trim(),
      extraSshArgs: (sshDraft.extraSshArgs || "")
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    };

    const rawPassword = sshDraft.password ?? "";
    if (rawPassword) {
      normalized.password = rawPassword;
    } else if (!sshPasswordStored) {
      normalized.password = "";
    }

    return normalized;
  }, [sshDraft, sshPasswordStored]);

  const handleServerDraftChange = useCallback((field, value) => {
    if (!canEditServers) return;
    setServerDraft((prev) => ({ ...prev, [field]: value }));
  }, [canEditServers]);

  const handleServerSave = useCallback(async () => {
    if (!canEditServers || !selectedServerId || !serverDirty) {
      return;
    }
    setServerSaving(true);
    try {
      await axios.put(`/api/setup/servers/${selectedServerId}`, {
        name: serverDraft.name?.trim() ?? "",
        url: serverDraft.url?.trim() ?? ""
      });
      showToast({
        variant: "success",
        title: "Server gespeichert",
        description: "Serverdetails wurden aktualisiert."
      });
      await loadServerDetail();
      await loadServerStatus({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Server konnte nicht aktualisiert werden";
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setServerSaving(false);
    }
  }, [canEditServers, selectedServerId, serverDirty, serverDraft, loadServerDetail, loadServerStatus, showToast]);

  const handleAgentDraftChange = useCallback((field, value) => {
    setAgentDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleAgentSave = useCallback(async () => {
    if (!selectedServerId) return;
    setAgentSaving(true);
    try {
      await axios.put(`/api/servers/${selectedServerId}/agent`, {
        agentUrl: agentDraft.agentUrl
      });
      showToast({
        variant: "success",
        title: "Agent gespeichert",
        description: "Agent-Einstellungen wurden aktualisiert."
      });
      await loadAgentConfig();
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Agent konnte nicht aktualisiert werden";
      showToast({ variant: "error", title: "Agent speichern fehlgeschlagen", description: message });
    } finally {
      setAgentSaving(false);
    }
  }, [selectedServerId, agentDraft, loadAgentConfig, showToast]);

  const handleApiKeySave = useCallback(async () => {
    if (!canEditServers || !selectedServerId) {
      return;
    }
    const draft = (apiKeyDraft || "").trim();
    if (!draft) {
      showToast({
        variant: "warning",
        title: "API-Key fehlt",
        description: "Bitte gib einen API-Key ein."
      });
      return;
    }
    setApiKeySaving(true);
    try {
      await updateSetupApiKey(selectedServerId, draft);
      showToast({
        variant: "success",
        title: "API-Key gespeichert",
        description: "Der neue API-Key wurde hinterlegt."
      });
      setApiKeyDraft("");
      await loadServerDetail();
      await loadServerStatus({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "API-Key konnte nicht gespeichert werden";
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setApiKeySaving(false);
    }
  }, [apiKeyDraft, canEditServers, selectedServerId, updateSetupApiKey, loadServerDetail, loadServerStatus, showToast]);

  const handleStatusRefresh = useCallback(() => {
    loadServerStatus();
  }, [loadServerStatus]);

  const handleDeleteServer = useCallback(async () => {
    if (!canDeleteServers || !selectedServerId || serverDeleteId === selectedServerId) {
      return;
    }

    const label = serverDetail?.name || serverDetail?.url || `Server ${selectedServerId}`;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Server "${label}" wirklich löschen?`);
      if (!confirmed) {
        return;
      }
    }

    setServerDeleteId(selectedServerId);
    try {
      await deleteSetupServer(selectedServerId);
      showToast({
        variant: "success",
        title: "Server gelöscht",
        description: `Server "${label}" wurde entfernt.`
      });
      navigate("/dashboard/maintenance/servers");
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Server konnte nicht gelöscht werden";
      showToast({ variant: "error", title: "Löschen fehlgeschlagen", description: message });
    } finally {
      setServerDeleteId(null);
    }
  }, [canDeleteServers, deleteSetupServer, navigate, selectedServerId, serverDeleteId, serverDetail, showToast]);

  const handleScriptSave = useCallback(async () => {
    if (!canManageSsh || !selectedServerId || !scriptConfig) return;
    try {
      setScriptSaving(true);
      setScriptError("");
      await axios.put(`/api/setup/servers/${selectedServerId}/update-script`, { script: scriptDraft });
      await loadServerScript();
      showToast({
        variant: "success",
        title: "Skript gespeichert",
        description: "Das benutzerdefinierte Portainer-Update-Skript wurde aktualisiert."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Skript konnte nicht gespeichert werden";
      setScriptError(message);
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setScriptSaving(false);
    }
  }, [canManageSsh, selectedServerId, scriptConfig, scriptDraft, loadServerScript, showToast]);

  const handleScriptReset = useCallback(async () => {
    if (!canManageSsh || !selectedServerId) return;
    try {
      setScriptSaving(true);
      setScriptError("");
      await axios.delete(`/api/setup/servers/${selectedServerId}/update-script`);
      await loadServerScript();
      showToast({
        variant: "info",
        title: "Standardskript wiederhergestellt",
        description: "Es wird wieder das Standard-Update-Skript verwendet."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Standardskript konnte nicht wiederhergestellt werden";
      setScriptError(message);
      showToast({ variant: "error", title: "Zurücksetzen fehlgeschlagen", description: message });
    } finally {
      setScriptSaving(false);
    }
  }, [canManageSsh, selectedServerId, loadServerScript, showToast]);

  const handleSshDraftChange = useCallback((field, value) => {
    if (!canManageSsh) return;
    setSshDraft((prev) => ({ ...prev, [field]: value }));
    if (field === "password") {
      setSshPasswordStored(false);
    }
  }, [canManageSsh]);

  const handleSshSaveConfig = useCallback(async () => {
    if (!canManageSsh || !selectedServerId) return;
    try {
      setSshSaving(true);
      await axios.put(`/api/setup/servers/${selectedServerId}/ssh-config`, normalizedSshDraft);
      setSshTestResult(null);
      setShowPassword(false);
      await loadServerSshConfig();
      showToast({
        variant: "success",
        title: "SSH-Konfiguration gespeichert",
        description: "Verbindungseinstellungen wurden aktualisiert."
      });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "SSH-Konfiguration konnte nicht gespeichert werden";
      setSshConfigError(message);
      showToast({ variant: "error", title: "Speichern fehlgeschlagen", description: message });
    } finally {
      setSshSaving(false);
    }
  }, [canManageSsh, normalizedSshDraft, selectedServerId, loadServerSshConfig, showToast]);

  const handleSshTestConnection = useCallback(async () => {
    if (!canManageSsh || !selectedServerId) return;
    try {
      setSshTesting(true);
      const response = await axios.post(`/api/setup/servers/${selectedServerId}/test-ssh`, normalizedSshDraft);
      setSshTestResult({ success: true, timestamp: new Date(), details: response.data?.result });
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
  }, [canManageSsh, normalizedSshDraft, selectedServerId, showToast]);

  const handleSshDeleteConfig = useCallback(async () => {
    if (!canManageSsh || !selectedServerId) return;
    try {
      setSshDeleting(true);
      await axios.delete(`/api/setup/servers/${selectedServerId}/ssh-config`);
      setServerSshConfig(null);
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
      setSshConfigError(message);
      showToast({ variant: "error", title: "Löschen fehlgeschlagen", description: message });
    } finally {
      setSshDeleting(false);
    }
  }, [canManageSsh, selectedServerId, showToast]);

  const sshControlsDisabled = !canManageSsh || sshSaving || sshTesting || sshDeleting || sshConfigLoading || !selectedServerId;

  if (!canViewServers) {
    return null;
  }

  if (!selectedServerId) {
    return (
      <div className="mt-12 flex flex-col gap-4">
        <Alert color="red" className="border border-red-200 bg-red-50 text-red-800">
          Ungültige Server-ID.
        </Alert>
        <Button variant="outlined" color="gray" onClick={() => navigate("/dashboard/maintenance/servers")}>Zurück zur Übersicht</Button>
      </div>
    );
  }

  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography variant="h6" color="white" className="flex items-center justify-between">
            <span>Serverdetails {serverDetail ? `– ${serverDetail.name || "Ohne Namen"}` : ""}</span>
            <div className="flex items-center gap-2">
              <Button variant="text" color="white" size="sm" onClick={() => navigate("/dashboard/maintenance/servers")}>
                Zur Übersicht
              </Button>
              {canDeleteServers && (
                <Button
                  variant="text"
                  color="white"
                  size="sm"
                  onClick={handleDeleteServer}
                  disabled={serverDeleteId === selectedServerId}
                >
                  {serverDeleteId === selectedServerId ? "Lösche…" : "Löschen"}
                </Button>
              )}
            </div>
          </Typography>
        </CardHeader>
        <CardBody className="flex flex-col gap-6 p-4">
          {serverLoading && (
            <p className="text-sm text-stormGrey-500">Serverdetails werden geladen…</p>
          )}
          {!serverLoading && serverError && (
            <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
              {serverError}
            </Alert>
          )}
          {!serverLoading && !serverError && !serverDetail && (
            <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
              Der angeforderte Server wurde nicht gefunden.
            </Alert>
          )}
          {serverDetail && (
            <>
               <div className="rounded-md border border-blue-gray-100 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Typography variant="small" color="blue-gray" className="font-semibold uppercase">
                      Verbindungsstatus
                                          {statusFetchedAt && (
                      <span className="antialiased font-sans font-light text-xs text-blue-gray-400 pl-2">Stand: {formatCreatedAt(statusFetchedAt)}</span>
                    )}
                    </Typography>
                    <p className="text-sm text-stormGrey-600 break-all">{serverDetail.url}</p>

                    {statusError && (
                      <p className="text-xs text-sunsetCoral-600 mt-2 text-right">{statusError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      value={statusData?.online === true ? "Server online" : statusData?.online === false ? "Offline" : "Unbekannt"}
                      size="sm"
                      color={statusData?.online === true ? "green" : statusData?.online === false ? "red" : "blue-gray"}
                      variant="ghost"
                    />
                    <Chip
                      value={(() => {
                        const flag = statusData?.portainer?.updateAvailable;
                        if (flag === true) return "Update vorhanden";
                        if (flag === false) return "Portainer aktuell";
                        return "Portainer unbekannt";
                      })()}
                      size="sm"
                      color={statusData?.portainer?.updateAvailable === true ? "amber" : "blue-gray"}
                      variant="ghost"
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Installierte Version</span>
                    <span className="font-medium">{statusData?.portainer?.currentVersion ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Neueste Version</span>
                    <span className="font-medium">{statusData?.portainer?.latestVersion ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Edition</span>
                    <span className="font-medium">{portainerEditionLabel}</span>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outlined"
                    color="gray"
                    size="sm"
                    onClick={handleStatusRefresh}
                    disabled={statusLoading}
                  >
                    {statusLoading ? "Prüfe…" : "Status aktualisieren"}
                  </Button>
                </div>
              </div>


              <div className="rounded-md border border-blue-gray-100 p-4">
                <Typography variant="small" color="blue-gray" className="font-semibold uppercase">
                  Server
                </Typography>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input
                    label="Servername"
                    value={serverDraft.name}
                    onChange={(event) => handleServerDraftChange("name", event.target.value)}
                    disabled={!canEditServers || serverSaving}
                  />
                  <Input
                    label="Server-URL"
                    value={serverDraft.url}
                    onChange={(event) => handleServerDraftChange("url", event.target.value)}
                    disabled={!canEditServers || serverSaving}
                  />
                </div>
                {canEditServers && (
                  <div className="flex justify-end mt-2 mb-5">
                    <Button color="blue" size="sm" onClick={handleServerSave} disabled={serverSaving || !serverDirty}>
                      {serverSaving ? "Speichere…" : "Server speichern"}
                    </Button>
                  </div>
                )}

                <div className="flex flex-col gap-2 md:max-w-md">
                  <p className="text-xs text-stormGrey-500">
                    {apiKeyMeta?.hasKey ? "API-Key gespeichert" : "Kein API-Key hinterlegt"}
                    {apiKeyMeta?.updatedAt ? ` – aktualisiert am ${formatCreatedAt(apiKeyMeta.updatedAt)}` : ""}
                  </p>
                  <Input
                    type="password"
                    label="Neuer API-Key"
                    value={apiKeyDraft}
                    onChange={(event) => setApiKeyDraft(event.target.value)}
                    disabled={!canEditServers || apiKeySaving}
                  />
                  {canEditServers && (
                    <div className="flex justify-end">
                      <Button color="blue" size="sm" onClick={handleApiKeySave} disabled={apiKeySaving || !apiKeyDraft.trim()}>
                        {apiKeySaving ? "Speichere…" : "API-Key speichern"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {isCommunityEdition && (
                <div className="rounded-md border border-blue-gray-100 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Typography variant="small" color="blue-gray" className="font-semibold uppercase">
                        Agent (CE)
                      </Typography>
                      <p className="text-sm text-stormGrey-600 break-all">
                        {agentDraft.agentUrl || "Keine Agent-URL hinterlegt"}
                      </p>
                      {agentError && <p className="text-xs text-sunsetCoral-600 mt-1">{agentError}</p>}
                    </div>
                    <Chip
                      value={agentStatusLabel}
                      size="sm"
                      color={agentOnline === true ? "green" : agentOnline === false ? "red" : "blue-gray"}
                      variant="ghost"
                    />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Input
                      label="Agent URL"
                      value={agentDraft.agentUrl}
                      onChange={(e) => handleAgentDraftChange("agentUrl", e.target.value)}
                      disabled={agentSaving}
                    />
                    <div className="w-full">
                      <div className="relative w-full">
                        <Input
                          label="Agent Token"
                          value={agentDraft.agentToken}
                          readOnly
                          disabled
                          className="pr-24"
                        />
                        <Button
                          variant="outlined"
                          color="gray"
                          size="sm"
                          className="!absolute right-1 top-1"
                          onClick={async () => {
                            if (!agentDraft.agentToken) return;
                            const text = agentDraft.agentToken;
                            const tryClipboard = async () => {
                              if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
                                await navigator.clipboard.writeText(text);
                                return true;
                              }
                              return false;
                            };
                            const tryFallback = () => {
                              try {
                                const textarea = document.createElement("textarea");
                                textarea.value = text;
                                textarea.style.position = "fixed";
                                textarea.style.opacity = "0";
                                document.body.appendChild(textarea);
                                textarea.select();
                                document.execCommand("copy");
                                document.body.removeChild(textarea);
                                return true;
                              } catch {
                                return false;
                              }
                            };
                            try {
                              const ok = (await tryClipboard()) || tryFallback();
                              if (ok) {
                                showToast({
                                  variant: "success",
                                  title: "Token kopiert",
                                  description: "Agent-Token wurde in die Zwischenablage kopiert."
                                });
                              } else {
                                throw new Error("Clipboard API nicht verfügbar");
                              }
                            } catch (err) {
                              showToast({
                                variant: "error",
                                title: "Kopieren fehlgeschlagen",
                                description: err?.message || "Token konnte nicht kopiert werden."
                              });
                            }
                          }}
                        >
                          Kopieren
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outlined"
                      color="gray"
                      size="sm"
                      onClick={loadAgentConfig}
                      disabled={agentLoading}
                    >
                      {agentLoading ? "Lade…" : "Agent neu laden"}
                    </Button>
                    <Button color="blue" size="sm" onClick={handleAgentSave} disabled={agentSaving}>
                      {agentSaving ? "Speichere…" : "Agent speichern"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {canViewSsh && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
              <Typography variant="h6" color="white">
                SSH-Verbindung
              </Typography>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 p-4">
              <label className="grid gap-1">
                <span className="text-xs uppercase tracking-wide">Host</span>
                <input
                  type="text"
                  value={sshDraft.host}
                  onChange={(event) => handleSshDraftChange("host", event.target.value)}
                  disabled={sshControlsDisabled}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs uppercase tracking-wide">Port</span>
                  <input
                    type="number"
                    min="1"
                    value={sshDraft.port}
                    onChange={(event) => handleSshDraftChange("port", event.target.value)}
                    disabled={sshControlsDisabled}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs uppercase tracking-wide">Benutzer</span>
                  <input
                    type="text"
                    value={sshDraft.username}
                    onChange={(event) => handleSshDraftChange("username", event.target.value)}
                    disabled={sshControlsDisabled}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide">
                  <label htmlFor="server-ssh-password" className="cursor-pointer">Passwort</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={sshControlsDisabled}
                    className="text-[11px] font-medium text-blue-500 transition hover:text-blue-800 disabled:opacity-50"
                  >
                    {showPassword ? "Verbergen" : "Anzeigen"}
                  </button>
                </div>
                <input
                  id="server-ssh-password"
                  type={showPassword ? "text" : "password"}
                  value={sshDraft.password}
                  onChange={(event) => handleSshDraftChange("password", event.target.value)}
                  disabled={sshControlsDisabled}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Passwort für den SSH-Benutzer"
                  autoComplete="off"
                  spellCheck={false}
                />
                {sshPasswordStored && !sshDraft.password && (
                  <span className="text-[11px] text-stormGrey-500">
                    Ein Passwort ist gespeichert. Neuer Inhalt ersetzt es oder lösche die Konfiguration unten.
                  </span>
                )}
              </div>
              <label className="grid gap-1">
                <span className="text-xs uppercase tracking-wide">Weitere SSH-Argumente</span>
                <textarea
                  rows={3}
                  value={sshDraft.extraSshArgs}
                  onChange={(event) => handleSshDraftChange("extraSshArgs", event.target.value)}
                  disabled={sshControlsDisabled}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
                  placeholder="je Zeile ein Argument (optional)"
                />
              </label>
              <div className="mt-2 grid gap-2">
                <Button onClick={handleSshSaveConfig} disabled={sshControlsDisabled}>
                  {sshSaving ? "Speichern…" : "SSH-Konfiguration speichern"}
                </Button>
                <Button
                  onClick={handleSshTestConnection}
                  disabled={sshControlsDisabled}
                  className="bg-arcticBlue-500 hover:bg-arcticBlue-600"
                >
                  {sshTesting ? "Test läuft…" : "Verbindung testen"}
                </Button>
                <Button
                  onClick={handleSshDeleteConfig}
                  disabled={sshControlsDisabled}
                  className="bg-sunsetCoral-500 hover:bg-sunsetCoral-600"
                >
                  {sshDeleting ? "Löschen…" : "SSH-Einstellungen löschen"}
                </Button>
              </div>
              {sshConfigLoading && (
                <p className="text-xs text-stormGrey-500">SSH-Konfiguration wird geladen…</p>
              )}
              {sshConfigError && (
                <p className="text-xs text-sunsetCoral-500">{sshConfigError}</p>
              )}
              {sshTestResult && (
                <p className={`text-xs ${sshTestResult.success ? "text-mossGreen-600" : "text-sunsetCoral-500"}`}>
                  {sshTestResult.success
                    ? "SSH-Verbindung erfolgreich."
                    : `SSH-Verbindung fehlgeschlagen: ${sshTestResult.error}`}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
              <Typography variant="h6" color="white" className="flex items-center justify-between">
                <span>Update-Skript</span>
                <span className="text-xs">Quelle: {scriptSourceLabel}</span>
              </Typography>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 p-4">
              <textarea
                value={scriptDraft}
                onChange={(event) => setScriptDraft(event.target.value)}
                rows={12}
                disabled={!canManageSsh || scriptSaving || scriptLoading || !selectedServerId}
                className="w-full rounded-md border border-blue-gray-100 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
              />
              {scriptLoading && (
                <p className="text-xs text-stormGrey-500">Skript wird geladen…</p>
              )}
              {scriptError && (
                <p className="text-xs text-sunsetCoral-500">{scriptError}</p>
              )}
              <div className="grid gap-2">
                <Button
                  onClick={handleScriptSave}
                  disabled={!canManageSsh || !scriptIsDirty || scriptSaving || scriptLoading || !selectedServerId}
                >
                  Speichern
                </Button>
                <Button
                  color="purple"
                  onClick={handleScriptReset}
                  disabled={!canManageSsh || !scriptConfig || scriptConfig.source !== "custom" || scriptSaving || scriptLoading || !selectedServerId}
                  className="bg-sunsetCoral-500 hover:bg-sunsetCoral-600"
                >
                  Standard wiederherstellen
                </Button>
              </div>
              {scriptConfig?.customUpdatedAt && (
                <p className="text-xs text-stormGrey-500">
                  Zuletzt geändert: {formatCreatedAt(scriptConfig.customUpdatedAt)}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ServerDetail;
