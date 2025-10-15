import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Stacks from "./Stacks.jsx";
import Logs from "./Logs.jsx";
import Maintenance from "./Maintenance.jsx";
import logo from "./assets/images/stackpulse.png";
import { useMaintenance } from "./context/MaintenanceContext.jsx";

const navLinkBase =
  "px-4 py-2 rounded-md font-medium transition-colors duration-150";

const getNavClass = ({ isActive }) =>
  `${navLinkBase} ${isActive ? "bg-purple-600 text-white" : "text-gray-300 hover:bg-gray-700"}`;

export default function App() {
  const { maintenance, update } = useMaintenance();
  const maintenanceActive = Boolean(maintenance?.active);
  const maintenanceLabel = maintenance?.message || (update?.running ? "Portainer-Update läuft" : "Wartungsmodus aktiv");

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-gray-500">v0.3</span>
              {maintenanceActive && (
                <span className="flex items-center gap-1 text-xs text-amber-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  {maintenanceLabel}
                </span>
              )}
              <img src={logo} alt="StackPulse" className="h-10 w-auto" />
            </div>
            <nav className="flex gap-2 items-end">
              <NavLink to="/" end className={getNavClass}>
                Stacks
              </NavLink>
              <NavLink to="/maintenance" className={getNavClass}>
                <span className="flex items-center gap-2">
                  Wartung
                  {maintenanceActive && (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                  )}
                </span>
              </NavLink>

              <NavLink to="/logs" className={getNavClass}>
                Logs
              </NavLink>
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<Stacks />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Stacks />} />
        </Routes>
      </main>
    </div>
  );
}
