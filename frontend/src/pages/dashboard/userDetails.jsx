import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import {
    Card,
    CardBody,
    Typography,
    Button,
    Spinner,
    Select,
    Option,
    Input,
    Switch
} from "@material-tailwind/react";

import { useToast } from "@/components/ToastProvider.jsx";
import { AVATAR_COLORS } from "@/data/avatarColors.js";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { useAuth } from "@/components/AuthProvider.jsx";

const _ = AVATAR_COLORS.join(" ");

const UPDATE_STAGE_LABELS = {
    initializing: "Vorbereitung",
    "activating-maintenance": "Wartungsmodus aktivieren",
    "executing-script": "Skript wird ausgeführt",
    waiting: "Warte auf Portainer",
    completed: "Abgeschlossen",
    failed: "Fehlgeschlagen"
};

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
    groups: normalizeUserGroups(item?.groups),
    securityPhraseDownloadedAt: item?.securityPhraseDownloadedAt || null
});

const normalizeServer = (item) => {
    if (!item || typeof item !== "object") {
        return null;
    }
    const id = Number(item.id ?? item.serverId ?? item.server_id);
    if (!Number.isFinite(id)) {
        return null;
    }
    const name = item.name || item.serverName || item.server_name || `Server ${id}`;
    return {
        id,
        name,
        url: item.url || item.serverUrl || item.server_url || ""
    };
};

const normalizeAssignmentsList = (list, servers = []) => {
    const serverMap = new Map(servers.map((server) => [server.id, server]));
    if (!Array.isArray(list)) {
        return [];
    }
    return list
        .map((entry) => {
            const serverId = Number(entry?.serverId ?? entry?.server_id);
            if (!Number.isFinite(serverId)) {
                return null;
            }
            const groupId = Number(entry?.groupId ?? entry?.group_id);
            const serverFallback = serverMap.get(serverId);
            return {
                serverId,
                serverName: entry?.serverName || entry?.server_name || serverFallback?.name || "",
                serverUrl: entry?.serverUrl || entry?.server_url || serverFallback?.url || "",
                groupId: Number.isFinite(groupId) ? groupId : null,
                groupName: entry?.groupName || entry?.group_name || "",
                useGlobalGroup: Boolean(entry?.useGlobalGroup ?? entry?.use_global_group)
            };
        })
        .filter(Boolean);
};

const extractPrimaryGroupId = (user) => {
    if (!user || !Array.isArray(user.groups) || user.groups.length === 0) {
        return null;
    }
    const firstValid = user.groups
        .map((group) => Number(group.id))
        .find((id) => Number.isFinite(id) && id > 0);
    return Number.isFinite(firstValid) ? firstValid : null;
};

const buildInitialFormValues = (user) => {
    if (!user) {
        return {
            username: "",
            email: "",
            password: "",
            groupId: null,
            avatarColor: ""
        };
    }

    const primaryGroupId = extractPrimaryGroupId(user);

    return {
        username: user.username || "",
        email: user.email || "",
        password: "",
        groupId: Number.isFinite(primaryGroupId) ? primaryGroupId : null,
        avatarColor: user.avatarColor || ""
    };
};

export function UserDetails() {
    const { userId } = useParams();
    const { showToast } = useToast();
    const { maintenance: maintenanceMeta, update: updateState } = useMaintenance();
    const { hasPermission, user: authUser } = useAuth();

    const [user, setUser] = useState(null);
    const [formValues, setFormValues] = useState(buildInitialFormValues(null));
    const initialFormValuesRef = useRef(buildInitialFormValues(null));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [hasLoaded, setHasLoaded] = useState(false);
    const [availableGroups, setAvailableGroups] = useState([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState("");
    const [savingUser, setSavingUser] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [securityPhraseWords, setSecurityPhraseWords] = useState([]);
    const [securityPhraseDownloadedAt, setSecurityPhraseDownloadedAt] = useState(null);
    const [securityPhraseLoading, setSecurityPhraseLoading] = useState(false);
    const [securityPhraseError, setSecurityPhraseError] = useState("");
    const [renewingSecurityPhrase, setRenewingSecurityPhrase] = useState(false);
    const [serverAssignments, setServerAssignments] = useState([]);
    const [availableServers, setAvailableServers] = useState([]);
    const [assignmentsError, setAssignmentsError] = useState("");
    const [savingAssignments, setSavingAssignments] = useState(false);
    const initialAssignmentsRef = useRef([]);

    const maintenanceActive = Boolean(maintenanceMeta?.active);
    const maintenanceMessage = maintenanceMeta?.message;
    const updateRunning = Boolean(updateState?.running);
    const updateStageLabel = updateState?.stage ? (UPDATE_STAGE_LABELS[updateState.stage] ?? updateState.stage) : "–";
    const maintenanceLocked = maintenanceActive || updateRunning;

    const canEditUsers = Boolean(authUser?.isSuperuser || hasPermission("users-edit", "full"));
    const canReadUsers = Boolean(authUser?.isSuperuser || hasPermission("users-edit", "read"));
    const canManageSecurityPhrase = Boolean(authUser?.isSuperuser || hasPermission("users-security-phrase", "full"));
    const canRenewSecurityPhrase = canManageSecurityPhrase;

    if (!canReadUsers) {
        return null;
    }

    const isSuperuserUser = useMemo(() => {
        if (!Array.isArray(user?.groups)) {
            return false;
        }
        return user.groups.some((group) => (group?.name || "").toLowerCase() === "superuser");
    }, [user]);
    const canCurrentUserEditSuperuser = authUser?.isSuperuser && user?.id && Number(authUser.id) === Number(user.id);
    const superuserFieldsLocked = isSuperuserUser && !canCurrentUserEditSuperuser;

    const numericUserId = useMemo(() => {
        const asNumber = Number(userId);
        return Number.isFinite(asNumber) ? asNumber : null;
    }, [userId]);

    const fetchUserDetails = useCallback(async () => {
        if (!numericUserId) {
            setError("Ungültige Benutzer-ID.");
            setUser(null);
            setFormValues(buildInitialFormValues(null));
            initialFormValuesRef.current = buildInitialFormValues(null);
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
            const normalizedServers = Array.isArray(response.data?.servers)
                ? response.data.servers.map(normalizeServer).filter(Boolean)
                : [];
            setAvailableServers(normalizedServers);
            const normalizedAssignments = normalizeAssignmentsList(
                response.data?.item?.serverAssignments ?? response.data?.serverAssignments ?? [],
                normalizedServers
            );
            initialAssignmentsRef.current = normalizedAssignments;
            setServerAssignments(normalizedAssignments);
            setAssignmentsError("");
            setUser(item);
            setSecurityPhraseWords([]);
            setSecurityPhraseDownloadedAt(item.securityPhraseDownloadedAt || null);
            setSecurityPhraseError("");
            const initialValues = buildInitialFormValues(item);
            initialFormValuesRef.current = { ...initialValues };
            setFormValues(initialValues);
            setSaveError("");
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
            initialFormValuesRef.current = buildInitialFormValues(null);
            setFormValues(buildInitialFormValues(null));
            setServerAssignments([]);
            setAvailableServers([]);
            setAssignmentsError("");
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

    const hasChanges = useMemo(() => {
        if (!hasLoaded || !user) {
            return false;
        }

        const initial = initialFormValuesRef.current;
        if (!initial) {
            return false;
        }

        const initialUsername = initial.username || "";
        const currentUsername = formValues.username || "";

        const initialEmail = initial.email || "";
        const currentEmail = formValues.email || "";

        const initialGroupId = Number.isFinite(initial.groupId) ? Number(initial.groupId) : null;
        const currentGroupId = Number.isFinite(formValues.groupId) ? Number(formValues.groupId) : null;

        const initialAvatar = initial.avatarColor || "";
        const currentAvatar = formValues.avatarColor || "";

        const passwordChanged = Boolean(formValues.password && formValues.password.trim().length > 0);

        return (
            initialUsername !== currentUsername ||
            initialEmail !== currentEmail ||
            (!isSuperuserUser && initialGroupId !== currentGroupId) ||
            initialAvatar !== currentAvatar ||
            passwordChanged
        );
    }, [formValues, hasLoaded, user, isSuperuserUser]);

    const renderSelectedAvatarLabel = useCallback(
        (element) => {
            if (element?.props?.children) {
                return element.props.children;
            }
            if (!formValues.avatarColor) {
                return "Standardfarbe";
            }
            return formValues.avatarColor;
        },
        [formValues.avatarColor]
    );

    const handleUsernameChange = useCallback((event) => {
        if (!canEditUsers) return;
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            username: value
        }));
    }, [canEditUsers]);

    const handleEmailChange = useCallback((event) => {
        if (!canEditUsers) return;
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            email: value
        }));
    }, [canEditUsers]);

    const handlePasswordChange = useCallback((event) => {
        if (!canEditUsers) return;
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            password: value
        }));
    }, [canEditUsers]);

    const handleGroupChange = useCallback((value) => {
        if (!canEditUsers) return;
        if (!value) {
            setFormValues((prev) => ({
                ...prev,
                groupId: null
            }));
            return;
        }
        const numeric = Number(value);
        setFormValues((prev) => ({
            ...prev,
            groupId: Number.isFinite(numeric) && numeric > 0 ? numeric : null
        }));
    }, [canEditUsers]);

    const handleAvatarColorChange = useCallback((value) => {
        if (!canEditUsers) return;
        setFormValues((prev) => ({
            ...prev,
            avatarColor: value || ""
        }));
    }, [canEditUsers]);

    const assignmentsChanged = useMemo(() => {
        const serialize = (list) =>
            JSON.stringify(
                list
                    .map((entry) => ({
                        serverId: Number(entry.serverId) || null,
                        groupId: entry.useGlobalGroup ? null : (Number(entry.groupId) || null),
                        useGlobalGroup: Boolean(entry.useGlobalGroup)
                    }))
                    .sort((a, b) => (a.serverId || 0) - (b.serverId || 0))
            );
        return serialize(serverAssignments) !== serialize(initialAssignmentsRef.current);
    }, [serverAssignments]);

    const usedServerIds = useMemo(
        () =>
            new Set(
                serverAssignments
                    .map((entry) => Number(entry.serverId))
                    .filter((value) => Number.isFinite(value) && value > 0)
            ),
        [serverAssignments]
    );

    const getServerOptionsForRow = useCallback(
        (currentServerId) => {
            return availableServers.filter(
                (server) => server.id === currentServerId || !usedServerIds.has(server.id)
            );
        },
        [availableServers, usedServerIds]
    );

    const handleAddAssignment = useCallback(() => {
        if (!canEditUsers || isSuperuserUser) return;
        const usedServerIds = new Set(
            serverAssignments
                .map((entry) => Number(entry.serverId))
                .filter((value) => Number.isFinite(value) && value > 0)
        );
        const nextServer = availableServers.find((server) => !usedServerIds.has(server.id));
        if (!nextServer) {
            setAssignmentsError("Alle verfügbaren Server sind bereits zugeordnet.");
            return;
        }
        setAssignmentsError("");
        setServerAssignments((prev) => [
            ...prev,
            {
                serverId: nextServer.id,
                serverName: nextServer.name ?? "",
                serverUrl: nextServer.url ?? "",
                groupId: null,
                groupName: "",
                useGlobalGroup: true
            }
        ]);
    }, [canEditUsers, serverAssignments, availableServers]);

    const handleAssignmentServerChange = useCallback(
        (index, value) => {
            if (!canEditUsers || isSuperuserUser) return;
            const numeric = Number(value);
            const server = availableServers.find((item) => item.id === numeric);
            setServerAssignments((prev) =>
                prev.map((entry, idx) =>
                    idx === index
                        ? {
                              ...entry,
                              serverId: Number.isFinite(numeric) ? numeric : null,
                              serverName: server?.name || entry.serverName,
                              serverUrl: server?.url || entry.serverUrl
                          }
                        : entry
                )
            );
        },
        [availableServers, canEditUsers]
    );

    const handleAssignmentGroupChange = useCallback(
        (index, value) => {
            if (!canEditUsers || isSuperuserUser) return;
            const numeric = Number(value);
            setServerAssignments((prev) =>
                prev.map((entry, idx) =>
                    idx === index
                        ? {
                              ...entry,
                              groupId: Number.isFinite(numeric) ? numeric : null,
                              useGlobalGroup: false
                          }
                        : entry
                )
            );
        },
        [canEditUsers]
    );

    const handleAssignmentUseGlobalToggle = useCallback(
        (index, checked) => {
            if (!canEditUsers || isSuperuserUser) return;
            setServerAssignments((prev) =>
                prev.map((entry, idx) =>
                    idx === index
                        ? {
                              ...entry,
                              useGlobalGroup: Boolean(checked),
                              groupId: checked ? null : entry.groupId
                          }
                        : entry
                )
            );
        },
        [canEditUsers]
    );

    const handleRemoveAssignment = useCallback(
        (index) => {
            if (!canEditUsers || isSuperuserUser) return;
            setServerAssignments((prev) => prev.filter((_, idx) => idx !== index));
        },
        [canEditUsers, isSuperuserUser]
    );

    const handleSaveAssignments = useCallback(async () => {
        if (!canEditUsers || !numericUserId || !assignmentsChanged || isSuperuserUser) {
            return;
        }

        const normalizedPayload = [];
        const seenServers = new Set();
        for (const assignment of serverAssignments) {
            const serverId = Number(assignment.serverId);
            if (!Number.isFinite(serverId) || serverId <= 0) {
                setAssignmentsError("Bitte wähle für jede Zuordnung einen Server aus.");
                return;
            }
            if (seenServers.has(serverId)) {
                setAssignmentsError("Jeder Server kann nur einmal zugeordnet werden.");
                return;
            }
            seenServers.add(serverId);
            const useGlobalGroup = Boolean(assignment.useGlobalGroup);
            const groupId = Number(assignment.groupId);
            if (!useGlobalGroup && (!Number.isFinite(groupId) || groupId <= 0)) {
                setAssignmentsError("Bitte wähle eine Rechtegruppe oder aktiviere die globale Gruppe.");
                return;
            }
            normalizedPayload.push({
                serverId,
                groupId: useGlobalGroup ? null : groupId,
                useGlobalGroup
            });
        }

        setAssignmentsError("");
        setSavingAssignments(true);

        try {
            const response = await axios.put(
                `/api/users/${numericUserId}/server-assignments`,
                { assignments: normalizedPayload }
            );
            const normalizedAssignments = normalizeAssignmentsList(
                response.data?.items ?? [],
                availableServers
            );
            initialAssignmentsRef.current = normalizedAssignments;
            setServerAssignments(normalizedAssignments);
            showToast({
                variant: "success",
                title: "Serverzuordnungen gespeichert",
                description: "Die Zuordnungen wurden erfolgreich aktualisiert."
            });
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = "Die Serverzuordnungen konnten nicht gespeichert werden.";
            if (serverError === "USER_NOT_FOUND") {
                message = "Der Benutzer wurde nicht gefunden.";
            } else if (serverError === "INVALID_USER_ID") {
                message = "Die Benutzer-ID ist ungültig.";
            } else if (serverError === "USER_SUPERUSER_PROTECTED") {
                message = "Für den Superuser können keine Server-Zuordnungen gesetzt werden.";
            } else if (serverError === "SERVER_NOT_FOUND") {
                message = "Ein ausgewählter Server existiert nicht mehr.";
            } else if (serverError === "GROUP_NOT_FOUND") {
                message = "Eine ausgewählte Rechtegruppe existiert nicht mehr.";
            } else if (serverError === "INSUFFICIENT_PERMISSIONS") {
                message = "Keine Berechtigung zum Ändern der Zuordnungen.";
            }
            setAssignmentsError(message);
            showToast({
                variant: "error",
                title: "Speichern fehlgeschlagen",
                description: message
            });
        } finally {
            setSavingAssignments(false);
        }
    }, [canEditUsers, numericUserId, serverAssignments, availableServers, assignmentsChanged, showToast]);

    const handleSaveUser = useCallback(async () => {
        if (!canEditUsers || !user || !hasChanges) {
            return;
        }

        setSavingUser(true);
        setSaveError("");

        try {
            const payload = {
                username: formValues.username,
                email: formValues.email,
                password: formValues.password,
                avatarColor: formValues.avatarColor
            };

            if (!isSuperuserUser) {
                payload.groupId = formValues.groupId;
            }

            const response = await axios.put(`/api/users/${user.id}`, payload);
            const updatedUser = mapUser(response.data?.item || response.data?.user);
            setUser(updatedUser);
            const nextInitial = buildInitialFormValues(updatedUser);
            initialFormValuesRef.current = { ...nextInitial };
            setFormValues(nextInitial);
            setGroupsError("");
            showToast({
                variant: "success",
                title: "Benutzer gespeichert",
                description: "Die Änderungen wurden erfolgreich gespeichert."
            });
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = "Die Benutzerdaten konnten nicht gespeichert werden.";

            if (serverError === "USERNAME_REQUIRED") {
                message = "Bitte einen Benutzernamen angeben.";
            } else if (serverError === "USERNAME_TAKEN") {
                message = "Der Benutzername wird bereits verwendet.";
            } else if (serverError === "INVALID_EMAIL") {
                message = "Bitte eine gültige E-Mail-Adresse eingeben.";
            } else if (serverError === "EMAIL_TAKEN") {
                message = "Die E-Mail-Adresse wird bereits verwendet.";
            } else if (serverError === "INVALID_PASSWORD") {
                message = "Das Passwort ist ungültig.";
            } else if (serverError === "PASSWORD_TOO_SHORT") {
                message = "Das Passwort muss mindestens 8 Zeichen enthalten.";
            } else if (serverError === "INVALID_AVATAR_COLOR") {
                message = "Bitte eine gültige Avatar-Farbe auswählen.";
            } else if (serverError === "GROUP_NOT_FOUND") {
                message = "Die ausgewählte Benutzergruppe existiert nicht mehr.";
                setGroupsError(message);
            }

            setSaveError(message);
            showToast({
                variant: "error",
                title: "Speichern fehlgeschlagen",
                description: message
            });
        } finally {
            setSavingUser(false);
        }
    }, [canEditUsers, user, hasChanges, formValues, showToast, isSuperuserUser]);

    const fetchSecurityPhrase = useCallback(async () => {
        if (!canManageSecurityPhrase || !numericUserId) {
            return;
        }

        setSecurityPhraseLoading(true);
        setSecurityPhraseError("");

        try {
            const response = await axios.get(`/api/users/${numericUserId}/security-phrase`);
            const words = Array.isArray(response.data?.item?.words) ? response.data.item.words : [];
            setSecurityPhraseWords(words);
            setSecurityPhraseDownloadedAt(response.data?.item?.downloadedAt || null);
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = "Sicherheitsschlüssel konnte nicht geladen werden.";

            if (serverError === "USER_NOT_FOUND") {
                message = "Der Benutzer wurde nicht gefunden.";
            } else if (serverError === "INVALID_USER_ID") {
                message = "Die Benutzer-ID ist ungültig.";
            } else if (serverError === "INSUFFICIENT_PERMISSIONS") {
                message = "Keine Berechtigung zum Anzeigen des Sicherheitsschlüssels.";
            }

            setSecurityPhraseError(message);
            setSecurityPhraseWords([]);
            setSecurityPhraseDownloadedAt(null);
        } finally {
            setSecurityPhraseLoading(false);
        }
    }, [canManageSecurityPhrase, numericUserId]);

    const handleReloadSecurityPhrase = useCallback(() => {
        if (!canRenewSecurityPhrase) {
            return;
        }
        if (securityPhraseLoading || renewingSecurityPhrase) {
            return;
        }
        fetchSecurityPhrase();
    }, [canRenewSecurityPhrase, fetchSecurityPhrase, renewingSecurityPhrase, securityPhraseLoading]);

    const handleRenewSecurityPhrase = useCallback(async () => {
        if (!canRenewSecurityPhrase || !numericUserId || maintenanceLocked || renewingSecurityPhrase) {
            return;
        }

        setRenewingSecurityPhrase(true);
        setSecurityPhraseError("");

        try {
            const response = await axios.post(`/api/users/${numericUserId}/security-phrase/renew`);
            const words = Array.isArray(response.data?.item?.words) ? response.data.item.words : [];
            setSecurityPhraseWords(words);
            setSecurityPhraseDownloadedAt(response.data?.item?.downloadedAt || null);
            showToast({
                variant: "success",
                title: "Sicherheitsschlüssel erneuert",
                description: "Der Benutzer muss den neuen Schlüssel erneut herunterladen."
            });
        } catch (err) {
            const serverError = err.response?.data?.error;
            let message = "Der Sicherheitsschlüssel konnte nicht erneuert werden.";

            if (serverError === "USER_NOT_FOUND") {
                message = "Der Benutzer wurde nicht gefunden.";
            } else if (serverError === "INVALID_USER_ID") {
                message = "Die Benutzer-ID ist ungültig.";
            } else if (serverError === "INSUFFICIENT_PERMISSIONS") {
                message = "Keine Berechtigung zum Erneuern des Sicherheitsschlüssels.";
            }

            setSecurityPhraseError(message);
        } finally {
            setRenewingSecurityPhrase(false);
        }
    }, [
        canRenewSecurityPhrase,
        numericUserId,
        maintenanceLocked,
        renewingSecurityPhrase,
        showToast
    ]);

    const avatarLabel = useMemo(() => {
        const source = (formValues.username || formValues.email || "").trim();
        if (!source) {
            return "?";
        }
        return source.charAt(0).toUpperCase();
    }, [formValues.username, formValues.email]);

    const avatarColorClass = useMemo(() => {
        if (formValues.avatarColor) {
            return formValues.avatarColor;
        }
        return user?.avatarColor || "";
    }, [formValues.avatarColor, user]);

    const securityPhraseRows = useMemo(() => {
        if (!Array.isArray(securityPhraseWords) || securityPhraseWords.length === 0) {
            return [];
        }
        const rows = [];
        for (let index = 0; index < securityPhraseWords.length; index += 4) {
            rows.push(securityPhraseWords.slice(index, index + 4));
        }
        return rows;
    }, [securityPhraseWords]);

    const securityPhraseStatus = useMemo(() => {
        if (!securityPhraseDownloadedAt) {
            return {
                text: "Noch nicht heruntergeladen",
                tone: "text-red-500"
            };
        }
        const date = new Date(securityPhraseDownloadedAt);
        if (Number.isNaN(date.getTime())) {
            return {
                text: "Zuletzt heruntergeladen: unbekannt",
                tone: "text-blue-gray-500"
            };
        }
        return {
            text: `Zuletzt heruntergeladen: ${date.toLocaleString("de-DE")}`,
            tone: "text-blue-gray-500"
        };
    }, [securityPhraseDownloadedAt]);

    const filteredGroups = useMemo(() => {
        if (!Array.isArray(availableGroups)) {
            return [];
        }
        return availableGroups.filter((group) => (group?.name || "").toLowerCase() !== "superuser");
    }, [availableGroups]);

    useEffect(() => {
        if (isSuperuserUser) {
            return;
        }
        const currentGroupId = formValues.groupId ? Number(formValues.groupId) : null;
        const stillExists = filteredGroups.some((group) => Number(group.id) === currentGroupId);
        if (!stillExists) {
            setFormValues((prev) => ({
                ...prev,
                groupId: null
            }));
        }
    }, [filteredGroups, formValues.groupId, isSuperuserUser]);

    useEffect(() => {
        if (!hasLoaded) {
            return;
        }

        if (!canManageSecurityPhrase || !numericUserId) {
            setSecurityPhraseWords([]);
            setSecurityPhraseDownloadedAt(null);
            setSecurityPhraseError("");
            setSecurityPhraseLoading(false);
            return;
        }

        fetchSecurityPhrase();
    }, [hasLoaded, canManageSecurityPhrase, fetchSecurityPhrase, numericUserId]);

    const inputDisabled = maintenanceLocked || savingUser || !user || !canEditUsers;
    const selectDisabled = maintenanceLocked || savingUser || !user || groupsLoading || !canEditUsers || isSuperuserUser;
    const avatarSelectDisabled = maintenanceLocked || savingUser || !user || !canEditUsers || superuserFieldsLocked;
    const groupSelectValue = formValues.groupId ? String(formValues.groupId) : "";

    return (
        <>
            <div className="mt-12 flex flex-col gap-12">
                {(maintenanceActive || updateRunning) && (
                    <div className="rounded-lg border border-cyan-500/60 bg-cyan-900/30 px-4 py-3 text-sm text-bluegray-100">
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
                <div className="relative h-72 w-full overflow-hidden rounded-xl bg-[url('/img/background-image.png')] bg-cover\tbg-center">
                    <div className="absolute inset-0 h-full w-full bg-gray-900/75" />
                </div>
                <Card className="mx-3 -mt-16 mb-6 lg:mx-4 border border-blue-gray-100">
                    <CardBody className="p-4">
                        <div className="mb-10 flex flex-wrap items-center justify-between gap-6">
                            <div className="flex items-center gap-6">
                                <div
                                    className={`text-black flex h-[74px] w-[74px] items-center justify-center rounded-xl text-3xl font-semibold uppercase shadow-lg shadow-blue-gray-500/40 ${avatarColorClass}`}
                                    aria-label={formValues.username || "Benutzeravatar"}
                                >
                                    {avatarLabel}
                                </div>
                                <div>
                                    <Typography variant="h5" color="blue-gray">
                                        {formValues.username || "–"}
                                    </Typography>
                                    <Typography className="text-xs font-semibold tracking-wide text-stormGrey-400">
                                        {formValues.email || "–"}
                                    </Typography>
                                </div>
                            </div>
                            {hasChanges && (
                                <Button
                                    color="green"
                                    className="normal-case"
                                    onClick={handleSaveUser}
                                    disabled={maintenanceLocked || savingUser}
                                >
                                    {savingUser ? "Speichert ..." : "Änderungen speichern"}
                                </Button>
                            )}
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
                        {saveError && !loading && (
                            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {saveError}
                            </div>
                        )}
                        <div className="grid-cols-1 mb-12 grid gap-12 px-4 lg:grid-cols-2 xl:grid-cols-3">
                            <div>
                                <Typography variant="h6" color="blue-gray" className="mb-4">
                                    Allgemeine Einstellungen
                                </Typography>
                                {(isSuperuserUser) && (
                                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        Systemgruppe – Name und Beschreibung sind geschützt.
                                        {superuserFieldsLocked && (
                                            <span className="mt-1 block text-xs text-amber-600">
                                                Nur der Superuser selbst kann Benutzername, E-Mail-Adresse und Passwort ändern.
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        Benutzername
                                    </Typography>
                                    <Input
                                        value={formValues.username}
                                        onChange={handleUsernameChange}
                                        placeholder="Benutzername"
                                        disabled={inputDisabled || superuserFieldsLocked}
                                        className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                                        labelProps={{
                                            className: "before:content-none after:content-none"
                                        }}
                                    />
                                </div>
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        E-Mail-Adresse
                                    </Typography>
                                    <Input
                                        type="email"
                                        value={formValues.email}
                                        onChange={handleEmailChange}
                                        placeholder="benutzer@example.com"
                                        disabled={inputDisabled || superuserFieldsLocked}
                                        className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                                        labelProps={{
                                            className: "before:content-none after:content-none"
                                        }}
                                    />
                                </div>
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        Neues Passwort
                                    </Typography>
                                    <Input
                                        type="password"
                                        value={formValues.password}
                                        onChange={handlePasswordChange}
                                        placeholder="Passwort setzen"
                                        disabled={inputDisabled || superuserFieldsLocked}
                                        className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                                        labelProps={{
                                            className: "before:content-none after:content-none"
                                        }}
                                    />
                                    <Typography className="mt-1 text-xs text-blue-gray-400">
                                        Das Passwort wird nur geändert, wenn ein neuer Wert eingetragen wird.
                                    </Typography>
                                </div>
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        Globale Rolle
                                    </Typography>
                                    {isSuperuserUser ? (
                                        <Typography className="block text-xs font-semibold uppercase text-blue-gray-500">
                                            Die Rolle für den Superuser kann nicht geändert werden.
                                        </Typography>
                                    ) : groupsLoading && availableGroups.length === 0 ? (
                                        <div className="flex items-center gap-3 rounded-lg border border-blue-gray-50 bg-blue-gray-50/50 px-4 py-3 text-sm text-blue-gray-500">
                                            <Spinner className="h-4 w-4" />
                                            <span>Benutzergruppen werden geladen ...</span>
                                        </div>
                                    ) : filteredGroups.length === 0 ? (
                                        <Typography className="block text-xs font-semibold uppercase text-blue-gray-500">
                                            Es sind keine weiteren Benutzergruppen vorhanden. Bitte lege zunächst eine neue Gruppe an.
                                        </Typography>
                                    ) : (
                                        <Select
                                            label="Benutzergruppe wählen"
                                            value={groupSelectValue}
                                            onChange={handleGroupChange}
                                            disabled={selectDisabled}
                                            variant="outlined"
                                        >
                                            {filteredGroups.map((group) => (
                                                <Option key={group.id} value={String(group.id)}>
                                                    {group.name}
                                                </Option>
                                            ))}
                                        </Select>
                                    )}
                                </div>
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        Avatar-Farbe
                                    </Typography>
                                    <Select
                                        label="Avatar-Farbe auswählen"
                                        variant="outlined"
                                        value={formValues.avatarColor}
                                        onChange={handleAvatarColorChange}
                                        disabled={avatarSelectDisabled}
                                        selected={renderSelectedAvatarLabel}
                                    >
                                        <Option value="">
                                            <span className="flex items-center gap-2">
                                                <span className="h-4 w-4 rounded border border-blue-gray-100" />
                                                <span className="text-xs">Keine</span>
                                            </span>
                                        </Option>
                                        {AVATAR_COLORS.map((color) => (
                                            <Option key={color} value={color}>
                                                <span className="flex items-center gap-2">
                                                    <span className={`h-4 w-4 rounded border border-blue-gray-100 ${color}`} />
                                                    <span className="text-xs">{color}</span>
                                                </span>
                                            </Option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Typography variant="h6" color="blue-gray" className="mb-3">
                                    Server-Zuordnungen
                                </Typography>
                                {isSuperuserUser ? (
                                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        Für den Superuser gelten immer alle Rechte und es können keine server-spezifischen Zuordnungen gesetzt werden.
                                    </div>
                                ) : (
                                    <>
                                        <Typography className="mb-4 text-sm text-blue-gray-500">
                                            Ohne Zuordnungen hat der Benutzer Zugriff auf alle Server mit seinen globalen Rechten.
                                            Lege hier Server-spezifische Gruppen fest oder markiere den Server explizit zur Nutzung der globalen Gruppe.
                                        </Typography>
                                        {assignmentsError && (
                                            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                                {assignmentsError}
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-4">
                                            {serverAssignments.length === 0 ? (
                                                <div className="rounded-lg border border-blue-gray-100 bg-blue-gray-50/60 px-4 py-3 text-sm text-blue-gray-600">
                                                    Keine Server zugeordnet. Die globalen Gruppen gelten für alle Server.
                                                </div>
                                            ) : (
                                                serverAssignments.map((assignment, index) => {
                                                    const serverOptions = getServerOptionsForRow(assignment.serverId);
                                                    const groupSelectValue =
                                                        assignment.useGlobalGroup || !assignment.groupId
                                                            ? ""
                                                            : String(assignment.groupId);
                                                    return (
                                                        <div
                                                            key={`assignment-${assignment.serverId ?? index}-${index}`}
                                                            className="rounded-lg border border-blue-gray-100 bg-white px-4 py-3 shadow-sm"
                                                        >
                                                            <div className="grid gap-4 md:grid-cols-2">
                                                                <div>
                                                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                                                        Server
                                                                    </Typography>
                                                                    <Select
                                                                        label="Server auswählen"
                                                                        value={
                                                                            assignment.serverId
                                                                                ? String(assignment.serverId)
                                                                                : ""
                                                                        }
                                                                        onChange={(value) =>
                                                                            handleAssignmentServerChange(index, value)
                                                                        }
                                                                        disabled={
                                                                            maintenanceLocked ||
                                                                            savingAssignments ||
                                                                            !canEditUsers
                                                                        }
                                                                        variant="outlined"
                                                                    >
                                                                        {serverOptions.map((server) => (
                                                                            <Option key={server.id} value={String(server.id)}>
                                                                                {server.name}
                                                                            </Option>
                                                                        ))}
                                                                    </Select>
                                                                </div>
                                                                <div>
                                                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                                                        Rechtegruppe
                                                                    </Typography>
                                                                    <div className="flex flex-col gap-2">
                                                                        <Switch
                                                                            id={`assignment-global-${index}`}
                                                                            label="Globale Gruppe verwenden"
                                                                            checked={assignment.useGlobalGroup}
                                                                            onChange={({ target }) =>
                                                                                handleAssignmentUseGlobalToggle(
                                                                                    index,
                                                                                    target?.checked
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                maintenanceLocked ||
                                                                                savingAssignments ||
                                                                                !canEditUsers
                                                                            }
                                                                            labelProps={{
                                                                                className: "text-sm font-normal text-blue-gray-600"
                                                                            }}
                                                                        />
                                                                        <Select
                                                                            label="Server-Gruppe wählen"
                                                                            value={groupSelectValue}
                                                                            onChange={(value) =>
                                                                                handleAssignmentGroupChange(index, value)
                                                                            }
                                                                            disabled={
                                                                                maintenanceLocked ||
                                                                                savingAssignments ||
                                                                                !canEditUsers ||
                                                                                assignment.useGlobalGroup
                                                                            }
                                                                            variant="outlined"
                                                                            className="max-w-xl"
                                                                        >
                                                                            <Option value="">Globale Gruppe</Option>
                                                                            {availableGroups.map((group) => (
                                                                                <Option key={group.id} value={String(group.id)}>
                                                                                    {group.name}
                                                                                </Option>
                                                                            ))}
                                                                        </Select>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 flex justify-end">
                                                                <Button
                                                                    variant="text"
                                                                    color="red"
                                                                    className="normal-case"
                                                                    onClick={() => handleRemoveAssignment(index)}
                                                                    disabled={
                                                                        maintenanceLocked ||
                                                                        savingAssignments ||
                                                                        !canEditUsers
                                                                    }
                                                                >
                                                                    Entfernen
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <Button
                                                variant="outlined"
                                                color="blue"
                                                className="normal-case"
                                                onClick={handleAddAssignment}
                                                disabled={
                                                    maintenanceLocked ||
                                                    savingAssignments ||
                                                    !canEditUsers ||
                                                    availableServers.length === 0 ||
                                                    usedServerIds.size >= availableServers.length
                                                }
                                            >
                                                Server hinzufügen
                                            </Button>
                                            <Button
                                                color="green"
                                                className="normal-case"
                                                onClick={handleSaveAssignments}
                                                disabled={
                                                    maintenanceLocked ||
                                                    savingAssignments ||
                                                    !canEditUsers ||
                                                    !assignmentsChanged
                                                }
                                            >
                                                {savingAssignments ? "Speichert ..." : "Zuordnungen speichern"}
                                            </Button>
                                            {savingAssignments && <Spinner className="h-4 w-4" />}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {canManageSecurityPhrase && (
                            <div className="mt-10 border-t border-blue-gray-50 pt-8">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                                    <div>
                                        <Typography variant="h6" color="blue-gray">
                                            Sicherheitsschlüssel
                                        </Typography>
                                        <Typography className={`text-sm ${securityPhraseStatus.tone}`}>
                                            {securityPhraseStatus.text}
                                        </Typography>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button
                                            variant="outlined"
                                            color="blue"
                                            className="normal-case"
                                            onClick={handleReloadSecurityPhrase}
                                            disabled={
                                                !canRenewSecurityPhrase ||
                                                maintenanceLocked ||
                                                securityPhraseLoading ||
                                                renewingSecurityPhrase
                                            }
                                        >
                                            Aktualisieren
                                        </Button>
                                        <Button
                                            color="red"
                                            className="normal-case"
                                            onClick={handleRenewSecurityPhrase}
                                            disabled={
                                                !canRenewSecurityPhrase ||
                                                maintenanceLocked ||
                                                securityPhraseLoading ||
                                                renewingSecurityPhrase
                                            }
                                        >
                                            {renewingSecurityPhrase ? "Erneuert ..." : "Schlüssel erneuern"}
                                        </Button>
                                    </div>
                                </div>
                                {securityPhraseLoading ? (
                                    <div className="flex items-center gap-3 rounded-lg border border-blue-gray-50 bg-blue-gray-50/50 px-4 py-3 text-sm text-blue-gray-500">
                                        <Spinner className="h-4 w-4" />
                                        <span>Sicherheitsschlüssel wird geladen ...</span>
                                    </div>
                                ) : securityPhraseError ? (
                                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <span>{securityPhraseError}</span>
                                        <Button
                                            variant="text"
                                            size="sm"
                                            color="red"
                                            className="normal-case"
                                            onClick={handleReloadSecurityPhrase}
                                            disabled={
                                                !canRenewSecurityPhrase ||
                                                maintenanceLocked ||
                                                securityPhraseLoading ||
                                                renewingSecurityPhrase
                                            }
                                        >
                                            Erneut laden
                                        </Button>
                                    </div>
                                ) : securityPhraseRows.length > 0 ? (
                                    <div className="rounded-lg border border-blue-gray-100 bg-blue-gray-50/60 p-4">
                                        <div className="space-y-2 text-center font-mono text-base tracking-wide text-blue-gray-900 md:text-lg">
                                            {securityPhraseRows.map((row, rowIndex) => (
                                                <div
                                                    key={`security-phrase-row-${rowIndex}`}
                                                    className="flex flex-wrap items-center justify-center gap-4"
                                                >
                                                    {row.map((word, wordIndex) => (
                                                        <span
                                                            key={`security-phrase-${rowIndex}-${wordIndex}`}
                                                            className="uppercase"
                                                        >
                                                            {word}
                                                        </span>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <Typography className="text-sm text-blue-gray-500">
                                        Kein Sicherheitsschlüssel verfügbar.
                                    </Typography>
                                )}
                                <Typography className="mt-3 text-sm text-blue-gray-500">
                                    Nach dem Erneuern muss der Benutzer den neuen Sicherheitsschlüssel erneut herunterladen.
                                </Typography>
                            </div>
                        )}

                    </CardBody>
                </Card></div>
        </>
    );
}

export default UserDetails;
