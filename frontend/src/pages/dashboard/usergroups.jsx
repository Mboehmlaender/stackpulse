import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Chip,
  Button,
  Select,
  Option,
  Input,
  useSelect
} from "@material-tailwind/react";
import { PaginationControls, usePage } from "@/components/PageProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { useToast } from "@/components/ToastProvider.jsx";

export function Usergroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { showToast } = useToast();
  const { maintenance } = useMaintenance();
  const maintenanceActive = Boolean(maintenance?.active);

  const {
    page,
    perPage,
    perPageOptions,
    perPageIsAll,
    handlePerPageChange,
    setPage,
    setTotals,
    resetPagination
  } = usePage();

  useEffect(() => () => resetPagination(), [resetPagination]);
  const noop = useCallback(() => { }, []);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/groups");
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      const normalized = items
        .map((item) => ({
          id: item.id,
          name: item.name || "",
          description: item.description || "",
          memberCount: Number(item.memberCount) || 0,
          members: Array.isArray(item.members)
            ? item.members.map((member) => ({
              id: member.id,
              username: member.username || ""
            })).filter((member) => member.username)
            : [],
          createdAt: item.createdAt || null,
          updatedAt: item.updatedAt || null
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
      setGroups(normalized);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Unbekannter Fehler";
      setError(message);
      showToast({
        variant: "error",
        title: "Benutzergruppen konnten nicht geladen werden",
        description: message
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleRefresh = useCallback(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleSearchChange = useCallback((event) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    }
  }, [searchQuery, page, setPage]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return groups;
    }
    return groups.filter((group) => {
      const haystacks = [
        group.name,
        group.description,
        ...group.members.map((member) => member.username)
      ].map((value) => String(value || "").toLowerCase());
      return haystacks.some((value) => value.includes(query));
    });
  }, [groups, searchQuery]);

  const perPageNumber = useMemo(() => {
    if (perPageIsAll) {
      return null;
    }
    const numeric = Number(perPage);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }, [perPage, perPageIsAll]);

  const paginatedGroups = useMemo(() => {
    if (perPageIsAll || !perPageNumber) {
      return filteredGroups;
    }
    const startIndex = (page - 1) * perPageNumber;
    return filteredGroups.slice(startIndex, startIndex + perPageNumber);
  }, [filteredGroups, page, perPageIsAll, perPageNumber]);

  const filteredCount = filteredGroups.length;
  const visibleCount = paginatedGroups.length;

  useEffect(() => {
    if (perPageIsAll) {
      setTotals(filteredCount, filteredCount);
      if (page !== 1) {
        setPage(1);
      }
      return;
    }

    const numeric = Number(perPage);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setTotals(filteredCount, filteredCount);
      return;
    }

    const maxPages = Math.max(1, Math.ceil(filteredCount / numeric));
    if (page > maxPages) {
      setPage(maxPages);
      return;
    }

    setTotals(filteredCount, visibleCount);
  }, [filteredCount, visibleCount, page, perPage, perPageIsAll, setPage, setTotals]);

  const formatTimestamp = useCallback((value) => {
    if (!value) {
      return "–";
    }
    const normalized = typeof value === "string" ? value.replace(" ", "T") : value;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(parsed);
  }, []);

  return (
    <div className="mt-12">
      <Card className="border border-blue-gray-100 shadow-sm">
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography
            variant="h6"
            color="white"
          >
            <span>Benutzergruppen</span>
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">

          {maintenanceActive && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Wartungsmodus aktiv – Änderungen sind deaktiviert. Die Liste kann dennoch angezeigt werden.
            </div>
          )}

          <div className="mb-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="md:flex-1">
                <Input
                  label="Suchen nach Name, E-Mail oder Gruppe"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  disabled={loading && !groups.length}
                  crossOrigin=""
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
                    <Option key={value} value={value}>
                      {label}
                    </Option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-blue-gray-50">
            <table className="w-full min-w-[720px] table-auto text-left">
              <thead>
                <tr className="bg-blue-gray-50/50 text-xs uppercase tracking-wide text-stormGrey-400">
                  <th className="px-6 py-4 font-semibold">Gruppenname</th>
                  <th className="px-6 py-4 font-semibold">Beschreibung</th>
                  <th className="px-6 py-4 font-semibold">Mitglieder</th>
                  <th className="px-6 py-4 font-semibold">Anzahl</th>
                  <th className="px-6 py-4 font-semibold">Erstellt am</th>
                  <th className="px-6 py-4 font-semibold">Zuletzt aktualisiert</th>
                  <th className="px-6 py-4 font-semibold">Aktionen</th>

                </tr>
              </thead>
              <tbody>
                {loading && groups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-stormGrey-400">
                      Gruppen werden geladen ...
                    </td>
                  </tr>
                ) : paginatedGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-stormGrey-400">
                      Keine Gruppen gefunden.
                    </td>
                  </tr>
                ) : (
                  paginatedGroups.map((group, index) => {
                    const rowClass = index === paginatedGroups.length - 1 ? "" : "border-b border-blue-gray-50";
                    return (
                      <tr key={group.id} className={`text-sm text-stormGrey-700 ${rowClass}`}>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="font-medium text-stormGrey-900">
                            {group.name || "–"}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small">
                            {group.description ? (
                              group.description
                            ) : (
                              <span className="text-stormGrey-400">–</span>
                            )}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          {group.members.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {group.members.map((member) => (
                                <Chip
                                  key={`${group.id}-${member.id}-${member.username}`}
                                  value={member.username}
                                  size="sm"
                                  color="blue-gray"
                                  variant="ghost"
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-stormGrey-400">Keine Mitglieder</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Chip
                            value={group.memberCount.toLocaleString("de-DE")}
                            size="sm"
                            color={group.memberCount > 0 ? "green" : "blue-gray"}
                            variant="ghost"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="antialiased font-sans mb-1 block text-xs font-medium text-stormGrey-600">
                            {formatTimestamp(group.createdAt)}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="antialiased font-sans mb-1 block text-xs font-medium text-stormGrey-600">
                            {formatTimestamp(group.updatedAt)}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="antialiased font-sans mb-1 block text-xs font-medium text-stormGrey-600">
                            Aktionen
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
              {!loading && groups.length === 0
                ? "Noch keine Gruppen angelegt."
                : `${filteredCount.toLocaleString("de-DE")} Gruppen gefunden`}
            </Typography>
            <PaginationControls disabled={loading && groups.length === 0} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default Usergroups;
