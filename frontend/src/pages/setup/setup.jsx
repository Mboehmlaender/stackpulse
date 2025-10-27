import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Input,
  Button,
  Alert,
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";

const initialFormState = {
  superuser: {
    username: "",
    email: "",
    password: "",
  },
  server: {
    name: "",
    url: "",
  },
  endpoint: {
    name: "",
    externalId: "",
    serverId: "",
  },
  apiKey: ""
};

export function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadStatus = async () => {
      setLoadingStatus(true);
      setFetchError(null);
      try {
        const response = await fetch("/api/setup/status", {
          signal: controller.signal,
          credentials: "include"
        });
        if (!response.ok) {
          throw new Error("STATUS_REQUEST_FAILED");
        }
        const data = await response.json();

        if (!isActive) return;

        setStatus(data);

        if (data.setupComplete) {
          navigate("/auth/sign-in", { replace: true });
          return;
        }

        setForm((prev) => ({
          superuser: {
            username: data.envDefaults?.superuserUsername?.length ? data.envDefaults.superuserUsername : prev.superuser.username,
            email: data.envDefaults?.superuserEmail?.length ? data.envDefaults.superuserEmail : prev.superuser.email,
            password: data.envDefaults?.superuserPassword?.length ? data.envDefaults.superuserPassword : prev.superuser.password,
          },
          server: {
            name: data.envDefaults?.serverName || prev.server.name,
            url: data.envDefaults?.serverUrl?.length ? data.envDefaults.serverUrl : prev.server.url,
          },
          endpoint: {
            name: data.envDefaults?.endpointName || prev.endpoint.name,
            externalId: data.envDefaults?.endpointExternalId?.length ? data.envDefaults.endpointExternalId : prev.endpoint.externalId,
            serverId: prev.endpoint.serverId || ""
          },
          apiKey: data.envDefaults?.apiKeyValue?.length ? data.envDefaults.apiKeyValue : prev.apiKey
        }));
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("⚠️ [Setup] Status konnte nicht geladen werden:", error);
        if (isActive) {
          setFetchError("Setup-Status konnte nicht geladen werden. Bitte Seite aktualisieren.");
        }
      } finally {
        if (isActive) {
          setLoadingStatus(false);
        }
      }
    };

    loadStatus();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [navigate]);

  const envDefaults = status?.envDefaults || {};
  const envSuperuserUsername = envDefaults.superuserUsername ?? "";
  const envSuperuserEmail = envDefaults.superuserEmail ?? "";
  const envSuperuserPassword = envDefaults.superuserPassword ?? "";
  const envServerUrl = envDefaults.serverUrl ?? "";
  const envEndpointExternalId = envDefaults.endpointExternalId ?? "";
  const envApiKeyValue = envDefaults.apiKeyValue ?? "";

  const requireSuperuser = Boolean(status?.requirements?.superuser);
  const requireServer = Boolean(status?.requirements?.server);
  const requireEndpoint = Boolean(status?.requirements?.endpoint);
  const requireApiKey = Boolean(status?.requirements?.apiKey);
  const hasAnyApiKey = Boolean(status?.apiKeys?.count);

  const serverEnvProvided = Boolean(envServerUrl || status?.servers?.envProvided);
  const endpointEnvProvided = Boolean(envEndpointExternalId || status?.endpoints?.envProvided);
  const apiKeyEnvProvided = Boolean(envApiKeyValue || status?.apiKeys?.envProvided);

  const showServerSection = requireServer || serverEnvProvided;
  const showEndpointSection = requireEndpoint || endpointEnvProvided;
  const showApiKeyField = requireApiKey || !hasAnyApiKey || apiKeyEnvProvided;

  const superuserUsernameReadOnly = Boolean(envSuperuserUsername);
  const superuserEmailReadOnly = Boolean(envSuperuserEmail);
  const superuserPasswordReadOnly = Boolean(envSuperuserPassword);
  const serverNameReadOnly = Boolean(envDefaults.serverNameFromEnv);
  const serverUrlReadOnly = Boolean(envServerUrl);
  const endpointNameReadOnly = Boolean(envDefaults.endpointNameFromEnv);
  const endpointExternalIdReadOnly = Boolean(envEndpointExternalId);
  const apiKeyReadOnly = Boolean(envApiKeyValue);

  const handleInputChange = useCallback((section, field, { locked = false } = {}) => (event) => {
    if (locked) {
      return;
    }
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  }, []);

  const validationErrors = useMemo(() => {
    if (!status) return [];
    const errors = [];

    if (requireSuperuser) {
      const { username, email, password } = form.superuser;
      if (!username.trim()) errors.push("Benutzername ist erforderlich.");
      if (!email.trim()) errors.push("E-Mail-Adresse ist erforderlich.");
      if (!password.trim()) errors.push("Passwort ist erforderlich.");
    }

    if (requireServer && !form.server.url.trim()) {
      errors.push("Server-URL ist erforderlich.");
    }

    if (requireEndpoint && !form.endpoint.externalId.trim()) {
      errors.push("Endpoint-ID ist erforderlich.");
    }

    if (showApiKeyField && requireApiKey && !form.apiKey.trim()) {
      errors.push("API-Key ist erforderlich.");
    }

    return errors;
  }, [form, requireSuperuser, requireServer, requireEndpoint, showApiKeyField, requireApiKey, status]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (submitting || !status) return;

    setSubmitError(null);
    setSubmitSuccess(false);

    if (validationErrors.length) {
      setSubmitError(validationErrors.join(" "));
      return;
    }

    const payload = {};

    if (requireSuperuser) {
      payload.superuser = {
        username: form.superuser.username.trim(),
        email: form.superuser.email.trim(),
        password: form.superuser.password
      };
    }

    if (showServerSection) {
      const serverName = form.server.name.trim();
      const serverUrl = form.server.url.trim();
      if (requireServer || (!serverNameReadOnly && serverName) || (!serverUrlReadOnly && serverUrl)) {
        payload.server = {
          name: serverName,
          url: serverUrl
        };
      }
    }

    if (showEndpointSection) {
      const endpointName = form.endpoint.name.trim();
      const endpointExternalId = form.endpoint.externalId.trim();
      const endpointServerId = form.endpoint.serverId ? Number(form.endpoint.serverId) : undefined;
      if (requireEndpoint || (!endpointNameReadOnly && endpointName) || (!endpointExternalIdReadOnly && endpointExternalId) || endpointServerId) {
        payload.endpoint = {
          name: endpointName || null,
          externalId: endpointExternalId || null,
          serverId: endpointServerId
        };
      }
    }

    const apiKeyValue = form.apiKey.trim();
    if (showApiKeyField || apiKeyValue) {
      payload.apiKey = { value: apiKeyValue };
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        switch (payload.error) {
          case "SERVER_DETAILS_REQUIRED":
            throw new Error("Bitte gib eine gültige Server-URL an.");
          case "ENDPOINT_DETAILS_REQUIRED":
            throw new Error("Bitte gib eine gültige Endpoint-ID an.");
          case "API_KEY_REQUIRED":
            throw new Error("Bitte gib einen gültigen API-Key an.");
          case "USERNAME_REQUIRED":
            throw new Error("Benutzername wird benötigt.");
          case "EMAIL_INVALID":
            throw new Error("Bitte gib eine gültige E-Mail-Adresse an.");
          case "PASSWORD_TOO_SHORT":
            throw new Error("Passwort muss mindestens 8 Zeichen enthalten.");
          case "INVALID_PASSWORD":
            throw new Error("Das Passwort ist ungültig.");
          case "API_KEY_ENCRYPT_FAILED":
            throw new Error("API-Key konnte nicht verschlüsselt werden. Bitte erneut versuchen.");
          case "SUPERUSER_EXISTS":
            throw new Error("Der Superuser wurde bereits angelegt.");
          default:
            throw new Error("Setup konnte nicht abgeschlossen werden. Bitte erneut versuchen.");
        }
      }

      const result = await response.json().catch(() => ({}));
      setStatus(result.status);
      setSubmitSuccess(true);
      setTimeout(() => {
        navigate("/auth/sign-in", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("⚠️ [Setup] Abschluss fehlgeschlagen:", error);
      setSubmitError(error.message || "Setup fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }, [form, navigate, requireSuperuser, requireServer, requireEndpoint, showServerSection, showEndpointSection, showApiKeyField, status, submitting, validationErrors, serverNameReadOnly, serverUrlReadOnly, endpointNameReadOnly, endpointExternalIdReadOnly]);

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Lade Setup-Status ...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <Alert color="red" className="w-full max-w-lg border border-red-200 bg-red-50 text-red-700">
          {fetchError}
        </Alert>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Keine Setup-Informationen verfügbar.</span>
      </div>
    );
  }

  const superuserSection = requireSuperuser ? (
    <>
      <Typography variant="h6" color="blue-gray" className="font-semibold">
        Superuser
      </Typography>
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Benutzername"
          required
          value={form.superuser.username}
          onChange={handleInputChange("superuser", "username", { locked: superuserUsernameReadOnly })}
          disabled={submitting}
          readOnly={superuserUsernameReadOnly}
        />
        <Input
          label="E-Mail-Adresse"
          required
          type="email"
          value={form.superuser.email}
          onChange={handleInputChange("superuser", "email", { locked: superuserEmailReadOnly })}
          disabled={submitting}
          readOnly={superuserEmailReadOnly}
        />
        <Input
          label="Passwort"
          required
          type="password"
          value={form.superuser.password}
          onChange={handleInputChange("superuser", "password", { locked: superuserPasswordReadOnly })}
          disabled={submitting}
          readOnly={superuserPasswordReadOnly}
        />
      </div>
    </>
  ) : (
    <Alert color="green" className="border border-green-200 bg-green-50 text-green-700">
      Superuser ist bereits vorhanden.
    </Alert>
  );

  const serverSection = showServerSection ? (
    <>
      <Typography variant="h6" color="blue-gray" className="mt-6 font-semibold">
        Server
      </Typography>
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Server-Name"
          value={form.server.name}
          onChange={handleInputChange("server", "name", { locked: serverNameReadOnly })}
          readOnly={serverNameReadOnly}
          disabled={submitting}
        />
        <Input
          label="Server-URL"
          required={requireServer}
          value={form.server.url}
          onChange={handleInputChange("server", "url", { locked: serverUrlReadOnly })}
          readOnly={serverUrlReadOnly}
          disabled={submitting}
        />
      </div>
    </>
  ) : null;

  const endpointSection = showEndpointSection ? (
    <>
      <Typography variant="h6" color="blue-gray" className="mt-6 font-semibold">
        Endpoint
      </Typography>
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="Endpoint-Name"
          value={form.endpoint.name}
          onChange={handleInputChange("endpoint", "name", { locked: endpointNameReadOnly })}
          readOnly={endpointNameReadOnly}
          disabled={submitting}
        />
        <Input
          label="Endpoint-ID"
          required={requireEndpoint}
          value={form.endpoint.externalId}
          onChange={handleInputChange("endpoint", "externalId", { locked: endpointExternalIdReadOnly })}
          readOnly={endpointExternalIdReadOnly}
          disabled={submitting}
        />
      </div>
    </>
  ) : null;

  const apiKeySection = showApiKeyField ? (
    <>
      <Typography variant="h6" color="blue-gray" className="mt-6 font-semibold">
        API-Key
      </Typography>
      <div className="grid grid-cols-1 gap-4">
        <Input
          label="API-Key"
          required={requireApiKey}
          type="password"
          value={form.apiKey}
          onChange={(event) => {
            if (apiKeyReadOnly) return;
            setForm((prev) => ({ ...prev, apiKey: event.target.value }));
          }}
          readOnly={apiKeyReadOnly}
          disabled={submitting}
        />
      </div>
    </>
  ) : null;

  const showEnvHint = Boolean(
    status?.superuser?.envProvided ||
    serverEnvProvided ||
    endpointEnvProvided ||
    apiKeyEnvProvided
  );

  return (
    <div className="flex min-h-screen w-full items-center justify-center py-10">
      <Card className="w-full max-w-lg border border-blue-gray-100 shadow-sm">
        <CardHeader
          floated={false}
          shadow={false}
          className="mb-0 grid place-items-start gap-2 rounded-none bg-transparent p-6"
        >
          <Typography variant="h4" color="blue-gray">
            System Setup
          </Typography>
          <Typography color="gray" className="font-normal">
            Lege einen Superuser sowie mindestens einen Server mit Endpoint und API-Key fest, um StackPulse zu starten.
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">
          <form className="mt-4 flex flex-col gap-6" onSubmit={handleSubmit}>
            {showEnvHint && (
              <Alert color="blue" className="border border-blue-200 bg-blue-50 text-blue-700">
                Teile der Konfiguration stammen bereits aus den Umgebungsvariablen.
              </Alert>
            )}

            {superuserSection}
            {serverSection}
            {endpointSection}
            {apiKeySection}

            {submitError && (
              <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
                {submitError}
              </Alert>
            )}

            {submitSuccess && (
              <Alert color="green" className="border border-green-200 bg-green-50 text-green-700">
                Setup abgeschlossen. Du wirst zum Login weitergeleitet ...
              </Alert>
            )}

            <Button type="submit" color="blue" disabled={submitting || submitSuccess}>
              {submitting ? "Setup läuft ..." : "Setup abschließen"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default Setup;
