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
  Chip,
  Radio,
  List,
  ListItem,
  ListItemPrefix
} from "@material-tailwind/react";

import { useToast } from "@/components/ToastProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { useAuth } from "@/components/AuthProvider.jsx";
import { AVATAR_COLORS } from "@/data/avatarColors.js";

const _ = AVATAR_COLORS.join(" ");

const UPDATE_STAGE_LABELS = {
  initializing: "Vorbereitung",
  "activating-maintenance": "Wartungsmodus aktivieren",
  "executing-script": "Skript wird ausgeführt",
  waiting: "Warte auf Portainer",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen"
};

const mapGroup = (item) => ({
  id: item?.id ?? null,
  name: item?.name || "",
  description: item?.description || "",
  avatarColor: item?.avatarColor || null,
  createdAt: item?.createdAt || null,
  updatedAt: item?.updatedAt || null,
  memberCount: Number.isFinite(Number(item?.memberCount)) ? Number(item.memberCount) : 0,
  members: Array.isArray(item?.members)
    ? item.members
      .map((member) => ({
        id: member?.id ?? null,
        username: member?.username || ""
      }))
      .filter((member) => member.username)
    : []
});

const buildInitialFormValues = (group) => {
  if (!group) {
    return {
      name: "",
      description: "",
      avatarColor: ""
    };
  }

  return {
    name: group.name || "",
    description: group.description || "",
    avatarColor: group.avatarColor || ""
  };
};

const LEVEL_OPTIONS = [
  { value: "full", label: "Vollzugriff" },
  { value: "read", label: "Nur lesen" },
  { value: "none", label: "Kein Zugriff" }
];
const LEVEL_PRIORITY = {
  none: 0,
  read: 1,
  full: 2
};

const isDependencySatisfied = (value, requirement) => {
  const req = requirement || "!=none";
  if (req === "!=none") return value !== "none";
  if (req.startsWith("!=")) return value !== req.substring(2);
  if (req.startsWith("=")) return value === req.substring(1);
  if (!req) return true;
  return value === req;
};

export function UserGroupDetail() {
  const { groupId } = useParams();
  const { showToast } = useToast();
  const { maintenance: maintenanceMeta, update: updateState } = useMaintenance();
  const { hasPermission, user: authUser } = useAuth();

  const [group, setGroup] = useState(null);
  const [formValues, setFormValues] = useState(buildInitialFormValues(null));
  const initialFormValuesRef = useRef(buildInitialFormValues(null));
  const [initialPermissionSelection, setInitialPermissionSelection] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [permissionSections, setPermissionSections] = useState([]);
  const [permissionSelection, setPermissionSelection] = useState({});
  const [permissionDefaults, setPermissionDefaults] = useState({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState("");

  const maintenanceActive = Boolean(maintenanceMeta?.active);
  const maintenanceMessage = maintenanceMeta?.message;
  const updateRunning = Boolean(updateState?.running);
  const updateStageLabel = updateState?.stage ? (UPDATE_STAGE_LABELS[updateState.stage] ?? updateState.stage) : "–";
  const maintenanceLocked = maintenanceActive || updateRunning;
  const isSuperuserGroup = useMemo(() => (group?.name || "").toLowerCase() === "superuser", [group]);
  const isSuperuserAccount = Boolean(authUser?.isSuperuser);
  const canEditGroupDetails = Boolean(isSuperuserAccount || hasPermission("user-groups-edit", "full"));
  const canViewPermissionSettings = Boolean(isSuperuserAccount || hasPermission("user-groups-edit", "read"));
  const canAdjustPermissions = Boolean(isSuperuserAccount || hasPermission("user-groups-edit", "full"));
  const superuserGroupLocked = isSuperuserGroup && !isSuperuserAccount;

  const numericGroupId = useMemo(() => {
    const candidate = Number(groupId);
    return Number.isFinite(candidate) ? candidate : null;
  }, [groupId]);

  const fetchGroupPermissions = useCallback(
    async (targetGroupId) => {
      const numericTargetId = Number(targetGroupId);
      if (!Number.isFinite(numericTargetId) || numericTargetId <= 0) {
        setPermissionSections([]);
        setPermissionSelection({});
        setPermissionDefaults({});
        setPermissionsError("");
        setInitialPermissionSelection({});
        setPermissionsLoading(false);
        return;
      }

      setPermissionsLoading(true);
      setPermissionsError("");

      try {
        const response = await axios.get(`/api/groups/${numericTargetId}/permissions`);
        const rawSections = Array.isArray(response.data?.sections) ? response.data.sections : [];
        const rawValues =
          response.data?.values && typeof response.data.values === "object" ? response.data.values : {};

        const defaults = {};
        const initialSelection = {};

        const normalizeItem = (item, index) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const key = item.key || "";
          const defaultLevel =
            typeof item.defaultLevel === "string" && item.defaultLevel ? item.defaultLevel : "none";
          defaults[key] = defaultLevel;

          const assigned = rawValues[key];
          let normalizedAssigned =
            typeof assigned === "string" && assigned ? assigned : defaultLevel;

          const availableLevels =
            Array.isArray(item.availableLevels) && item.availableLevels.length
              ? item.availableLevels
              : LEVEL_OPTIONS.map((option) => option.value);
          if (!availableLevels.includes(normalizedAssigned)) {
            normalizedAssigned = defaultLevel;
          }
          initialSelection[key] = normalizedAssigned;

          const dependencies = Array.isArray(item.dependencies) ? item.dependencies : [];

          return {
            ...item,
            availableLevels,
            dependencies,
            sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index
          };
        };

        const normalizeGroup = (group, groupIdx = 0) => {
          const groupItems = Array.isArray(group.items)
            ? group.items.map((item, itemIdx) => normalizeItem(item, itemIdx)).filter(Boolean)
            : [];
          const childGroups = Array.isArray(group.groups)
            ? group.groups.map((child, childIdx) => normalizeGroup(child, childIdx))
            : [];
          return {
            ...group,
            sortOrder: typeof group.sortOrder === "number" ? group.sortOrder : groupIdx,
            items: groupItems,
            groups: childGroups
          };
        };

        const normalizedSections = rawSections.map((section, sectionIndex) => {
          const sectionItems = Array.isArray(section.items)
            ? section.items.map((item, itemIdx) => normalizeItem(item, itemIdx)).filter(Boolean)
            : [];

          const sectionGroups = Array.isArray(section.groups)
            ? section.groups.map((group, groupIdx) => normalizeGroup(group, groupIdx))
            : [];

          return {
            ...section,
            sortOrder: typeof section.sortOrder === "number" ? section.sortOrder : sectionIndex,
            hasNavigation: Boolean(section.hasNavigation),
            items: sectionItems,
            groups: sectionGroups
          };
        });

        setPermissionSections(normalizedSections);
        setPermissionDefaults(defaults);
        setPermissionSelection({ ...initialSelection });
        setInitialPermissionSelection({ ...initialSelection });
      } catch (err) {
        let message = "Die Berechtigungen konnten nicht geladen werden.";
        if (err.response?.data?.error === "GROUP_NOT_FOUND") {
          message = "Die angeforderte Benutzergruppe wurde nicht gefunden.";
        }
        setPermissionsError(message);
        setPermissionSections([]);
        setPermissionSelection({});
        setPermissionDefaults({});
        setInitialPermissionSelection({});
        showToast({
          variant: "error",
          title: "Fehler beim Laden",
          description: message
        });
      } finally {
        setPermissionsLoading(false);
      }
    },
    [showToast]
  );

  const fetchGroupDetails = useCallback(async () => {
    if (!numericGroupId) {
      setError("Ungültige Gruppen-ID.");
      setGroup(null);
      setFormValues(buildInitialFormValues(null));
      initialFormValuesRef.current = buildInitialFormValues(null);
      setPermissionSections([]);
      setPermissionSelection({});
      setPermissionDefaults({});
      setPermissionsError("");
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.get(`/api/groups/${numericGroupId}`);
      const item = mapGroup(response.data?.item);
      if (!item.id) {
        throw new Error("GROUP_NOT_FOUND");
      }
      setGroup(item);
      const initialValues = buildInitialFormValues(item);
      initialFormValuesRef.current = { ...initialValues };
      setFormValues(initialValues);
      setSaveError("");

      const superuserDetected = (item.name || "").toLowerCase() === "superuser";
      if (superuserDetected) {
        setPermissionSections([]);
        setPermissionSelection({});
        setPermissionDefaults({});
        setPermissionsError("");
        setInitialPermissionSelection({});
        setPermissionsLoading(false);
      } else if (canViewPermissionSettings) {
        fetchGroupPermissions(item.id);
      } else {
        setPermissionSections([]);
        setPermissionSelection({});
        setPermissionDefaults({});
        setPermissionsError("");
        setInitialPermissionSelection({});
        setPermissionsLoading(false);
      }
    } catch (err) {
      const serverError = err.response?.data?.error;
      let message = "Gruppendetails konnten nicht geladen werden.";

      if (serverError === "GROUP_NOT_FOUND") {
        message = "Die angeforderte Benutzergruppe wurde nicht gefunden.";
      } else if (serverError === "INVALID_GROUP_ID") {
        message = "Die angegebene Gruppen-ID ist ungültig.";
      } else if (err.response?.status === 404) {
        message = "Die angeforderte Benutzergruppe existiert nicht.";
      }

      setGroup(null);
      initialFormValuesRef.current = buildInitialFormValues(null);
      setFormValues(buildInitialFormValues(null));
      setPermissionSections([]);
      setPermissionSelection({});
      setPermissionDefaults({});
      setPermissionsError("");
      setPermissionsLoading(false);
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
  }, [numericGroupId, showToast, fetchGroupPermissions, canViewPermissionSettings]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  const detailsChanged = useMemo(() => {
    if (!hasLoaded || !group) {
      return false;
    }

    const initial = initialFormValuesRef.current;
    if (!initial) {
      return false;
    }

    const initialName = initial.name || "";
    const currentName = formValues.name || "";

    const initialDescription = initial.description || "";
    const currentDescription = formValues.description || "";

    const initialAvatar = initial.avatarColor || "";
    const currentAvatar = formValues.avatarColor || "";

    return (
      initialName !== currentName ||
      initialDescription !== currentDescription ||
      initialAvatar !== currentAvatar
    );
  }, [formValues, hasLoaded, group]);

  const permissionsChanged = useMemo(() => {
    if (isSuperuserGroup) {
      return false;
    }
    const initial = initialPermissionSelection || {};
    const current = permissionSelection || {};
    const allKeys = new Set([...Object.keys(initial), ...Object.keys(current)]);
    for (const key of allKeys) {
      const initialValue = initial[key] ?? null;
      const currentValue = current[key] ?? null;
      if (initialValue !== currentValue) {
        return true;
      }
    }
    return false;
  }, [permissionSelection, initialPermissionSelection, isSuperuserGroup]);

  const hasChanges = useMemo(
    () => detailsChanged || permissionsChanged,
    [detailsChanged, permissionsChanged]
  );

  const handleNameChange = useCallback((event) => {
    const { value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      name: value
    }));
  }, []);

  const handleDescriptionChange = useCallback((event) => {
    const { value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      description: value
    }));
  }, []);

  const handleAvatarColorChange = useCallback((value) => {
    setFormValues((prev) => ({
      ...prev,
      avatarColor: value || ""
    }));
  }, []);

  const handleSaveGroup = useCallback(async () => {
    if (!group || (!detailsChanged && !permissionsChanged)) {
      return;
    }

    if (detailsChanged && !canEditGroupDetails) {
      setSaveError("Dir fehlt die Berechtigung, diese Gruppe zu bearbeiten.");
      return;
    }

    if (permissionsChanged && !canAdjustPermissions) {
      setSaveError("Dir fehlt die Berechtigung, die Gruppenrechte anzupassen.");
      return;
    }

    setSavingGroup(true);
    setSaveError("");

    try {
      if (detailsChanged) {
        const payload = {
          avatarColor: formValues.avatarColor
        };

        if (!isSuperuserGroup) {
          payload.name = formValues.name;
          payload.description = formValues.description;
        }

        const response = await axios.put(`/api/groups/${group.id}`, payload);
        const updated = mapGroup(response.data?.item || response.data?.group);
        if (updated?.id) {
          setGroup(updated);
          const nextInitial = buildInitialFormValues(updated);
          initialFormValuesRef.current = { ...nextInitial };
          setFormValues(nextInitial);
        }
      }

      if (permissionsChanged) {
        await axios.put(`/api/groups/${group.id}/permissions`, {
          values: permissionSelection
        });
        setPermissionSelection((prev) => ({
          ...prev,
          ...permissionSelection
        }));
        setInitialPermissionSelection({ ...permissionSelection });
      }

      if (detailsChanged) {
        showToast({
          variant: "success",
          title: "Gruppe gespeichert",
          description: "Die Änderungen wurden erfolgreich gespeichert."
        });
      } else if (permissionsChanged) {
        showToast({
          variant: "success",
          title: "Berechtigungen gespeichert",
          description: "Die Berechtigungen wurden erfolgreich gespeichert."
        });
      }

      setSaveError("");
    } catch (err) {
      const serverError = err.response?.data?.error;
      let message = "Die Änderungen konnten nicht gespeichert werden.";

      if (serverError === "GROUP_NAME_REQUIRED") {
        message = "Bitte einen Gruppennamen angeben.";
      } else if (serverError === "GROUP_NAME_TAKEN") {
        message = "Der Gruppenname wird bereits verwendet.";
      } else if (serverError === "INVALID_AVATAR_COLOR") {
        message = "Bitte eine gültige Avatar-Farbe auswählen.";
      } else if (serverError === "GROUP_NOT_FOUND") {
        message = "Die Benutzergruppe wurde nicht gefunden.";
      } else if (serverError === "GROUP_SUPERUSER_PROTECTED") {
        message = "Für die Superuser-Gruppe können Berechtigungen nicht angepasst werden.";
      } else if (serverError === "PERMISSION_INVALID_PAYLOAD") {
        message = "Ungültige Berechtigungsdaten übermittelt.";
      } else if (serverError === "PERMISSION_INVALID_LEVEL") {
        message = "Für mindestens eine Berechtigung wurde ein nicht erlaubter Wert übermittelt.";
      } else if (serverError === "PERMISSION_UNKNOWN_KEY") {
        message = "Es wurde eine unbekannte Berechtigung übermittelt.";
      }

      setSaveError(message);
      showToast({
        variant: "error",
        title: "Speichern fehlgeschlagen",
        description: message
      });
    } finally {
      setSavingGroup(false);
    }
  }, [
    group,
    detailsChanged,
    permissionsChanged,
    formValues,
    showToast,
    isSuperuserGroup,
    permissionSelection,
    canEditGroupDetails,
    canAdjustPermissions
  ]);

  const avatarLabel = useMemo(() => {
    const source = (formValues.name || formValues.description || "").trim();
    if (!source) {
      return "?";
    }
    return source.charAt(0).toUpperCase();
  }, [formValues.name, formValues.description]);

  const avatarColorClass = useMemo(() => {
    if (formValues.avatarColor) {
      return formValues.avatarColor;
    }
    return group?.avatarColor || "";
  }, [formValues.avatarColor, group]);

  const inputDisabled = maintenanceLocked || savingGroup || !group || superuserGroupLocked || !canEditGroupDetails;
  const selectDisabled = maintenanceLocked || savingGroup || !group || superuserGroupLocked || !canEditGroupDetails;
  const selectValue = formValues.avatarColor || "";

  const handlePermissionChange = useCallback((permissionKey, value) => {
    if (!permissionKey || !canAdjustPermissions || isSuperuserGroup) {
      return;
    }
    const getValueWithDefaults = (key, selectionMap) =>
      selectionMap[key] ?? permissionDefaults[key] ?? "none";

    const collectAllItems = () => {
      const items = [];
      const walkGroups = (groups) => {
        (groups || []).forEach((group) => {
          (group.items || []).forEach((item) => items.push(item));
          if (group.groups) {
            walkGroups(group.groups);
          }
        });
      };
      permissionSections.forEach((section) => {
        (section.items || []).forEach((item) => items.push(item));
        walkGroups(section.groups);
      });
      return items;
    };

    const allItems = collectAllItems();
    const itemMap = new Map(allItems.map((item) => [item.key, item]));

    const clampToAllowed = (itemKey, desiredLevel) => {
      const item = itemMap.get(itemKey);
      if (!item) return desiredLevel;
      const allowed = Array.isArray(item.availableLevels) && item.availableLevels.length
        ? item.availableLevels
        : LEVEL_OPTIONS.map((opt) => opt.value);
      if (allowed.includes(desiredLevel)) {
        return desiredLevel;
      }
      // Fallback: wähle niedrigstes erlaubtes Level
      return allowed.reduce((lowest, candidate) => {
        return LEVEL_PRIORITY[candidate] < LEVEL_PRIORITY[lowest] ? candidate : lowest;
      }, allowed[0] || "none");
    };

    const nextValue = clampToAllowed(permissionKey, value);


    setPermissionSelection((prev) => {
      const currentValue = getValueWithDefaults(permissionKey, prev);
      const isDowngrade = LEVEL_PRIORITY[nextValue] < LEVEL_PRIORITY[currentValue];

      if (prev[permissionKey] === nextValue) {
        return prev;
      }

      const nextState = {
        ...prev,
        [permissionKey]: nextValue
      };

      // Kaskade: Nur bei Downgrade des auslösenden Rechts abhängige Rechte herabstufen.
      if (isDowngrade) {
        let changed = true;
        while (changed) {
          changed = false;
          allItems.forEach((item) => {
            const dependencies = Array.isArray(item.dependencies) ? item.dependencies : [];
            if (!dependencies.length) return;
            const satisfied = dependencies.every((dep) =>
              isDependencySatisfied(getValueWithDefaults(dep.key, nextState), dep.requiredLevel)
            );
            if (!satisfied) {
              const cascadedValue = clampToAllowed(item.key, nextValue);
              if (getValueWithDefaults(item.key, nextState) !== cascadedValue) {
                nextState[item.key] = cascadedValue;
                changed = true;
              }
            }
          });
        }
      }

      return nextState;
    });
  }, [canAdjustPermissions, isSuperuserGroup, permissionDefaults, permissionSections]);

  const getPermissionValue = useCallback(
    (permissionKey) => {
      if (!permissionKey) {
        return null;
      }
      let value = null;
      if (Object.prototype.hasOwnProperty.call(permissionSelection, permissionKey)) {
        value = permissionSelection[permissionKey];
      } else if (Object.prototype.hasOwnProperty.call(permissionDefaults, permissionKey)) {
        value = permissionDefaults[permissionKey];
      }
      if (typeof value === "string") {
        return value;
      }
      return value;
    },
    [permissionSelection, permissionDefaults]
  );

  const radioIcon = useMemo(
    () => (
      <span className="mx-auto block h-2.5 w-2.5 rounded-full border border-blue-gray-400 bg-black" />
    ),
    []
  );

  const isPermissionRowVisible = useCallback(
    (row) => {
      if (!row || !row.key) {
        return false;
      }
      const dependencies = Array.isArray(row.dependencies) ? row.dependencies : [];
      return dependencies.every((dependency) => {
        if (!dependency || !dependency.key) {
          return true;
        }
        const value = getPermissionValue(dependency.key) ?? "none";
        const requirement = dependency.requiredLevel || "!=none";

        if (requirement === "!=none") {
          return value !== "none";
        }
        if (requirement.startsWith("!=")) {
          return value !== requirement.substring(2);
        }
        if (requirement.startsWith("=")) {
          return value === requirement.substring(1);
        }
        if (!requirement) {
          return true;
        }
        return value === requirement;
      });
    },
    [getPermissionValue]
  );

  const renderPermissionRow = (row, ownerKey, options = {}) => {
    if (!isPermissionRowVisible(row)) {
      return null;
    }

    const rowName = `permission-${ownerKey}-${row.key}`;
    const currentValue = getPermissionValue(row.key) ?? "none";
    const displayValue = currentValue;
    const { addTopBorder = true } = options;

    const rowClasses = [
      "flex flex-col gap-2.5 px-4 py-4 md:flex-row md:items-center md:gap-6",
      addTopBorder ? "border-t border-blue-gray-100" : ""
    ]
      .filter(Boolean)
      .join(" ");

    const baseLevels = Array.isArray(row.availableLevels) && row.availableLevels.length
      ? row.availableLevels
      : LEVEL_OPTIONS.map((option) => option.value);
    const availableLevels = new Set(baseLevels);
    const levelOptions = LEVEL_OPTIONS;

    return (
      <div key={`${ownerKey}-${row.key}`} className={rowClasses}>
        <div className="text-sm font-medium leading-5 text-blue-gray-600 md:w-1/2">
          {row.label}
        </div>
        <List className="flex-col gap-1.5 md:ml-auto md:flex-row md:flex-nowrap md:w-1/2 md:items-center md:justify-end md:gap-3">
          {levelOptions.map((option) => {
            const optionId = `${rowName}-${option.value}`;
            const checked = displayValue === option.value;
            const disabled =
              !availableLevels.has(option.value) ||
              permissionsLoading ||
              savingGroup ||
              !canAdjustPermissions ||
              isSuperuserGroup;

            return (
              <ListItem
                key={`${ownerKey}-${row.key}-${option.value}`}
                className="w-full min-w-[140px] p-0 md:w-auto md:flex-1"
              >
                <label
                  htmlFor={optionId}
                  className={`inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 min-h-[38px] ${disabled ? "cursor-not-allowed bg-blue-gray-50/40" : "cursor-pointer hover:bg-blue-gray-50/60"
                    }`}
                >
                  <ListItemPrefix className="flex-shrink-0">
                    <Radio
                      id={optionId}
                      name={rowName}
                      value={option.value}
                      checked={checked}
                      onChange={() => handlePermissionChange(row.key, option.value)}
                      disabled={disabled}
                      ripple={false}
                      className="h-4 w-4 hover:before:opacity-0"
                      containerProps={{
                        className: "p-0"
                      }}
                      icon={radioIcon}
                    />
                  </ListItemPrefix>
                  <Typography
                    color="blue-gray"
                    className={`text-sm font-medium leading-5 whitespace-nowrap ${disabled ? "text-blue-gray-300" : "text-blue-gray-600"
                      }`}
                  >
                    {option.label}
                  </Typography>
                </label>
              </ListItem>
            );
          })}
        </List>
      </div>
    );
  };

  const groupHasVisibleRows = (grp) => {
    if (!grp) {
      return false;
    }
    const groupItems = Array.isArray(grp.items) ? grp.items : [];
    const childGroups = Array.isArray(grp.groups) ? grp.groups : [];
    if (groupItems.some(isPermissionRowVisible)) {
      return true;
    }
    return childGroups.some(groupHasVisibleRows);
  };

  const sectionHasVisibleRows = (section) => {
    if (!section) {
      return false;
    }
    const sectionItems = Array.isArray(section.items) ? section.items : [];
    const sectionGroups = Array.isArray(section.groups) ? section.groups : [];
    if (sectionItems.some(isPermissionRowVisible)) {
      return true;
    }
    return sectionGroups.some(groupHasVisibleRows);
  };

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
        <Card className="mx-3 -mt-16 mb-6 lg:mx-4 border border-blue-gray-100">
          <CardBody className="p-4">
            <div className="mb-10 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div
                  className={`text-black flex h-[74px] w-[74px] items-center justify-center rounded-xl text-3xl font-semibold uppercase shadow-lg shadow-blue-gray-500/40 ${avatarColorClass}`}
                  aria-label={formValues.name || "Gruppenavatar"}
                >
                  {avatarLabel}
                </div>
                <div>
                  <Typography variant="h5" color="blue-gray">
                    {formValues.name || "–"}
                  </Typography>
                  <Typography className="text-xs font-semibold tracking-wide text-stormGrey-400">
                    Gruppen-ID: {group?.id ?? "–"}
                  </Typography>
                </div>
              </div>
              {hasChanges && (
                <Button
                  color="green"
                  className="normal-case"
                  onClick={handleSaveGroup}
                  disabled={maintenanceLocked || savingGroup}
                >
                  {savingGroup ? "Speichert ..." : "Änderungen speichern"}
                </Button>
              )}
            </div>
            {loading && !group && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-gray-50 bg-blue-gray-50/50 px-4 py-3 text-sm text-blue-gray-500">
                <Spinner className="h-4 w-4" />
                <span>Gruppendaten werden geladen ...</span>
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
                  Gruppendaten
                </Typography>
                {isSuperuserGroup && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Systemgruppe – Name und Beschreibung sind geschützt.
                    {superuserGroupLocked && (
                      <span className="mt-1 block text-xs text-amber-600">
                        Nur der Superuser darf die Superuser-Gruppe bearbeiten.
                      </span>
                    )}
                  </div>
                )}
                <div className="mb-6">
                  <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                    Gruppenname
                  </Typography>
                  <Input
                    value={formValues.name}
                    onChange={handleNameChange}
                    placeholder="Gruppenname"
                    disabled={inputDisabled}
                    className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                    labelProps={{
                      className: "before:content-none after:content-none"
                    }}
                  />
                </div>
                <div className="mb-6">
                  <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                    Beschreibung
                  </Typography>
                  <Input
                    value={formValues.description}
                    onChange={handleDescriptionChange}
                    placeholder="Beschreibung der Gruppe"
                    disabled={inputDisabled}
                    className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                    labelProps={{
                      className: "before:content-none after:content-none"
                    }}
                  />
                </div>
                <div className="mb-6">
                  <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                    Avatar-Farbe
                  </Typography>
                  <Select
                    label="Avatar-Farbe auswählen"
                    variant="outlined"
                    value={selectValue}
                    onChange={handleAvatarColorChange}
                    disabled={selectDisabled}
                    selected={(element) => {
                      if (element?.props?.children) {
                        return element.props.children;
                      }
                      if (!formValues.avatarColor) {
                        return "Standardfarbe";
                      }
                      return formValues.avatarColor;
                    }}
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
                <Typography variant="h6" color="blue-gray" className="mb-4">
                  Mitglieder
                </Typography>
                {!group || group.members.length === 0 ? (
                  <Typography className="text-sm text-stormGrey-500">
                    Aktuell sind keine Benutzer dieser Gruppe zugeordnet.
                  </Typography>
                ) : (
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
                )}
                <div className="mt-6 text-xs text-stormGrey-400">
                  <p>Mitglieder insgesamt: {group?.memberCount ?? 0}</p>
                </div>
              </div>
              <div className="lg:col-span-2 xl:col-span-3">
                {(!maintenanceActive && !updateRunning) && (
                  <>
                    <Typography variant="h6" color="blue-gray" className="mb-4">
                      Berechtigungen (Ansicht)
                    </Typography>

                    {isSuperuserGroup ? (
                      <div className="rounded-xl border border-blue-gray-100 bg-white px-4 py-4 text-sm text-blue-gray-600 shadow-sm">
                        Die Superuser-Gruppe besitzt automatisch Vollzugriff auf alle Bereiche. Berechtigungen können hier nicht angepasst werden.
                      </div>
                    ) : !canViewPermissionSettings ? null : (
                      <>
                        {permissionsLoading && (
                          <div className="border-b border-blue-gray-100 px-4 py-4">
                            <div className="flex items-center gap-3 text-sm text-blue-gray-500">
                              <Spinner className="h-4 w-4" />
                              <span>Berechtigungen werden geladen ...</span>
                            </div>
                          </div>
                        )}
                        {!permissionsLoading && permissionsError && (
                          <div className="border-b border-blue-gray-100 px-4 py-4 text-sm text-red-700">
                            {permissionsError}
                          </div>
                        )}
                        {!permissionsLoading && !permissionsError &&
                          (permissionSections.length === 0 ? (
                            <div className="border-b border-blue-gray-100 px-4 py-4 text-sm text-blue-gray-500">
                              Für diese Gruppe sind keine Berechtigungen definiert.
                            </div>
                          ) : (
                            (() => {
                              const renderedSections = permissionSections
                                .map((section, sectionIndex) => {
                                  const sectionItems = Array.isArray(section.items) ? section.items : [];
                                  const sectionGroups = Array.isArray(section.groups) ? section.groups : [];

                                  if (!sectionHasVisibleRows(section)) {
                                    return null;
                                  }

                                  const renderGroup = (currentGroup, path = `${section.key || sectionIndex}-group`, depth = 0) => {
                                    if (!groupHasVisibleRows(currentGroup)) {
                                      return null;
                                    }

                                    const groupItems = Array.isArray(currentGroup.items) ? currentGroup.items : [];
                                    const childGroups = Array.isArray(currentGroup.groups) ? currentGroup.groups : [];

                                    return (
                                      <div
                                        key={currentGroup.key || path}
                                        className=""
                                      >
                                        <div className="border-b border-blue-gray-100 bg-blue-gray-50/80 px-4 py-3">
                                          <Typography className={`${depth > 0 ? "ml-2" : ""} text-xs font-semibold uppercase tracking-wide text-blue-gray-600`}>
                                            {currentGroup.title}
                                          </Typography>
                                        </div>
                                        <div className="divide-y divide-blue-gray-100">
                                          {groupItems.map((row) =>
                                            renderPermissionRow(row, `${path}-${row.key}`, {
                                              addTopBorder: false
                                            })
                                          )}
                                          {childGroups.map((childGroup, childIdx) =>
                                            renderGroup(childGroup, `${path}-${childGroup.key || childIdx}`, depth + 1)
                                          )}
                                        </div>
                                      </div>
                                    );
                                  };

                                  return (
                                    <div
                                      key={section.key || sectionIndex}
                                      className="overflow-hidden rounded-xl border border-blue-gray-100 bg-white shadow-sm"
                                    >
                                      <div className="border-b border-blue-gray-100 bg-blue-gray-50/70 px-4 py-3">
                                        <Typography variant="h6" className="text-lg font-semibold text-blue-gray-700">
                                          {section.title}
                                        </Typography>
                                      </div>
                                      <div className="divide-y divide-blue-gray-100">
                                        {sectionItems.map((row) =>
                                          renderPermissionRow(row, section.key || sectionIndex, {
                                            addTopBorder: false
                                          })
                                        )}
                                        {sectionGroups.map((group, groupIdx) =>
                                          renderGroup(group, `${section.key || sectionIndex}-${groupIdx}`, 0)
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                                .filter(Boolean);

                              if (renderedSections.length === 0) {
                                return (
                                  <div className="border-b border-blue-gray-100 px-4 py-4 text-sm text-blue-gray-500">
                                    Für diese Gruppe sind keine Berechtigungen definiert.
                                  </div>
                                );
                              }

                              return <div className="flex flex-col gap-4">{renderedSections}</div>;
                            })()
                          ))}
                      </>
                    )}
                  </>

                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export default UserGroupDetail;
