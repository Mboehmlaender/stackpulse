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
  Input
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";
import { PaginationControls, usePage } from "@/components/PageProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { useToast } from "@/components/ToastProvider.jsx";

const normalizeUserGroups = (rawGroups) => {
  if (!Array.isArray(rawGroups)) {
    return [];
  }
  return rawGroups
    .map((group) => {
      if (group && typeof group === "object") {
        const id = Number(group.id);
        const name = typeof group.name === "string" ? group.name : "";
        if (!name) {
          return null;
        }
        return {
          id: Number.isFinite(id) ? id : null,
          name
        };
      }
      if (typeof group === "string") {
        const name = group.trim();
        return name ? { id: null, name } : null;
      }
      return null;
    })
    .filter(Boolean);
};

export function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { showToast } = useToast();
  const { maintenance } = useMaintenance();
  const maintenanceActive = Boolean(maintenance?.active);
  const navigate = useNavigate();
  const noop = useCallback(() => { }, []);

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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/users");
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      const sorted = items
        .map((item) => ({
          id: item.id,
          username: item.username || "",
          email: item.email || "",
          isActive: Boolean(item.isActive),
          avatarColor: typeof item.avatarColor === "string" ? item.avatarColor.trim() : null,
          lastLogin: item.lastLogin || null,
          createdAt: item.createdAt || null,
          updatedAt: item.updatedAt || null,
          groups: normalizeUserGroups(item.groups)
        }))
        .sort((a, b) => a.username.localeCompare(b.username, "de-DE"));
      setUsers(sorted);
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Unbekannter Fehler";
      setError(message);
      showToast({
        variant: "error",
        title: "Benutzer konnten nicht geladen werden",
        description: message
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((user) => {
      const haystacks = [
        user.username,
        user.email,
        ...user.groups.map((group) => group.name)
      ].map((value) => String(value || "").toLowerCase());
      return haystacks.some((value) => value.includes(query));
    });
  }, [users, searchQuery]);

  const perPageNumber = useMemo(() => {
    if (perPageIsAll) {
      return null;
    }
    const numeric = Number(perPage);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }, [perPage, perPageIsAll]);

  const paginatedUsers = useMemo(() => {
    if (perPageIsAll || !perPageNumber) {
      return filteredUsers;
    }
    const startIndex = (page - 1) * perPageNumber;
    return filteredUsers.slice(startIndex, startIndex + perPageNumber);
  }, [filteredUsers, page, perPageIsAll, perPageNumber]);

  const filteredCount = filteredUsers.length;
  const visibleCount = paginatedUsers.length;

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
      <Card>
        <CardHeader variant="gradient" color="gray" className="mb-5 p-4">
          <Typography
            variant="h6"
            color="white"
          >
            <span>Benutzerverwaltung</span>
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">
          {maintenanceActive && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Wartungsmodus aktiv – Änderungen sind deaktiviert. Die Liste kann dennoch angezeigt werden.
            </div>
          )}

          <div className="mb-8">

            <div className="flex flex-wrap gap-2">            {/* <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-gray-400">
                  Einträge pro Seite
                </label>
                <select
                  value={perPage}
                  onChange={handlePerPageChange}
                  className="w-full rounded-lg border border-blue-gray-100 px-3 py-2 text-sm text-blue-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 md:w-40"
                >
                  {perPageOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outlined"
                color="blue"
                onClick={handleRefresh}
                disabled={loading}
                className="whitespace-nowrap"
              >
                {loading ? "Lädt ..." : "Aktualisieren"}
              </Button>
            </div> */}
              {/* <div className="w-full md:max-w-md">
              <Input
                label="Suchen nach Name, E-Mail oder Gruppe"
                value={searchQuery}
                onChange={handleSearchChange}
                disabled={loading && !users.length}
                crossOrigin=""
              />
            </div> */}
              {/* {searchQuery && (
              <Button
                variant="text"
                color="blue-gray"
                onClick={handleClearSearch}
                className="w-full md:w-auto"
              >
                Suche zurücksetzen
              </Button>
            )} */}


              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mt-8">
                <div className="md:flex-1">
                  <Input
                    label="Suchen nach Name, E-Mail oder Gruppe"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    disabled={loading && !users.length}
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
          </div>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-blue-gray-50">
            <table className="w-full min-w-[720px] table-auto text-left">
              <thead>
                <tr className="bg-blue-gray-50/50 text-xs uppercase tracking-wide text-stormGrey-400">
                  <th className="px-6 py-4 font-semibold">Benutzername</th>
                  <th className="px-6 py-4 font-semibold">E-Mail</th>
                  <th className="px-6 py-4 font-semibold">Gruppen</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Letzte Anmeldung</th>
                  <th className="px-6 py-4 font-semibold">Erstellt am</th>
                  <th className="px-6 py-4 font-semibold">Aktionen</th>

                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-blue-gray-400">
                      Benutzerdaten werden geladen ...
                    </td>
                  </tr>
                ) : paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-blue-gray-400">
                      Keine Benutzer gefunden.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user, index) => {
                    const rowClass = index === paginatedUsers.length - 1 ? "" : "border-b border-blue-gray-50";
                    return (
                      <tr key={user.id} className={`text-sm text-stormGrey-700 ${rowClass}`}>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="font-medium text-stormGrey-900">
                            {user.username || "–"}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small">
                            {user.email || "–"}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          {user.groups.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {user.groups.map((group) => (
                                <Chip
                                  key={group.id ?? group.name}
                                  value={group.name}
                                  size="sm"
                                  color="blue-gray"
                                  variant="ghost"
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-stormGrey-400">–</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Chip
                            value={user.isActive ? "Aktiv" : "Deaktiviert"}
                            size="sm"
                            color={user.isActive ? "green" : "red"}
                            variant="ghost"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="antialiased font-sans mb-1 block text-xs font-medium text-stormGrey-600">
                            {formatTimestamp(user.lastLogin)}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Typography variant="small" className="antialiased font-sans mb-1 block text-xs font-medium text-stormGrey-600">
                            {formatTimestamp(user.createdAt)}
                          </Typography>
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            size="sm"
                            variant="outlined"
                            color="blue-gray"
                            onClick={() => navigate(`/dashboard/users/${user.id}`)}
                          >
                            Details
                          </Button>
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
            <PaginationControls disabled={loading && users.length === 0} />
          </div>
        </CardBody>
      </Card>
    </div>
  );

}

export default Users;
