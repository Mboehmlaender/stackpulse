import PropTypes from "prop-types";
import { useEffect, useState } from "react";
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

export function RegSuperuser({ onCompleted }) {
  const navigate = useNavigate();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const verifyStatus = async () => {
      try {
        const response = await fetch("/api/auth/superuser/status", { signal: controller.signal });
        if (!response.ok) {
          throw new Error("STATUS_REQUEST_FAILED");
        }
        const data = await response.json();
        if (data.exists && isActive) {
          navigate("/dashboard/stacks", { replace: true });
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("⚠️ [Superuser] Statusabfrage fehlgeschlagen:", err);
        }
      } finally {
        if (isActive) {
          setCheckingStatus(false);
        }
      }
    };

    verifyStatus();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/superuser/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        switch (payload.error) {
          case "MISSING_FIELDS":
            throw new Error("Bitte alle Felder ausfüllen.");
          case "USERNAME_REQUIRED":
            throw new Error("Benutzername darf nicht leer sein.");
          case "EMAIL_INVALID":
            throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
          case "PASSWORD_TOO_SHORT":
            throw new Error("Passwort muss mindestens 8 Zeichen enthalten.");
          case "SUPERUSER_EXISTS":
            throw new Error("Superuser existiert bereits.");
          default:
            throw new Error("Registrierung fehlgeschlagen. Bitte erneut versuchen.");
        }
      }

      setSuccess(true);
      if (typeof onCompleted === "function") {
        onCompleted();
      } else {
        navigate("/dashboard/stacks", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Pruefe Superuser-Status ...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center py-10">
      <Card className="w-full max-w-lg border border-blue-gray-100 shadow-sm">
        <CardHeader
          floated={false}
          shadow={false}
          className="mb-0 grid place-items-start gap-2 rounded-none bg-transparent p-6"
        >
          <Typography variant="h4" color="blue-gray">
            Superuser anlegen
          </Typography>
          <Typography color="gray" className="font-normal">
            Lege den ersten Benutzer deines Systems an. Dieser verfügt über uneingeschränkte Rechte
            und kann später weitere Benutzer verwalten.
          </Typography>
        </CardHeader>
        <CardBody className="pt-0">
          <form className="mt-4 flex flex-col gap-6" onSubmit={handleSubmit}>
            <Input
              label="Benutzername"
              value={form.username}
              onChange={handleChange("username")}
              required
              disabled={loading || success}
            />
            <Input
              label="E-Mail-Adresse"
              type="email"
              value={form.email}
              onChange={handleChange("email")}
              required
              disabled={loading || success}
            />
            <Input
              label="Passwort"
              type="password"
              value={form.password}
              onChange={handleChange("password")}
              required
              disabled={loading || success}
            />

            {error && (
              <Alert color="red" className="border border-red-200 bg-red-50 text-red-700">
                {error}
              </Alert>
            )}

            {success && (
              <Alert color="green" className="border border-green-200 bg-green-50 text-green-700">
                Superuser wurde erfolgreich angelegt. Du wirst gleich weitergeleitet.
              </Alert>
            )}

            <Button type="submit" color="blue" disabled={loading || success}>
              {loading ? "Wird angelegt..." : "Superuser erstellen"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

RegSuperuser.propTypes = {
  onCompleted: PropTypes.func,
};

RegSuperuser.defaultProps = {
  onCompleted: undefined,
};

export default RegSuperuser;
