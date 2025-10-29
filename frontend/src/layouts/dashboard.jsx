import { useEffect, useState, useCallback } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { IconButton } from "@material-tailwind/react";
import {
  Sidenav,
  DashboardNavbar,
  Configurator,
  Footer,
} from "@/widgets/layout";
import routes from "@/routes";
import { UserDetails } from "@/pages/dashboard/userDetails.jsx";
import { UserGroupDetail } from "@/pages/dashboard/userGroupDetail.jsx";
import { useMaterialTailwindController, setOpenConfigurator } from "@/components";

export function Dashboard() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType } = controller;
  const location = useLocation();
  const navigate = useNavigate();
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupIncomplete, setSetupIncomplete] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkSetupStatus = useCallback(async () => {
    setSetupChecked(false);
    try {
      const response = await fetch("/api/setup/status", { credentials: "include" });
      if (!response.ok) {
        throw new Error("STATUS_REQUEST_FAILED");
      }
      const data = await response.json();
      setSetupIncomplete(!data.setupComplete);
    } catch (error) {
      console.error("⚠️ [Setup] Statusprüfung fehlgeschlagen:", error);
      setSetupIncomplete(true);
    } finally {
      setSetupChecked(true);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setAuthChecked(false);
    try {
      const response = await fetch("/api/auth/session", { credentials: "include" });
      if (response.status === 403) {
        setSetupIncomplete(true);
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) {
        setIsAuthenticated(false);
        return;
      }
      const data = await response.json();
      setIsAuthenticated(Boolean(data?.user));
    } catch (error) {
      console.error("⚠️ [Auth] Sessionprüfung fehlgeschlagen:", error);
      setIsAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, [setSetupIncomplete, setIsAuthenticated, setAuthChecked]);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  useEffect(() => {
    if (!setupChecked || setupIncomplete) return;
    checkSession();
  }, [setupChecked, setupIncomplete, checkSession]);

  useEffect(() => {
    if (!setupChecked) return;

    if (setupIncomplete) {
      if (location.pathname !== "/setup") {
        navigate("/setup", { replace: true });
      }
      return;
    }

    if (!authChecked) return;

    if (!isAuthenticated) {
      if (location.pathname !== "/auth/sign-in") {
        navigate("/auth/sign-in", { replace: true });
      }
      return;
    }

    if (location.pathname === "/setup" || location.pathname.startsWith("/auth/")) {
      navigate("/dashboard/stacks", { replace: true });
    }
  }, [setupChecked, setupIncomplete, authChecked, isAuthenticated, location.pathname, navigate]);

  if (!setupChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Pruefe Systemkonfiguration ...</span>
      </div>
    );
  }

  if (setupIncomplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Setup erforderlich ...</span>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Pruefe Anmeldung ...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Weiterleitung zur Anmeldung ...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      <Sidenav
        routes={routes}
        brandImg={
          sidenavType === "dark" ? "/img/logo-ct.png" : "/img/logo-ct-dark.png"
        }
      />
      <div className="p-4 xl:ml-80">
        <DashboardNavbar />
        <Configurator />
        <IconButton
          size="lg"
          color="white"
          className="fixed bottom-8 right-8 z-40 rounded-full shadow-blue-gray-900/10 xl:hidden"
          ripple={false}
          onClick={() => setOpenConfigurator(dispatch, true)}
        >
          <Cog6ToothIcon className="h-5 w-5" />
        </IconButton>
        <Routes>
          {routes.map(
            ({ layout, pages }) =>
              layout === "dashboard" &&
              pages.map(({ path, element }) => (
                <Route exact path={path} element={element} />
              ))
          )}
          <Route path="users/:userId" element={<UserDetails />} />
          <Route path="usergroups/:groupId" element={<UserGroupDetail />} />
        </Routes>
        <div className="text-blue-gray-600">
          <Footer />
        </div>
      </div>
    </div>
  );
}

Dashboard.displayName = "/src/layout/dashboard.jsx";

export default Dashboard;
