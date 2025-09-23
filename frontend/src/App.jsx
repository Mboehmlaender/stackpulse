import React from "react";
import Stacks from "./Stacks.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="p-6 bg-gray-800 shadow-md">
        <h1 className="text-2xl font-bold text-white">StackPulse</h1>
        <p className="text-gray-400 mt-1">Verwalte deine Docker Stacks</p>
      </header>
      <main className="p-6">
        <Stacks />
      </main>
    </div>
  );
}
