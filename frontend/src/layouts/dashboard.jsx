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
import { SecurityPhrase } from "@/pages/dashboard/securityPhrase.jsx";
import { useMaterialTailwindController, setOpenConfigurator } from "@/components";
import { useAuth } from "@/components/AuthProvider.jsx";
import PermissionGate from "@/components/PermissionGate.jsx";

export function Dashboard() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType } = controller;
  const location = useLocation();
  const navigate = useNavigate();
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupIncomplete, setSetupIncomplete] = useState(true);
  const {
    initialized: authInitialized,
    loading: authLoading,
    isAuthenticated,
    refreshSession,
    user
  } = useAuth();

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

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  useEffect(() => {
    if (!setupChecked || setupIncomplete) return;
    if (authInitialized || authLoading) return;
    refreshSession();
  }, [setupChecked, setupIncomplete, authInitialized, authLoading, refreshSession]);

  useEffect(() => {
    if (!setupChecked) return;

    if (setupIncomplete) {
      if (location.pathname !== "/setup") {
        navigate("/setup", { replace: true });
      }
      return;
    }

    if (!authInitialized) return;

    if (!isAuthenticated) {
      if (location.pathname !== "/auth/sign-in") {
        navigate("/auth/sign-in", { replace: true });
      }
      return;
    }

    const requiresSecurityPhrase = Boolean(user?.requiresSecurityPhraseDownload);
    const isSecurityPhrasePath = location.pathname === "/dashboard/security-phrase";

    if (requiresSecurityPhrase && !isSecurityPhrasePath) {
      navigate("/dashboard/security-phrase", { replace: true });
      return;
    }

    if (!requiresSecurityPhrase && isSecurityPhrasePath) {
      navigate("/dashboard/stacks", { replace: true });
    }
  }, [
    setupChecked,
    setupIncomplete,
    authInitialized,
    isAuthenticated,
    location.pathname,
    navigate,
    user?.requiresSecurityPhraseDownload
  ]);

  useEffect(() => {
    if (!setupChecked || setupIncomplete) return;
    if (!authInitialized || authLoading) return;

    if (!isAuthenticated) {
      if (location.pathname !== "/auth/sign-in") {
        navigate("/auth/sign-in", { replace: true });
      }
      return;
    }

    const isAuthPath = location.pathname.startsWith("/auth/");
    const isLogoutPath = location.pathname === "/auth/logout";

    if (location.pathname === "/setup" || (isAuthPath && !isLogoutPath)) {
      navigate("/dashboard/stacks", { replace: true });
    }
  }, [
    setupChecked,
    setupIncomplete,
    authInitialized,
    authLoading,
    isAuthenticated,
    location.pathname,
    navigate
  ]);

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

  if (!authInitialized || authLoading) {
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

  const isSecurityPhraseRoute = location.pathname === "/dashboard/security-phrase";

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      {!isSecurityPhraseRoute && (
        <Sidenav
          routes={routes}
          brandImg={
            sidenavType === "dark" ? "/img/logo-ct.png" : "/img/logo-ct-dark.png"
          }
        />
      )}
      <div className={isSecurityPhraseRoute ? "" : "p-4 xl:ml-80"}>
        {!isSecurityPhraseRoute && (
          <>
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
          </>
        )}
        <Routes>
          {routes.map(
            ({ layout, pages }) =>
              layout === "dashboard" &&
              pages.map(({ path, element }) => (
                <Route exact path={path} element={element} />
              ))
          )}
          <Route path="security-phrase" element={<SecurityPhrase />} />
          <Route
            path="users/:userId"
            element={
              <PermissionGate permission="users-access" requiredLevel="read">
                <UserDetails />
              </PermissionGate>
            }
          />
          <Route
            path="usergroups/:groupId"
            element={
              <PermissionGate permission="user-groups-access" requiredLevel="read">
                <UserGroupDetail />
              </PermissionGate>
            }
          />
        </Routes>
        {!isSecurityPhraseRoute && (
          <div className="text-blue-gray-600">
            <Footer />
          </div>
        )}
      </div>
    </div>
  );
}

Dashboard.displayName = "/src/layout/dashboard.jsx";

export default Dashboard;
