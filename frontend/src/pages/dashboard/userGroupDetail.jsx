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
  Chip
} from "@material-tailwind/react";

import { useToast } from "@/components/ToastProvider.jsx";
import { useMaintenance } from "@/components/MaintenanceProvider.jsx";
import { AVATAR_COLORS } from "@/data/avatarColors.js";

const _ = AVATAR_COLORS.join(" ");

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

export function UserGroupDetail() {
  const { groupId } = useParams();
  const { showToast } = useToast();
  const { maintenance } = useMaintenance();

  const [group, setGroup] = useState(null);
  const [formValues, setFormValues] = useState(buildInitialFormValues(null));
  const initialFormValuesRef = useRef(buildInitialFormValues(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [saveError, setSaveError] = useState("");

  const maintenanceActive = Boolean(maintenance?.active);
  const isSuperuserGroup = useMemo(() => (group?.name || "").toLowerCase() === "superuser", [group]);

  const numericGroupId = useMemo(() => {
    const candidate = Number(groupId);
    return Number.isFinite(candidate) ? candidate : null;
  }, [groupId]);

  const fetchGroupDetails = useCallback(async () => {
    if (!numericGroupId) {
      setError("Ungültige Gruppen-ID.");
      setGroup(null);
      setFormValues(buildInitialFormValues(null));
      initialFormValuesRef.current = buildInitialFormValues(null);
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
  }, [numericGroupId, showToast]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  const hasChanges = useMemo(() => {
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
    if (!group || !hasChanges) {
      return;
    }

    setSavingGroup(true);
    setSaveError("");

    try {
      const payload = {
        avatarColor: formValues.avatarColor
      };

      if (!isSuperuserGroup) {
        payload.name = formValues.name;
        payload.description = formValues.description;
      }

      const response = await axios.put(`/api/groups/${group.id}`, payload);
      const updated = mapGroup(response.data?.item || response.data?.group);
      setGroup(updated);
      const nextInitial = buildInitialFormValues(updated);
      initialFormValuesRef.current = { ...nextInitial };
      setFormValues(nextInitial);
      showToast({
        variant: "success",
        title: "Gruppe gespeichert",
        description: "Die Änderungen wurden erfolgreich gespeichert."
      });
    } catch (err) {
      const serverError = err.response?.data?.error;
      let message = "Die Gruppe konnte nicht gespeichert werden.";

      if (serverError === "GROUP_NAME_REQUIRED") {
        message = "Bitte einen Gruppennamen angeben.";
      } else if (serverError === "GROUP_NAME_TAKEN") {
        message = "Der Gruppenname wird bereits verwendet.";
      } else if (serverError === "INVALID_AVATAR_COLOR") {
        message = "Bitte eine gültige Avatar-Farbe auswählen.";
      } else if (serverError === "GROUP_NOT_FOUND") {
        message = "Die Benutzergruppe wurde nicht gefunden.";
      } else if (serverError === "GROUP_SUPERUSER_PROTECTED") {
        message = "Für die Superuser-Gruppe kann nur die Avatar-Farbe angepasst werden.";
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
  }, [group, hasChanges, formValues, showToast, isSuperuserGroup]);

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

  const selectDisabled = maintenanceActive || savingGroup || !group;
  const inputDisabled = maintenanceActive || savingGroup || !group || isSuperuserGroup;
  const selectValue = formValues.avatarColor || "";

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
                  disabled={maintenanceActive || savingGroup}
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
                {(maintenanceActive || isSuperuserGroup) && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {maintenanceActive
                      ? "Wartungsmodus aktiv – Änderungen sind deaktiviert."
                      : "Systemgruppe – Name und Beschreibung sind geschützt."}
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
            </div>
          </CardBody>
        </Card></div>
      </>
      );
}

      export default UserGroupDetail;
