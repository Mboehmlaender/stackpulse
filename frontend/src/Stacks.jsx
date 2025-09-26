import React, { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

export default function Stacks() {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
const socket = io("/", {
  path: "/socket.io",
  transports: ["websocket"]
});
    console.log("🔌 Socket connected");

    socket.on("redeployStatus", async ({ stackId, status }) => {
      console.log(`🔄 Stack ${stackId} Redeploy Status: ${status ? "running" : "finished"}`);

      if (!status) {
        // Status nach Redeploy neu vom Server holen
        try {
          const res = await axios.get("/api/stacks");
          setStacks(res.data.sort((a, b) => a.Name.localeCompare(b.Name)));
        } catch (err) {
          console.error("Fehler beim Aktualisieren nach Redeploy:", err);
        }
      } else {
        // UI direkt auf redeploying setzen
        setStacks(prev =>
          prev.map(stack =>
            stack.Id === stackId ? { ...stack, redeploying: true } : stack
          )
        );
      }
    });

    return () => socket.disconnect();
  }, []);

  const fetchStacks = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/stacks");
      setStacks(res.data.map(stack => ({ ...stack, redeploying: stack.redeploying || false })));
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
    setStacks(prev =>
      prev.map(stack => stack.Id === stackId ? { ...stack, redeploying: true } : stack)
    );

    try {
      await axios.put(`/api/stacks/${stackId}/redeploy`);
      // Socket.IO Event aktualisiert Status automatisch
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      setStacks(prev =>
        prev.map(stack => stack.Id === stackId ? { ...stack, redeploying: false } : stack)
      );
    }
  };

  const handleRedeployAll = async () => {
    setStacks(prev => prev.map(stack => ({ ...stack, redeploying: true })));

    try {
      await axios.put("/api/stacks/redeploy-all");
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy ALL:", err);
      setStacks(prev => prev.map(stack => ({ ...stack, redeploying: false })));
    }
  };

  if (loading) return <p className="text-gray-400">Lade Stacks...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-end mb-4">
        <button
          onClick={handleRedeployAll}
          className="px-5 py-2 rounded-lg font-medium transition bg-purple-500 hover:bg-purple-600"
        >
          Redeploy All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stacks.map(stack => {
          const isRedeploying = stack.redeploying;

          return (
            <div
              key={stack.Id}
              className={`flex justify-between items-center p-5 rounded-xl shadow-lg transition
                ${isRedeploying ? "bg-gray-700 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-700"}`}
            >
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 flex items-center justify-center rounded-full
                  ${stack.updateStatus === "✅" ? "bg-green-500" :
                    stack.updateStatus === "⚠️" ? "bg-yellow-500" :
                    "bg-red-500"}`}
                />
                <div>
                  <p className="text-lg font-semibold text-white">{stack.Name}</p>
                  <p className="text-sm text-gray-400">ID: {stack.Id}</p>
                </div>
              </div>

              <button
                onClick={() => handleRedeploy(stack.Id)}
                disabled={isRedeploying}
                className={`px-5 py-2 rounded-lg font-medium transition
                  ${isRedeploying ? "bg-orange-500 cursor-not-allowed" :
                    "bg-blue-500 hover:bg-blue-600"}`}
              >
                {isRedeploying ? "Redeploying" : "Redeploy"}
              </button>
            </div>
          );
        })}
        {stacks.length === 0 && <p className="text-gray-400">Keine Stacks gefunden.</p>}
      </div>
    </div>
  );
}
