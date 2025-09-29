import React, { useEffect, useState } from "react";
import axios from "axios";

const STATUS_COLORS = {
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400"
};

const formatTimestamp = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get("/api/logs", {
        params: { limit: 200 }
      });
      setLogs(response.data);
    } catch (err) {
      console.error("❌ Fehler beim Laden der Logs:", err);
      setError("Fehler beim Laden der Redeploy-Logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) {
    return <p className="text-gray-400">Lade Logs...</p>;
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/40 text-red-300 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Redeploy-Logs</h2>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 rounded-md font-medium transition bg-purple-500 hover:bg-purple-600"
        >
          Aktualisieren
        </button>
      </div>

      <div className="overflow-x-auto bg-gray-800/60 rounded-xl border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr className="text-left text-sm uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Zeitpunkt</th>
              <th className="px-4 py-3">Stack</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Nachricht</th>
              <th className="px-4 py-3">Endpoint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 text-sm">
            {logs.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-6 text-center text-gray-400">
                  Keine Logs vorhanden.
                </td>
              </tr>
            )}
            {logs.map((log) => {
              const statusClass = STATUS_COLORS[log.status] || "text-blue-300";
              return (
                <tr key={log.id} className="hover:bg-gray-700/40">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    <div className="flex flex-col">
                      <span className="font-medium">{log.stackName || "Unbekannt"}</span>
                      <span className="text-xs text-gray-400">ID: {log.stackId}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${statusClass}`}>
                    {log.status}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {log.message || "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {log.endpoint ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
