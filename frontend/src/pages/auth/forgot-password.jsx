import React, { useCallback, useMemo, useState } from "react";
import axios from "axios";
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Input,
  Button,
  Spinner,
  Alert
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ToastProvider.jsx";

const PHRASE_WORD_COUNT = 8;

const normalizeWord = (value) => String(value || "").trim().toLowerCase();

const extractWordsFromText = (text = "") => {
  const normalized = String(text || "").replace(/[\r\n\t]+/g, " ").trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/).filter(Boolean);
};

const buildPhrasePayload = (words = []) => {
  const normalized = words.map(normalizeWord).filter(Boolean);
  return {
    words: normalized,
    canonical: normalized.join("")
  };
};

export function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [username, setUsername] = useState("");
  const [phraseInputs, setPhraseInputs] = useState(Array(PHRASE_WORD_COUNT).fill(""));
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const phraseWords = useMemo(() => {
    if (fileContent.trim()) {
      return extractWordsFromText(fileContent);
    }
    return phraseInputs.map(normalizeWord).filter(Boolean);
  }, [fileContent, phraseInputs]);

  const handlePhraseInputChange = useCallback((index, value) => {
    setPhraseInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleFileUpload = useCallback((event) => {
    const [file] = event.target.files || [];
    if (!file) {
      setFileName("");
      setFileContent("");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const text = String(loadEvent.target?.result || "");
      setFileContent(text);
      setPhraseInputs(Array(PHRASE_WORD_COUNT).fill(""));
    };
    reader.onerror = () => {
      setFileName("");
      setFileContent("");
      showToast({
        variant: "error",
        title: "Datei konnte nicht gelesen werden",
        description: "Bitte lade die Datei erneut hoch."
      });
    };
    reader.readAsText(file);
  }, [showToast]);

  const handleVerifyPhrase = useCallback(async () => {
    setVerificationError("");
    setVerificationToken("");

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setVerificationError("Bitte gib deinen Benutzernamen ein.");
      return;
    }

    const words = phraseWords;
    const hasFile = Boolean(fileContent.trim());

    if (!hasFile && words.length !== PHRASE_WORD_COUNT) {
      setVerificationError("Bitte gib alle acht Wörter des Sicherheitsschlüssels ein.");
      return;
    }

    if (hasFile && words.length !== PHRASE_WORD_COUNT) {
      setVerificationError("Die hochgeladene Datei enthält nicht genau acht Wörter.");
      return;
    }

    const payload = buildPhrasePayload(words);
    if (!payload.canonical) {
      setVerificationError("Der Sicherheitsschlüssel ist ungültig oder leer.");
      return;
    }

    setVerifying(true);
    try {
      const response = await axios.post("/api/auth/recover/verify", {
        username: trimmedUsername,
        phrase: payload.canonical,
        words: payload.words
      });

      const responseToken = response.data?.token;
      if (!responseToken) {
        throw new Error("TOKEN_MISSING");
      }
      setVerificationToken(responseToken);
      showToast({
        variant: "success",
        title: "Sicherheitsschlüssel bestätigt",
        description: "Du kannst jetzt ein neues Passwort festlegen."
      });
    } catch (error) {
      const serverError = error.response?.data?.error;
      if (serverError === "USER_NOT_FOUND") {
        setVerificationError("Der angegebene Benutzer wurde nicht gefunden.");
      } else if (serverError === "PHRASE_MISMATCH") {
        setVerificationError("Der Sicherheitsschlüssel passt nicht zum Benutzer.");
      } else if (serverError === "PHRASE_NOT_INITIALIZED") {
        setVerificationError("Für diesen Benutzer ist aktuell kein Sicherheitsschlüssel hinterlegt.");
      } else if (serverError === "PHRASE_REQUIRED") {
        setVerificationError("Bitte gib den Sicherheitsschlüssel ein.");
      } else if (serverError === "USERNAME_REQUIRED") {
        setVerificationError("Der Benutzername darf nicht leer sein.");
      } else if (serverError === "INVALID_PASSWORD") {
        setVerificationError("Der Sicherheitsschlüssel ist ungültig.");
      } else {
        setVerificationError("Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut.");
      }
    } finally {
      setVerifying(false);
    }
  }, [fileContent, phraseWords, showToast, username]);

  const handleResetPassword = useCallback(async () => {
    setResetError("");

    if (!verificationToken) {
      setResetError("Bitte bestätige zuerst deinen Sicherheitsschlüssel.");
      return;
    }

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirm) {
      setResetError("Bitte gib das neue Passwort zweimal ein.");
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setResetError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setResetting(true);
    try {
      await axios.post("/api/auth/recover/reset", {
        token: verificationToken,
        password: trimmedPassword,
        confirmPassword: trimmedConfirm
      });
      showToast({
        variant: "success",
        title: "Passwort aktualisiert",
        description: "Du kannst dich jetzt mit deinem neuen Passwort anmelden."
      });
      navigate("/auth/sign-in", { replace: true });
    } catch (error) {
      const serverError = error.response?.data?.error;
      if (serverError === "TOKEN_INVALID_OR_EXPIRED") {
        setResetError("Die Wiederherstellungssitzung ist abgelaufen. Bitte starte den Vorgang erneut.");
        setVerificationToken("");
      } else if (serverError === "PASSWORD_TOO_SHORT") {
        setResetError("Das Passwort muss mindestens 8 Zeichen enthalten.");
      } else if (serverError === "PASSWORD_REQUIRED") {
        setResetError("Bitte gib ein neues Passwort ein.");
      } else if (serverError === "PASSWORD_MISMATCH") {
        setResetError("Die Passwörter stimmen nicht überein.");
      } else {
        setResetError("Das Passwort konnte nicht zurückgesetzt werden. Bitte versuche es erneut.");
      }
    } finally {
      setResetting(false);
    }
  }, [confirmPassword, navigate, password, showToast, verificationToken]);

  const verificationCompleted = Boolean(verificationToken);

  return (
    <section className="m-8 flex justify-center">
      <Card className="w-full max-w-3xl">
        <CardHeader floated={false} shadow={false} className="rounded-none border-b border-blue-gray-50 bg-white px-6 py-5">
          <Typography variant="h4" color="blue-gray" className="font-semibold">
            Passwort zurücksetzen
          </Typography>
          <Typography color="blue-gray" className="mt-1 text-sm">
            Gib deinen Benutzernamen und den Sicherheitsschlüssel (8 Wörter) ein oder lade die gespeicherte Schlüsseldatei.
          </Typography>
        </CardHeader>
        <CardBody className="space-y-8">
          <div className="space-y-4">
            <Typography variant="h6" color="blue-gray">
              Schritt 1: Sicherheitsschlüssel prüfen
            </Typography>
            <div>
              <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                Benutzername
              </Typography>
              <Input
                size="lg"
                placeholder="Benutzername"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={verificationCompleted || verifying}
                className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                labelProps={{ className: "before:content-none after:content-none" }}
              />
            </div>

            <div>
              <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                Sicherheitsschlüssel eingeben
              </Typography>
<div className="grid grid-cols-1 gap-3 md:grid-cols-4 min-w-[20px] [&>div]:!min-w-0">
                {phraseInputs.map((value, index) => (
                  <Input
                    key={`phrase-input-${index}`}
                    placeholder={`Wort ${index + 1}`}
                    value={value}
                    onChange={(event) => handlePhraseInputChange(index, event.target.value)}
                    disabled={verificationCompleted || verifying || Boolean(fileContent.trim())}
                    className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                    labelProps={{ className: "before:content-none after:content-none" }}
                  />
                ))}
              </div>
            </div>

            <div>
              <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                Alternativ: Schlüsseldatei (.txt) hochladen
              </Typography>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  disabled={verificationCompleted || verifying}
                  className="block w-full max-w-xs text-sm text-blue-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-gray-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-gray-700 hover:file:bg-blue-gray-100"
                />
                {fileName && (
                  <Typography className="text-xs text-blue-gray-500">
                    Ausgewählte Datei: <span className="font-medium text-blue-gray-700">{fileName}</span>
                  </Typography>
                )}
              </div>
            </div>

            {verificationError && (
              <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
                {verificationError}
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <Button
                color="blue"
                className="normal-case"
                onClick={handleVerifyPhrase}
                disabled={verifying || verificationCompleted}
              >
                {verifying ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Prüfe Sicherheitsschlüssel ...
                  </span>
                ) : (
                  "Sicherheitsschlüssel prüfen"
                )}
              </Button>
              {verificationCompleted && (
                <Typography className="text-sm text-blue-gray-500">
                  Die Wiederherstellung bleibt für kurze Zeit aktiv. Bitte setze dein Passwort zeitnah zurück.
                </Typography>
              )}
            </div>
          </div>

          {/* Schritt 2 */}
          <div className="space-y-4">
            <Typography variant="h6" color={verificationCompleted ? "blue-gray" : "gray"}>
              Schritt 2: Neues Passwort festlegen
            </Typography>

            {!verificationCompleted && (
              <Typography className="text-sm text-blue-gray-500">
                Nach erfolgreicher Prüfung des Sicherheitsschlüssels kannst du hier ein neues Passwort vergeben.
              </Typography>
            )}

            {verificationCompleted && (
              <div className="space-y-4">
                <div>
                  <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                    Neues Passwort
                  </Typography>
                  <Input
                    type="password"
                    size="lg"
                    placeholder="Neues Passwort"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={resetting}
                    className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                    labelProps={{ className: "before:content-none after:content-none" }}
                  />
                </div>
                <div>
                  <Typography className="mb-2 block text-xs font-semibold uppercase text-blue-gray-500">
                    Passwort bestätigen
                  </Typography>
                  <Input
                    type="password"
                    size="lg"
                    placeholder="Passwort bestätigen"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={resetting}
                    className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
                    labelProps={{ className: "before:content-none after:content-none" }}
                  />
                </div>
                {resetError && (
                  <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
                    {resetError}
                  </Alert>
                )}
                <Button
                  color="green"
                  className="normal-case"
                  onClick={handleResetPassword}
                  disabled={resetting}
                >
                  {resetting ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="h-4 w-4" /> Speichere Passwort ...
                    </span>
                  ) : (
                    "Neues Passwort speichern"
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-blue-gray-50 pt-4">
            <Typography
              as="button"
              type="button"
              onClick={() => navigate("/auth/sign-in")}
              className="text-sm font-medium text-blue-600 transition hover:text-blue-800"
            >
              Zurück zur Anmeldung
            </Typography>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}

export default ForgotPassword;
