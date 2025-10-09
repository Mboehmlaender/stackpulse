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
const PER_PAGE_DEFAULT = "50";
const PER_PAGE_OPTIONS = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "Alle" }
];
const VALID_PER_PAGE_VALUES = new Set(PER_PAGE_OPTIONS.map((option) => option.value));

const REDEPLOY_TYPE_LABELS = {
  Einzeln: "Einzeln",
  Alle: "Alle",
  Auswahl: "Auswahl",
  Wartung: "Wartung",
  maintenance: "Wartung",
  single: "Einzeln",
  all: "Alle",
  selection: "Auswahl"
};

const hasActiveFilters = (filters) => Boolean(
  (filters.stacks && filters.stacks.length) ||
  (filters.statuses && filters.statuses.length) ||
  (filters.endpoints && filters.endpoints.length) ||
  (filters.redeployTypes && filters.redeployTypes.length) ||
  (filters.message && filters.message.trim()) ||
  (filters.from && filters.from.trim()) ||
  (filters.to && filters.to.trim())
);

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [stackOptions, setStackOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [endpointOptions, setEndpointOptions] = useState([]);
  const [redeployTypeOptions, setRedeployTypeOptions] = useState([]);

  const [selectedStacks, setSelectedStacks] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedEndpoints, setSelectedEndpoints] = useState([]);
  const [selectedRedeployTypes, setSelectedRedeployTypes] = useState([]);
  const [messageQuery, setMessageQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [optionsInitialized, setOptionsInitialized] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [perPage, setPerPage] = useState(PER_PAGE_DEFAULT);
  const [page, setPage] = useState(1);

  const updateFilterOptions = useCallback((payload) => {
    const logsPayload = Array.isArray(payload) ? payload : payload?.items ?? [];

    const stackMap = new Map();
    const statusSet = new Set();
    const endpointSet = new Set();
    const redeployTypeSet = new Set();

    logsPayload.forEach((log) => {
      if (log.stackId) {
        const value = String(log.stackId);
        const label = log.stackName || `Stack ${value}`;
        stackMap.set(value, label);
      }

      if (log.status) {
        statusSet.add(log.status);
      }

      if (log.endpoint !== null && log.endpoint !== undefined && log.endpoint !== "") {
        endpointSet.add(String(log.endpoint));
      }

      if (log.redeployType) {
        redeployTypeSet.add(log.redeployType);
      }
    });

    setStackOptions(Array.from(stackMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)));

    setStatusOptions(Array.from(statusSet).sort());

    setEndpointOptions(Array.from(endpointSet)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));

    setRedeployTypeOptions(Array.from(redeployTypeSet).sort());
    setOptionsInitialized(true);
  }, []);

  const stackLabelMap = useMemo(() => {
    const map = new Map();
    stackOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [stackOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedStacks((prev) => {
      const valid = prev.filter((value) => stackOptions.some((option) => option.value === value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, stackOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedStatuses((prev) => {
      const valid = prev.filter((value) => statusOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, statusOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedEndpoints((prev) => {
      const valid = prev.filter((value) => endpointOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, endpointOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedRedeployTypes((prev) => {
      const valid = prev.filter((value) => redeployTypeOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, redeployTypeOptions]);

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
        const storedPagination = parsed?.pagination ?? {};

        setSelectedStacks(storedFilters.stacks || []);
        setSelectedStatuses(storedFilters.statuses || []);
        setSelectedEndpoints(storedFilters.endpoints || []);
        setSelectedRedeployTypes(storedFilters.redeployTypes || []);
        setMessageQuery(storedFilters.message || "");
        setFromDate(storedFilters.from || "");
        setToDate(storedFilters.to || "");
        setFiltersOpen(hasActiveFilters(storedFilters));

        const rawPerPage = storedPagination.perPage;
        if (rawPerPage !== undefined) {
          const parsedPerPage = String(rawPerPage);
          if (VALID_PER_PAGE_VALUES.has(parsedPerPage)) {
            setPerPage(parsedPerPage);
          }
        }

        const rawPage = storedPagination.page;
        if (typeof rawPage === 'number' && rawPage > 0) {
          setPage(rawPage);
        }
      }
    } catch (storageError) {
      console.error("❌ Fehler beim Laden der gespeicherten Log-Filter:", storageError);
    } finally {
      setFiltersReady(true);
    }
  }, []);

  const buildFilterParams = useCallback(() => {
    const params = {};

    if (selectedStacks.length) {
      params.stackIds = selectedStacks.join(",");
    }

    if (selectedStatuses.length) {
      params.statuses = selectedStatuses.join(",");
    }

    if (selectedEndpoints.length) {
      params.endpoints = selectedEndpoints.join(",");
    }

    if (selectedRedeployTypes.length) {
      params.redeployTypes = selectedRedeployTypes.join(",");
    }

    if (messageQuery.trim()) {
      params.message = messageQuery.trim();
    }

    const fromParam = normalizeDateParam(fromDate);
    if (fromParam) {
      params.from = fromParam;
    }

    const toParam = normalizeDateParam(toDate);
    if (toParam) {
      params.to = toParam;
    }

    return params;
  }, [selectedStacks, selectedStatuses, selectedEndpoints, selectedRedeployTypes, messageQuery, fromDate, toDate]);

  useEffect(() => {
    if (!filtersReady) return;

    let cancelled = false;
    axios.get("/api/logs", { params: { perPage: 'all', page: 1 } })
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
    redeployTypes: selectedRedeployTypes,
    message: messageQuery,
    from: fromDate,
    to: toDate
  }), [selectedStacks, selectedStatuses, selectedEndpoints, selectedRedeployTypes, messageQuery, fromDate, toDate]);

  useEffect(() => {
    if (!filtersReady) return;

    const params = { ...buildFilterParams() };
    if (perPage === 'all') {
      params.perPage = 'all';
      params.page = 1;
    } else {
      params.perPage = perPage;
      params.page = page;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    axios.get("/api/logs", { params })
      .then((response) => {
        if (cancelled) return;
        const data = response.data || {};
        const items = Array.isArray(data) ? data : data.items ?? [];
        const total = Array.isArray(data) ? items.length : data.total ?? items.length;

        setLogs(items);
        setTotalLogs(total);

        if (perPage === 'all') {
          if (page !== 1) setPage(1);
        } else {
          const totalPages = Math.max(1, Math.ceil((total || 0) / Number(perPage)));
          const nextPage = Math.min(Math.max(page, 1), totalPages);
          if (nextPage !== page) {
            setPage(nextPage);
          }
        }
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
  }, [filtersReady, buildFilterParams, updateFilterOptions, refreshSignal, perPage, page]);

  useEffect(() => {
    if (!filtersReady) return;
    if (typeof window === "undefined") return;

    try {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        filters: currentFilters,
        pagination: {
          perPage,
          page
        }
      })
    );
  } catch (storageError) {
    console.error("⚠️ Konnte Filter nicht speichern:", storageError);
  }
  }, [filtersReady, currentFilters, perPage, page]);

  const handleMultiSelectChange = (setter) => (event) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    if (values.includes(ALL_OPTION_VALUE)) {
      setter([]);
    } else {
      setter(values);
    }
    setPage(1);
  };

  const handleOptionMouseDown = (event, currentValues, setter) => {
    event.preventDefault();
    event.stopPropagation();

    const { value } = event.target;
    if (value === ALL_OPTION_VALUE) {
      if (currentValues.length) {
        setter([]);
        setPage(1);
      }
      return;
    }

    const nextValues = currentValues.includes(value)
      ? currentValues.filter((entry) => entry !== value)
      : [...currentValues, value];

    setter(nextValues);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedStacks([]);
    setSelectedStatuses([]);
    setSelectedEndpoints([]);
    setSelectedRedeployTypes([]);
    setMessageQuery("");
    setFromDate("");
    setToDate("");
    setFiltersOpen(false);
    setPage(1);
  };

  const handleToggleFilters = () => {
    setFiltersOpen((prev) => !prev);
  };

  const handleRefresh = () => {
    setRefreshSignal((prev) => prev + 1);
  };

  const handlePerPageChange = (event) => {
    const value = event.target.value;
    if (!VALID_PER_PAGE_VALUES.has(value)) return;
    setPerPage(value);
    setPage(1);
  };

  const handlePageChange = (nextPage) => {
    if (perPage === 'all') return;
    if (nextPage < 1) return;
    const totalPages = Math.max(1, Math.ceil((totalLogs || 0) / Number(perPage)));
    if (nextPage > totalPages) return;
    setPage(nextPage);
  };

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

  const redeployTypeSelectOptions = useMemo(() => {
    const entries = redeployTypeOptions
      .filter((type) => type !== ALL_OPTION_VALUE)
      .map((type) => ({ value: type, label: REDEPLOY_TYPE_LABELS[type] ?? type }));
    return [
      { value: ALL_OPTION_VALUE, label: ALL_OPTION_LABEL },
      ...entries
    ];
  }, [redeployTypeOptions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStacks.length) count += selectedStacks.length;
    if (selectedStatuses.length) count += selectedStatuses.length;
    if (selectedEndpoints.length) count += selectedEndpoints.length;
    if (selectedRedeployTypes.length) count += selectedRedeployTypes.length;
    if (messageQuery.trim()) count += 1;
    if (fromDate) count += 1;
    if (toDate) count += 1;
    return count;
  }, [selectedStacks, selectedStatuses, selectedEndpoints, messageQuery, fromDate, toDate]);

  const totalPages = useMemo(() => {
    if (perPage === 'all') return 1;
    const numeric = Number(perPage) || Number(PER_PAGE_DEFAULT);
    return Math.max(1, Math.ceil((totalLogs || 0) / numeric));
  }, [perPage, totalLogs]);

  const rangeStart = useMemo(() => {
    if (totalLogs === 0) return 0;
    if (perPage === 'all') return 1;
    return (page - 1) * Number(perPage) + 1;
  }, [totalLogs, perPage, page]);

  const rangeEnd = useMemo(() => {
    if (totalLogs === 0) return 0;
    if (perPage === 'all') return totalLogs;
    return Math.min(totalLogs, (page - 1) * Number(perPage) + logs.length);
  }, [totalLogs, perPage, page, logs.length]);

  const handleDeleteLog = async (id) => {
    if (!window.confirm("Diesen Log-Eintrag dauerhaft löschen?")) return;
    setActionLoading(true);
    setError("");
    try {
      await axios.delete(`/api/logs/${id}`);
      setRefreshSignal((prev) => prev + 1);
    } catch (err) {
      console.error("❌ Fehler beim Löschen des Logs:", err);
      setError("Fehler beim Löschen des Redeploy-Logs");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteFiltered = async () => {
    if (!logs.length) return;
    if (!window.confirm("Alle angezeigten Logs (entsprechend Filter) löschen?")) return;
    setActionLoading(true);
    setError("");
    try {
      const params = {
        ...buildFilterParams(),
        ids: logs.map((log) => log.id).join(',')
      };
      await axios.delete("/api/logs", { params });
      setRefreshSignal((prev) => prev + 1);
    } catch (err) {
      console.error("❌ Fehler beim Löschen der gefilterten Logs:", err);
      setError("Fehler beim Löschen der gefilterten Logs");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (format) => {
    setActionLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/logs/export", {
        params: { ...buildFilterParams(), format },
        responseType: "blob"
      });

      const contentType = response.headers["content-type"] || (format === "sql" ? "application/sql" : "text/plain");
      const disposition = response.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `redeploy-logs.${format}`;

      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("❌ Fehler beim Export der Logs:", err);
      setError("Fehler beim Export der Redeploy-Logs");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-100">Redeploy-Logs</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleExport('txt')}
            disabled={actionLoading || loading}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-gray-700 disabled:opacity-60"
          >
            Export TXT
          </button>
          <button
            onClick={() => handleExport('sql')}
            disabled={actionLoading || loading}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-gray-700 disabled:opacity-60"
          >
            Export SQL
          </button>
          <button
            onClick={handleDeleteFiltered}
            disabled={actionLoading || loading || logs.length === 0}
            className="rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-600/20 disabled:opacity-60"
          >
            Angezeigte löschen
          </button>
          {loading && <span className="text-sm text-gray-400">Aktualisiere…</span>}
          <button
            onClick={handleRefresh}
            disabled={actionLoading}
            className="px-4 py-2 rounded-md font-medium transition bg-purple-500 hover:bg-purple-600 disabled:opacity-60"
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                      onMouseDown={(event) => handleOptionMouseDown(event, selectedStacks, setSelectedStacks)}
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
                      onMouseDown={(event) => handleOptionMouseDown(event, selectedStatuses, setSelectedStatuses)}
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
                      onMouseDown={(event) => handleOptionMouseDown(event, selectedEndpoints, setSelectedEndpoints)}
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

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Redeploy-Typ</label>
                <select
                  multiple
                  value={selectedRedeployTypes}
                  onChange={handleMultiSelectChange(setSelectedRedeployTypes)}
                  className="w-full min-h-[8rem] rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {redeployTypeSelectOptions.map(({ value, label }) => (
                    <option
                      key={value}
                      value={value}
                      onMouseDown={(event) => handleOptionMouseDown(event, selectedRedeployTypes, setSelectedRedeployTypes)}
                      className={`bg-gray-900 text-gray-200 ${value === ALL_OPTION_VALUE ? 'font-semibold text-gray-100' : ''}`}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 min-h-[1.5rem] text-xs text-gray-400">
                  {selectedRedeployTypes.length === 0 ? (
                    <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                      Alle Typen
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedRedeployTypes.map((type) => (
                        <span
                          key={type}
                          className="rounded-full bg-teal-500/20 px-2 py-0.5 text-teal-200"
                        >
                          {REDEPLOY_TYPE_LABELS[type] ?? type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-4">
                <label className="mb-2 block text-sm font-medium text-gray-300">Nachricht (Freitext)</label>
                <input
                  type="text"
                  value={messageQuery}
                  onChange={(event) => {
                    setMessageQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Textsuche in Log-Nachrichten..."
                  className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Von</label>
                <input
                  type="datetime-local"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Bis</label>
                <input
                  type="datetime-local"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setPage(1);
                  }}
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

      <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-gray-300">
        <span>Einträge pro Seite</span>
        <select
          value={perPage}
          onChange={handlePerPageChange}
          className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          {PER_PAGE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto bg-gray-800/60 rounded-xl border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr className="text-left text-sm uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Zeitpunkt</th>
              <th className="px-4 py-3">Stack</th>
              <th className="px-4 py-3">Art</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Nachricht</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 text-sm">
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan="7" className="px-4 py-6 text-center text-gray-400">
                  Keine Logs vorhanden.
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
              const stackDisplayName = log.stackName || "Unbekannt";
              const showStackId = stackDisplayName !== '---' && log.stackId !== undefined && log.stackId !== null;
              const redeployTypeLabel = log.redeployType
                ? (REDEPLOY_TYPE_LABELS[log.redeployType] ?? log.redeployType)
                : '---';
              return (
                <tr key={log.id} className="hover:bg-gray-700/40">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="flex flex-col">
                      <span className="font-medium">{stackDisplayName}</span>
                      {showStackId && (
                        <span className="text-xs text-gray-400">ID: {log.stackId}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {redeployTypeLabel}
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      disabled={actionLoading}
                      className="rounded-md border border-red-600 px-3 py-1 text-xs text-red-300 transition hover:bg-red-600/20 disabled:opacity-60"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-300">
        <span>
          {totalLogs === 0
            ? "Keine Einträge"
            : perPage === 'all'
              ? `Zeige alle ${totalLogs} Einträge`
              : `Zeige ${rangeStart.toLocaleString()} – ${rangeEnd.toLocaleString()} von ${totalLogs.toLocaleString()} Einträgen`}
        </span>
        {perPage !== 'all' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || actionLoading}
              className="rounded-md border border-gray-600 px-3 py-1 text-gray-200 transition hover:bg-gray-700 disabled:opacity-60"
            >
              Zurück
            </button>
            <span className="text-gray-400">
              Seite {page} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || actionLoading}
              className="rounded-md border border-gray-600 px-3 py-1 text-gray-200 transition hover:bg-gray-700 disabled:opacity-60"
            >
              Weiter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
