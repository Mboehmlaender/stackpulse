import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Stacks from "./Stacks.jsx";
import Logs from "./Logs.jsx";

const navLinkBase =
  "px-4 py-2 rounded-md font-medium transition-colors duration-150";

const getNavClass = ({ isActive }) =>
  `${navLinkBase} ${isActive ? "bg-purple-600 text-white" : "text-gray-300 hover:bg-gray-700"}`;

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">StackPulse</h1>
              <p className="text-gray-400 mt-1">Verwalte deine Docker Stacks</p>
            </div>
            <nav className="flex gap-2">
              <NavLink to="/" end className={getNavClass}>
                Stacks
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
          <Route path="/logs" element={<Logs />} />
          <Route path="*" element={<Stacks />} />
        </Routes>
      </main>
    </div>
  );
}
