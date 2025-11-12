import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Input,
  Button,
  Alert,
  Stepper,
  Step,
  Radio
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";

const STEP_LABELS = [
  "Willkommen",
  "Superuser",
  "Server & API-Key",
  "Stack auswählen (optional)",
  "Abschluss"
];

const matchesStackpulse = (stack) =>
  typeof stack?.Name === "string" && stack.Name.toLowerCase().includes("stackpulse");

const initialSuperuser = {
  username: "",
  email: "",
  password: ""
};

const initialServer = {
  name: "",
  url: ""
};

export function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [superuserForm, setSuperuserForm] = useState(initialSuperuser);
  const [serverForm, setServerForm] = useState(initialServer);
  const [apiKeyValue, setApiKeyValue] = useState("");

  const [connectionStatus, setConnectionStatus] = useState({
    loading: false,
    success: false,
    tried: false,
    message: ""
  });

  const [stackLookup, setStackLookup] = useState({
    loading: false,
    fetched: false,
    error: "",
    items: [],
    updatedAt: null
  });
  const [selectedStackId, setSelectedStackId] = useState("");
  const [manualStackId, setManualStackId] = useState("");

  const [activeStep, setActiveStep] = useState(0);

  const [finalizing, setFinalizing] = useState(false);
  const [finalError, setFinalError] = useState(null);
  const [finalSuccess, setFinalSuccess] = useState(false);

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

        setSuperuserForm((prev) => ({
          username: data.envDefaults?.superuserUsername?.length
            ? data.envDefaults.superuserUsername
            : prev.username,
          email: data.envDefaults?.superuserEmail?.length
            ? data.envDefaults.superuserEmail
            : prev.email,
          password: data.envDefaults?.superuserPassword?.length
            ? data.envDefaults.superuserPassword
            : prev.password
        }));

        setServerForm((prev) => ({
          name: data.envDefaults?.serverName?.length
            ? data.envDefaults.serverName
            : prev.name,
          url: data.envDefaults?.serverUrl?.length
            ? data.envDefaults.serverUrl
            : prev.url
        }));

        setApiKeyValue((prev) =>
          data.envDefaults?.apiKeyValue?.length ? data.envDefaults.apiKeyValue : prev
        );

        const defaultSelfStack = data.selfStack?.current || data.envDefaults?.selfStackId || "";
        setManualStackId(defaultSelfStack);
        setSelectedStackId(data.selfStack?.current ? String(data.selfStack.current) : "");
        setActiveStep(0);
        setConnectionStatus({ loading: false, success: false, tried: false, message: "" });
        setStackLookup({ loading: false, fetched: false, error: "", items: [], updatedAt: null });
        setFinalError(null);
        setFinalSuccess(false);
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
  const requireSuperuser = Boolean(status?.requirements?.superuser);
  const requireServer = Boolean(status?.requirements?.server);
  const requireApiKey = Boolean(status?.requirements?.apiKey);
  const hasAnyApiKey = Boolean(status?.apiKeys?.count);

  const serverEnvProvided = Boolean(envDefaults.serverUrl || status?.servers?.envProvided);
  const apiKeyEnvProvided = Boolean(envDefaults.apiKeyValue || status?.apiKeys?.envProvided);

  const showServerSection = requireServer || serverEnvProvided;
  const showApiKeyField = requireApiKey || !hasAnyApiKey || apiKeyEnvProvided;

  const superuserUsernameReadOnly = Boolean(envDefaults.superuserUsername);
  const superuserEmailReadOnly = Boolean(envDefaults.superuserEmail);
  const superuserPasswordReadOnly = Boolean(envDefaults.superuserPassword);
  const serverNameReadOnly = Boolean(envDefaults.serverNameFromEnv);
  const serverUrlReadOnly = Boolean(envDefaults.serverUrl);
  const apiKeyReadOnly = Boolean(envDefaults.apiKeyValue);

  const resetConnectionStatus = useCallback(() => {
    setConnectionStatus((prev) =>
      prev.loading || !prev.tried
        ? prev
        : { loading: false, success: false, tried: false, message: "" }
    );
  }, []);

  const handleSuperuserChange = useCallback((field) => (event) => {
    const value = event.target.value;
    setSuperuserForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleServerChange = useCallback(
    (field) => (event) => {
      if (field === "name" && serverNameReadOnly) return;
      if (field === "url" && serverUrlReadOnly) return;
      const value = event.target.value;
      setServerForm((prev) => ({ ...prev, [field]: value }));
      resetConnectionStatus();
    },
    [resetConnectionStatus, serverNameReadOnly, serverUrlReadOnly]
  );

  const handleApiKeyChange = useCallback(
    (event) => {
      if (apiKeyReadOnly) return;
      setApiKeyValue(event.target.value);
      resetConnectionStatus();
    },
    [apiKeyReadOnly, resetConnectionStatus]
  );

  const handleTestConnection = useCallback(async () => {
    const serverUrl = serverForm.url.trim();
    const keyValue = apiKeyValue.trim();

    if (!serverUrl) {
      setConnectionStatus({
        loading: false,
        success: false,
        tried: true,
        message: "Bitte gib eine Server-URL an."
      });
      return;
    }
    if (!keyValue) {
      setConnectionStatus({
        loading: false,
        success: false,
        tried: true,
        message: "Bitte gib einen API-Key ein."
      });
      return;
    }

    setConnectionStatus({ loading: true, success: false, tried: true, message: "" });
    try {
      const response = await fetch("/api/setup/test-portainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          server: {
            name: serverForm.name.trim() || null,
            url: serverUrl
          },
          apiKey: keyValue
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload.message || "Verbindungstest fehlgeschlagen. Bitte Daten prüfen.";
        throw new Error(message);
      }

      setConnectionStatus({
        loading: false,
        success: true,
        tried: true,
        message: "Verbindung wurde erfolgreich hergestellt."
      });
    } catch (error) {
      console.error("⚠️ [Setup] Verbindungstest fehlgeschlagen:", error);
      setConnectionStatus({
        loading: false,
        success: false,
        tried: true,
        message: error.message || "Verbindungstest fehlgeschlagen."
      });
    }
  }, [apiKeyValue, serverForm]);

  const handleFetchStacks = useCallback(
    async ({ silent = false } = {}) => {
      if (!connectionStatus.success) {
        setStackLookup((prev) => ({ ...prev, error: "Bitte teste zuerst die Verbindung." }));
        return;
      }
      const serverUrl = serverForm.url.trim();
      const keyValue = apiKeyValue.trim();
      if (!serverUrl || !keyValue) return;

      setStackLookup((prev) => ({
        ...prev,
        loading: !silent,
        error: "",
        fetched: true
      }));

      try {
        const response = await fetch("/api/setup/portainer-stacks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            server: {
              name: serverForm.name.trim() || null,
              url: serverUrl
            },
            apiKey: keyValue
          })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload.message || "Stacks konnten nicht geladen werden.";
          throw new Error(message);
        }
        const data = await response.json().catch(() => ({ stacks: [] }));
        const stacks = Array.isArray(data.stacks) ? data.stacks : [];
        const filteredStacks = stacks.filter(matchesStackpulse);
        setStackLookup({
          loading: false,
          fetched: true,
          error: filteredStacks.length ? "" : "Es wurden keine passenden Stacks gefunden.",
          items: filteredStacks,
          updatedAt: new Date()
        });
      } catch (error) {
        console.error("⚠️ [Setup] Stack-Abruf fehlgeschlagen:", error);
        setStackLookup({
          loading: false,
          fetched: true,
          error: error.message || "Stacks konnten nicht geladen werden.",
          items: [],
          updatedAt: new Date()
        });
      }
    },
    [apiKeyValue, connectionStatus.success, serverForm]
  );

  useEffect(() => {
    if (activeStep === 3 && connectionStatus.success && !stackLookup.loading && !stackLookup.fetched) {
      handleFetchStacks({ silent: true });
    }
  }, [activeStep, connectionStatus.success, handleFetchStacks, stackLookup.fetched, stackLookup.loading]);

  useEffect(() => {
    if (!connectionStatus.success) {
      setStackLookup((prev) => ({ ...prev, items: [], fetched: false, error: "" }));
      setSelectedStackId("");
    }
  }, [connectionStatus.success]);

  const finalSelfStackId = (selectedStackId || manualStackId || "").trim();

  const canProceed = useMemo(() => {
    switch (activeStep) {
      case 0:
        return true;
      case 1:
        if (!requireSuperuser) return true;
        return (
          superuserForm.username.trim() &&
          superuserForm.email.trim() &&
          superuserForm.password.trim()
        );
      case 2: {
        const serverUrlValid = showServerSection ? Boolean(serverForm.url.trim()) : true;
        const apiKeyValid = showApiKeyField ? Boolean(apiKeyValue.trim()) : true;
        const connectionValid = (showServerSection || showApiKeyField)
          ? connectionStatus.success
          : true;
        return serverUrlValid && apiKeyValid && connectionValid;
      }
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  }, [
    activeStep,
    apiKeyValue,
    connectionStatus.success,
    requireSuperuser,
    showApiKeyField,
    showServerSection,
    superuserForm.email,
    superuserForm.password,
    superuserForm.username,
    serverForm.url
  ]);

  const handleNext = useCallback(() => {
    if (activeStep >= STEP_LABELS.length - 1) return;
    setActiveStep((prev) => Math.min(prev + 1, STEP_LABELS.length - 1));
  }, [activeStep]);

  const handlePrev = useCallback(() => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleFinishSetup = useCallback(async () => {
    if (!status || finalizing) return;

    setFinalError(null);
    setFinalSuccess(false);
    setFinalizing(true);
    try {
      const payload = {};

      if (requireSuperuser) {
        payload.superuser = {
          username: superuserForm.username.trim(),
          email: superuserForm.email.trim(),
          password: superuserForm.password
        };
      }

      if (showServerSection) {
        payload.server = {
          name: serverForm.name.trim(),
          url: serverForm.url.trim()
        };
      }

      if (showApiKeyField || apiKeyValue.trim()) {
        payload.apiKey = { value: apiKeyValue.trim() };
      }

      if (finalSelfStackId) {
        payload.selfStackId = finalSelfStackId;
      }

      const response = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = (() => {
          switch (payload.error) {
            case "SERVER_DETAILS_REQUIRED":
              return "Bitte gib eine gültige Server-URL an.";
            case "API_KEY_REQUIRED":
              return "Bitte gib einen gültigen API-Key an.";
            case "USERNAME_REQUIRED":
              return "Benutzername wird benötigt.";
            case "EMAIL_INVALID":
              return "Bitte gib eine gültige E-Mail-Adresse an.";
            case "PASSWORD_TOO_SHORT":
              return "Passwort muss mindestens 8 Zeichen enthalten.";
            case "INVALID_PASSWORD":
              return "Das Passwort ist ungültig.";
            case "API_KEY_ENCRYPT_FAILED":
              return "API-Key konnte nicht verschlüsselt werden.";
            case "SUPERUSER_EXISTS":
              return "Der Superuser wurde bereits angelegt.";
            default:
              return "Setup konnte nicht abgeschlossen werden.";
          }
        })();
        throw new Error(message);
      }

      const result = await response.json().catch(() => ({}));
      setStatus(result.status);
      setFinalSuccess(true);
      setTimeout(() => {
        navigate("/auth/sign-in", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("⚠️ [Setup] Abschluss fehlgeschlagen:", error);
      setFinalError(error.message || "Setup fehlgeschlagen.");
    } finally {
      setFinalizing(false);
    }
  }, [
    apiKeyValue,
    finalSelfStackId,
    finalizing,
    navigate,
    requireSuperuser,
    showApiKeyField,
    showServerSection,
    status,
    superuserForm.email,
    superuserForm.password,
    superuserForm.username,
    serverForm.name,
    serverForm.url
  ]);

  const stackItemsForDisplay = useMemo(() => stackLookup.items, [stackLookup.items]);

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <div className="space-y-6">
            <Typography variant="h5" color="blue-gray">
              Willkommen bei StackPulse
            </Typography>
            <Typography className="text-sm text-blue-gray-600">
              Dieser Assistent führt dich durch fünf Schritte:
            </Typography>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-blue-gray-600">
              <li>Superuser-Zugang anlegen</li>
              <li>Server-URL und Portainer API-Key hinterlegen und testen</li>
              <li>Den eigenen Stack in Portainer identifizieren</li>
              <li>Alle Angaben überprüfen und Setup abschließen</li>
            </ol>
            <Alert color="blue" className="bg-blue-50 text-blue-800">
              Du kannst jederzeit zum vorherigen Schritt zurückkehren. Vorwärts geht es,
              sobald alle Pflichtangaben eines Schritts erledigt sind.
            </Alert>
          </div>
        );
      case 1:
        return requireSuperuser ? (
          <div className="space-y-4">
            <Typography variant="h5" color="blue-gray">
              Superuser anlegen
            </Typography>
            <Typography className="text-sm text-blue-gray-600">
              Dieser Benutzer hat Zugriff auf alle Funktionen.
            </Typography>
            <div className="grid gap-4">
              <Input
                label="Benutzername"
                value={superuserForm.username}
                onChange={handleSuperuserChange("username")}
                readOnly={superuserUsernameReadOnly}
              />
              <Input
                label="E-Mail-Adresse"
                type="email"
                value={superuserForm.email}
                onChange={handleSuperuserChange("email")}
                readOnly={superuserEmailReadOnly}
              />
              <Input
                label="Passwort"
                type="password"
                value={superuserForm.password}
                onChange={handleSuperuserChange("password")}
                readOnly={superuserPasswordReadOnly}
              />
            </div>
          </div>
        ) : (
          <Alert color="green" className="bg-green-50 text-green-800">
            Superuser ist bereits vorhanden. Du kannst direkt zum nächsten Schritt gehen.
          </Alert>
        );
      case 2:
        return (
          <div className="space-y-6">
            <Typography variant="h5" color="blue-gray">
              Server und Portainer-Zugriff
            </Typography>
            <Typography className="text-sm text-blue-gray-600">
              Gib die URL zu deiner Portainer-Instanz sowie den dazugehörigen Business-API-Key ein
              und teste anschließend die Verbindung.
            </Typography>
            <div className="grid gap-4">
              <Input
                label="Server-Name"
                value={serverForm.name}
                onChange={handleServerChange("name")}
                readOnly={serverNameReadOnly}
              />
              <Input
                label="Server-URL"
                required={showServerSection}
                value={serverForm.url}
                onChange={handleServerChange("url")}
                readOnly={serverUrlReadOnly}
              />
              <Input
                label="Portainer API-Key"
                type="password"
                required={showApiKeyField}
                value={apiKeyValue}
                onChange={handleApiKeyChange}
                readOnly={apiKeyReadOnly}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  color="blue"
                  onClick={handleTestConnection}
                  disabled={connectionStatus.loading}
                  className="w-full sm:w-auto"
                >
                  {connectionStatus.loading ? "Teste Verbindung…" : "Verbindung testen"}
                </Button>
                {connectionStatus.tried && (
                  <span
                    className={`text-sm ${connectionStatus.success ? "text-green-600" : "text-red-600"}`}
                  >
                    {connectionStatus.message ||
                      (connectionStatus.success
                        ? "Verbindung erfolgreich"
                        : "Verbindungstest fehlgeschlagen")}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <Typography variant="h5" color="blue-gray">
              Eigenen Stack wählen (optional)
            </Typography>
            <Typography className="text-sm text-blue-gray-600">
              StackPulse kann deinen eigenen Stack hinterlegen, um spätere Wartungsschritte zu erleichtern.
              Wir versuchen, passende Stacks automatisch zu finden.
            </Typography>
            <Alert color="blue" className="bg-blue-50 text-blue-800">
              Dieser Schritt ist optional. Du kannst die Self-Stack-ID später jederzeit im Bereich
              „Wartung &gt; Server &amp; API-Keys“ hinterlegen oder anpassen.
            </Alert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                color="blue"
                variant="outlined"
                onClick={() => handleFetchStacks({ silent: false })}
                disabled={!connectionStatus.success || stackLookup.loading}
                className="w-full sm:w-auto"
              >
                {stackLookup.loading ? "Lade…" : "Stacks neu laden"}
              </Button>
              {stackLookup.updatedAt && (
                <span className="text-xs text-blue-gray-500">
                  Stand: {stackLookup.updatedAt.toLocaleTimeString("de-DE")}
                </span>
              )}
            </div>
            {stackLookup.error && (
              <Alert color="red" className="bg-red-50 text-red-700">
                {stackLookup.error}
              </Alert>
            )}
            <div className="space-y-3">
              {stackItemsForDisplay.length === 0 && !stackLookup.loading ? (
                <p className="text-sm text-blue-gray-500">
                  Es wurden keine Stacks gefunden, die "stackpulse" im Namen enthalten. Bitte die ID
                  manuell eingeben oder die Suche erneut ausführen.
                </p>
              ) : (
                stackItemsForDisplay.map((stack) => (
                  <label
                    key={stack.Id}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-blue-gray-100 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-blue-gray-900">{stack.Name || "Ohne Namen"}</p>
                      <p className="text-xs text-blue-gray-500">ID: {stack.Id}</p>
                    </div>
                    <Radio
                      name="stack-selection"
                      value={String(stack.Id)}
                      checked={selectedStackId === String(stack.Id)}
                      onChange={() => {
                        setSelectedStackId(String(stack.Id));
                        setManualStackId("");
                      }}
                      ripple={false}
                    />
                  </label>
                ))
              )}
            </div>
            <div className="space-y-2">
              <Typography className="text-sm font-semibold text-blue-gray-700">
                Alternative: Stack-ID manuell eintragen (optional)
              </Typography>
              <Input
                label="Stack-ID (optional)"
                value={manualStackId}
                onChange={(event) => {
                  setManualStackId(event.target.value);
                  setSelectedStackId("");
                }}
                placeholder="z. B. 42"
              />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <Typography variant="h5" color="blue-gray">
              Zusammenfassung
            </Typography>
            <div className="space-y-4 rounded-md border border-blue-gray-100 p-4 text-sm text-blue-gray-700">
              <div>
                <p className="font-semibold">Superuser</p>
                <p>
                  {requireSuperuser
                    ? `${superuserForm.username || "-"} (${superuserForm.email || "ohne E-Mail"})`
                    : "Bereits vorhanden"}
                </p>
              </div>
              <div>
                <p className="font-semibold">Server</p>
                <p>{serverForm.url || "-"}</p>
              </div>
              <div>
                <p className="font-semibold">API-Key</p>
                <p>{apiKeyValue ? "(ausgefüllt)" : "nicht angegeben"}</p>
              </div>
              <div>
                <p className="font-semibold">Self-Stack-ID</p>
                <p>{finalSelfStackId || "nicht ausgewählt"}</p>
              </div>
            </div>
            {finalError && (
              <Alert color="red" className="bg-red-50 text-red-700">
                {finalError}
              </Alert>
            )}
            {finalSuccess && (
              <Alert color="green" className="bg-green-50 text-green-800">
                Setup abgeschlossen. Du wirst zum Login weitergeleitet …
              </Alert>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Lade Setup-Status …</span>
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

  return (
    <div className="flex min-h-screen w-full items-center justify-center py-10">
      <Card className="w-full max-w-3xl border border-blue-gray-100 shadow-sm">
        <CardHeader
          floated={false}
          shadow={false}
          className="grid gap-1 rounded-none bg-transparent p-6 text-left"
        >
          <Typography variant="h4" color="blue-gray">
            System Setup
          </Typography>
          <Typography color="gray" className="text-sm">
            Folge den Schritten, um StackPulse mit deiner Portainer-Instanz zu verbinden.
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">
          <Stepper activeStep={activeStep} className="w-full py-6">
            {STEP_LABELS.map((label, index) => (
              <Step
                key={label}
                onClick={() => setActiveStep(index)}
                className="cursor-pointer"
                activeClassName="bg-blue-600 text-white"
                completedClassName="bg-blue-600 text-white"
              >
                {index + 1}
              </Step>
            ))}
          </Stepper>
          <div className="mt-4 grid grid-cols-1 gap-2 text-center text-xs font-medium text-blue-gray-600 sm:grid-cols-5">
            {STEP_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="mt-6 min-h-[260px] space-y-6">{renderStepContent()}</div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="text"
              color="blue"
              onClick={handlePrev}
              disabled={activeStep === 0 || finalizing}
              className="w-full sm:w-auto"
            >
              Zurück
            </Button>
            {activeStep < STEP_LABELS.length - 1 ? (
              <Button
                color="blue"
                onClick={handleNext}
                disabled={!canProceed || finalizing}
                className="w-full sm:w-auto"
              >
                Weiter
              </Button>
            ) : (
              <Button
                color="green"
                onClick={handleFinishSetup}
                disabled={!canProceed || finalizing}
                className="w-full sm:w-auto"
              >
                {finalizing ? "Setup wird abgeschlossen…" : "Setup abschließen"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default Setup;
