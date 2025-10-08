import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

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

export default function Stacks() {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStackIds, setSelectedStackIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionPromptVisible, setSelectionPromptVisible] = useState(false);
  const [rememberSelectionChoice, setRememberSelectionChoice] = useState(false);
  const [selectionPreferenceStored, setSelectionPreferenceStored] = useState(false);
  const [showRedeployingOnly, setShowRedeployingOnly] = useState(false);
  const [perPage, setPerPage] = useState(PER_PAGE_DEFAULT);
  const [page, setPage] = useState(1);

  const mergeStackState = (previousStacks, incomingStacks) => {
    const prevMap = new Map(previousStacks.map((stack) => [stack.Id, stack]));
    const sortedIncoming = [...incomingStacks].sort((a, b) => a.Name.localeCompare(b.Name));

    return sortedIncoming.map((stack) => {
      const previous = prevMap.get(stack.Id);
      return {
        ...stack,
        redeploying: previous?.redeploying || stack.redeploying || false,
        redeployDisabled: stack.redeployDisabled ?? previous?.redeployDisabled ?? false,
        duplicateName: stack.duplicateName ?? previous?.duplicateName ?? false
      };
    });
  };

  useEffect(() => {
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket"]
    });
    console.log("🔌 Socket connected");

    socket.on("redeployStatus", async ({ stackId, status }) => {
      console.log(`🔄 Stack ${stackId} Redeploy Status: ${status ? "running" : "finished"}`);

      setStacks(prev =>
        prev.map(stack => {
          if (stack.Id !== stackId) return stack;
          return {
            ...stack,
            redeploying: status,
            updateStatus: status ? stack.updateStatus : '✅'
          };
        })
      );

      if (!status) {
        // Status nach Redeploy neu vom Server holen
        try {
          const res = await axios.get("/api/stacks");
          setStacks(prev => mergeStackState(prev, res.data));
        } catch (err) {
          console.error("Fehler beim Aktualisieren nach Redeploy:", err);
        }
      }
    });

    return () => socket.disconnect();
  }, []);

  const fetchStacks = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/stacks");
      setStacks(prev => mergeStackState(prev, res.data));
    } catch (err) {
      console.error("❌ Fehler beim Abrufen der Stacks:", err);
      setError("Fehler beim Laden der Stacks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStacks();
  }, []);

  useEffect(() => {
    setSelectedStackIds(prev => {
      const filtered = prev.filter(id => {
        const match = stacks.find(stack => stack.Id === id);
        return match && match.updateStatus !== '✅' && !match.redeployDisabled;
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [stacks]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredStacks = useMemo(() => {
    return stacks.filter((stack) => {
      if (statusFilter === "current" && stack.updateStatus !== '✅') return false;
      if (statusFilter === "outdated" && stack.updateStatus === '✅') return false;
      if (showRedeployingOnly && !stack.redeploying) return false;

      if (normalizedSearch) {
        const identifier = `${stack.Name ?? ""} ${stack.Id ?? ""}`.toLowerCase();
        if (!identifier.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [stacks, statusFilter, normalizedSearch, showRedeployingOnly]);

  const eligibleFilteredStacks = useMemo(
    () => filteredStacks.filter((stack) => stack.updateStatus !== '✅' && !stack.redeployDisabled),
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
    () => paginatedStacks.filter((stack) => stack.updateStatus !== '✅' && !stack.redeployDisabled),
    [paginatedStacks]
  );

  const selectionPreferenceRef = useRef({ action: 'keep', remember: false });
  const previousFiltersRef = useRef({ status: statusFilter, search: normalizedSearch, redeploying: showRedeployingOnly });
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
      previousFiltersRef.current = { status: statusFilter, search: normalized, redeploying: showRedeployingOnly };
      return;
    }

    const prev = previousFiltersRef.current;
    const filtersChanged = prev.status !== statusFilter || prev.search !== normalized || prev.redeploying !== showRedeployingOnly;

    if (!filtersChanged) {
      if (statusFilter === 'all' && normalized.length === 0 && !showRedeployingOnly && selectionPromptVisible) {
        setSelectionPromptVisible(false);
      }
      return;
    }

    previousFiltersRef.current = { status: statusFilter, search: normalized, redeploying: showRedeployingOnly };

    if (selectedStackIds.length === 0) {
      setSelectionPromptVisible(false);
      return;
    }

    const hasFilters = statusFilter !== 'all' || normalized.length > 0 || showRedeployingOnly;
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

  const hasActiveFilters = statusFilter !== "all" || normalizedSearch.length > 0 || showRedeployingOnly;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, normalizedSearch, showRedeployingOnly]);

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
    if (disabled) return;
    setSelectedStackIds(prev =>
      prev.includes(stackId)
        ? prev.filter(id => id !== stackId)
        : [...prev, stackId]
    );
  };

  const handlePerPageChange = (event) => {
    const value = event.target.value;
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
    setSelectedStackIds((prev) => prev.filter((id) => id !== stackId));
    setStacks((prev) =>
      prev.map((stack) =>
        stack.Id === stackId ? { ...stack, redeploying: true } : stack
      )
    );

    try {
      await axios.put(`/api/stacks/${stackId}/redeploy`);
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      setStacks((prev) =>
        prev.map((stack) =>
          stack.Id === stackId ? { ...stack, redeploying: false } : stack
        )
      );
    }
  };

  const handleRedeployAll = async () => {
    if (!eligiblePageStacks.length) return;

    const targetIds = new Set(eligiblePageStacks.map((stack) => stack.Id));

    setStacks(prev =>
      prev.map(stack =>
        targetIds.has(stack.Id)
          ? { ...stack, redeploying: true }
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
            ? { ...stack, redeploying: false }
            : stack
        )
      );
    }
  };

  const handleRedeploySelection = async () => {
    if (!selectedStackIds.length) return;

    const eligibleIds = selectedStackIds.filter((id) => {
      const stack = stacks.find((entry) => entry.Id === id);
      return stack && stack.updateStatus !== '✅' && !stack.redeployDisabled;
    });

    if (!eligibleIds.length) {
      setSelectedStackIds([]);
      return;
    }

    const eligibleSet = new Set(eligibleIds);

    setStacks(prev =>
      prev.map(stack =>
        eligibleSet.has(stack.Id)
          ? { ...stack, redeploying: true }
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
            ? { ...stack, redeploying: false }
            : stack
        )
      );
    }
  };

  const hasSelection = selectedStackIds.length > 0;
  const hasOutdatedStacks = eligiblePageStacks.length > 0;
  const bulkButtonLabel = hasSelection
    ? `Redeploy Auswahl (${selectedStackIds.length})`
    : 'Redeploy All';

  const bulkActionDisabled = hasSelection
    ? selectionPromptVisible || selectedStackIds.length === 0 || selectedStackIds.every(id => {
        const targetStack = stacks.find(stack => stack.Id === id);
        return !targetStack || targetStack.redeploying || targetStack.updateStatus === '✅' || targetStack.redeployDisabled;
      })
    : !hasOutdatedStacks || eligiblePageStacks.every(stack => stack.redeploying);

  const handleBulkRedeploy = () => {
    if (hasSelection) {
      handleRedeploySelection();
    } else {
      handleRedeployAll();
    }
  };

  if (loading) return <p className="text-gray-400">Lade Stacks...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
          <div>
            <span className="mb-2 block text-sm font-medium text-gray-300">Status</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 text-sm font-medium transition ${statusFilter === 'all' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:text-white'} border-r border-gray-700 last:border-r-0`}
              >
                Alle
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('current')}
                className={`px-4 py-2 text-sm font-medium transition ${statusFilter === 'current' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:text-white'} border-r border-gray-700 last:border-r-0`}
              >
                Aktuell
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('outdated')}
                className={`px-4 py-2 text-sm font-medium transition ${statusFilter === 'outdated' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:text-white'}`}
              >
                Veraltet
              </button>
            </div>
          </div>
          <div className="md:w-64">
            <label htmlFor="stack-search" className="mb-2 block text-sm font-medium text-gray-300">Suche</label>
            <input
              id="stack-search"
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name oder ID"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={showRedeployingOnly}
                onChange={(event) => setShowRedeployingOnly(event.target.checked)}
                className="h-4 w-4 rounded border border-purple-400 bg-gray-900 text-purple-400 focus:ring-purple-400"
              />
              <span>Nur Redeploy läuft</span>
            </label>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {selectionPreferenceStored && (
            <button
              type="button"
              onClick={clearStoredSelectionPreference}
              className="text-xs font-medium text-amber-300 underline underline-offset-2 transition hover:text-amber-100"
            >
              Gespeicherte Entscheidung löschen
            </button>
          )}
          <button
            onClick={handleBulkRedeploy}
            disabled={bulkActionDisabled}
            className={`px-5 py-2 rounded-lg font-medium transition ${bulkActionDisabled ? 'bg-purple-900 cursor-not-allowed text-gray-400' : 'bg-purple-500 hover:bg-purple-600'}`}
          >
            {bulkButtonLabel}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 text-sm text-gray-300 md:flex-row md:items-center md:justify-between">
        <div>
          {totalItems === 0
            ? 'Keine Stacks verfügbar'
            : `Zeige ${pageStart}-${pageEnd} von ${totalItems} Stacks`}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span>Einträge pro Seite:</span>
            <select
              value={perPage}
              onChange={handlePerPageChange}
              className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={page <= 1 || totalItems === 0 || perPage === 'all'}
              className="rounded-md border border-gray-700 px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-200 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Zurück
            </button>
            <span>{`Seite ${Math.min(page, totalPages)} / ${totalPages}`}</span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={perPage === 'all' || totalItems === 0 || page >= totalPages}
              className="rounded-md border border-gray-700 px-2 py-1 text-xs font-medium uppercase tracking-wide text-gray-200 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Weiter
            </button>
          </div>
        </div>
      </div>

      {selectedStackIds.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 text-sm text-gray-300 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-200">Auswahl:</span>
            {selectedStackIds.map((id) => {
              const stack = stacksById.get(id);
              const name = stack?.Name || `Stack ${id}`;
              const isFiltered = filteredStackIdSet.has(id);
              const isVisibleOnPage = visiblePageStackIds.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleChipRemove(id)}
                  className="inline-flex items-center gap-2 rounded-full border border-purple-500/60 bg-purple-500/10 px-3 py-1 text-purple-100 transition hover:border-purple-400 hover:bg-purple-500/20"
                >
                  <span>{name}</span>
                  {!isFiltered && (
                    <span className="text-xs uppercase tracking-wide text-amber-300">Ausgefiltert</span>
                  )}
                  {isFiltered && !isVisibleOnPage && (
                    <span className="text-xs uppercase tracking-wide text-blue-300">Andere Seite</span>
                  )}
                  <span className="text-xs font-semibold text-purple-200">x</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="self-start text-xs font-medium text-gray-400 underline underline-offset-2 transition hover:text-gray-200 md:self-auto"
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      {selectionPromptVisible && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-500/50 bg-amber-900/40 px-4 py-3 text-amber-100 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p>
              {selectedStackIds.length === 1
                ? '1 Stack ist weiterhin ausgewählt.'
                : `${selectedStackIds.length} Stacks sind weiterhin ausgewählt.`}
              {' '}Soll die Auswahl entfernt werden?
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberSelectionChoice}
                onChange={(event) => setRememberSelectionChoice(event.target.checked)}
                className="h-4 w-4 rounded border border-amber-400 bg-amber-950 text-amber-400 focus:ring-amber-300"
              />
              <span>Einstellung merken (bis Browser geschlossen wird)</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applySelectionPreference('clear')}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-400"
            >
              Auswahl entfernen
            </button>
            <button
              type="button"
              onClick={() => applySelectionPreference('keep')}
              className="rounded-md border border-amber-400 px-4 py-2 text-sm font-medium transition hover:bg-amber-400/20"
            >
              Auswahl behalten
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {paginatedStacks.map(stack => {
          const isRedeploying = stack.redeploying;
          const isSelected = selectedStackIds.includes(stack.Id);
          const isCurrent = stack.updateStatus === '✅';
          const isSelfStack = Boolean(stack.redeployDisabled);
          const isSelectable = !isRedeploying && !isCurrent && !isSelfStack;

          return (
            <div
              key={stack.Id}
              className={`flex justify-between items-center p-5 rounded-xl shadow-lg transition border
                ${isSelected ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-transparent'}
                ${isRedeploying ? 'bg-gray-700 cursor-wait' : 'bg-gray-800 hover:bg-gray-700'}
                ${!isSelectable && !isRedeploying ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center space-x-4">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleStackSelection(stack.Id, !isSelectable)}
                  className={`h-5 w-5 text-purple-500 focus:ring-purple-400 border-gray-600 bg-gray-900 rounded ${!isSelectable ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={!isSelectable}
                />
                <div className={`w-12 h-12 flex items-center justify-center rounded-full
                  ${stack.updateStatus === '✅' ? 'bg-green-500' :
                    stack.updateStatus === '⚠️' ? 'bg-yellow-500' :
                    'bg-red-500'}`}
                />
                <div>
                  <p className="text-lg font-semibold text-white">{stack.Name}</p>
                  <p className="text-sm text-gray-400">ID: {stack.Id}</p>
                  {stack.duplicateName && (
                    <p className="text-xs text-amber-300">⚠️ Doppelter Name erkannt</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 text-sm">
                {isRedeploying ? (
                  <>
                    <span className="text-xs uppercase tracking-wide text-orange-300">Redeploy</span>
                    <span className="text-orange-200">läuft…</span>
                  </>
                ) : isSelfStack ? (
                  <>
                    <span className="text-xs uppercase tracking-wide text-gray-400">System</span>
                    <span className="text-gray-300">Redeploy deaktiviert</span>
                  </>
                ) : isCurrent ? (
                  <>
                    <span className="text-xs uppercase tracking-wide text-gray-400">Status</span>
                    <span className="text-green-300">Aktuell</span>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleRedeploy(stack.Id)}
                      disabled={isRedeploying}
                      className="px-5 py-2 rounded-lg font-medium transition bg-blue-500 hover:bg-blue-600"
                    >
                      Redeploy
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filteredStacks.length === 0 && (
          <p className="text-gray-400">
            {hasActiveFilters ? 'Keine Stacks für die gesetzten Filter.' : 'Keine Stacks gefunden.'}
          </p>
        )}
      </div>
    </div>
  );
}
