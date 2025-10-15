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
} from "@material-tailwind/react";
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { authorsTableData, projectsTableData } from "@/data";

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
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-8 p-6">
          <Typography variant="h6" color="white">
            Authors Table
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
              {logs.map(
                (log) => {
                  const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
                  const stackDisplayName = log.stackName || "Unbekannt";
                  const showStackId = stackDisplayName !== '---' && log.stackId !== undefined && log.stackId !== null;
                  const redeployTypeLabel = log.redeployType
                    ? (REDEPLOY_TYPE_LABELS[log.redeployType] ?? log.redeployType)
                    : '---';                 
                  const className = `py-3 px-5 ${
                    key === authorsTableData.length - 1
                      ? ""
                      : "border-b border-blue-gray-50"
                  }`;

                  return (
                    <tr key={log.id}>
                      <td className={className}>
                            <Typography
                              variant="small"
                              color="blue-gray"
                              className="font-semibold"
                            >
                              {formatTimestamp(log.timestamp)}
                            </Typography>
                      </td>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          {job[0]}
                        </Typography>
                        <Typography className="text-xs font-normal text-blue-gray-500">
                          {job[1]}
                        </Typography>
                      </td>
                      <td className={className}>
                        <Chip
                          variant="gradient"
                          color={online ? "green" : "blue-gray"}
                          value={online ? "online" : "offline"}
                          className="py-0.5 px-2 text-[11px] font-medium w-fit"
                        />
                      </td>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          {date}
                        </Typography>
                      </td>
                      <td className={className}>
                        <Typography
                          as="a"
                          href="#"
                          className="text-xs font-semibold text-blue-gray-600"
                        >
                          Edit
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
    </div>
  );
}

export default Logs;
