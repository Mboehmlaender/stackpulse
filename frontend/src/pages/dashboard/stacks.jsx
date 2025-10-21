import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { useToast } from "@/components/ToastProvider.jsx";
import { useMaintenance } from "@/context/MaintenanceContext.jsx";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  ButtonGroup,
  IconButton,
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
  Avatar,
  Tooltip,
  Progress,
  Spinner,
  Input,
  Select,
  Option
} from "@material-tailwind/react";

const SELECTION_PROMPT_STORAGE_KEY = "stackSelectionPreference";

const PER_PAGE_DEFAULT = "50";
const PER_PAGE_OPTIONS = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "Alle" }
];
const VALID_PER_PAGE_VALUES = new Set(PER_PAGE_OPTIONS.map((option) => option.value));
const STACKS_CACHE_DURATION = 30 * 1000;
const STACKS_REFRESH_INTERVAL = 30 * 1000;
let stacksCache = { data: null, timestamp: 0 };
let stacksCachePromise = null;

const REDEPLOY_PHASES = {
  QUEUED: 'queued',
  STARTED: 'started',
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info'
};

const isCacheFresh = () => Boolean(stacksCache.data) && (Date.now() - stacksCache.timestamp < STACKS_CACHE_DURATION);
const updateStacksCache = (data) => {
  stacksCache = { data, timestamp: Date.now() };
};

const prepareInitialStacks = (data) => {
  if (!Array.isArray(data)) return [];
  return [...data].sort((a, b) => (a?.Name || '').localeCompare(b?.Name || ''));
};
export function Stacks() {
  const [stacks, setStacks] = useState(() => prepareInitialStacks(stacksCache.data));
  const [loading, setLoading] = useState(() => !stacksCache.data);
  const [error, setError] = useState("");
  const [selectedStackIds, setSelectedStackIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionPromptVisible, setSelectionPromptVisible] = useState(false);
  const [rememberSelectionChoice, setRememberSelectionChoice] = useState(false);
  const [selectionPreferenceStored, setSelectionPreferenceStored] = useState(false);
  const [perPage, setPerPage] = useState(PER_PAGE_DEFAULT);
  const [page, setPage] = useState(1);

  const { showToast } = useToast();

  const { maintenance, update } = useMaintenance();
  const maintenanceActive = Boolean(maintenance?.active);
  const maintenanceMessage = maintenance?.message;
  const maintenanceLocked = maintenanceActive || Boolean(update?.running);
  const maintenanceBanner = maintenanceLocked ? (maintenanceMessage || (update?.running ? "Portainer-Update läuft" : "Wartungsmodus aktiv")) : "";
  const noop = useCallback(() => { }, []);

  const stacksByIdRef = useRef(new Map());

  useEffect(() => {
    if (maintenanceLocked) {
      setLoading(false);
      setStacks([]);
      setSelectedStackIds([]);
    }
  }, [maintenanceLocked]);

  const mergeStackState = useCallback((previousStacks, incomingStacks) => {
    const prevMap = new Map(previousStacks.map((stack) => [stack.Id, stack]));
    const sortedIncoming = [...incomingStacks].sort((a, b) => a.Name.localeCompare(b.Name));

    return sortedIncoming.map((stack) => {
      const previous = prevMap.get(stack.Id);

      if (previous && previous.updateStatus === '✅' && stack.updateStatus === '⚠️') {
        const stackLabel = stack.Name ? `${stack.Name} (ID: ${stack.Id})` : `Stack ${stack.Id}`;
        showToast({
          variant: 'warning',
          title: 'Aktualisierung gefunden',
          description: stackLabel
        });
      }

      let effectivePhase = stack.redeployPhase ?? previous?.redeployPhase ?? null;
      if (!effectivePhase && (stack.redeploying || previous?.redeploying)) {
        effectivePhase = REDEPLOY_PHASES.STARTED;
      }

      const isQueued = effectivePhase === REDEPLOY_PHASES.QUEUED;
      const isRunning = effectivePhase === REDEPLOY_PHASES.STARTED;
      const isBusy = isQueued || isRunning;

      return {
        ...stack,
        redeployPhase: effectivePhase,
        redeployQueued: isQueued,
        redeploying: isBusy,
        redeployDisabled: stack.redeployDisabled ?? previous?.redeployDisabled ?? false,
        duplicateName: stack.duplicateName ?? previous?.duplicateName ?? false
      };
    });
  }, [showToast]);

  useEffect(() => {
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket"]
    });
    console.log("🔌 Socket connected");

    socket.on("redeployStatus", async (payload = {}) => {
      const { stackId } = payload;
      if (!stackId) return;

      const resolvedPhaseRaw = payload.redeployPhase ?? payload.phase;
      let resolvedPhase = resolvedPhaseRaw;
      if (!resolvedPhase) {
        if (payload.isRedeploying === true) {
          resolvedPhase = REDEPLOY_PHASES.STARTED;
        } else if (payload.isRedeploying === false) {
          resolvedPhase = REDEPLOY_PHASES.SUCCESS;
        }
      } else if (resolvedPhaseRaw === 'started' || resolvedPhaseRaw === 'running') {
        resolvedPhase = REDEPLOY_PHASES.STARTED;
      } else if (resolvedPhaseRaw === 'queued') {
        resolvedPhase = REDEPLOY_PHASES.QUEUED;
      } else if (resolvedPhaseRaw === 'success') {
        resolvedPhase = REDEPLOY_PHASES.SUCCESS;
      } else if (resolvedPhaseRaw === 'error') {
        resolvedPhase = REDEPLOY_PHASES.ERROR;
      } else if (resolvedPhaseRaw === 'info') {
        resolvedPhase = REDEPLOY_PHASES.INFO;
      }

      const stackSnapshot = stacksByIdRef.current.get(stackId);
      const stackName = payload.stackName ?? stackSnapshot?.Name;
      const stackLabel = stackName ? `${stackName} (ID: ${stackId})` : `Stack ${stackId}`;

      console.log(`🔄 Stack ${stackId} Redeploy Update: ${resolvedPhase ?? 'unbekannt'}`);

      if (resolvedPhase === REDEPLOY_PHASES.STARTED) {
        showToast({
          variant: 'info',
          title: 'Redeploy gestartet',
          description: stackLabel
        });
      } else if (resolvedPhase === REDEPLOY_PHASES.SUCCESS) {
        showToast({
          variant: 'success',
          title: 'Redeploy abgeschlossen',
          description: stackLabel
        });
      } else if (resolvedPhase === REDEPLOY_PHASES.ERROR) {
        const detail = payload.message ? ` – ${payload.message}` : '';
        showToast({
          variant: 'error',
          title: 'Redeploy fehlgeschlagen',
          description: `${stackLabel}${detail}`
        });
      }

      setStacks(prev =>
        prev.map(stack => {
          if (stack.Id !== stackId) return stack;

          const nextPhase = resolvedPhase ?? stack.redeployPhase ?? null;
          const isQueued = nextPhase === REDEPLOY_PHASES.QUEUED;
          const isRunning = nextPhase === REDEPLOY_PHASES.STARTED;
          const isSuccess = nextPhase === REDEPLOY_PHASES.SUCCESS;
          const isError = nextPhase === REDEPLOY_PHASES.ERROR;
          const isBusy = isQueued || isRunning;

          const updated = {
            ...stack,
            redeployPhase: nextPhase,
            redeployQueued: isQueued,
            redeploying: isBusy
          };

          if (isSuccess) {
            updated.updateStatus = '✅';
            updated.redeploying = false;
            updated.redeployQueued = false;
          }

          if (isError) {
            updated.redeploying = false;
            updated.redeployQueued = false;
          }

          if (!isBusy && !isSuccess && !isError && resolvedPhase === undefined) {
            updated.redeploying = false;
            updated.redeployQueued = false;
            updated.redeployPhase = stack.redeployPhase ?? null;
          }

          return updated;
        })
      );

      const shouldRefresh =
        resolvedPhase === REDEPLOY_PHASES.SUCCESS ||
        resolvedPhase === REDEPLOY_PHASES.ERROR ||
        (payload.isRedeploying === false && !resolvedPhase);

      if (shouldRefresh) {
        try {
          const res = await axios.get('/api/stacks');
          updateStacksCache(res.data);
          setStacks(prev => mergeStackState(prev, res.data));
        } catch (err) {
          console.error('Fehler beim Aktualisieren nach Redeploy:', err);
        }
      }
    });

    return () => socket.disconnect();
  }, []);

  const fetchStacks = useCallback(async ({ force = false, silent = false } = {}) => {
    if (maintenanceActive) {
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    const hadCache = Boolean(stacksCache.data);

    if (!force && hadCache) {
      setStacks(prev => mergeStackState(prev, stacksCache.data));
      if (!silent) {
        setLoading(false);
        if (isCacheFresh()) {
          return;
        }
      }
    }

    const shouldShowSpinner = !silent && (!hadCache || force);
    if (shouldShowSpinner) {
      setLoading(true);
    }

    try {
      if (force || !stacksCachePromise) {
        stacksCachePromise = axios.get("/api/stacks")
          .then((res) => {
            updateStacksCache(res.data);
            return res.data;
          })
          .finally(() => {
            stacksCachePromise = null;
          });
      }

      const data = await stacksCachePromise;
      setStacks(prev => mergeStackState(prev, data));
      setError("");
    } catch (err) {
      console.error("❌ Fehler beim Abrufen der Stacks:", err);
      if (!hadCache && !silent) {
        setError("Fehler beim Laden der Stacks");
      }
    } finally {
      if (shouldShowSpinner) {
        setLoading(false);
      }
    }
  }, [maintenanceActive, mergeStackState]);

  useEffect(() => {
    fetchStacks();
  }, [fetchStacks]);

  useEffect(() => {
    if (typeof document === 'undefined' || maintenanceActive) return undefined;

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        fetchStacks({ force: true, silent: true });
      }
    }, STACKS_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [fetchStacks, maintenanceActive]);

  useEffect(() => {
    if (typeof document === 'undefined' || maintenanceActive) return undefined;

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchStacks({ force: true, silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStacks, maintenanceActive]);

  useEffect(() => {
    setSelectedStackIds(prev => {
      const filtered = prev.filter(id => {
        const match = stacks.find(stack => stack.Id === id);
        if (!match) return false;
        if (match.updateStatus === '✅') return false;
        if (match.redeployDisabled) return false;
        const phase = match.redeployPhase;
        if (phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED) return false;
        return true;
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [stacks]);

  useEffect(() => {
    stacksByIdRef.current = new Map(stacks.map((stack) => [stack.Id, stack]));
  }, [stacks]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredStacks = useMemo(() => {
    return stacks.filter((stack) => {
      if (statusFilter === "current" && stack.updateStatus !== '✅') return false;
      if (statusFilter === "outdated" && stack.updateStatus === '✅') return false;

      if (normalizedSearch) {
        const identifier = `${stack.Name ?? ""} ${stack.Id ?? ""}`.toLowerCase();
        if (!identifier.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [stacks, statusFilter, normalizedSearch]);

  const eligibleFilteredStacks = useMemo(
    () => filteredStacks.filter((stack) => {
      if (stack.updateStatus === '✅') return false;
      if (stack.redeployDisabled) return false;
      const phase = stack.redeployPhase;
      if (phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED) return false;
      return true;
    }),
    [filteredStacks]
  );

  const stacksById = useMemo(() => {
    const map = new Map();
    stacks.forEach((stack) => {
      map.set(stack.Id, stack);
    });
    return map;
  }, [stacks]);

  const filteredStackIdSet = useMemo(() => new Set(filteredStacks.map((stack) => stack.Id)), [filteredStacks]);

  const paginatedStacks = useMemo(() => {
    if (perPage === 'all') {
      return filteredStacks;
    }
    const perPageNumber = Number(perPage);
    const start = (page - 1) * perPageNumber;
    return filteredStacks.slice(start, start + perPageNumber);
  }, [filteredStacks, perPage, page]);

  const visiblePageStackIds = useMemo(() => new Set(paginatedStacks.map((stack) => stack.Id)), [paginatedStacks]);

  const eligiblePageStacks = useMemo(
    () => paginatedStacks.filter((stack) => {
      if (stack.updateStatus === '✅') return false;
      if (stack.redeployDisabled) return false;
      const phase = stack.redeployPhase;
      if (phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED) return false;
      return true;
    }),
    [paginatedStacks]
  );

  const selectionPreferenceRef = useRef({ action: 'keep', remember: false });
  const previousFiltersRef = useRef({ status: statusFilter, search: normalizedSearch });
  const didMountRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedValue = window.sessionStorage.getItem(SELECTION_PROMPT_STORAGE_KEY);
      if (!storedValue) return;
      const parsed = JSON.parse(storedValue);
      if (parsed && (parsed.action === 'keep' || parsed.action === 'clear')) {
        selectionPreferenceRef.current = { action: parsed.action, remember: true };
        setSelectionPreferenceStored(true);
      }
    } catch (err) {
      console.error('⚠️ Konnte gespeicherte Auswahl-Einstellung nicht laden:', err);
      selectionPreferenceRef.current = { action: 'keep', remember: false };
    }
  }, []);

  useEffect(() => {
    const normalized = normalizedSearch;
    if (!didMountRef.current) {
      didMountRef.current = true;
      previousFiltersRef.current = { status: statusFilter, search: normalized };
      return;
    }

    const prev = previousFiltersRef.current;
    const filtersChanged = prev.status !== statusFilter || prev.search !== normalized;

    if (!filtersChanged) {
      if (statusFilter === 'all' && normalized.length === 0 && selectionPromptVisible) {
        setSelectionPromptVisible(false);
      }
      return;
    }

    previousFiltersRef.current = { status: statusFilter, search: normalized };

    if (selectedStackIds.length === 0) {
      setSelectionPromptVisible(false);
      return;
    }

    const hasFilters = statusFilter !== 'all' || normalized.length > 0;
    if (!hasFilters) {
      setSelectionPromptVisible(false);
      return;
    }

    const storedPreference = selectionPreferenceRef.current;
    if (storedPreference?.remember) {
      if (storedPreference.action === 'clear') {
        setSelectedStackIds([]);
      }
      setSelectionPromptVisible(false);
      return;
    }

    setRememberSelectionChoice(Boolean(storedPreference?.remember));
    setSelectionPromptVisible(true);
  }, [statusFilter, normalizedSearch, selectedStackIds.length, selectionPromptVisible]);

  useEffect(() => {
    if (selectedStackIds.length === 0 && selectionPromptVisible) {
      setSelectionPromptVisible(false);
    }
  }, [selectedStackIds.length, selectionPromptVisible]);

  const hasActiveFilters = statusFilter !== "all" || normalizedSearch.length > 0;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, normalizedSearch]);

  useEffect(() => {
    if (perPage === 'all') {
      if (page !== 1) setPage(1);
      return;
    }

    const perPageNumber = Number(perPage);
    const totalPagesCalc = Math.max(1, Math.ceil(filteredStacks.length / perPageNumber));
    if (page > totalPagesCalc) {
      setPage(totalPagesCalc);
    }
  }, [filteredStacks.length, perPage, page]);

  const totalItems = filteredStacks.length;
  const perPageNumber = perPage === 'all' ? (totalItems || 1) : Number(perPage);
  const totalPages = perPage === 'all' ? 1 : Math.max(1, Math.ceil(totalItems / perPageNumber));
  const pageStart = totalItems === 0 ? 0 : (perPage === 'all' ? 1 : ((page - 1) * perPageNumber + 1));
  const pageEnd = perPage === 'all' ? totalItems : Math.min(totalItems, page * perPageNumber);

  const toggleStackSelection = (stackId, disabled) => {
    if (maintenanceLocked || disabled) return;
    setSelectedStackIds(prev =>
      prev.includes(stackId)
        ? prev.filter(id => id !== stackId)
        : [...prev, stackId]
    );
  };


  const handlePerPageChange = (value) => {
    if (!VALID_PER_PAGE_VALUES.has(value)) return;
    setPerPage(value);
    setPage(1);
  };

  const handlePrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    if (perPage === 'all') return;
    setPage((prev) => {
      const perPageNumberLocal = Number(perPage);
      const totalPagesCalc = Math.max(1, Math.ceil(filteredStacks.length / perPageNumberLocal));
      return Math.min(totalPagesCalc, prev + 1);
    });
  };

  const applySelectionPreference = (action) => {
    const remember = rememberSelectionChoice;
    if (typeof window !== 'undefined') {
      try {
        if (remember) {
          const payload = { action, remember: true };
          window.sessionStorage.setItem(SELECTION_PROMPT_STORAGE_KEY, JSON.stringify(payload));
          selectionPreferenceRef.current = payload;
        } else {
          window.sessionStorage.removeItem(SELECTION_PROMPT_STORAGE_KEY);
          selectionPreferenceRef.current = { action, remember: false };
        }
      } catch (err) {
        console.error('⚠️ Konnte Auswahl-Einstellung nicht speichern:', err);
        selectionPreferenceRef.current = { action, remember: false };
      }
    } else {
      selectionPreferenceRef.current = { action, remember: false };
    }

    setSelectionPreferenceStored(remember);
    setRememberSelectionChoice(remember);

    if (action === 'clear') {
      setSelectedStackIds([]);
    }

    setSelectionPromptVisible(false);
  };

  const clearStoredSelectionPreference = () => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(SELECTION_PROMPT_STORAGE_KEY);
      } catch (err) {
        console.error('⚠️ Konnte gespeicherte Auswahl-Einstellung nicht löschen:', err);
      }
    }

    selectionPreferenceRef.current = { action: 'keep', remember: false };
    setSelectionPreferenceStored(false);
    setRememberSelectionChoice(false);

    if (hasActiveFilters && selectedStackIds.length > 0) {
      setSelectionPromptVisible(true);
    }
  };

  const clearSelection = () => {
    setSelectedStackIds([]);
    setSelectionPromptVisible(false);
  };

  const handleChipRemove = (stackId) => {
    setSelectedStackIds((prev) => prev.filter((id) => id !== stackId));
  };

  const handleRedeploy = async (stackId) => {
    const snapshot = stacksByIdRef.current.get(stackId);
    const phase = snapshot?.redeployPhase;
    if (phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED) return;

    setSelectedStackIds((prev) => prev.filter((id) => id !== stackId));
    setStacks((prev) =>
      prev.map((stack) =>
        stack.Id === stackId
          ? {
            ...stack,
            redeployPhase: REDEPLOY_PHASES.STARTED,
            redeploying: true,
            redeployQueued: false
          }
          : stack
      )
    );

    try {
      await axios.put(`/api/stacks/${stackId}/redeploy`);
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      setStacks((prev) =>
        prev.map((stack) =>
          stack.Id === stackId
            ? {
              ...stack,
              redeployPhase: null,
              redeploying: false,
              redeployQueued: false
            }
            : stack
        )
      );

      if (!err.response) {
        const current = stacksByIdRef.current.get(stackId);
        const stackLabel = current?.Name ? `${current.Name} (ID: ${stackId})` : `Stack ${stackId}`;
        const errorText = err.message || 'Unbekannter Fehler';
        showToast({
          variant: 'error',
          title: 'Redeploy fehlgeschlagen',
          description: `${stackLabel} – ${errorText}`
        });
      }
    }
  };

  const handleRedeployAll = async () => {
    if (!eligiblePageStacks.length) return;

    const targetIds = new Set(eligiblePageStacks.map((stack) => stack.Id));

    setStacks(prev =>
      prev.map(stack =>
        targetIds.has(stack.Id)
          ? {
            ...stack,
            redeployPhase: REDEPLOY_PHASES.QUEUED,
            redeploying: true,
            redeployQueued: true
          }
          : stack
      )
    );

    try {
      if (targetIds.size === eligibleFilteredStacks.length) {
        await axios.put("/api/stacks/redeploy-all");
      } else {
        await axios.put("/api/stacks/redeploy-selection", { stackIds: Array.from(targetIds) });
      }
      setSelectedStackIds((prev) => prev.filter((id) => !targetIds.has(id)));
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy ALL:", err);
      setStacks(prev =>
        prev.map(stack =>
          targetIds.has(stack.Id)
            ? {
              ...stack,
              redeployPhase: null,
              redeploying: false,
              redeployQueued: false
            }
            : stack
        )
      );

      const errorText = err.response?.data?.error || err.message || 'Unbekannter Fehler';
      showToast({
        variant: 'error',
        title: 'Redeploy ALL fehlgeschlagen',
        description: errorText
      });
    }
  };

  const handleRedeploySelection = async () => {
    if (!selectedStackIds.length) return;

    const eligibleIds = selectedStackIds.filter((id) => {
      const stack = stacks.find((entry) => entry.Id === id);
      if (!stack) return false;
      if (stack.updateStatus === '✅') return false;
      if (stack.redeployDisabled) return false;
      const phase = stack.redeployPhase;
      if (phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED) return false;
      return true;
    });

    if (!eligibleIds.length) {
      setSelectedStackIds([]);
      return;
    }

    const eligibleSet = new Set(eligibleIds);

    setStacks(prev =>
      prev.map(stack =>
        eligibleSet.has(stack.Id)
          ? {
            ...stack,
            redeployPhase: REDEPLOY_PHASES.QUEUED,
            redeploying: true,
            redeployQueued: true
          }
          : stack
      )
    );

    try {
      await axios.put("/api/stacks/redeploy-selection", { stackIds: eligibleIds });
      setSelectedStackIds((prev) => prev.filter((id) => !eligibleSet.has(id)));
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy Auswahl:", err);
      setStacks(prev =>
        prev.map(stack =>
          eligibleSet.has(stack.Id)
            ? {
              ...stack,
              redeployPhase: null,
              redeploying: false,
              redeployQueued: false
            }
            : stack
        )
      );

      const errorText = err.response?.data?.error || err.message || 'Unbekannter Fehler';
      showToast({
        variant: 'error',
        title: 'Redeploy Auswahl fehlgeschlagen',
        description: errorText
      });
    }
  };

  const hasSelection = selectedStackIds.length > 0;
  const hasOutdatedStacks = eligiblePageStacks.length > 0;
  const bulkButtonLabel = hasSelection
    ? `Redeploy Auswahl (${selectedStackIds.length})`
    : 'Redeploy All';

  const bulkActionDisabled = maintenanceLocked || (hasSelection
    ? selectionPromptVisible || selectedStackIds.length === 0 || selectedStackIds.every(id => {
      const targetStack = stacks.find(stack => stack.Id === id);
      if (!targetStack) return true;
      if (targetStack.updateStatus === '✅') return true;
      if (targetStack.redeployDisabled) return true;
      const phase = targetStack.redeployPhase;
      return phase === REDEPLOY_PHASES.STARTED || phase === REDEPLOY_PHASES.QUEUED;
    })
    : !hasOutdatedStacks);

  const handleBulkRedeploy = () => {
    if (maintenanceLocked) {
      showToast({
        variant: 'warning',
        title: 'Wartungsmodus aktiv',
        description: 'Redeploy-Aktionen sind während des Wartungsmodus deaktiviert.'
      });
      return;
    }

    if (hasSelection) {
      handleRedeploySelection();
    } else {
      handleRedeployAll();
    }
  };


  return (
    <div className="mt-12 mb-8 flex flex-col gap-12">
      <Card>
        <CardHeader variant="gradient" color="gray" className="p-4 pt-2 pb-2">
          {!loading && !error ? (
            <Typography variant="h6" color="white">
              <span className="flex items-center gap-2">
                <span>Filter und Optionen</span></span>
            </Typography>
          ) :
            (
              <Typography variant="h6" color="white">
                <span className="flex items-center gap-2">
                  <span>Lade Stacks</span></span>
              </Typography>)
          }
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="flex py-6 text-center text-sm font-medium text-gray-400"> <Spinner className="mr-2 h-4 w-4 flex" />Lade Stacks...</p>
          ) : error ? (
            <p className="py-6 text-sm font-medium text-red-400">{error}</p>
          ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <ButtonGroup
                  >
                    <Button
                      onClick={() => setStatusFilter('all')}

                    >Alle</Button>
                    <Button
                      onClick={() => setStatusFilter('current')}

                    >Aktuell</Button>
                    <Button
                      onClick={() => setStatusFilter('outdated')}

                    >Veraltet</Button>
                  </ButtonGroup>
                </div>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  variant="static"
                  placeholder="Name oder ID" />
                              <div className="flex items-center gap-3">

                <Select
                  variant="static"
                  label="Einträge pro Seite"
                  onChange={noop}
                  value={perPage}
                >
                  {PER_PAGE_OPTIONS.map(({ value, label }) => (
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

              <div className="flex flex-col items-end gap-2">
                {selectionPreferenceStored && (
                  <button
                    type="button"
                    onClick={clearStoredSelectionPreference}
                    className="text-xs font-medium text-amber-300 underline underline-offset-2 transition hover:text-amber-100"
                  >
                    Gespeicherte Entscheidung löschen
                  </button>
                )}


              </div>
            </div>
          )}


        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {paginatedStacks.map(stack => {
          const phase = stack.redeployPhase;
          const isQueued = phase === REDEPLOY_PHASES.QUEUED;
          const isRunning = phase === REDEPLOY_PHASES.STARTED;
          const isBusy = isQueued || isRunning;
          const isSelected = selectedStackIds.includes(stack.Id);
          const isCurrent = stack.updateStatus === '✅';
          const isSelfStack = Boolean(stack.redeployDisabled);
          const isSelectable = !isBusy && !isCurrent && !isSelfStack && !maintenanceLocked;
          return (
            <Card key={stack.Id}>
              <CardBody
                className={`flex w-full text-stormGrey-500 items-center justify-between gap-4 rounded-xl shadow-lg transition border
                ${isSelected ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-transparent'}
                ${!isSelectable || isBusy ? 'opacity-75 bg-stormGrey-200/20' : ''}`}
              >
                <div className="flex items-center space-x-4" id="left">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleStackSelection(stack.Id, !isSelectable)}
                    className={`h-5 w-5 text-purple-500 focus:ring-purple-400 border-gray-600 bg-gray-900 rounded ${!isSelectable ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!isSelectable}
                  />
                  <div className={`w-12 h-12 flex items-center justify-center rounded-full
                  ${stack.updateStatus === '✅' ? 'bg-mossGreen-600' :
                      stack.updateStatus === '⚠️' ? 'bg-warmAmberGlow-400' :
                        'bg-sunsetCoral-500'}`}
                  />
                  <div>
                    <p className="text-lg antialiased font-sans font-semibold leading-normal text-inherit">{stack.Name}</p>
                    <p className="text-sm antialiased font-sans font-light leading-normal text-inherit">ID: {stack.Id}</p>
                    {stack.duplicateName && (
                      <p className="text-xs text-amber-700">⚠️ Doppelter Name erkannt</p>
                    )}
                  </div>
                </div>

                <div className="ml-auto flex flex-col items-end gap-1 text-sm" id="right">
                  {isRunning ? (
                    <>
                      <span className="antialiased font-sans font-light leading-normal text-xs uppercase tracking-wide text-warmAmberGlow-600">Redeploy</span>
                      <span className="text-warmAmberGlow-500">läuft…</span>
                    </>
                  ) : isQueued ? (
                    <>
                      <span className="antialiased font-sans font-light leading-normal text-xs uppercase tracking-wide text-warmAmberGlow-600">Redeploy</span>
                      <span className="text-warmAmberGlow-500">in Warteliste…</span>
                    </>
                  ) : isSelfStack ? (
                    <>
                      <span className="antialiased font-sans font-light leading-normal text-xs uppercase tracking-wide text-stormGrey-500">System</span>
                      <span className="text-gray-300">Redeploy deaktiviert</span>
                    </>
                  ) : isCurrent ? (
                    <>
                      <span className="antialiased font-sans font-light leading-normal text-xs uppercase tracking-wide text-stormGrey-500">Status</span>
                      <span className="text-mossGreen-600">Aktuell</span>
                    </>
                  ) : (
                    <Button
                      onClick={() => handleRedeploy(stack.Id)}
                      disabled={isBusy || maintenanceLocked}
                      className="disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Redeploy
                    </Button>
                  )}
                </div>

              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default Stacks;
