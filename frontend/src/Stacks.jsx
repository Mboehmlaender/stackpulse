import React, { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";

export default function Stacks() {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStackIds, setSelectedStackIds] = useState([]);

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
          const sortedStacks = [...res.data].sort((a, b) => a.Name.localeCompare(b.Name));
          setStacks(sortedStacks.map(stack => ({ ...stack, redeploying: stack.redeploying || false })));
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
      const sortedStacks = [...res.data].sort((a, b) => a.Name.localeCompare(b.Name));
      setStacks(sortedStacks.map(stack => ({ ...stack, redeploying: stack.redeploying || false })));
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

  useEffect(() => {
    setSelectedStackIds(prev => {
      const filtered = prev.filter(id => {
        const match = stacks.find(stack => stack.Id === id);
        return match && match.updateStatus !== '✅';
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [stacks]);

  const toggleStackSelection = (stackId, disabled) => {
    if (disabled) return;
    setSelectedStackIds(prev =>
      prev.includes(stackId)
        ? prev.filter(id => id !== stackId)
        : [...prev, stackId]
    );
  };

  const handleRedeploy = async (stackId) => {
    setSelectedStackIds((prev) => prev.filter((id) => id !== stackId));
    setStacks((prev) =>
      prev.map((stack) =>
        stack.Id === stackId ? { ...stack, redeploying: true } : stack
      )
    );

    try {
      await axios.put(`/api/stacks/${stackId}/redeploy`);
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy:", err);
      setStacks((prev) =>
        prev.map((stack) =>
          stack.Id === stackId ? { ...stack, redeploying: false } : stack
        )
      );
    }
  };

  const handleRedeployAll = async () => {
    const outdatedStacks = stacks.filter((stack) => stack.updateStatus !== '✅');
    if (!outdatedStacks.length) return;

    const outdatedIds = new Set(outdatedStacks.map((stack) => stack.Id));

    setStacks(prev =>
      prev.map(stack =>
        outdatedIds.has(stack.Id)
          ? { ...stack, redeploying: true }
          : stack
      )
    );

    try {
      await axios.put("/api/stacks/redeploy-all");
      setSelectedStackIds((prev) => prev.filter((id) => !outdatedIds.has(id)));
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy ALL:", err);
      setStacks(prev =>
        prev.map(stack =>
          outdatedIds.has(stack.Id)
            ? { ...stack, redeploying: false }
            : stack
        )
      );
    }
  };

  const handleRedeploySelection = async () => {
    if (!selectedStackIds.length) return;

    const eligibleIds = selectedStackIds.filter((id) => {
      const stack = stacks.find((entry) => entry.Id === id);
      return stack && stack.updateStatus !== '✅';
    });

    if (!eligibleIds.length) {
      setSelectedStackIds([]);
      return;
    }

    const eligibleSet = new Set(eligibleIds);

    setStacks(prev =>
      prev.map(stack =>
        eligibleSet.has(stack.Id)
          ? { ...stack, redeploying: true }
          : stack
      )
    );

    try {
      await axios.put("/api/stacks/redeploy-selection", { stackIds: eligibleIds });
      setSelectedStackIds((prev) => prev.filter((id) => !eligibleSet.has(id)));
      // Statusupdates kommen über Socket.IO
    } catch (err) {
      console.error("❌ Fehler beim Redeploy Auswahl:", err);
      setStacks(prev =>
        prev.map(stack =>
          eligibleSet.has(stack.Id)
            ? { ...stack, redeploying: false }
            : stack
        )
      );
    }
  };

  const hasSelection = selectedStackIds.length > 0;
  const hasOutdatedStacks = stacks.some((stack) => stack.updateStatus !== '✅');
  const bulkButtonLabel = hasSelection
    ? `Redeploy Auswahl (${selectedStackIds.length})`
    : 'Redeploy All';

  const bulkActionDisabled = hasSelection
    ? selectedStackIds.length === 0 || selectedStackIds.every(id => {
        const targetStack = stacks.find(stack => stack.Id === id);
        return !targetStack || targetStack.redeploying || targetStack.updateStatus === '✅';
      })
    : !hasOutdatedStacks || stacks.every(stack => stack.updateStatus !== '✅' || stack.redeploying);

  const handleBulkRedeploy = () => {
    if (hasSelection) {
      handleRedeploySelection();
    } else {
      handleRedeployAll();
    }
  };

  if (loading) return <p className="text-gray-400">Lade Stacks...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-end mb-4">
        <button
          onClick={handleBulkRedeploy}
          disabled={bulkActionDisabled}
          className={`px-5 py-2 rounded-lg font-medium transition ${bulkActionDisabled ? 'bg-purple-900 cursor-not-allowed text-gray-400' : 'bg-purple-500 hover:bg-purple-600'}`}
        >
          {bulkButtonLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stacks.map(stack => {
          const isRedeploying = stack.redeploying;
          const isSelected = selectedStackIds.includes(stack.Id);
          const isCurrent = stack.updateStatus === '✅';
          const isSelectable = !isRedeploying && !isCurrent;

          return (
            <div
              key={stack.Id}
              className={`flex justify-between items-center p-5 rounded-xl shadow-lg transition border
                ${isSelected ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-transparent'}
                ${isRedeploying ? 'bg-gray-700 cursor-wait' : 'bg-gray-800 hover:bg-gray-700'}
                ${!isSelectable && !isRedeploying ? 'opacity-75' : ''}`}
            >
              <div className="flex items-center space-x-4">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleStackSelection(stack.Id, !isSelectable)}
                  className={`h-5 w-5 text-purple-500 focus:ring-purple-400 border-gray-600 bg-gray-900 rounded ${!isSelectable ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={!isSelectable}
                />
                <div className={`w-12 h-12 flex items-center justify-center rounded-full
                  ${stack.updateStatus === '✅' ? 'bg-green-500' :
                    stack.updateStatus === '⚠️' ? 'bg-yellow-500' :
                    'bg-red-500'}`}
                />
                <div>
                  <p className="text-lg font-semibold text-white">{stack.Name}</p>
                  <p className="text-sm text-gray-400">ID: {stack.Id}</p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 text-sm">
                {isRedeploying ? (
                  <>
                    <span className="text-xs uppercase tracking-wide text-orange-300">Redeploy</span>
                    <span className="text-orange-200">läuft…</span>
                  </>
                ) : isCurrent ? (
                  <>
                    <span className="text-xs uppercase tracking-wide text-gray-400">Status</span>
                    <span className="text-green-300">Aktuell</span>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleRedeploy(stack.Id)}
                      disabled={isRedeploying}
                      className="px-5 py-2 rounded-lg font-medium transition bg-blue-500 hover:bg-blue-600"
                    >
                      Redeploy
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {stacks.length === 0 && <p className="text-gray-400">Keine Stacks gefunden.</p>}
      </div>
    </div>
  );
}
