import { useCallback, useEffect, useState } from "react";
import {
  Input,
  Button,
  Typography,
  Alert,
} from "@material-tailwind/react";
import { useNavigate } from "react-router-dom";

export function SignIn() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const initialize = async () => {
      try {
        const setupResponse = await fetch("/api/setup/status", {
          credentials: "include",
          signal: controller.signal,
        });

        if (setupResponse.ok) {
          const setupData = await setupResponse.json();
          if (!setupData.setupComplete && isActive) {
            navigate("/setup", { replace: true });
            return;
          }
        }

        const sessionResponse = await fetch("/api/auth/session", {
          credentials: "include",
          signal: controller.signal,
        });

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData?.user && isActive) {
            navigate("/dashboard/stacks", { replace: true });
            return;
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("⚠️ [Auth] Initiale Prüfung fehlgeschlagen:", err);
        }
      } finally {
        if (isActive) {
          setStatusChecked(true);
        }
      }
    };

    initialize();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [navigate]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (loading) return;

      setError(null);

      const trimmedIdentifier = identifier.trim();
      const trimmedPassword = password.trim();

      if (!trimmedIdentifier || !trimmedPassword) {
        setError("Bitte fülle beide Felder aus.");
        return;
      }

      setLoading(true);
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ identifier: trimmedIdentifier, password: trimmedPassword }),
        });

        if (response.status === 403) {
          navigate("/setup", { replace: true });
          return;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (response.status === 401 || payload.error === "INVALID_CREDENTIALS") {
            setError("Ungültige Zugangsdaten.");
          } else if (payload.error === "MISSING_CREDENTIALS") {
            setError("Bitte fülle beide Felder aus.");
          } else if (payload.error === "SETUP_REQUIRED") {
            navigate("/setup", { replace: true });
            return;
          } else {
            setError("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
          }
          return;
        }

        await response.json().catch(() => ({}));
        navigate("/dashboard/stacks", { replace: true });
      } catch (err) {
        console.error("⚠️ [Auth] Anmeldung fehlgeschlagen:", err);
        setError("Netzwerkfehler – bitte erneut versuchen.");
      } finally {
        setLoading(false);
      }
    },
    [identifier, password, loading, navigate]
  );

  if (!statusChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Pruefe Anmeldestatus ...</span>
      </div>
    );
  }

  return (
    <section className="m-8 flex gap-4">
      <div className="w-full lg:w-3/5 mt-24">
        <div className="text-center">
          <Typography variant="h2" className="font-bold mb-4">
            Anmelden
          </Typography>
          <Typography
            variant="paragraph"
            color="blue-gray"
            className="text-lg font-normal"
          >
            Gib deine E-Mail oder deinen Benutzernamen sowie dein Passwort ein, um dich anzumelden.
          </Typography>
        </div>
        <form
          className="mt-8 mb-2 mx-auto w-80 max-w-screen-lg lg:w-1/2"
          onSubmit={handleSubmit}
        >
          <div className="mb-1 flex flex-col gap-6">
            <Typography variant="small" color="blue-gray" className="-mb-3 font-medium">
              E-Mail oder Benutzername
            </Typography>
            <Input
              size="lg"
              placeholder="E-Mail oder Benutzername"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              autoFocus
              disabled={loading}
              className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
              labelProps={{
                className: "before:content-none after:content-none",
              }}
            />
            <Typography variant="small" color="blue-gray" className="-mb-3 font-medium">
              Passwort
            </Typography>
            <Input
              type="password"
              size="lg"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
              className=" !border-t-blue-gray-200 focus:!border-t-gray-900"
              labelProps={{
                className: "before:content-none after:content-none",
              }}
            />
          </div>

          {error && (
            <Alert color="red" className="mt-2 border border-red-200 bg-red-50 text-red-700">
              {error}
            </Alert>
          )}

          <Button type="submit" className="mt-6" fullWidth disabled={loading}>
            {loading ? "Anmeldung läuft ..." : "Anmelden"}
          </Button>
        </form>
      </div>
      <div className="w-2/5 h-full hidden lg:block">
        <img src="/img/pattern.png" className="h-full w-full object-cover rounded-3xl" />
      </div>
    </section>
  );
}

export default SignIn;
