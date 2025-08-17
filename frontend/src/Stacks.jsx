import React, { useEffect, useState } from "react";
import axios from "axios";

export default function Stacks() {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStacks = async () => {
    try {
      const res = await axios.get("/api/stacks");
      const sortedStacks = res.data.sort((a, b) => a.Name.localeCompare(b.Name));
      setStacks(sortedStacks);
    } catch (err) {
      console.error("❌ Fehler beim Abrufen der Stacks:", err);
      setError("Fehler beim Laden der Stacks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStacks();
  }, []);

  const handleRedeploy = async (stackId) => {
    try {
      const confirmRedeploy = window.confirm("Willst du den Stack wirklich redeployen?");
      if (!confirmRedeploy) return;

      const res = await axios.put(`/api/stacks/${stackId}/redeploy`);
      if (res.data.success) {
        alert("✅ Stack erfolgreich redeployed!");
        fetchStacks(); // Optional: Stacks neu laden
      } else {
        alert("⚠️ Redeploy fehlgeschlagen: " + res.data.error);
      }
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      alert("⚠️ Redeploy fehlgeschlagen: " + err.message);
    }
  };

  if (loading) return <p className="text-gray-600">Lade Stacks...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <ul className="space-y-4">
      {stacks.map((stack) => (
        <li
          key={stack.Id}
          className="p-4 bg-white rounded-xl shadow hover:shadow-md transition flex justify-between items-center"
        >
          <div className="flex items-center space-x-4">
            <div className="text-xl">{stack.updateStatus}</div>
            <div>
              <p className="text-lg font-semibold text-gray-800">{stack.Name}</p>
              <p className="text-sm text-gray-500">ID: {stack.Id}</p>
            </div>
          </div>
          <button
            onClick={() => handleRedeploy(stack.Id)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Redeploy
          </button>
        </li>
      ))}
      {stacks.length === 0 && <p className="text-gray-500">Keine Stacks gefunden.</p>}
    </ul>
  );
}
