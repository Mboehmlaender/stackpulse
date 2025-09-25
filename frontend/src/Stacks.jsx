import React, { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

export default function Stacks() {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redeploying, setRedeploying] = useState({});

  // WebSocket initialisieren
  useEffect(() => {
    const socket = io("/");
    console.log("Socket connected");

    socket.on("redeployStatus", async ({ stackId, status }) => {
      setRedeploying(prev => ({ ...prev, [stackId]: status }));

      // Wenn Redeploy beendet, Stack-Status neu laden
      if (!status) {
        try {
          const res = await axios.get("/api/stacks");
          const sortedStacks = res.data.sort((a, b) => a.Name.localeCompare(b.Name));
          setStacks(sortedStacks);
        } catch (err) {
          console.error("Fehler beim Aktualisieren des Status nach Redeploy:", err);
        }
      }
    });

    return () => socket.disconnect();
  }, []);

  // Stacks initial laden
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

  // Redeploy eines Stacks
  const handleRedeploy = async (stackId) => {
    setRedeploying(prev => ({ ...prev, [stackId]: true }));

    try {
      await axios.put(`/api/stacks/${stackId}/redeploy`);
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      setRedeploying(prev => ({ ...prev, [stackId]: false }));
    }
  };

  if (loading) return <p className="text-gray-400">Lade Stacks...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
      {stacks.map(stack => {
        const isRedeploying = redeploying[stack.Id] || false;
        const isUpToDate = stack.updateStatus === "✅";

        return (
          <div
            key={stack.Id}
            className={`flex justify-between items-center p-5 rounded-xl shadow-lg transition
              ${isRedeploying ? "bg-gray-700 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-700"}`}
          >
            <div className="flex items-center space-x-4">
              {/* Status Indicator */}
              <div className={`w-12 h-12 flex items-center justify-center rounded-full
                ${stack.updateStatus === "✅" ? "bg-green-500" :
                  stack.updateStatus === "⚠️" ? "bg-yellow-500" :
                  "bg-red-500"}`}
              >
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{stack.Name}</p>
                <p className="text-sm text-gray-400">ID: {stack.Id}</p>
              </div>
            </div>

            {!isUpToDate && (
              <button
                onClick={() => handleRedeploy(stack.Id)}
                disabled={isRedeploying}
                className={`px-5 py-2 rounded-lg font-medium transition
                  ${isRedeploying ? "bg-orange-500 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"}`}
              >
                {isRedeploying ? "Redeploying" : "Redeploy"}
              </button>
            )}
          </div>
        );
      })}
      {stacks.length === 0 && <p className="text-gray-400">Keine Stacks gefunden.</p>}
    </div>
  );
}
