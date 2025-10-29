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
import { platformSettingsData } from "@/data";
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
    const { maintenance } = useMaintenance();

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

    const maintenanceActive = Boolean(maintenance?.active);
    const isSuperuserUser = useMemo(() => {
        if (!Array.isArray(user?.groups)) {
            return false;
        }
        return user.groups.some((group) => (group?.name || "").toLowerCase() === "superuser");
    }, [user]);

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
            setUser(item);
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
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            username: value
        }));
    }, []);

    const handleEmailChange = useCallback((event) => {
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            email: value
        }));
    }, []);

    const handlePasswordChange = useCallback((event) => {
        const { value } = event.target;
        setFormValues((prev) => ({
            ...prev,
            password: value
        }));
    }, []);

    const handleGroupChange = useCallback((value) => {
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
    }, []);

    const handleAvatarColorChange = useCallback((value) => {
        setFormValues((prev) => ({
            ...prev,
            avatarColor: value || ""
        }));
    }, []);

    const handleSaveUser = useCallback(async () => {
        if (!user || !hasChanges) {
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
    }, [user, hasChanges, formValues, showToast, isSuperuserUser]);

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

    const selectDisabled = maintenanceActive || savingUser || !user || groupsLoading;
    const avatarSelectDisabled = maintenanceActive || savingUser || !user;
    const inputDisabled = maintenanceActive || savingUser || !user;
    const groupSelectValue = formValues.groupId ? String(formValues.groupId) : "";

    return (
        <>
            <div className="mt-12 flex flex-col gap-12">
                {maintenanceActive && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Wartungsmodus aktiv – Änderungen sind deaktiviert.
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
                                    disabled={maintenanceActive || savingUser}
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
                                <div className="mb-6">
                                    <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                                        Benutzername
                                    </Typography>
                                    <Input
                                        value={formValues.username}
                                        onChange={handleUsernameChange}
                                        placeholder="Benutzername"
                                        disabled={inputDisabled}
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
                                        disabled={inputDisabled}
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
                                        disabled={inputDisabled}
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
                                    {groupsError && !isSuperuserUser && (
                                        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                            {groupsError}
                                        </div>
                                    )}
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
                        </div>

                    </CardBody>
                </Card></div>
        </>
    );
}

export default UserDetails;
