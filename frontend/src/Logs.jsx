import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const STATUS_COLORS = {
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  started: "text-blue-300"
};

const formatTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

const normalizeDateParam = (value) => {
  if (!value) return undefined;
  return value.replace("T", " ");
};

const FILTER_STORAGE_KEY = "redeployLogFilters";
const ALL_OPTION_VALUE = "__all__";
const ALL_OPTION_LABEL = "- Alle -";

const hasActiveFilters = (filters) => Boolean(
  (filters.stacks && filters.stacks.length) ||
  (filters.statuses && filters.statuses.length) ||
  (filters.endpoints && filters.endpoints.length) ||
  (filters.message && filters.message.trim()) ||
  (filters.from && filters.from.trim()) ||
  (filters.to && filters.to.trim())
);

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stackOptions, setStackOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [endpointOptions, setEndpointOptions] = useState([]);

  const [selectedStacks, setSelectedStacks] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [messageQuery, setMessageQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const updateFilterOptions = useCallback((logsPayload) => {
    setStackOptions((prev) => {
      const map = new Map(prev.map((entry) => [entry.value, entry.label]));
      logsPayload.forEach((log) => {
        if (!log.stackId) return;
        const value = String(log.stackId);
        if (!map.has(value)) {
          map.set(value, log.stackName || `Stack ${value}`);
        }
      });
      return Array.from(map.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    });

    setStatusOptions((prev) => {
      const next = new Set(prev);
      logsPayload.forEach((log) => {
        if (log.status) next.add(log.status);
      });
      return Array.from(next).sort();
    });

    setEndpointOptions((prev) => {
      const next = new Set(prev);
      logsPayload.forEach((log) => {
        if (log.endpoint === null || log.endpoint === undefined || log.endpoint === "") return;
        next.add(String(log.endpoint));
      });
      return Array.from(next).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setFiltersReady(true);
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(FILTER_STORAGE_KEY);
      if (storedValue) {
        const parsed = JSON.parse(storedValue);
        const storedFilters = parsed?.filters ?? parsed ?? {};
        const storedOptions = parsed?.options ?? {};

        setSelectedStacks(storedFilters.stacks || []);
        setSelectedStatuses(storedFilters.statuses || []);
        setSelectedEndpoints(storedFilters.endpoints || []);
        setMessageQuery(storedFilters.message || "");
        setFromDate(storedFilters.from || "");
        setToDate(storedFilters.to || "");
        setFiltersOpen(hasActiveFilters(storedFilters));

        if (Array.isArray(storedOptions.stacks) && storedOptions.stacks.length) {
          setStackOptions(storedOptions.stacks);
        }

        if (Array.isArray(storedOptions.statuses) && storedOptions.statuses.length) {
          setStatusOptions(storedOptions.statuses);
        }

        if (Array.isArray(storedOptions.endpoints) && storedOptions.endpoints.length) {
          setEndpointOptions(storedOptions.endpoints);
        }
      }
    } catch (storageError) {
      console.error("❌ Fehler beim Laden der gespeicherten Log-Filter:", storageError);
    } finally {
      setFiltersReady(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersReady) return;

    let cancelled = false;
    axios.get("/api/logs", { params: { limit: 500 } })
      .then((response) => {
        if (cancelled) return;
        updateFilterOptions(response.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("⚠️ Konnte Filteroptionen nicht aktualisieren:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [filtersReady, updateFilterOptions, refreshSignal]);

  const currentFilters = useMemo(() => ({
    stacks: selectedStacks,
    statuses: selectedStatuses,
    endpoints: selectedEndpoints,
    message: messageQuery,
    from: fromDate,
    to: toDate
  }), [selectedStacks, selectedStatuses, selectedEndpoints, messageQuery, fromDate, toDate]);

  const stackLabelMap = useMemo(() => {
    const map = new Map();
    stackOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [stackOptions]);

  const stackSelectOptions = useMemo(() => {
    const entries = stackOptions.filter((option) => option.value !== ALL_OPTION_VALUE);
    return [
      { value: ALL_OPTION_VALUE, label: ALL_OPTION_LABEL },
      ...entries
    ];
  }, [stackOptions]);

  const statusSelectOptions = useMemo(() => {
    const entries = statusOptions
      .filter((status) => status !== ALL_OPTION_VALUE)
      .map((status) => ({ value: status, label: status }));
    return [
      { value: ALL_OPTION_VALUE, label: ALL_OPTION_LABEL },
      ...entries
    ];
  }, [statusOptions]);

  const endpointSelectOptions = useMemo(() => {
    const entries = endpointOptions
      .filter((endpoint) => endpoint !== ALL_OPTION_VALUE)
      .map((endpoint) => ({ value: endpoint, label: endpoint }));
    return [
      { value: ALL_OPTION_VALUE, label: ALL_OPTION_LABEL },
      ...entries
    ];
  }, [endpointOptions]);

  useEffect(() => {
    if (!filtersReady) return;

    const params = { limit: 200 };

    if (currentFilters.stacks.length) {
      params.stackIds = currentFilters.stacks.join(",");
    }

    if (currentFilters.statuses.length) {
      params.statuses = currentFilters.statuses.join(",");
    }

    if (currentFilters.endpoints.length) {
      params.endpoints = currentFilters.endpoints.join(",");
    }

    if (currentFilters.message.trim()) {
      params.message = currentFilters.message.trim();
    }

    const fromParam = normalizeDateParam(currentFilters.from);
    if (fromParam) {
      params.from = fromParam;
    }

    const toParam = normalizeDateParam(currentFilters.to);
    if (toParam) {
      params.to = toParam;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    axios.get("/api/logs", { params })
      .then((response) => {
        if (cancelled) return;
        setLogs(response.data);
        updateFilterOptions(response.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("❌ Fehler beim Laden der Logs:", err);
        setError("Fehler beim Laden der Redeploy-Logs");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filtersReady, currentFilters, updateFilterOptions, refreshSignal]);

  useEffect(() => {
    if (!filtersReady) return;
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          filters: currentFilters,
          options: {
            stacks: stackOptions,
            statuses: statusOptions,
            endpoints: endpointOptions,
          }
        })
      );
    } catch (storageError) {
      console.error("⚠️ Konnte Filter nicht speichern:", storageError);
    }
  }, [filtersReady, currentFilters, stackOptions, statusOptions, endpointOptions]);

  const handleMultiSelectChange = (setter) => (event) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    if (values.includes(ALL_OPTION_VALUE)) {
      setter([]);
      return;
    }
    setter(values);
  };

  const handleResetFilters = () => {
    setSelectedStacks([]);
    setSelectedStatuses([]);
    setSelectedEndpoints([]);
    setMessageQuery("");
    setFromDate("");
    setToDate("");
    setFiltersOpen(false);
  };

  const handleToggleFilters = () => {
    setFiltersOpen((prev) => !prev);
  };

  const handleRefresh = () => {
    setRefreshSignal((prev) => prev + 1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStacks.length) count += selectedStacks.length;
    if (selectedStatuses.length) count += selectedStatuses.length;
    if (selectedEndpoints.length) count += selectedEndpoints.length;
    if (messageQuery.trim()) count += 1;
    if (fromDate) count += 1;
    if (toDate) count += 1;
    return count;
  }, [selectedStacks, selectedStatuses, selectedEndpoints, messageQuery, fromDate, toDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-100">Redeploy-Logs</h2>
        <div className="flex items-center gap-3">
          {loading && <span className="text-sm text-gray-400">Aktualisiere…</span>}
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-md font-medium transition bg-purple-500 hover:bg-purple-600"
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800/60">
        <button
          onClick={handleToggleFilters}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-200 hover:bg-gray-700/40"
        >
          <span>
            Filter {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                {activeFilterCount} aktiv
              </span>
            )}
          </span>
          <span className="text-xs uppercase tracking-wide text-gray-400">
            {filtersOpen ? "Ausblenden" : "Anzeigen"}
          </span>
        </button>

        {filtersOpen && (
          <div className="space-y-4 border-t border-gray-700 px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Stack</label>
                <select
                  multiple
                  value={selectedStacks}
                  onChange={handleMultiSelectChange(setSelectedStacks)}
                  className="w-full min-h-[8rem] rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {stackSelectOptions.map(({ value, label }) => (
                    <option
                      key={value}
                      value={value}
                      className={`bg-gray-900 text-gray-200 ${value === ALL_OPTION_VALUE ? 'font-semibold text-gray-100' : ''}`}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 min-h-[1.5rem] text-xs text-gray-400">
                  {selectedStacks.length === 0 ? (
                    <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                      Alle Stacks
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedStacks.map((stackId) => (
                        <span
                          key={stackId}
                          className="rounded-full bg-purple-500/20 px-2 py-0.5 text-purple-200"
                        >
                          {stackLabelMap.get(stackId) ?? `Stack ${stackId}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Status</label>
                <select
                  multiple
                  value={selectedStatuses}
                  onChange={handleMultiSelectChange(setSelectedStatuses)}
                  className="w-full min-h-[8rem] rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {statusSelectOptions.map(({ value, label }) => (
                    <option
                      key={value}
                      value={value}
                      className={`bg-gray-900 text-gray-200 ${value === ALL_OPTION_VALUE ? 'font-semibold text-gray-100' : ''}`}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 min-h-[1.5rem] text-xs text-gray-400">
                  {selectedStatuses.length === 0 ? (
                    <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                      Alle Status
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedStatuses.map((status) => (
                        <span
                          key={status}
                          className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200"
                        >
                          {status}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Endpoint</label>
                <select
                  multiple
                  value={selectedEndpoints}
                  onChange={handleMultiSelectChange(setSelectedEndpoints)}
                  className="w-full min-h-[8rem] rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {endpointSelectOptions.map(({ value, label }) => (
                    <option
                      key={value}
                      value={value}
                      className={`bg-gray-900 text-gray-200 ${value === ALL_OPTION_VALUE ? 'font-semibold text-gray-100' : ''}`}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 min-h-[1.5rem] text-xs text-gray-400">
                  {selectedEndpoints.length === 0 ? (
                    <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                      Alle Endpoints
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedEndpoints.map((endpoint) => (
                        <span
                          key={endpoint}
                          className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-200"
                        >
                          {endpoint}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="mb-2 block text-sm font-medium text-gray-300">Nachricht (Freitext)</label>
                <input
                  type="text"
                  value={messageQuery}
                  onChange={(event) => setMessageQuery(event.target.value)}
                  placeholder="Textsuche in Log-Nachrichten..."
                  className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Von</label>
                <input
                  type="datetime-local"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Bis</label>
                <input
                  type="datetime-local"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={handleResetFilters}
                className="rounded-md border border-gray-600 px-4 py-2 text-gray-200 transition hover:bg-gray-700"
              >
                Zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto bg-gray-800/60 rounded-xl border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr className="text-left text-sm uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Zeitpunkt</th>
              <th className="px-4 py-3">Stack</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Nachricht</th>
              <th className="px-4 py-3">Endpoint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 text-sm">
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-4 py-6 text-center text-gray-400">
                  Keine Logs vorhanden.
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
              return (
                <tr key={log.id} className="hover:bg-gray-700/40">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="flex flex-col">
                      <span className="font-medium">{log.stackName || "Unbekannt"}</span>
                      <span className="text-xs text-gray-400">ID: {log.stackId}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${statusClass}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {log.message || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {log.endpoint ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
