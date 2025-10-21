import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useToast } from "@/components/ToastProvider.jsx";
import { useMaintenance } from "@/context/MaintenanceContext.jsx";

import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Switch
} from "@material-tailwind/react";

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

const resolveStackType = (type) => {
  if (type === 1) return "Git";
  if (type === 2) return "Compose";
  return type ?? "-";
};

const createEmptySshDraft = () => ({
  host: '',
  port: '22',
  username: '',
  password: '',
  extraSshArgs: ''
});

export function Maintenance() {
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
    testSshConnection
  } = useMaintenance();

  const maintenanceActive = Boolean(maintenanceMeta?.active);
  const maintenanceMessage = maintenanceMeta?.message;
  const maintenanceExtraType = maintenanceMeta?.extra?.type;
  const updateRunning = Boolean(updateState?.running);

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

  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(true);
  const [duplicatesError, setDuplicatesError] = useState("");
  const [duplicatesRefreshing, setDuplicatesRefreshing] = useState(false);
  const [activeCleanupId, setActiveCleanupId] = useState(null);
  const [duplicatesUpdatedAt, setDuplicatesUpdatedAt] = useState(null);
  const duplicatesRequestRef = useRef(null);

  const [portainerStatus, setPortainerStatus] = useState(null);
  const [portainerLoading, setPortainerLoading] = useState(true);
  const [portainerError, setPortainerError] = useState("");
  const [portainerRefreshing, setPortainerRefreshing] = useState(false);
  const [portainerUpdatedAt, setPortainerUpdatedAt] = useState(null);
  const portainerRequestRef = useRef(null);

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

  const fetchDuplicates = useCallback(async ({ silent = false } = {}) => {
    if (maintenanceActive || updateRunning) {
      setDuplicates([]);
      setDuplicatesError("Wartungsmodus aktiv – Duplikat-Verwaltung ist vorübergehend deaktiviert.");
      setDuplicatesLoading(false);
      setDuplicatesRefreshing(false);
      return;
    }

    if (duplicatesRequestRef.current) {
      return duplicatesRequestRef.current;
    }

    const requestPromise = (async () => {
      if (silent) {
        setDuplicatesRefreshing(true);
      } else {
        setDuplicatesLoading(true);
      }
      setDuplicatesError("");

      try {
        const response = await axios.get("/api/maintenance/duplicates");
        const payload = response.data;
        const items = Array.isArray(payload) ? payload : payload?.items ?? [];
        setDuplicates(items);
        setDuplicatesUpdatedAt(new Date());
      } catch (err) {
        if (err.response?.status === 423) {
          const message = "Wartungsmodus aktiv – Duplikat-Verwaltung ist vorübergehend deaktiviert.";
          setDuplicates([]);
          setDuplicatesError(message);
          showToast({ variant: "warning", title: "Duplikat-Verwaltung gesperrt", description: message });
        } else {
          const message = err.response?.data?.error || err.message || "Fehler beim Laden der Wartungsdaten";
          setDuplicatesError(message);
          showToast({ variant: "error", title: "Duplikate konnten nicht geladen werden", description: message });
        }
      } finally {
        if (silent) {
          setDuplicatesRefreshing(false);
        } else {
          setDuplicatesLoading(false);
        }
        duplicatesRequestRef.current = null;
      }
    })();

    duplicatesRequestRef.current = requestPromise;
    return requestPromise;
  }, [maintenanceActive, updateRunning, showToast]);

  useEffect(() => {
    fetchPortainerStatus();
  }, [fetchPortainerStatus]);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  const totals = useMemo(() => {
    const groups = Array.isArray(duplicates) ? duplicates.length : 0;
    const duplicateCount = Array.isArray(duplicates)
      ? duplicates.reduce((sum, entry) => sum + ((entry?.duplicates?.length) || 0), 0)
      : 0;
    return { groups, duplicateCount };
  }, [duplicates]);

  const handleSshDraftChange = useCallback((field, value) => {
    setSshDraft((prev) => ({ ...prev, [field]: value }));
    if (field === 'password') {
      setSshPasswordStored(false);
    }
  }, []);

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
  }, [saveScript, scriptDraft, scriptConfig, showToast]);

  const handleScriptReset = useCallback(async () => {
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
  }, [resetScript, showToast]);

  const handleSshSaveConfig = useCallback(async () => {
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
  }, [normalizedSshDraft, saveSshConfig, showToast]);

  const handleSshTestConnection = useCallback(async () => {
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
  }, [normalizedSshDraft, testSshConnection, showToast]);

  const handleSshDeleteConfig = useCallback(async () => {
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
  }, [deleteSshConfig, showToast]);

  const handleMaintenanceToggle = useCallback(async (nextActive) => {
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
  }, [maintenanceLoading, maintenanceToggleLoading, maintenanceActive, updateRunning, setMaintenanceMode, maintenanceMessage, maintenanceExtraType, showToast]);

  const handleTriggerUpdate = useCallback(async () => {
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
  }, [maintenanceActive, updateRunning, portainerStatus, triggerUpdate, showToast]);

  const handleCleanup = useCallback(async (entry) => {
    if (!entry) return;
    if (maintenanceActive || updateRunning) {
      showToast({
        variant: "warning",
        title: "Aktion nicht möglich",
        description: "Während des Wartungsmodus sind Bereinigungen deaktiviert."
      });
      return;
    }

    const canonicalId = entry.canonical?.Id;
    if (!canonicalId) return;

    const duplicateIds = (entry.duplicates || []).map((dup) => dup.Id).filter(Boolean);
    if (!duplicateIds.length) return;

    const canonicalName = entry.canonical?.Name || entry.name || `Stack ${canonicalId}`;

    if (typeof window !== "undefined") {
      const confirmation = window.confirm(
        `Bereinigung für "${canonicalName}" starten?\n` +
        `Es werden ${duplicateIds.length} Duplikate entfernt: ${duplicateIds.join(", ")}`
      );
      if (!confirmation) {
        return;
      }
    }

    setActiveCleanupId(String(canonicalId));

    try {
      const response = await axios.post("/api/maintenance/duplicates/cleanup", {
        canonicalId,
        duplicateIds
      });

      const payload = response.data ?? {};
      if (payload.success === false) {
        throw new Error(payload.error || "Bereinigung fehlgeschlagen");
      }

      const removedIds = Array.isArray(payload.results)
        ? payload.results.filter((result) => result.status === "deleted").map((result) => result.id)
        : duplicateIds;

      showToast({
        variant: "success",
        title: "Bereinigung abgeschlossen",
        description: `${canonicalName} – entfernte IDs: ${removedIds.join(", ")}`
      });
      await fetchDuplicates({ silent: true });
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Bereinigung fehlgeschlagen";
      showToast({
        variant: "error",
        title: "Bereinigung fehlgeschlagen",
        description: message
      });
    } finally {
      setActiveCleanupId(null);
    }
  }, [fetchDuplicates, maintenanceActive, showToast, updateRunning]);

  const maintenanceActivatedAt = maintenanceMeta?.activatedAt ? formatCreatedAt(maintenanceMeta.activatedAt) : null;
  const maintenanceUpdatedAt = maintenanceMeta?.updatedAt ? formatCreatedAt(maintenanceMeta.updatedAt) : null;

  const isDuplicatesDisabled = maintenanceActive || updateRunning;
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
              disabled={maintenanceToggleLoading || maintenanceLoading || updateRunning}
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

      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography
            variant="h6"
            color="white"
            className="flex items-center justify-between"
          >
            <span>Portainer</span>

          </Typography>
        </CardHeader>
        <CardBody className="flex flex-col gap-4 p-4 pt-0">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="block antialiased font-sans text-lg font-semibold">Portainer Status</h2>
              <p className="block antialiased font-sans text-sm font-light leading-normal text-inherit">
                {portainerLoading
                  ? "Status wird geprüft…"
                  : portainerError
                    ? portainerError
                    : updateRunning
                      ? "Portainer wird aktuell aktualisiert."
                      : (portainerStatus?.updateAvailable === true
                        ? "Es ist ein Update für Portainer verfügbar."
                        : "Portainer ist auf dem aktuellen Stand.")}
              </p>
              {portainerUpdatedAt && !portainerLoading && (
                <p className="mt-1 text-xs text-stormGrey-500 block antialiased font-sans">
                  Stand: {portainerUpdatedAt.toLocaleString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => fetchPortainerStatus({ silent: false })}
                disabled={portainerLoading || portainerRefreshing}
                className="w-full">
                Status aktualisieren
              </Button>

            </div>
          </div>
          <div className="flex flex-col gap-4 mt-5 space-y-4 block antialiased font-sans text-sm font-light leading-normal text-inherit">
            {!portainerLoading && !portainerError && portainerStatus && (
              <div className="">
                <div className="flex items-center justify-between space-y-2">
                  <span >Installierte Version</span>
                  <span className="font-medium">{portainerStatus.currentVersion ?? "Unbekannt"}</span>
                </div>
                <div className="flex items-center justify-between space-y-2">
                  <span>Neueste Version</span>
                  <span className="font-medium">{portainerStatus.latestVersion ?? "Unbekannt"}</span>
                </div>
                <div className="flex items-center justify-between space-y-2">
                  <span>Status</span>
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-semibold ${portainerStatus.updateAvailable === true
                      ? UPDATE_STATUS_STYLES.error
                      : portainerStatus.updateAvailable === false
                        ? UPDATE_STATUS_STYLES.success
                        : UPDATE_STATUS_STYLES.idle
                      }`}
                  >
                    {portainerStatus.updateAvailable === true
                      ? "Update verfügbar"
                      : portainerStatus.updateAvailable === false
                        ? "Aktuell"
                        : "Unbekannt"}
                  </span>
                </div>
                {portainerStatus.edition && (
                  <div className="flex items-center justify-between">
                    <span className="text-stormGrey-400">Edition</span>
                    <span className="font-medium">{portainerStatus.edition}</span>
                  </div>
                )}
                {portainerStatus.build && (
                  <div className="flex items-center justify-between">
                    <span className="text-stormGrey-400">Build</span>
                    <span className="font-medium">{portainerStatus.build}</span>
                  </div>
                )}
                {portainerStatus.errors?.latestVersion && (
                  <div className="rounded-md mt-8 border  bg-sunsetCoral-600 text-white px-3 py-2 text-xs">
                    Neueste Version konnte nicht ermittelt werden: {portainerStatus.errors.latestVersion}
                  </div>
                )}
                {portainerStatus.errors?.container && (
                  <div className="rounded-md mt-8 border  bg-sunsetCoral-600 text-white px-3 py-2 text-xs">
                    Container-Details konnten nicht ermittelt werden: {portainerStatus.errors.container}
                  </div>
                )}
              </div>

              /* {portainerStatus.container && (
            <div className="rounded-md border border-gray-700 bg-gray-900/40 p-4 text-xs text-gray-200">
              <h3 className="text-sm font-semibold text-white">Startparameter</h3>
              <div className="mt-3 space-y-2">
                {(portainerStatus.container.name || portainerStatus.container.image) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-gray-400">Container</span>
                    <div className="text-right">
                      <span className="block font-medium text-white">{portainerStatus.container.name ?? "Unbekannt"}</span>
                      {portainerStatus.container.image && (
                        <span className="text-[11px] text-gray-400">{portainerStatus.container.image}</span>
                      )}
                    </div>
                  </div>
                )}
                {portainerStatus.container.id && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-gray-400">Container-ID</span>
                    <code
                      title={portainerStatus.container.id}
                      className="rounded bg-gray-800/80 px-2 py-1 font-mono text-[11px] text-gray-100"
                    >
                      {portainerStatus.container.id.slice(0, 12)}
                    </code>
                  </div>
                )}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <span className="text-gray-400">Startkommando</span>
                  <code className="rounded bg-gray-800/60 px-2 py-1 font-mono text-[11px] text-gray-100 sm:max-w-xs sm:text-right">
                    {[...(portainerStatus.container.entrypoint || []), ...(portainerStatus.container.command || [])].join(" ") || "Unbekannt"}
                  </code>
                </div>
                {Array.isArray(portainerStatus.container.args) && portainerStatus.container.args.length > 0 && (
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <span className="text-gray-400">Argumente</span>
                    <code className="rounded bg-gray-800/60 px-2 py-1 font-mono text-[11px] text-gray-100 sm:max-w-xs sm:text-right">
                      {portainerStatus.container.args.join(" ")}
                    </code>
                  </div>
                )}
                {Array.isArray(portainerStatus.container.env) && portainerStatus.container.env.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-gray-400">Umgebungsvariablen</span>
                    <div className="grid gap-1">
                      {portainerStatus.container.env.map((entry, index) => (
                        <code
                          key={`${entry || "env"}-${index}`}
                          className="block rounded bg-gray-800/70 px-2 py-1 font-mono text-[11px] text-gray-100"
                        >
                          {entry}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(portainerStatus.container.binds) && portainerStatus.container.binds.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-gray-400">Bind-Mounts</span>
                    <div className="grid gap-1">
                      {portainerStatus.container.binds.map((bind, index) => (
                        <code
                          key={`bind-${index}`}
                          className="block rounded bg-gray-800/70 px-2 py-1 font-mono text-[11px] text-gray-100"
                        >
                          {bind}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )} */
            )}
          </div>


          <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-md border border-gray-700/20 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">SSH-Verbindung</h3>
              </div>
              <div className="mt-3 grid gap-3 text-sm">
                <label className="grid gap-1">
                  <span className="text-xs uppercase tracking-wide">Host</span>
                  <input
                    type="text"
                    value={sshDraft.host}
                    onChange={(event) => handleSshDraftChange('host', event.target.value)}
                    disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                    className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs uppercase tracking-wide ">Port</span>
                    <input
                      type="number"
                      min="1"
                      value={sshDraft.port}
                      onChange={(event) => handleSshDraftChange('port', event.target.value)}
                      disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                      className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm  focus:border-purple-500 focus:outline-none"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs uppercase tracking-wide ">Benutzer</span>
                    <input
                      type="text"
                      value={sshDraft.username}
                      onChange={(event) => handleSshDraftChange('username', event.target.value)}
                      disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                      className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="grid gap-1">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide ">
                    <label htmlFor="maintenance-ssh-password" className="cursor-pointer">Passwort</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                      className="text-[11px] font-medium text-blue-500 transition hover:text-blue-800 disabled:opacity-50"
                    >
                      {showPassword ? 'Verbergen' : 'Anzeigen'}
                    </button>
                  </div>
                  <input
                    id="maintenance-ssh-password"
                    type={showPassword ? 'text' : 'password'}
                    value={sshDraft.password}
                    onChange={(event) => handleSshDraftChange('password', event.target.value)}
                    disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                    className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                    placeholder="Passwort für den SSH-Benutzer"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {sshPasswordStored && !sshDraft.password && (
                    <span className="text-[11px] ">
                      Ein Passwort ist gespeichert. Neuer Inhalt ersetzt es oder lösche die Konfiguration unten.
                    </span>
                  )}
                </div>
                <label className="grid gap-1">
                  <span className="text-xs uppercase tracking-wide ">Weitere SSH-Argumente</span>
                  <textarea
                    rows={3}
                    value={sshDraft.extraSshArgs}
                    onChange={(event) => handleSshDraftChange('extraSshArgs', event.target.value)}
                    disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                    className="w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 font-mono text-[11px] focus:border-purple-500 focus:outline-none"
                    placeholder="je Zeile ein Argument (optional)"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-2">

                <Button
                  onClick={handleSshSaveConfig}
                  disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                  className="mt-3 w-full">
                  {sshSaving ? 'Speichern…' : 'SSH-Konfiguration speichern'}
                </Button>

                <Button
                  onClick={handleSshTestConnection}
                  disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                  className="w-full bg-arcticBlue-500 hover:bg-arcticBlue-600">
                  {sshTesting ? 'Test läuft…' : 'Verbindung testen'}
                </Button>


                <Button
                  onClick={handleSshDeleteConfig}
                  disabled={sshSaving || sshTesting || sshDeleting || updateRunning}
                  className="w-full hover:bg-sunsetCoral-600 bg-sunsetCoral-500"
                >
                  {sshDeleting ? 'Löschen…' : 'SSH-Einstellungen löschen'}
                </Button>
              </div>
              {sshTestResult && (
                <p className={`mt-3 text-xs ${sshTestResult.success ? 'text-mossGreen-600' : 'text-sunsetCoral-500'}`}>
                  {sshTestResult.success ? 'SSH-Verbindung erfolgreich.' : `SSH-Verbindung fehlgeschlagen: ${sshTestResult.error}`}
                </p>
              )}
            </div>

            <div className="rounded-md border border-gray-700/20 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Update-Skript</h3>
                <span className="text-xs">Quelle: {scriptSourceLabel}</span>
              </div>
              <textarea
                value={scriptDraft}
                onChange={(event) => setScriptDraft(event.target.value)}
                rows={10}
                disabled={scriptSaving || updateRunning}
                className="mt-3 w-full rounded-md border border-gray-700/20 px-3 py-2 font-mono text-xs focus:border-purple-500 focus:outline-none"
              />
              <div className="mt-3 grid gap-2">
                <Button
                  onClick={handleScriptSave}
                  disabled={!scriptIsDirty || scriptSaving || updateRunning}
                  className="mt-3 w-full">
                  Speichern
                </Button>
                <Button
                  color="purple"
                  onClick={handleScriptReset}
                  disabled={!scriptConfig || scriptConfig.source !== "custom" || scriptSaving || updateRunning}
                  className="w-full hover:bg-sunsetCoral-600 bg-sunsetCoral-500">
                  Standard wiederherstellen
                </Button>

              </div>
              {scriptConfig?.customUpdatedAt && (
                <p className="mt-2 text-xs text-stormGrey-500">
                  Zuletzt geändert: {formatCreatedAt(scriptConfig.customUpdatedAt)}
                </p>
              )}
            </div>

            <div className="rounded-md border border-gray-700/20 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Update-Status</h3>
                <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${updateBadgeClass}`}>
                  {updateStatusLabel}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span>Phase</span>
                  <span className="font-medium">{updateStageLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ziel-Version</span>
                  <span className="font-medium">{updateTargetVersion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Installierte Version</span>
                  <span className="font-medium">{updateResultVersion}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Gestartet</span>
                  <span>{updateStartedAt}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Beendet</span>
                  <span>{updateFinishedAt}</span>
                </div>
                {updateStatusMessage && (
                  <div className="rounded-md border border-mossGreen-700 bg-mossGreen-800 px-3 py-2 text-xs text-white">
                    {updateStatusMessage}
                  </div>
                )}
                {updateState?.error && (
                  <div className="rounded-md border border-sunsetCoral-500/60 bg-sunsetCoral-900/40 px-3 py-2 text-xs text-white">
                    {updateState.error}
                  </div>
                )}
                {updateActionError && (
                  <div className="rounded-md border border-sunsetCoral-500/60 bg-sunsetCoral-900/40 px-3 py-2 text-xs text-white">
                    {updateActionError}
                  </div>
                )}
              </div>
              <div className="mt-3 h-40 overflow-y-auto rounded-md border border-gray-700/20 bg-gray-950/70 p-3 font-mono text-[11px] leading-relaxed">
                {updateLogs.length === 0 ? (
                  <p className="text-stormGrey-500">Noch keine Protokolle vorhanden.</p>
                ) : (
                  updateLogs.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="mb-2 last:mb-0">
                      <span className="text-gray-500">[{formatLogTimestamp(entry.timestamp)}]</span>{" "}
                      <span className={(LOG_LEVEL_STYLES[entry.level] ?? "text-stormGrey-300") + " whitespace-normal break-words"} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>
                        {entry.message}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <Button
                onClick={handleTriggerUpdate}
                disabled={disableUpdateButton || updateActionLoading}
                className="mt-3 w-full">
                {updateActionLoading ? "Update wird gestartet…" : "Portainer aktualisieren"}
              </Button>


            </div>
          </div>


        </CardBody>
      </Card>

      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography
            variant="h6"
            color="white"
            className="flex items-center justify-between"
          >
            <span>Doppelte Stacks</span>

          </Typography>
        </CardHeader>
        <CardBody className="flex flex-col gap-4 p-4">
          <div className="rounded-lg border border-warmAmberGlow-600 bg-warmAmberGlow-700 px-4 py-3 text-sm text-white">
            Das Entfernen von deppelten Stacks ist noch nicht getestet. Bitte nicht in Produktivumgebungen einsetzen.
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm antialiased font-sans text-sm font-light leading-normal text-inherit">
                {isDuplicatesDisabled
                  ? "Wartungsmodus aktiv – Duplikat-Verwaltung ist vorübergehend deaktiviert."
                  : duplicatesLoading
                    ? "Analyse läuft…"
                    : totals.groups === 0
                      ? "Keine Duplikate gefunden"
                      : `${totals.groups} Stack-Namen mit insgesamt ${totals.duplicateCount} Duplikaten gefunden`}
              </p>
              {duplicatesUpdatedAt && !duplicatesLoading && !isDuplicatesDisabled && (
                <p className="mt-1 text-xs text-gray-500">
                  Stand: {duplicatesUpdatedAt.toLocaleString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}
                </p>
              )}
            </div>

            <Button
              onClick={() => fetchDuplicates({ silent: false })}
              disabled={isDuplicatesDisabled || duplicatesLoading || duplicatesRefreshing || activeCleanupId !== null}
              className=""
            >
              Aktualisieren
            </Button>
            {duplicatesError && !isDuplicatesDisabled && (
              <div className="rounded-lg border border-sunsetCoral-500/60 bg-sunsetCoral-900/40 px-4 py-3 text-sm text-white">
                {duplicatesError}
              </div>
            )}
          </div>
          {duplicatesLoading ? (
            <div className="flex flex-col gap-4 p-4">
              Daten werden geladen…
            </div>
          ) : totals.groups === 0 || isDuplicatesDisabled ? (
            <div className="rounded-xl border-mossGreen-500/80 bg-mossGreen-900/90 text-mossGreen-100 p-8 text-center text-sm text-white">
              {isDuplicatesDisabled
                ? "Wartungsmodus aktiv – Duplikat-Verwaltung ist vorübergehend deaktiviert."
                : "Es wurden keine doppelten Stacks gefunden."}
            </div>
          ) : (
            <div className="space-y-5">
              {duplicates.map((entry) => {
                const canonicalId = entry?.canonical?.Id;
                const duplicatesForEntry = entry?.duplicates || [];
                const isProcessing = activeCleanupId === String(canonicalId);

                return (
                  <div
                    key={canonicalId || entry.name}
                    className="rounded-xl border border-gray-700 bg-gray-800/70 p-6 shadow"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">{entry.name}</h3>
                          <span className="rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-medium text-amber-200">
                            {duplicatesForEntry.length} Duplikat{duplicatesForEntry.length === 1 ? "" : "e"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">
                          Behaltener Stack: ID {canonicalId} (Endpoint {entry?.canonical?.EndpointId ?? "-"})
                        </p>
                        <p className="text-xs text-gray-500">
                          Typ: {resolveStackType(entry?.canonical?.Type)} • Erstellt: {formatCreatedAt(entry?.canonical?.Created)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCleanup(entry)}
                        disabled={isDuplicatesDisabled || isProcessing || duplicatesRefreshing || duplicatesLoading}
                        className="self-start rounded-lg bg-sunsetCoral-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sunsetCoral-600 disabled:opacity-50"
                      >
                        {isProcessing ? "Bereinigung läuft…" : `Bereinigen (${duplicatesForEntry.length})`}
                      </button>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {duplicatesForEntry.map((duplicate) => (
                        <div
                          key={duplicate.Id}
                          className="rounded-lg border border-sunsetCoral-500/40 bg-sunsetCoral-900/20 p-4 text-sm text-white"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-white">ID: {duplicate.Id}</span>
                            <span>Endpoint: {duplicate.EndpointId ?? "-"}</span>
                            <span>Typ: {resolveStackType(duplicate.Type)}</span>
                            <span>Erstellt: {formatCreatedAt(duplicate.Created)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );


}

export default Maintenance;