import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const DEFAULT_PER_PAGE_OPTIONS = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "all", label: "Alle" }
];

const DEFAULT_PER_PAGE = "50";

const PageContext = createContext(null);

const normalizeNumber = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const fallbackNumeric = Number(fallback);
  if (Number.isFinite(fallbackNumeric) && fallbackNumeric > 0) {
    return fallbackNumeric;
  }
  return 1;
};

export function PageProvider({
  children,
  initialPage = 1,
  initialPerPage = DEFAULT_PER_PAGE,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS
}) {
  const [page, setPage] = useState(initialPage);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [totalItems, setTotalItems] = useState(0);
  const [visibleItems, setVisibleItems] = useState(0);

  const initialPageRef = useRef(initialPage);
  const initialPerPageRef = useRef(initialPerPage);

  const validPerPageValues = useMemo(() => new Set(
    perPageOptions.map((option) => String(option.value))
  ), [perPageOptions]);

  const perPageIsAll = perPage === "all";

  const resolvePerPageNumber = useCallback(() => {
    if (perPageIsAll) {
      return null;
    }
    return normalizeNumber(perPage, initialPerPage);
  }, [perPage, perPageIsAll, initialPerPage]);

  const updateTotals = useCallback((total, visible) => {
    setTotalItems(Math.max(0, Number(total) || 0));
    setVisibleItems(Math.max(0, Number(visible) || 0));
  }, []);

  const resetPagination = useCallback(() => {
    setPage(initialPageRef.current ?? 1);
    setPerPage(initialPerPageRef.current ?? DEFAULT_PER_PAGE);
    setTotalItems(0);
    setVisibleItems(0);
  }, []);

  const setPerPageValue = useCallback((value, { resetPage = true } = {}) => {
    if (value === undefined || value === null) return;
    const nextValue = String(value);
    if (!validPerPageValues.has(nextValue)) {
      return;
    }
    setPerPage(nextValue);
    if (resetPage) {
      setPage(1);
    }
  }, [validPerPageValues]);

  const handlePerPageChange = useCallback((eventOrValue) => {
    const nextValue = typeof eventOrValue === "string"
      ? eventOrValue
      : eventOrValue?.target?.value;
    setPerPageValue(nextValue, { resetPage: true });
  }, [setPerPageValue]);

  const handlePageChange = useCallback((nextPage) => {
    if (perPageIsAll) return;

    const numericPage = Number(nextPage);
    if (!Number.isFinite(numericPage) || numericPage < 1) {
      return;
    }

    const perPageNumber = resolvePerPageNumber();
    if (!perPageNumber) {
      return;
    }

    const maxPages = Math.max(1, Math.ceil((totalItems || 0) / perPageNumber));
    if (numericPage > maxPages) {
      return;
    }

    setPage(numericPage);
  }, [perPageIsAll, resolvePerPageNumber, totalItems]);

  const totalPages = useMemo(() => {
    if (perPageIsAll) {
      return 1;
    }
    const perPageNumber = resolvePerPageNumber();
    if (!perPageNumber) {
      return 1;
    }
    return Math.max(1, Math.ceil((totalItems || 0) / perPageNumber));
  }, [perPageIsAll, resolvePerPageNumber, totalItems]);

  const rangeStart = useMemo(() => {
    if (!totalItems) {
      return 0;
    }
    if (perPageIsAll) {
      return 1;
    }
    const perPageNumber = resolvePerPageNumber();
    return (page - 1) * perPageNumber + 1;
  }, [totalItems, perPageIsAll, resolvePerPageNumber, page]);

  const rangeEnd = useMemo(() => {
    if (!totalItems) {
      return 0;
    }
    if (perPageIsAll) {
      return totalItems;
    }
    const perPageNumber = resolvePerPageNumber();
    const estimatedEnd = (page - 1) * perPageNumber + (visibleItems || perPageNumber);
    return Math.min(totalItems, estimatedEnd);
  }, [totalItems, perPageIsAll, resolvePerPageNumber, page, visibleItems]);

  const summaryLabel = useMemo(() => {
    if (!totalItems) {
      return "Keine Einträge";
    }
    if (perPageIsAll) {
      return `Zeige alle ${totalItems.toLocaleString()} Einträge`;
    }
    return `Zeige ${rangeStart.toLocaleString()} – ${rangeEnd.toLocaleString()} von ${totalItems.toLocaleString()} Einträgen`;
  }, [totalItems, perPageIsAll, rangeStart, rangeEnd]);

  const value = useMemo(() => ({
    page,
    perPage,
    perPageOptions,
    perPageIsAll,
    totalItems,
    visibleItems,
    totalPages,
    rangeStart,
    rangeEnd,
    summaryLabel,
    setPage,
    setPerPage: setPerPageValue,
    setTotals: updateTotals,
    setTotalItems,
    setVisibleItems,
    handlePageChange,
    handlePerPageChange,
    validPerPageValues,
    resetPagination
  }), [
    page,
    perPage,
    perPageOptions,
    perPageIsAll,
    totalItems,
    visibleItems,
    totalPages,
    rangeStart,
    rangeEnd,
    summaryLabel,
    updateTotals,
    setPerPageValue,
    handlePageChange,
    handlePerPageChange,
    validPerPageValues,
    resetPagination
  ]);

  return (
    <PageContext.Provider value={value}>
      {children}
    </PageContext.Provider>
  );
}

export function usePage() {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("usePage must be used within a PageProvider");
  }
  return context;
}

export function PaginationControls({ disabled = false }) {
  const {
    summaryLabel,
    perPageIsAll,
    page,
    totalPages,
    handlePageChange
  } = usePage();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span>{summaryLabel}</span>
      {!perPageIsAll && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={disabled || page <= 1}
            className="rounded-md border border-slate-300 p-2.5 text-center text-sm transition-all shadow-sm hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
              <path d="M11.03 3.97a.75.75 0 0 1 0 1.06l-6.22 6.22H21a.75.75 0 0 1 0 1.5H4.81l6.22 6.22a.75.75 0 1 1-1.06 1.06l-7.5-7.5a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </button>
          <p className="text-slate-600">
            Seite <strong className="text-slate-800">{page}</strong> /&nbsp;
            <strong className="text-slate-800">{totalPages}</strong>
          </p>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            className="rounded-md border border-slate-300 p-2.5 text-center text-sm transition-all shadow-sm hover:shadow-lg text-slate-600 hover:text-white hover:bg-slate-800 hover:border-slate-800 focus:text-white focus:bg-slate-800 focus:border-slate-800 active:border-slate-800 active:text-white active:bg-slate-800 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
              <path d="M12.97 3.97a.75.75 0 0 1 1.06 0l7.5 7.5a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 1 1-1.06-1.06l6.22-6.22H3a.75.75 0 0 1 0-1.5h16.19l-6.22-6.22a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export const PAGE_DEFAULTS = {
  perPage: DEFAULT_PER_PAGE,
  options: DEFAULT_PER_PAGE_OPTIONS
};

export default PageProvider;
