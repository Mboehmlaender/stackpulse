import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import {
    Card,
    CardHeader,
    CardBody,
    Typography,
    Button,
    Spinner,
    CardFooter,
    Switch,
    Tooltip,
    Avatar,
    Select,
    Option
} from "@material-tailwind/react";
import {
    PencilIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

import { useToast } from "@/components/ToastProvider.jsx";
import { ProfileInfoCard } from "@/widgets/cards";
import { platformSettingsData, projectsData } from "@/data";
import { AVATAR_COLORS } from "@/data/avatarColors.js";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";

const _ = AVATAR_COLORS.join(" ");


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

const mapUser = (item) => ({
    id: item?.id ?? null,
    username: item?.username || "",
    email: item?.email || "",
    isActive: Boolean(item?.isActive),
    avatarColor: item?.avatarColor || null,
    lastLogin: item?.lastLogin || null,
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    groups: normalizeUserGroups(item?.groups)
});

export function UserDetails() {
    const { userId } = useParams();
    const { showToast } = useToast();
    const { maintenance } = useMaintenance();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasLoaded, setHasLoaded] = useState(false);
    const [availableGroups, setAvailableGroups] = useState([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState("");
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [savingGroup, setSavingGroup] = useState(false);

    const maintenanceActive = Boolean(maintenance?.active);

    const numericUserId = useMemo(() => {
        const asNumber = Number(userId);
        return Number.isFinite(asNumber) ? asNumber : null;
    }, [userId]);

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

    const fetchUserDetails = useCallback(async () => {
        if (!numericUserId) {
            setError("Ungültige Benutzer-ID.");
            setUser(null);
            setHasLoaded(true);
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await axios.get(`/api/users/${numericUserId}`);
            const item = mapUser(response.data?.item);
            if (!item.id) {
                throw new Error("USER_NOT_FOUND");
            }
            setUser(item);
            setError("");
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = "Benutzerdetails konnten nicht geladen werden.";

            if (serverError === "USER_NOT_FOUND") {
                message = "Der angeforderte Benutzer wurde nicht gefunden.";
            } else if (serverError === "INVALID_USER_ID") {
                message = "Die angegebene Benutzer-ID ist ungültig.";
            } else if (err.response?.status === 404) {
                message = "Der angeforderte Benutzer existiert nicht.";
            }

            setUser(null);
            setError(message);
            showToast({
                variant: "error",
                title: "Fehler beim Laden",
                description: message
            });
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, [numericUserId, showToast]);

    const fetchAvailableGroups = useCallback(async () => {
        setGroupsLoading(true);
        setGroupsError("");
        try {
            const response = await axios.get("/api/groups");
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            const normalized = items
                .map((item) => ({
                    id: Number(item.id),
                    name: item.name || "",
                    description: item.description || "",
                    memberCount: Number.isFinite(Number(item.memberCount)) ? Number(item.memberCount) : 0
                }))
                .filter((group) => Number.isFinite(group.id) && group.id > 0 && group.name)
                .sort((a, b) => a.name.localeCompare(b.name, "de-DE"));
            setAvailableGroups(normalized);
        } catch (err) {
            const message = err.response?.data?.error || err.message || "Benutzergruppen konnten nicht geladen werden.";
            setGroupsError(message);
            showToast({
                variant: "error",
                title: "Benutzergruppen",
                description: message
            });
        } finally {
            setGroupsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchUserDetails();
    }, [fetchUserDetails]);

    useEffect(() => {
        fetchAvailableGroups();
    }, [fetchAvailableGroups]);

    const originalGroupId = useMemo(() => {
        if (!user || !Array.isArray(user.groups) || user.groups.length === 0) {
            return null;
        }
        const firstValid = user.groups
            .map((group) => Number(group.id))
            .find((id) => Number.isFinite(id) && id > 0);
        return Number.isFinite(firstValid) ? firstValid : null;
    }, [user]);

    useEffect(() => {
        setSelectedGroupId(originalGroupId);
    }, [originalGroupId]);

    const hasGroupChanges = useMemo(() => {
        if (!hasLoaded) {
            return false;
        }
        return originalGroupId !== selectedGroupId;
    }, [originalGroupId, selectedGroupId, hasLoaded]);

    const handleGroupChange = useCallback((value) => {
        if (!value) {
            setSelectedGroupId(null);
            return;
        }
        const numeric = Number(value);
        setSelectedGroupId(Number.isFinite(numeric) && numeric > 0 ? numeric : null);
    }, []);

    const handleResetGroup = useCallback(() => {
        setSelectedGroupId(originalGroupId);
    }, [originalGroupId]);

    const handleSaveGroup = useCallback(async () => {
        if (!user || !hasGroupChanges) {
            return;
        }

        const payloadGroups = selectedGroupId ? [selectedGroupId] : [];

        setSavingGroup(true);
        setGroupsError("");
        try {
            const response = await axios.put(`/api/users/${user.id}/groups`, { groupIds: payloadGroups });
            const updatedUser = mapUser(response.data?.item || response.data?.user);
            setUser(updatedUser);
            const nextGroupId = Array.isArray(updatedUser.groups) && updatedUser.groups.length > 0
                ? Number(updatedUser.groups[0].id)
                : null;
            setSelectedGroupId(Number.isFinite(nextGroupId) && nextGroupId > 0 ? nextGroupId : null);
            showToast({
                variant: "success",
                title: "Globale Rolle aktualisiert",
                description: "Die Gruppenzuordnung wurde gespeichert."
            });
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = err.message || "Die globale Rolle konnte nicht aktualisiert werden.";
            if (serverError === "INVALID_USER_ID") {
                message = "Die Benutzer-ID ist ungültig.";
            } else if (serverError === "USER_NOT_FOUND") {
                message = "Der Benutzer konnte nicht gefunden werden.";
            } else if (serverError === "GROUP_NOT_FOUND") {
                message = "Die ausgewählte Gruppe existiert nicht mehr.";
            } else if (typeof serverError === "string" && serverError.length > 0) {
                message = serverError;
            }
            setGroupsError(message);
            showToast({
                variant: "error",
                title: "Globale Rolle",
                description: message
            });
        } finally {
            setSavingGroup(false);
        }
    }, [user, selectedGroupId, hasGroupChanges, showToast]);

    const selectedGroupLabel = useMemo(() => {
        if (!selectedGroupId) {
            return null;
        }
        const match = availableGroups.find((group) => group.id === selectedGroupId);
        return match ? match.name : null;
    }, [availableGroups, selectedGroupId]);

    const selectValue = selectedGroupId ? String(selectedGroupId) : "";
    const selectDisabled = maintenanceActive || savingGroup || !user || groupsLoading;

    const avatarLabel = useMemo(() => {
        const source = (user?.username || user?.email || "").trim();
        if (!source) {
            return "?";
        }
        return source.charAt(0).toUpperCase();
    }, [user]);


    return (
        <>
            <div className="relative mt-8 h-72 w-full overflow-hidden rounded-xl bg-[url('/img/background-image.png')] bg-cover	bg-center">
                <div className="absolute inset-0 h-full w-full bg-gray-900/75" />
            </div>
            <Card className="mx-3 -mt-16 mb-6 lg:mx-4 border border-blue-gray-100">
                <CardBody className="p-4">
                    <div className="mb-10 flex items-center justify-between flex-wrap gap-6">
                        <div className="flex items-center gap-6">
                            <div
                                className={`text-black flex h-[74px] w-[74px] items-center justify-center rounded-xl text-3xl font-semibold uppercase shadow-lg shadow-blue-gray-500/40 ${user?.avatarColor}`}
                                aria-label={user?.username || "Benutzeravatar"}
                            >
                                {avatarLabel}
                            </div>
                            <div>
                                <Typography variant="h5" color="blue-gray" className="mb-1">
                                    {user?.username}
                                </Typography>
                                <Typography className="text-xs font-semibold uppercase tracking-wide text-stormGrey-400">
                                    User-ID: {user?.id || "–"}
                                </Typography>
                            </div>
                        </div>

                    </div>
                    {loading && !user && (
                        <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-gray-50 bg-blue-gray-50/50 px-4 py-3 text-sm text-blue-gray-500">
                            <Spinner className="h-4 w-4" />
                            <span>Benutzerdaten werden geladen ...</span>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            {error}
                        </div>
                    )}
                    <div className="gird-cols-1 mb-12 grid gap-12 px-4 lg:grid-cols-2 xl:grid-cols-3">
                        <div>
                            <Typography variant="h6" color="blue-gray" className="mb-3">
                                Platform Settings
                            </Typography>
                            <div className="flex flex-col gap-12">
                                {platformSettingsData.map(({ title, options }) => (
                                    <div key={title}>
                                        <Typography className="mb-4 block text-xs font-semibold uppercase text-blue-gray-500">
                                            {title}
                                        </Typography>
                                        <div className="flex flex-col gap-6">
                                            {options.map(({ checked, label }) => (
                                                <Switch
                                                    key={label}
                                                    id={label}
                                                    label={label}
                                                    defaultChecked={checked}
                                                    labelProps={{
                                                        className: "text-sm font-normal text-blue-gray-500",
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <ProfileInfoCard
                            title="Profile Information"
                            description="Hi, I'm Alec Thompson, Decisions: If you can't decide, the answer is no. If two equally difficult paths, choose the one more painful in the short term (pain avoidance is creating an illusion of equality)."
                            details={{
                                "first name": "Alec M. Thompson",
                                mobile: "(44) 123 1234 123",
                                email: "alecthompson@mail.com",
                                location: "USA",
                                social: (
                                    <div className="flex items-center gap-4">
                                        <i className="fa-brands fa-facebook text-blue-700" />
                                        <i className="fa-brands fa-twitter text-blue-400" />
                                        <i className="fa-brands fa-instagram text-purple-500" />
                                    </div>
                                ),
                            }}
                            action={
                                <Tooltip content="Edit Profile">
                                    <PencilIcon className="h-4 w-4 cursor-pointer text-blue-gray-500" />
                                </Tooltip>
                            }
                        />
                        <div id="platform" className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <Typography variant="h6" color="blue-gray">
                                    Globale Rolle
                                </Typography>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="text"
                                        size="sm"
                                        color="blue-gray"
                                        className="normal-case"
                                        onClick={handleResetGroup}
                                        disabled={!hasGroupChanges || savingGroup || !user}
                                    >
                                        Änderungen verwerfen
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="green"
                                        className="normal-case"
                                        onClick={handleSaveGroup}
                                        disabled={maintenanceActive || savingGroup || !hasGroupChanges || !user}
                                    >
                                        {savingGroup ? "Speichert ..." : "Speichern"}
                                    </Button>
                                </div>
                            </div>
                            {maintenanceActive && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    Wartungsmodus aktiv – Änderungen sind deaktiviert.
                                </div>
                            )}
                            {groupsError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                    {groupsError}
                                </div>
                            )}
                            {groupsLoading && availableGroups.length === 0 ? (
                                <div className="flex items-center gap-3 rounded-lg border border-blue-gray-50 bg-blue-gray-50/50 px-4 py-3 text-sm text-blue-gray-500">
                                    <Spinner className="h-4 w-4" />
                                    <span>Benutzergruppen werden geladen ...</span>
                                </div>
                            ) : availableGroups.length === 0 ? (
                                <Typography variant="small" className="text-sm text-stormGrey-500">
                                    Es sind noch keine Benutzergruppen vorhanden.
                                </Typography>
                            ) : (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                    <div className="sm:flex-1">
                                        <Select
                                            label="Benutzergruppe wählen"
                                            value={selectValue}
                                            onChange={handleGroupChange}
                                            disabled={selectDisabled}
                                            variant="outlined"
                                        >
                                            {availableGroups.map((group) => (
                                                <Option key={group.id} value={String(group.id)}>
                                                    {group.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    </div>
                                </div>
                            )}
                            {!(groupsLoading && availableGroups.length === 0) && (
                                <Typography variant="small" className="text-sm text-stormGrey-500">
                                    {selectedGroupLabel
                                        ? `Aktuell zugewiesene Gruppe: ${selectedGroupLabel}`
                                        : "Dem Benutzer ist aktuell keine Gruppe zugewiesen."}
                                </Typography>
                            )}
                        </div>
                    </div>
                    <div className="px-4 pb-4">
                        <Typography variant="h6" color="blue-gray" className="mb-2">
                            Projects
                        </Typography>
                        <Typography
                            variant="small"
                            className="font-normal text-blue-gray-500"
                        >
                            Architects design houses
                        </Typography>
                        <div className="mt-6 grid grid-cols-1 gap-12 md:grid-cols-2 xl:grid-cols-4">
                            {projectsData.map(
                                ({ img, title, description, tag, route, members }) => (
                                    <Card key={title} color="transparent" shadow={false}>
                                        <CardHeader
                                            floated={false}
                                            color="gray"
                                            className="mx-0 mt-0 mb-4 h-64 xl:h-40"
                                        >
                                            <img
                                                src={img}
                                                alt={title}
                                                className="h-full w-full object-cover"
                                            />
                                        </CardHeader>
                                        <CardBody className="py-0 px-1">
                                            <Typography
                                                variant="small"
                                                className="font-normal text-blue-gray-500"
                                            >
                                                {tag}
                                            </Typography>
                                            <Typography
                                                variant="h5"
                                                color="blue-gray"
                                                className="mt-1 mb-2"
                                            >
                                                {title}
                                            </Typography>
                                            <Typography
                                                variant="small"
                                                className="font-normal text-blue-gray-500"
                                            >
                                                {description}
                                            </Typography>
                                        </CardBody>
                                        <CardFooter className="mt-6 flex items-center justify-between py-0 px-1">
                                            <Link to={route}>
                                                <Button variant="outlined" size="sm">
                                                    view project
                                                </Button>
                                            </Link>
                                            <div>
                                                {members.map(({ img, name }, key) => (
                                                    <Tooltip key={name} content={name}>
                                                        <Avatar
                                                            src={img}
                                                            alt={name}
                                                            size="xs"
                                                            variant="circular"
                                                            className={`cursor-pointer border-2 border-white ${key === 0 ? "" : "-ml-2.5"
                                                                }`}
                                                        />
                                                    </Tooltip>
                                                ))}
                                            </div>
                                        </CardFooter>
                                    </Card>
                                )
                            )}
                        </div>
                    </div>
                </CardBody>
            </Card>
        </>
    );
}

export default UserDetails;
