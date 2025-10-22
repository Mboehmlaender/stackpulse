import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Avatar,
  Chip,
  Tooltip,
  Progress,
  Collapse,
  Button,
  ButtonGroup,
  Select,
  Option,
  Input,
  useSelect
} from "@material-tailwind/react";
import { PaginationControls, usePage } from "@/components/PageProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { useToast } from "@/components/ToastProvider.jsx";

const UPDATE_STAGE_LABELS = {
  initializing: "Vorbereitung",
  "activating-maintenance": "Wartungsmodus aktivieren",
  "executing-script": "Skript wird ausgeführt",
  waiting: "Warte auf Portainer",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen"
};

const StickyOption = React.forwardRef(({ value, onClick, onKeyDown, ...props }, ref) => {
  const { setOpen } = useSelect();

  const reopen = useCallback(() => {
    const schedule = (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function")
      ? window.requestAnimationFrame
      : (callback) => setTimeout(callback, 0);

    schedule(() => {
      setOpen(true);
    });
  }, [setOpen]);

  const handleClick = useCallback((event) => {
    if (typeof onClick === "function") {
      onClick(event);
    }

    reopen();
  }, [onClick, reopen]);

  const handleKeyDown = useCallback((event) => {
    if (typeof onKeyDown === "function") {
      onKeyDown(event);
    }

    if (event.key === "Enter" || event.key === " ") {
      reopen();
    }
  }, [onKeyDown, reopen]);

  return (
    <Option
      {...props}
      value={value}
      ref={ref}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
});

StickyOption.displayName = "StickyOption";

const STATUS_COLORS = {
  success: "text-mossGreen-500",
  warning: "text-warmAmberGlow-500",
  error: "text-sunsetCoral-500",
  started: "text-arcticBlue-500"
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
const REDEPLOY_TYPE_LABELS = {
  Einzeln: "Einzeln",
  Alle: "Alle",
  Auswahl: "Auswahl",
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


export function Logs() {

  const [logs, setLogs] = useState([]);
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

    const { showToast } = useToast();
    const {
      maintenance: maintenanceMeta,
      update: updateState,
      script: scriptConfig,
      ssh: sshConfig,
    } = useMaintenance();
  
    const maintenanceActive = Boolean(maintenanceMeta?.active);
    const maintenanceMessage = maintenanceMeta?.message;
    const updateRunning = Boolean(updateState?.running);
    const maintenanceLocked = maintenanceActive || updateRunning;
    const updateStageLabel = updateState?.stage ? (UPDATE_STAGE_LABELS[updateState.stage] ?? updateState.stage) : "–";
  

  const {
    page,
    perPage,
    perPageOptions,
    setPage,
    setPerPage: setPerPageValue,
    setTotals,
    handlePerPageChange,
    validPerPageValues,
    resetPagination
  } = usePage();

  const noop = useCallback(() => { }, []);

  useEffect(() => () => resetPagination(), [resetPagination]);

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
          if (validPerPageValues.has(parsedPerPage)) {
            setPerPageValue(parsedPerPage, { resetPage: false });
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
  }, [setPage, setPerPageValue, validPerPageValues]);

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
        setTotals(total, items.length);

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
  }, [filtersReady, buildFilterParams, updateFilterOptions, refreshSignal, perPage, page, setTotals]);

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

  const handleMultiSelectChange = useCallback((setter) => (valueOrEvent) => {
    if (typeof valueOrEvent === "string") {
      const value = valueOrEvent;
      if (value === "") {
        return;
      }

      setter((prev) => {
        if (value === ALL_OPTION_VALUE) {
          return [];
        }

        if (prev.includes(value)) {
          return prev.filter((entry) => entry !== value);
        }

        return [...prev, value];
      });
      setPage(1);
      return;
    }

    const selectedOptions = valueOrEvent?.target?.selectedOptions;
    if (!selectedOptions) {
      return;
    }

    const values = Array.from(selectedOptions).map((option) => option.value);
    if (values.includes(ALL_OPTION_VALUE)) {
      setter([]);
    } else {
      setter(values);
    }
    setPage(1);
  }, [setPage]);

  const selectStacks = useMemo(() => handleMultiSelectChange(setSelectedStacks), [handleMultiSelectChange, setSelectedStacks]);
  const selectStatuses = useMemo(() => handleMultiSelectChange(setSelectedStatuses), [handleMultiSelectChange, setSelectedStatuses]);
  const selectRedeployTypes = useMemo(() => handleMultiSelectChange(setSelectedRedeployTypes), [handleMultiSelectChange, setSelectedRedeployTypes]);
  const selectEndpoints = useMemo(() => handleMultiSelectChange(setSelectedEndpoints), [handleMultiSelectChange, setSelectedEndpoints]);

  const removeFilterValue = (setter, value) => {
    setter((prev) => prev.filter((entry) => entry !== value));
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
  const [open, setOpen] = React.useState(false);
  const toggleOpen = () => setOpen((cur) => !cur);
  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
            {(maintenanceActive || updateRunning) && (<div className="rounded-lg border border-cyan-500/60 bg-cyan-900/30 px-4 py-3 text-sm text-bluegray-100">
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
        <CardHeader variant="gradient" color="gray" className="p-4 pt-2 pb-2">
          <Typography variant="h6" color="white">
            <button
              onClick={handleToggleFilters}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span>Filter und Optionen</span>
                {activeFilterCount > 0 && (

                  <span className="rounded-full bg-blue-gray-500/80 px-2 py-0.5 text-xs text-white">
                    {activeFilterCount} aktiv
                  </span>
                )}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-400">
                {filtersOpen ? "Ausblenden" : "Anzeigen"}
              </span>
            </button>
          </Typography>
        </CardHeader>
        <CardBody>
          {filtersOpen && (
            <div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleExport('txt')}
                  disabled={actionLoading || loading}
                  className="w-full md:flex-1">
                  Export TXT</Button>
                <Button
                  onClick={() => handleExport('sql')}
                  disabled={actionLoading || loading}
                  className="w-full md:flex-1">
                  Export SQL</Button>
                <Button
                  onClick={handleDeleteFiltered}
                  disabled={actionLoading || loading || logs.length === 0}
                  className="w-full md:flex-1 bg-sunsetCoral-500 hover:bg-sunsetCoral-600">
                  Angezeigte löschen</Button>
              </div>

              <div className="flex flex-wrap gap-2 mt-10">
                <div className="grid gap-4 flex-1">
                  <Select
                    multiple
                    onChange={noop}
                    className="text-stormGrey-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Stacks"
                  >
                    {stackSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onClick={() => selectStacks(value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectStacks(value);
                          }
                        }}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                    {selectedStacks.length === 0 ? (
                      <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white ">
                        Alle Stacks
                      </span>
                    ) : (
                      <span>
                        {selectedStacks.map((stackId) => (
                          <button
                            key={stackId}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedStacks, stackId)}
                            className="rounded-full bg-lavenderSmoke-600/80 px-2 py-0.5 text-white transition hover:bg-lavenderSmoke-600/90 focus:outline-none focus:ring-2 focus:ring-lavenderSmoke-400 cursor-pointer"
                            title="Filter entfernen"
                          >
                            {stackLabelMap.get(stackId) ?? `Stack ${stackId}`}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 flex-1">
                  <Select
                    multiple
                    onChange={noop}
                    className="text-stormGrey-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Status"
                  >
                    {statusSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onClick={() => selectStatuses(value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectStatuses(value);
                          }
                        }}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                    {selectedStatuses.length === 0 ? (
                      <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                        Alle Status
                      </span>
                    ) : (
                      <span>
                        {selectedStatuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedStatuses, status)}
                            className="rounded-full bg-copperRust-600/80 px-2 py-0.5 text-white transition hover:bg-copperRust-600/90 focus:outline-none focus:ring-2 focus:ring-copperRust-400 cursor-pointer"
                            title="Filter entfernen"
                          >
                            {status}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 flex-1">
                  <Select
                    multiple
                    onChange={noop}
                    className="text-stormGrey-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Redeploy-Typ"
                  >
                    {redeployTypeSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onClick={() => selectRedeployTypes(value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectRedeployTypes(value);
                          }
                        }}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>

                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                    {selectedRedeployTypes.length === 0 ? (
                      <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                        Alle Typen
                      </span>
                    ) : (
                      <span>
                        {selectedRedeployTypes.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedRedeployTypes, type)}
                            className="rounded-full bg-citrusPunch-600/80 px-2 py-0.5 text-white transition hover:bg-citrusPunch-600/90 focus:outline-none focus:ring-2 focus:ring-citrusPunch-400 cursor-pointer"
                            title="Filter entfernen"
                          >
                            {REDEPLOY_TYPE_LABELS[type] ?? type}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 flex-1">
                  <Select
                    multiple
                    onChange={noop}
                    className="text-stormGrey-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Endpoints"
                  >
                    {endpointSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onClick={() => selectEndpoints(value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectEndpoints(value);
                          }
                        }}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                    {selectedEndpoints.length === 0 ? (
                      <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                        Alle Endpoints
                      </span>
                    ) : (
                      <span>
                        {selectedEndpoints.map((endpoint) => (
                          <button
                            key={endpoint}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedEndpoints, endpoint)}
                            className="rounded-full bg-emeraldMist-500/80 px-2 py-0.5 text-white transition hover:bg-emeraldMist-500/90 focus:outline-none focus:ring-2 focus:ring-emeraldMist-400 cursor-pointer"
                            title="Filter entfernen"
                          >
                            Endpoint {endpoint}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mt-8">
                <div className="md:flex-1">
                  <Input
                    value={messageQuery}
                    onChange={(event) => {
                      setMessageQuery(event.target.value);
                      setPage(1);
                    }}
                    variant="static"
                    label="Nachricht (Freitext)"
                    placeholder="Suche" />
                </div>
                <div className="md:mt-0 mt-8 md:flex-1">
                  <Select
                    variant="static"
                    label="Einträge pro Seite"
                    onChange={noop}
                    value={perPage}
                  >
                    {perPageOptions.map(({ value, label }) => (
                      <Option
                        key={value}
                        value={value}
                        onClick={() => handlePerPageChange(value)}
                      >
                        {label}
                      </Option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex flex-col md:flex-row flex-wrap gap-4 mt-8">
                <div className="flex-1">
                  <Input
                    type="datetime-local"
                    variant="static"
                    label="Von"
                    value={fromDate}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                      setPage(1);
                    }}
                    className="w-full"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    type="datetime-local"
                    variant="static"
                    label="Bis"
                    value={toDate}
                    onChange={(event) => {
                      setToDate(event.target.value);
                      setPage(1);
                    }}
                    className="w-full"
                  />
                </div>
                <div className="flex-1">
                  <Button
                    onClick={handleResetFilters}
                    disabled={actionLoading || loading}
                    className="w-full"
                  >
                    Zurücksetzen
                  </Button>
                </div>
              </div>

            </div>

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
            <span>Logs</span>
          </Typography>
        </CardHeader>
        <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
          <table className="w-full min-w-[640px] table-auto">
            <thead>
              <tr>
                {["Zeitpunkt", "Stack", "Art", "Status", "Nachricht", "Endpoint", "Aktionen"].map((el) => (
                  <th
                    key={el}
                    className="border-b border-stormGrey-50 py-3 px-5 text-left"
                  >
                    <Typography
                      variant="small"
                      className="text-[11px] font-bold uppercase text-stormGrey-400"
                    >
                      {el}
                    </Typography>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
                const className = "py-3 px-5";
                const stackDisplayName = log.stackName || "Unbekannt";
                const showStackId = stackDisplayName !== '---' && log.stackId !== undefined && log.stackId !== null;
                const redeployTypeLabel = log.redeployType
                  ? (REDEPLOY_TYPE_LABELS[log.redeployType] ?? log.redeployType)
                  : '---';
                return (
                  <tr key={log.id}>
                    <td className={className}>
                      <Typography
                        variant="small"
                        className="mb-1 block text-xs font-medium text-stormGrey-600">
                        {formatTimestamp(log.timestamp)}
                      </Typography>
                    </td>
                    <td className={className}>
                      <div className="flex flex-col">
                        <span className="font-medium">{stackDisplayName}</span>
                        <Typography
                          variant="small"
                        >
                          {showStackId && (
                            <span className="text-xs text-stormGrey-400">ID: {log.stackId}</span>
                          )}
                        </Typography>
                      </div>
                    </td>
                    <td className={className}>
                      <Typography
                        variant="small"
                      >
                        {redeployTypeLabel}
                      </Typography>
                    </td>
                    <td className={className}>
                      <Typography
                        variant="small"
                        className={`font-semibold ${statusClass}`}
                      >
                        {log.status}
                      </Typography>
                    </td>
                    <td className={className}>
                      <Typography
                        variant="small"
                      >
                        {log.message || "-"}
                      </Typography>
                    </td>
                    <td className={className}>
                      <Typography
                        variant="small"
                      >
                        {log.endpoint ?? "-"}
                      </Typography>
                    </td>
                    <td className={className}>
                      <Typography
                        variant="small"
                      >
                        <button
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={actionLoading}
                          className="rounded-md border border-sunsetCoral-600 px-3 py-1 text-xs text-sunsetCoral-800 transition hover:bg-sunsetCoral-600/20 disabled:opacity-60">
                          Löschen
                        </button>
                      </Typography>
                    </td>
                  </tr>
                );
              }
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
      <PaginationControls disabled={actionLoading} />
    </div>


  );
}

export default Logs;
