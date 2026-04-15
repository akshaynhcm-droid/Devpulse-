"use client";
import { useEffect, useState } from "react";
import RiskChart from "../../components/RiskChart";

interface Message {
  type: string;
  total_cost?: number;
  cost?: number;
  agent_id?: string;
  anomaly?: boolean;
  model?: string;
}

interface LogEntry {
  time: string;
  agent: string;
  cost: number;
  anomaly: boolean;
  model?: string;
}

export default function Dashboard() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [anomalyActive, setAnomalyActive] = useState(false);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Connected to DevPulse Core");
      setConnected(true);
      setSocket(ws);
    };

    ws.onmessage = event => {
      try {
        const msg: Message = JSON.parse(event.data);

        if (msg.type === "cost_update") {
          setTotalCost(msg.total_cost || 0);
          const newLog: LogEntry = {
            time: new Date().toLocaleTimeString(),
            agent: msg.agent_id || "unknown",
            cost: msg.cost || 0,
            anomaly: msg.anomaly || false,
            model: msg.model,
          };
          setLogs(prev => [newLog, ...prev].slice(0, 50));
          if (msg.anomaly) setAnomalyActive(true);
        } else if (msg.type === "init") {
          setTotalCost(msg.total_cost || 0);
        }
      } catch (e) {
        console.error("Failed to parse message", e);
      }
    };

    ws.onerror = error => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      setConnected(false);
      setSocket(null);
    };

    return () => {
      ws.close();
    };
  }, []);

  const triggerTestCall = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/agent/interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: "test-agent-" + Math.floor(Math.random() * 100),
          model: "gpt-4",
          prompt_tokens: Math.floor(Math.random() * 2000),
          completion_tokens: Math.floor(Math.random() * 1000),
        }),
      });
      const data = await response.json();
      console.log("Test call result:", data);
    } catch (e) {
      console.error("Failed to call API:", e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">
              DevPulse Command Center
            </h1>
            <p className="text-gray-400 mt-1">
              Real-time AI Agent Cost Monitoring & Security
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-sm text-gray-400">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              Total LLM Spend
            </h3>
            <p className="text-4xl font-bold mt-2 text-green-400">
              ${totalCost.toFixed(4)}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Lifetime accumulated cost
            </p>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              Active Agents
            </h3>
            <p className="text-4xl font-bold mt-2 text-blue-400">
              {new Set(logs.map(l => l.agent)).size}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Unique agents this session
            </p>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              API Calls
            </h3>
            <p className="text-4xl font-bold mt-2 text-purple-400">
              {logs.length}
            </p>
            <p className="text-xs text-gray-500 mt-2">Total API interactions</p>
          </div>

          {anomalyActive && (
            <div className="md:col-span-3 bg-red-900/30 p-6 rounded-lg border border-red-500">
              <h3 className="text-red-400 font-bold text-lg">
                Anomaly Detected
              </h3>
              <p className="text-red-200 text-sm">
                Cost spike observed in recent agent activity. Review logs below.
              </p>
            </div>
          )}
        </div>

        <RiskChart />

        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Live Agent Activity</h2>
            <button
              onClick={triggerTestCall}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
            >
              Simulate API Call
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No activity yet. Click "Simulate API Call" to test.
              </p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-gray-700/50 p-3 rounded hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-blue-300 font-mono text-sm">
                      {log.agent}
                    </span>
                    {log.model && (
                      <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-600 rounded">
                        {log.model}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm">{log.time}</span>
                    <span
                      className={
                        log.anomaly
                          ? "text-red-400 font-bold"
                          : "text-green-400"
                      }
                    >
                      ${log.cost.toFixed(5)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
