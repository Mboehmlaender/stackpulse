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
import { useMaterialTailwindController, setOpenConfigurator } from "@/components";

export function Dashboard() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType } = controller;
  const location = useLocation();
  const navigate = useNavigate();
  const [superuserRequired, setSuperuserRequired] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);

  const checkSuperuserStatus = useCallback(async () => {
    setStatusChecked(false);
    try {
      const response = await fetch("/api/auth/superuser/status");
      if (!response.ok) {
        throw new Error("STATUS_REQUEST_FAILED");
      }
      const data = await response.json();
      setSuperuserRequired(!data.exists);
    } catch (error) {
      console.error("⚠️ [Superuser] Statusprüfung fehlgeschlagen:", error);
      setSuperuserRequired(true);
    } finally {
      setStatusChecked(true);
    }
  }, []);

  useEffect(() => {
    checkSuperuserStatus();
  }, [checkSuperuserStatus]);

  useEffect(() => {
    if (!statusChecked) return;
    if (superuserRequired) {
      if (location.pathname !== "/auth/regsuperuser") {
        navigate("/auth/regsuperuser", { replace: true });
      }
    } else if (location.pathname === "/auth/regsuperuser") {
      navigate("/dashboard/stacks", { replace: true });
    }
  }, [superuserRequired, statusChecked, location.pathname, navigate]);

  if (!statusChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Lade Systemstatus ...</span>
      </div>
    );
  }

  if (superuserRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <span className="text-blue-gray-500">Superuser-Einrichtung erforderlich ...</span>
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
