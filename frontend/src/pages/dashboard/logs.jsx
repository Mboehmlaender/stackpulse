import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Button,
  Select,
  Option,
  Input,
  useSelect
} from "@material-tailwind/react";
import { PaginationControls, usePage } from "@/components/PageProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";

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
  started: "text-arcticBlue-500",
  running: "text-arcticBlue-500",
  info: "text-arcticBlue-500",
  queued: "text-indigo-500"
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

const FILTER_STORAGE_KEY = "eventLogFilters";
const ALL_OPTION_VALUE = "__all__";
const ALL_OPTION_LABEL = "- Alle -";
const hasActiveFilters = (filters) => Boolean(
  (filters.categories && filters.categories.length) ||
  (filters.eventTypes && filters.eventTypes.length) ||
  (filters.actions && filters.actions.length) ||
  (filters.statuses && filters.statuses.length) ||
  (filters.entityTypes && filters.entityTypes.length) ||
  (filters.contextTypes && filters.contextTypes.length) ||
  (filters.entityId && filters.entityId.trim()) ||
  (filters.contextId && filters.contextId.trim()) ||
  (filters.search && filters.search.trim()) ||
  (filters.from && filters.from.trim()) ||
  (filters.to && filters.to.trim())
);

const formatMetadataValue = (value) => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return "[Objekt]";
    }
  }
  return String(value);
};

const summarizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") return "";
  const entries = Object.entries(metadata);
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => `${key}: ${formatMetadataValue(value)}`)
    .join(" • ");
};


export function Logs() {

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState([]);
  const [eventTypeOptions, setEventTypeOptions] = useState([]);
  const [actionOptions, setActionOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [entityTypeOptions, setEntityTypeOptions] = useState([]);
  const [contextTypeOptions, setContextTypeOptions] = useState([]);

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState([]);
  const [selectedActions, setSelectedActions] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState([]);
  const [selectedContextTypes, setSelectedContextTypes] = useState([]);
  const [entityIdQuery, setEntityIdQuery] = useState("");
  const [contextIdQuery, setContextIdQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);
  const [optionsInitialized, setOptionsInitialized] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const {
    maintenance: maintenanceMeta,
    update: updateState
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

    const categorySet = new Set();
    const eventTypeSet = new Set();
    const actionSet = new Set();
    const statusSet = new Set();
    const entityTypeSet = new Set();
    const contextTypeSet = new Set();

    logsPayload.forEach((log) => {
      if (log.category) categorySet.add(log.category);
      if (log.eventType) eventTypeSet.add(log.eventType);
      if (log.action) actionSet.add(log.action);
      if (log.status) statusSet.add(log.status);
      if (log.entityType) entityTypeSet.add(log.entityType);
      if (log.contextType) contextTypeSet.add(log.contextType);
    });

    setCategoryOptions(Array.from(categorySet).sort());
    setEventTypeOptions(Array.from(eventTypeSet).sort());
    setActionOptions(Array.from(actionSet).sort());
    setStatusOptions(Array.from(statusSet).sort());
    setEntityTypeOptions(Array.from(entityTypeSet).sort());
    setContextTypeOptions(Array.from(contextTypeSet).sort());
    setOptionsInitialized(true);
  }, []);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedCategories((prev) => {
      const valid = prev.filter((value) => categoryOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, categoryOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedEventTypes((prev) => {
      const valid = prev.filter((value) => eventTypeOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, eventTypeOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedActions((prev) => {
      const valid = prev.filter((value) => actionOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, actionOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedStatuses((prev) => {
      const valid = prev.filter((value) => statusOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, statusOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedEntityTypes((prev) => {
      const valid = prev.filter((value) => entityTypeOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, entityTypeOptions]);

  useEffect(() => {
    if (!optionsInitialized) return;
    setSelectedContextTypes((prev) => {
      const valid = prev.filter((value) => contextTypeOptions.includes(value));
      return valid.length === prev.length ? prev : valid;
    });
  }, [optionsInitialized, contextTypeOptions]);

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

        setSelectedCategories(storedFilters.categories || []);
        setSelectedEventTypes(storedFilters.eventTypes || []);
        setSelectedActions(storedFilters.actions || []);
        setSelectedStatuses(storedFilters.statuses || []);
        setSelectedEntityTypes(storedFilters.entityTypes || []);
        setSelectedContextTypes(storedFilters.contextTypes || []);
        setEntityIdQuery(storedFilters.entityId || "");
        setContextIdQuery(storedFilters.contextId || "");
        setSearchQuery(storedFilters.search || "");
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

    if (selectedCategories.length) {
      params.categories = selectedCategories.join(",");
    }

    if (selectedEventTypes.length) {
      params.eventTypes = selectedEventTypes.join(",");
    }

    if (selectedActions.length) {
      params.actions = selectedActions.join(",");
    }

    if (selectedStatuses.length) {
      params.statuses = selectedStatuses.join(",");
    }

    if (selectedEntityTypes.length) {
      params.entityTypes = selectedEntityTypes.join(",");
    }

    if (selectedContextTypes.length) {
      params.contextTypes = selectedContextTypes.join(",");
    }

    if (entityIdQuery.trim()) {
      params.entityId = entityIdQuery.trim();
    }

    if (contextIdQuery.trim()) {
      params.contextId = contextIdQuery.trim();
    }

    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
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
  }, [
    selectedCategories,
    selectedEventTypes,
    selectedActions,
    selectedStatuses,
    selectedEntityTypes,
    selectedContextTypes,
    entityIdQuery,
    contextIdQuery,
    searchQuery,
    fromDate,
    toDate
  ]);

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
    categories: selectedCategories,
    eventTypes: selectedEventTypes,
    actions: selectedActions,
    statuses: selectedStatuses,
    entityTypes: selectedEntityTypes,
    contextTypes: selectedContextTypes,
    entityId: entityIdQuery,
    contextId: contextIdQuery,
    search: searchQuery,
    from: fromDate,
    to: toDate
  }), [
    selectedCategories,
    selectedEventTypes,
    selectedActions,
    selectedStatuses,
    selectedEntityTypes,
    selectedContextTypes,
    entityIdQuery,
    contextIdQuery,
    searchQuery,
    fromDate,
    toDate
  ]);

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
        setError("Fehler beim Laden der Logs");
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

  const selectCategories = useMemo(() => handleMultiSelectChange(setSelectedCategories), [handleMultiSelectChange]);
  const selectEventTypes = useMemo(() => handleMultiSelectChange(setSelectedEventTypes), [handleMultiSelectChange]);
  const selectActions = useMemo(() => handleMultiSelectChange(setSelectedActions), [handleMultiSelectChange]);
  const selectStatuses = useMemo(() => handleMultiSelectChange(setSelectedStatuses), [handleMultiSelectChange]);
  const selectEntityTypes = useMemo(() => handleMultiSelectChange(setSelectedEntityTypes), [handleMultiSelectChange]);
  const selectContextTypes = useMemo(() => handleMultiSelectChange(setSelectedContextTypes), [handleMultiSelectChange]);

  const removeFilterValue = (setter, value) => {
    setter((prev) => prev.filter((entry) => entry !== value));
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedCategories([]);
    setSelectedEventTypes([]);
    setSelectedActions([]);
    setSelectedStatuses([]);
    setSelectedEntityTypes([]);
    setSelectedContextTypes([]);
    setEntityIdQuery("");
    setContextIdQuery("");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    setFiltersOpen(false);
    setPage(1);
  };

  const handleToggleFilters = () => {
    setFiltersOpen((prev) => !prev);
  };

  const createSelectOptions = useCallback((values) => ([
    { value: ALL_OPTION_VALUE, label: ALL_OPTION_LABEL },
    ...values
      .filter((value) => value !== ALL_OPTION_VALUE)
      .map((value) => ({ value, label: value }))
  ]), []);

  const categorySelectOptions = useMemo(() => createSelectOptions(categoryOptions), [createSelectOptions, categoryOptions]);
  const eventTypeSelectOptions = useMemo(() => createSelectOptions(eventTypeOptions), [createSelectOptions, eventTypeOptions]);
  const actionSelectOptions = useMemo(() => createSelectOptions(actionOptions), [createSelectOptions, actionOptions]);
  const statusSelectOptions = useMemo(() => createSelectOptions(statusOptions), [createSelectOptions, statusOptions]);
  const entityTypeSelectOptions = useMemo(() => createSelectOptions(entityTypeOptions), [createSelectOptions, entityTypeOptions]);
  const contextTypeSelectOptions = useMemo(() => createSelectOptions(contextTypeOptions), [createSelectOptions, contextTypeOptions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategories.length) count += selectedCategories.length;
    if (selectedEventTypes.length) count += selectedEventTypes.length;
    if (selectedActions.length) count += selectedActions.length;
    if (selectedStatuses.length) count += selectedStatuses.length;
    if (selectedEntityTypes.length) count += selectedEntityTypes.length;
    if (selectedContextTypes.length) count += selectedContextTypes.length;
    if (entityIdQuery.trim()) count += 1;
    if (contextIdQuery.trim()) count += 1;
    if (searchQuery.trim()) count += 1;
    if (fromDate) count += 1;
    if (toDate) count += 1;
    return count;
  }, [
    selectedCategories,
    selectedEventTypes,
    selectedActions,
    selectedStatuses,
    selectedEntityTypes,
    selectedContextTypes,
    entityIdQuery,
    contextIdQuery,
    searchQuery,
    fromDate,
    toDate
  ]);

  const handleDeleteLog = async (id) => {
    if (!window.confirm("Diesen Log-Eintrag dauerhaft löschen?")) return;
    setActionLoading(true);
    setError("");
    try {
      await axios.delete(`/api/logs/${id}`);
      setRefreshSignal((prev) => prev + 1);
    } catch (err) {
      console.error("❌ Fehler beim Löschen des Logs:", err);
      setError("Fehler beim Löschen des Logs");
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
      const filename = match?.[1] || `event-logs.${format}`;

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
      setError("Fehler beim Export der Logs");
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
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography variant="h6" color="white">
            <button
              onClick={handleToggleFilters}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span>Logs</span>
                {activeFilterCount > 0 && (

                  <span className="rounded-full bg-blue-gray-500/80 px-2 py-0.5 text-xs text-white">
                    {activeFilterCount} aktiv
                  </span>
                )}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-400">
                {filtersOpen ? "Filter ausblenden" : "Filter anzeigen"}
              </span>
            </button>
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">
          {filtersOpen && (
            <div className="mb-8">

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

              <div className="grid gap-6 mt-10">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-3">
                    <Select
                      multiple
                      onChange={noop}
                      className="text-stormGrey-500"
                      variant="static"
                      dismiss={{ itemPress: false }}
                      label="Kategorien"
                    >
                      {categorySelectOptions.map(({ value, label }) => (
                        <StickyOption
                          key={value}
                          value={value}
                          onClick={() => selectCategories(value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectCategories(value);
                            }
                          }}
                          className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                        >
                          {label}
                        </StickyOption>
                      ))}
                    </Select>
                    <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                      {selectedCategories.length === 0 ? (
                        <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                          Alle Kategorien
                        </span>
                      ) : (
                        <span>
                          {selectedCategories.map((category) => (
                            <button
                              key={category}
                              type="button"
                              onClick={() => removeFilterValue(setSelectedCategories, category)}
                              className="rounded-full bg-lavenderSmoke-600/80 px-2 py-0.5 text-white transition hover:bg-lavenderSmoke-600/90 focus:outline-none focus:ring-2 focus:ring-lavenderSmoke-400 cursor-pointer"
                              title="Filter entfernen"
                            >
                              {category}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <Select
                      multiple
                      onChange={noop}
                      className="text-stormGrey-500"
                      variant="static"
                      dismiss={{ itemPress: false }}
                      label="Event-Typen"
                    >
                      {eventTypeSelectOptions.map(({ value, label }) => (
                        <StickyOption
                          key={value}
                          value={value}
                          onClick={() => selectEventTypes(value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectEventTypes(value);
                            }
                          }}
                          className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                        >
                          {label}
                        </StickyOption>
                      ))}
                    </Select>
                    <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                      {selectedEventTypes.length === 0 ? (
                        <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                          Alle Event-Typen
                        </span>
                      ) : (
                        <span>
                          {selectedEventTypes.map((eventType) => (
                            <button
                              key={eventType}
                              type="button"
                              onClick={() => removeFilterValue(setSelectedEventTypes, eventType)}
                              className="rounded-full bg-citrusPunch-600/80 px-2 py-0.5 text-white transition hover:bg-citrusPunch-600/90 focus:outline-none focus:ring-2 focus:ring-citrusPunch-400 cursor-pointer"
                              title="Filter entfernen"
                            >
                              {eventType}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-3">
                    <Select
                      multiple
                      onChange={noop}
                      className="text-stormGrey-500"
                      variant="static"
                      dismiss={{ itemPress: false }}
                      label="Aktionen"
                    >
                      {actionSelectOptions.map(({ value, label }) => (
                        <StickyOption
                          key={value}
                          value={value}
                          onClick={() => selectActions(value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectActions(value);
                            }
                          }}
                          className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                        >
                          {label}
                        </StickyOption>
                      ))}
                    </Select>
                    <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                      {selectedActions.length === 0 ? (
                        <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                          Alle Aktionen
                        </span>
                      ) : (
                        <span>
                          {selectedActions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              onClick={() => removeFilterValue(setSelectedActions, action)}
                              className="rounded-full bg-emeraldMist-500/80 px-2 py-0.5 text-white transition hover:bg-emeraldMist-500/90 focus:outline-none focus:ring-2 focus:ring-emeraldMist-400 cursor-pointer"
                              title="Filter entfernen"
                            >
                              {action}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3">
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
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-3">
                    <Select
                      multiple
                      onChange={noop}
                      className="text-stormGrey-500"
                      variant="static"
                      dismiss={{ itemPress: false }}
                      label="Entitäts-Typen"
                    >
                      {entityTypeSelectOptions.map(({ value, label }) => (
                        <StickyOption
                          key={value}
                          value={value}
                          onClick={() => selectEntityTypes(value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectEntityTypes(value);
                            }
                          }}
                          className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                        >
                          {label}
                        </StickyOption>
                      ))}
                    </Select>
                    <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                      {selectedEntityTypes.length === 0 ? (
                        <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                          Alle Entitäten
                        </span>
                      ) : (
                        <span>
                          {selectedEntityTypes.map((entityType) => (
                            <button
                              key={entityType}
                              type="button"
                              onClick={() => removeFilterValue(setSelectedEntityTypes, entityType)}
                              className="rounded-full bg-indigo-600/80 px-2 py-0.5 text-white transition hover:bg-indigo-600/90 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                              title="Filter entfernen"
                            >
                              {entityType}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <Select
                      multiple
                      onChange={noop}
                      className="text-stormGrey-500"
                      variant="static"
                      dismiss={{ itemPress: false }}
                      label="Kontext"
                    >
                      {contextTypeSelectOptions.map(({ value, label }) => (
                        <StickyOption
                          key={value}
                          value={value}
                          onClick={() => selectContextTypes(value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectContextTypes(value);
                            }
                          }}
                          className={`text-black-600 ${value === ALL_OPTION_VALUE ? 'font-semibold text-black-800' : ''}`}
                        >
                          {label}
                        </StickyOption>
                      ))}
                    </Select>
                    <div className="mt-2 mb-2 min-h-[1.5rem] text-xs text-stormGrey-400">
                      {selectedContextTypes.length === 0 ? (
                        <span className="rounded-full bg-stormGrey-700/60 px-2 py-0.5 text-white">
                          Alle Kontexte
                        </span>
                      ) : (
                        <span>
                          {selectedContextTypes.map((contextType) => (
                            <button
                              key={contextType}
                              type="button"
                              onClick={() => removeFilterValue(setSelectedContextTypes, contextType)}
                              className="rounded-full bg-sunsetCoral-600/80 px-2 py-0.5 text-white transition hover:bg-sunsetCoral-600/90 focus:outline-none focus:ring-2 focus:ring-sunsetCoral-400 cursor-pointer"
                              title="Filter entfernen"
                            >
                              {contextType}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:flex-1">
                    <Input
                      value={entityIdQuery}
                      onChange={(event) => {
                        setEntityIdQuery(event.target.value);
                        setPage(1);
                      }}
                      variant="static"
                      label="Entitäts-ID"
                      placeholder="z. B. Stack-ID"
                    />
                  </div>
                  <div className="md:flex-1">
                    <Input
                      value={contextIdQuery}
                      onChange={(event) => {
                        setContextIdQuery(event.target.value);
                        setPage(1);
                      }}
                      variant="static"
                      label="Kontext-ID"
                      placeholder="z. B. Endpoint-ID"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="md:flex-1">
                    <Input
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setPage(1);
                      }}
                      variant="static"
                      label="Suche (Nachricht & Details)"
                      placeholder="Freitext"
                    />
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
                <div className="flex flex-col md:flex-row flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
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
                  <div className="flex-1 min-w-[200px]">
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
                  <div className="flex-1 min-w-[180px]">
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

            </div>

          )}
          <div className="overflow-x-auto rounded-lg border border-blue-gray-50">
            <table className="w-full min-w-[860px] table-auto text-left">
              <thead>
                <tr className="bg-blue-gray-50/50 text-xs uppercase tracking-wide text-stormGrey-400">
                  {["Zeitpunkt", "Kategorie", "Status", "Entität", "Kontext", "Nachricht", "Details", "Aktionen"].map((el) => (
                    <th key={el} className="px-6 py-4 font-semibold">
                      {el}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-stormGrey-400">
                      Logs werden geladen ...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-stormGrey-400">
                      Keine Logs gefunden.
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => {
                    const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
                    const rowClass = index === logs.length - 1 ? "" : "border-b border-blue-gray-50";
                    const categoryLabel = log.category || "-";
                    const entityPrimary = log.entityName || log.entityId || "-";
                    const entityDetails = [];
                    if (log.entityName && log.entityId) {
                      entityDetails.push(`ID: ${log.entityId}`);
                    } else if (!log.entityName && log.entityId) {
                      entityDetails.push(`ID: ${log.entityId}`);
                    }
                    if (log.entityType) {
                      entityDetails.push(log.entityType);
                    }
                    const contextPrimary = log.contextLabel || log.contextType || (log.contextId ? `#${log.contextId}` : "-");
                    const contextDetails = [];
                    if (log.contextType) {
                      contextDetails.push(log.contextType);
                    }
                    if (log.contextId) {
                      contextDetails.push(`#${log.contextId}`);
                    }
                    const metadataSummary = summarizeMetadata(log.metadata);
                    const detailSegments = [];
                    if (log.actorName || log.actorId) {
                      const actorLabel = log.actorName ? log.actorName : `#${log.actorId}`;
                      const suffix = log.actorName && log.actorId ? ` (#${log.actorId})` : "";
                      detailSegments.push(`Akteur: ${actorLabel}${suffix}`);
                    }
                    if (log.source) {
                      detailSegments.push(`Quelle: ${log.source}`);
                    }
                    if (metadataSummary) {
                      detailSegments.push(metadataSummary);
                    }
                    if (!detailSegments.length) {
                      detailSegments.push("-");
                    }

                    return (
                      <tr key={log.id} className={`text-sm text-stormGrey-700 ${rowClass}`}>
                        <td className="px-6 py-4 align-top">
                          <Typography
                            variant="small"
                            className="block text-xs font-medium text-stormGrey-600"
                          >
                            {formatTimestamp(log.timestamp)}
                          </Typography>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            <span className="font-medium">{categoryLabel}</span>
                            <div className="flex flex-wrap gap-2 text-xs text-stormGrey-400">
                              {log.eventType && (
                                <span className="rounded-full bg-citrusPunch-600/80 px-2 py-0.5 text-white">
                                  {log.eventType}
                                </span>
                              )}
                              {log.action && (
                                <span className="rounded-full bg-emeraldMist-500/80 px-2 py-0.5 text-white">
                                  {log.action}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <Typography
                            variant="small"
                            className={`font-semibold ${statusClass}`}
                          >
                            {log.status || "-"}
                          </Typography>
                          {log.severity && (
                            <Typography variant="small" className="text-xs text-stormGrey-400">
                              {log.severity}
                            </Typography>
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium break-words">{entityPrimary}</span>
                            {entityDetails.length > 0 && (
                              <div className="flex flex-col text-xs text-stormGrey-400">
                                {entityDetails.map((entry) => (
                                  <span key={entry} className="break-words">{entry}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium break-words">{contextPrimary}</span>
                            {contextDetails.length > 0 && (
                              <div className="flex flex-col text-xs text-stormGrey-400">
                                {contextDetails.map((entry) => (
                                  <span key={entry} className="break-words">{entry}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <Typography variant="small" className="break-words">
                            {log.message || "-"}
                          </Typography>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-col gap-1 text-xs text-stormGrey-500">
                            {detailSegments.map((entry, idx) => (
                              <span key={idx} className="break-words">{entry}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <Typography variant="small">
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              disabled={actionLoading}
                              className="rounded-md border border-sunsetCoral-600 px-3 py-1 text-xs text-sunsetCoral-800 transition hover:bg-sunsetCoral-600/20 disabled:opacity-60"
                            >
                              Löschen
                            </button>
                          </Typography>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Typography variant="small" color="gray">
              {""}
            </Typography>
            <PaginationControls disabled={loading && logs.length === 0} />
          </div>
        </CardBody>
      </Card>
    </div>


  );
}

export default Logs;
