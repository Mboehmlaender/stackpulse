import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useToast } from "./components/ToastProvider.jsx";

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

export default function Maintenance() {
  const { showToast } = useToast();
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeCleanupId, setActiveCleanupId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchDuplicates = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const response = await axios.get("/api/maintenance/duplicates");
      const payload = response.data;
      const items = Array.isArray(payload) ? payload : payload?.items ?? [];
      setDuplicates(items);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("❌ Fehler beim Laden der Wartungsdaten:", err);
      setError("Fehler beim Laden der Wartungsdaten");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

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

  const handleCleanup = useCallback(async (entry) => {
    if (!entry) return;
    const canonicalId = entry.canonical?.Id;
    if (!canonicalId) return;

    const duplicateIds = (entry.duplicates || []).map((dup) => dup.Id).filter(Boolean);
    if (!duplicateIds.length) return;

    const canonicalName = entry.canonical?.Name || entry.name || `Stack ${canonicalId}`;

    if (typeof window !== "undefined") {
      const confirmation = window.confirm(
        `Bereinigung für \"${canonicalName}\" starten?\n` +
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
      console.error("❌ Fehler bei der Duplikat-Bereinigung:", err);
      showToast({
        variant: "error",
        title: "Bereinigung fehlgeschlagen",
        description: message
      });
    } finally {
      setActiveCleanupId(null);
    }
  }, [fetchDuplicates, showToast]);

  const isEmpty = !loading && totals.groups === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Wartung</h1>
        <p className="text-sm text-gray-400">
          Werkzeuge für wiederkehrende Wartungsaufgaben. Entfernt derzeit doppelte Stack-Einträge.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/60 bg-amber-900/40 px-4 py-3 text-sm text-amber-100">
        Dieses Wartungsfeature ist noch nicht getestet. Bitte nicht in Produktivumgebungen einsetzen.
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-6 shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Doppelte Stacks</h2>
            <p className="text-sm text-gray-400">
              {loading
                ? "Analyse läuft…"
                : totals.groups === 0
                  ? "Keine Duplikate gefunden"
                  : `${totals.groups} Stack-Namen mit insgesamt ${totals.duplicateCount} Duplikaten gefunden`}
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-gray-500">
                Stand: {lastUpdated.toLocaleString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchDuplicates({ silent: false })}
              disabled={loading || refreshing || activeCleanupId !== null}
              className="rounded-lg border border-purple-500 px-4 py-2 text-sm font-medium text-purple-200 transition hover:bg-purple-500/20 disabled:opacity-50"
            >
              Aktualisieren
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/60 bg-red-900/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Daten werden geladen…
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-green-600/40 bg-green-900/30 p-8 text-center text-sm text-green-100">
          Es wurden keine doppelten Stacks gefunden.
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
                    disabled={isProcessing || refreshing || loading}
                    className="self-start rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                  >
                    {isProcessing ? "Bereinigung läuft…" : `Bereinigen (${duplicatesForEntry.length})`}
                  </button>
                </div>

                <div className="mt-5 grid gap-3">
                  {duplicatesForEntry.map((duplicate) => (
                    <div
                      key={duplicate.Id}
                      className="rounded-lg border border-red-500/40 bg-red-900/20 p-4 text-sm text-red-100"
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
    </div>
  );
}
