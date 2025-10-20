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

const StickyOption = React.forwardRef(({ value, onValueSelect, onClick, onKeyDown, ...props }, ref) => {
  const { setOpen } = useSelect();

  const reopen = useCallback(() => {
    const schedule = (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function")
      ? window.requestAnimationFrame
      : (callback) => setTimeout(callback, 0);

    schedule(() => {
      setOpen(true);
    });
  }, [setOpen]);

  const commitSelection = useCallback(() => {
    if (typeof onValueSelect === "function") {
      onValueSelect(value);
    }
  }, [onValueSelect, value]);

  const handleClick = useCallback((event) => {
    if (typeof onClick === "function") {
      onClick(event);
    }

    commitSelection();
    reopen();
  }, [onClick, commitSelection, reopen]);

  const handleKeyDown = useCallback((event) => {
    if (typeof onKeyDown === "function") {
      onKeyDown(event);
    }

    if (event.key === "Enter" || event.key === " ") {
      commitSelection();
      reopen();
    }
  }, [onKeyDown, commitSelection, reopen]);

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

  const noop = useCallback(() => { }, []);

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

  const handleMultiSelectChange = (setter) => (valueOrEvent) => {
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
  };

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
  const [open, setOpen] = React.useState(false);
  const toggleOpen = () => setOpen((cur) => !cur);
  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="gray" className="p-6 pt-2 pb-2">
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
                  color="red"
                  onClick={handleDeleteFiltered}
                  disabled={actionLoading || loading || logs.length === 0}
                  className="w-full md:flex-1">
                  Angezeigte löschen</Button>
              </div>

              <div className="flex flex-wrap gap-2 mt-10">
                <div className="grid gap-4 flex-1">
                  <Select
                    multiple
                    onChange={noop}
                    className="text-gray-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Stacks"
                  >
                    {stackSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onValueSelect={handleMultiSelectChange(setSelectedStacks)}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-gray-400">
                    {selectedStacks.length === 0 ? (
                      <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300 ">
                        Alle Stacks
                      </span>
                    ) : (
                      <span>
                        {selectedStacks.map((stackId) => (
                          <button
                            key={stackId}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedStacks, stackId)}
                            className="rounded-full bg-purple-500/80 px-2 py-0.5 text-white transition hover:bg-purple-500/90 focus:outline-none focus:ring-2 focus:ring-purple-300 cursor-pointer"
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
                    className="text-gray-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Status"
                  >
                    {statusSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onValueSelect={handleMultiSelectChange(setSelectedStatuses)}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-gray-400">
                    {selectedStatuses.length === 0 ? (
                      <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                        Alle Status
                      </span>
                    ) : (
                      <span>
                        {selectedStatuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedStatuses, status)}
                            className="rounded-full bg-brown-500/80 px-2 py-0.5 text-white transition hover:bg-brown-500/90 focus:outline-none focus:ring-2 focus:ring-brown-300 cursor-pointer"
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
                    className="text-gray-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Redeploy-Typ"
                  >
                    {redeployTypeSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onValueSelect={handleMultiSelectChange(setSelectedRedeployTypes)}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>

                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-gray-400">
                    {selectedRedeployTypes.length === 0 ? (
                      <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                        Alle Typen
                      </span>
                    ) : (
                      <span>
                        {selectedRedeployTypes.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedRedeployTypes, type)}
                            className="rounded-full bg-brown-500/80 px-2 py-0.5 text-white transition hover:bg-brown-500/90 focus:outline-none focus:ring-2 focus:ring-brown-300 cursor-pointer"
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
                    className="text-gray-500"
                    variant="static"
                    dismiss={{ itemPress: false }}
                    label="Endpoints"
                  >
                    {endpointSelectOptions.map(({ value, label }) => (
                      <StickyOption
                        key={value}
                        value={value}
                        onValueSelect={handleMultiSelectChange(setSelectedEndpoints)}
                        className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                      >
                        {label}
                      </StickyOption>
                    ))}
                  </Select>
                  <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-gray-400">
                    {selectedEndpoints.length === 0 ? (
                      <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-gray-300">
                        Alle Endpoints
                      </span>
                    ) : (
                      <span>
                        {selectedEndpoints.map((endpoint) => (
                          <button
                            key={endpoint}
                            type="button"
                            onClick={() => removeFilterValue(setSelectedEndpoints, endpoint)}
                            className="rounded-full bg-teal-500/80 px-2 py-0.5 text-white transition hover:bg-teal-500/90 focus:outline-none focus:ring-2 focus:ring-brown-300 cursor-pointer"
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
              <div className="flex flex-wrap gap-2 mt-5">
                <div className="grid gap-4 flex-1">
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
        <CardHeader variant="gradient" color="gray" className="mb-8 p-6">
          <Typography
            variant="h6"
            color="white"
            className="flex items-center justify-between"
          >
            <span>Logs</span>

            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">
                Einträge pro Seite:
              </span>
              <select
                value={perPage}
                onChange={handlePerPageChange}
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {PER_PAGE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </Typography>
        </CardHeader>
        <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
          <table className="w-full min-w-[640px] table-auto">
            <thead>
              <tr>
                {["Zeitpunkt", "Stack", "Art", "Status", "Nachricht", "Endpoint", "Aktionen"].map((el) => (
                  <th
                    key={el}
                    className="border-b border-blue-gray-50 py-3 px-5 text-left"
                  >
                    <Typography
                      variant="small"
                      className="text-[11px] font-bold uppercase text-blue-gray-400"
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
                        className="mb-1 block text-xs font-medium text-blue-gray-600">
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
                            <span className="text-xs text-gray-400">ID: {log.stackId}</span>
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
                          className="rounded-md border border-red-600 px-3 py-1 text-xs text-red-300 transition hover:bg-red-600/20 disabled:opacity-60">
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              className="rounded-md border border-slate-300 p-2.5 text-center text-sm transition-all shadow-sm hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none">

              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <path d="M11.03 3.97a.75.75 0 0 1 0 1.06l-6.22 6.22H21a.75.75 0 0 1 0 1.5H4.81l6.22 6.22a.75.75 0 1 1-1.06 1.06l-7.5-7.5a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 0 1 1.06 0Z" />
              </svg>
            </button>

            <p className="text-slate-600">
              Seite <strong className="text-slate-800">{page}</strong> /&nbsp;<strong className="text-slate-800">{totalPages}</strong>
            </p>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || actionLoading}
              className="rounded-md border border-slate-300 p-2.5 text-center text-sm transition-all shadow-sm hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4">
                <path d="M12.97 3.97a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 1 1-1.06-1.06l6.22-6.22H3a.75.75 0 0 1 0-1.5h16.19l-6.22-6.22a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>


  );
}

export default Logs;
