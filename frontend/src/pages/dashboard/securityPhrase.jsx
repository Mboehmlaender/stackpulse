import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Card,
  CardBody,
  Typography,
  Button,
  Spinner,
  Alert
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/components/AuthProvider.jsx";

const formatWordsAsText = (words = []) => {
  if (!Array.isArray(words) || words.length === 0) {
    return "";
  }
  const rows = [];
  for (let index = 0; index < words.length; index += 4) {
    rows.push(words.slice(index, index + 4).join(" "));
  }
  return rows.join("\n");
};

const groupWords = (words = []) => {
  if (!Array.isArray(words)) {
    return [];
  }
  const rows = [];
  for (let index = 0; index < words.length; index += 4) {
    rows.push(words.slice(index, index + 4));
  }
  return rows;
};

export function SecurityPhrase() {
  const navigate = useNavigate();
  const { user, setSession, refreshSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [words, setWords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const requiresDownload = Boolean(user?.requiresSecurityPhraseDownload);

  const groupedWords = useMemo(() => groupWords(words), [words]);

  const triggerDownload = useCallback((content) => {
    if (!content) {
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const baseName = user?.username ? `${user.username}-sicherheitsschluessel` : "security-phrase";
    link.download = `${baseName}.txt`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [user?.username]);

  const fetchPhrase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/users/me/security-phrase");
      const phraseWords = Array.isArray(response.data?.item?.words) ? response.data.item.words : [];
      if (!phraseWords.length) {
        throw new Error("EMPTY_SECURITY_PHRASE");
      }
      setWords(phraseWords);
      setDownloaded(false);
    } catch (err) {
      if (err?.response?.status === 409 || err?.response?.data?.error === "SECURITY_PHRASE_ALREADY_DOWNLOADED") {
        await refreshSession();
        navigate("/dashboard/stacks", { replace: true });
        return;
      }

      const message = err?.response?.data?.error || err?.message || "Sicherheitsschlüssel konnte nicht geladen werden.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [navigate, refreshSession]);

  useEffect(() => {
    if (!user) {
      navigate("/auth/sign-in", { replace: true });
      return;
    }

    if (!requiresDownload) {
      navigate("/dashboard/stacks", { replace: true });
      return;
    }

    fetchPhrase();
  }, [user, requiresDownload, fetchPhrase, navigate]);

  const handleRetry = useCallback(() => {
    fetchPhrase();
  }, [fetchPhrase]);

  const handleDownload = useCallback(async () => {
    if (saving || !Array.isArray(words) || words.length === 0) {
      return;
    }
    setSaving(true);
    setError("");

    try {
      const text = formatWordsAsText(words);
      triggerDownload(text);

      const response = await axios.post("/api/users/me/security-phrase/downloaded");
      const downloadedAt = response.data?.item?.downloadedAt || null;
      const sessionPayload = response.data?.session;

      if (sessionPayload?.user) {
        setSession(sessionPayload);
      } else {
        await refreshSession();
      }

      setDownloaded(Boolean(downloadedAt));
      navigate("/dashboard/stacks", { replace: true });
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Download konnte nicht bestätigt werden.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [words, saving, triggerDownload, refreshSession, navigate, setSession]);

  if (!requiresDownload) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-blue-gray-50/50 px-4 py-10">
      <div className="mb-6 text-center">
        <Typography variant="h2" className="font-semibold text-blue-gray-800">
          Sicherheitsschlüssel sichern
        </Typography>
        <Typography color="blue-gray" className="mt-2 max-w-3xl text-base">
          Bitte lade den einmaligen Sicherheitsschlüssel herunter und bewahre ihn sicher auf. Er wird benötigt, um dein Passwort zurückzusetzen.
          Ohne den Download kannst du die Anwendung nicht weiter nutzen.
        </Typography>
      </div>

      <Card className="w-full max-w-3xl shadow-lg">
        <CardBody className="space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-10 w-10 text-blue-gray-500" />
            </div>
          )}

          {!loading && error && (
            <Alert
              color="red"
              className="border border-red-200 bg-red-50 text-red-700"
              icon={<ArrowPathIcon className="h-5 w-5" />}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Typography variant="h6" color="red">
                    Fehler
                  </Typography>
                  <Typography color="red" className="text-sm">
                    {error}
                  </Typography>
                </div>
                <Button
                  size="sm"
                  color="red"
                  variant="text"
                  onClick={handleRetry}
                  className="normal-case"
                >
                  Erneut versuchen
                </Button>
              </div>
            </Alert>
          )}

          {!loading && !error && (
            <>
              <div className="rounded-lg border border-blue-gray-100 bg-blue-gray-50/60 p-6">
                <Typography variant="h5" className="mb-4 text-blue-gray-800">
                  Deine Sicherheitsphrase
                </Typography>
                <div className="space-y-3">
                  {groupedWords.map((row, rowIndex) => (
                    <div
                      key={`phrase-row-${rowIndex}`}
                      className="flex flex-wrap items-center justify-center gap-4 text-lg font-mono tracking-wide text-blue-gray-900 md:text-xl"
                    >
                      {row.map((word, wordIndex) => (
                        <span key={`phrase-${rowIndex}-${wordIndex}`} className="uppercase">
                          {word}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="text-sm text-blue-gray-600">
                  Der Download startet im TXT-Format. Bewahre die Datei sicher auf – sie kann später nicht erneut angezeigt werden.
                </div>
                <Button
                  color="blue"
                  size="md"
                  className="flex items-center gap-2 normal-case"
                  onClick={handleDownload}
                  disabled={saving || downloaded || words.length === 0}
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Sicherheitsschlüssel herunterladen
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default SecurityPhrase;
