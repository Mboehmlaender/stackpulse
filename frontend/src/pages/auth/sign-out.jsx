import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, Typography, Spinner } from "@material-tailwind/react";
import { useAuth } from "@/components/AuthProvider.jsx";

export function SignOut() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [status, setStatus] = useState("abmelden...");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const performLogout = async () => {
      try {
        setStatus("Abmeldung läuft …");
        setError(null);
        await logout();
      } catch (err) {
        if (!cancelled) {
          console.error("⚠️ [Auth] Logout fehlgeschlagen:", err);
          setError("Abmeldung fehlgeschlagen. Bitte versuche es erneut.");
        }
      } finally {
        if (!cancelled) {
          navigate("/auth/sign-in", { replace: true });
        }
      }
    };

    performLogout();

    return () => {
      cancelled = true;
    };
  }, [logout, navigate]);

  return (
    <section className="m-8 flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border border-blue-gray-100 shadow-sm">
        <CardBody className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <Spinner className="h-5 w-5 text-blue-gray-500" />
            <Typography color="blue-gray" className="text-sm font-medium">
              {status}
            </Typography>
          </div>
          {error && (
            <Typography color="red" className="text-sm">
              {error}
            </Typography>
          )}
          <Typography className="text-xs text-blue-gray-400">
            Du wirst automatisch weitergeleitet …
          </Typography>
        </CardBody>
      </Card>
    </section>
  );
}

SignOut.displayName = "/src/pages/auth/sign-out.jsx";
