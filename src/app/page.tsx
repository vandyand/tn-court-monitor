"use client";

import { useState, useEffect, useCallback } from "react";

interface TrackedCase {
  id: number;
  case_number: string;
  case_name: string | null;
  case_url: string | null;
  created_at: string;
}

interface Alert {
  id: number;
  case_number: string;
  case_name: string;
  entries_count: number;
  sent_at: string;
}

export default function Dashboard() {
  const [cases, setCases] = useState<TrackedCase[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [newCaseNumber, setNewCaseNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showMessage = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadData = useCallback(async () => {
    try {
      const [casesRes, settingsRes, alertsRes] = await Promise.all([
        fetch("/api/cases"),
        fetch("/api/settings"),
        fetch("/api/alerts"),
      ]);
      if (casesRes.ok) setCases(await casesRes.json());
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setEmail(settings.alert_email || "");
        setSavedEmail(settings.alert_email || "");
      }
      if (alertsRes.ok) setAlerts(await alertsRes.json());
    } catch {
      // Initial load may fail before DB is set up
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseNumber.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_url: newCaseNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error, "error");
      } else {
        setNewCaseNumber("");
        showMessage(`Added: ${data.case_number} — ${data.case_name}`, "success");
        loadData();
      }
    } catch {
      showMessage("Failed to add case", "error");
    }
    setLoading(false);
  };

  const removeCase = async (id: number) => {
    await fetch("/api/cases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  };

  const saveEmail = async () => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_email: email }),
    });
    if (res.ok) {
      setSavedEmail(email);
      showMessage("Email saved", "success");
    } else {
      showMessage("Failed to save email", "error");
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error, "error");
      } else {
        const newCount = data.results?.reduce(
          (sum: number, r: { new_entries?: number }) => sum + (r.new_entries || 0),
          0
        );
        showMessage(
          `Checked ${data.checked} case(s). ${newCount} new entr${newCount === 1 ? "y" : "ies"} found.`,
          "success"
        );
        loadData();
      }
    } catch {
      showMessage("Check failed", "error");
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">TN Court Docket Monitor</h1>
        <p className="text-gray-500 text-sm mb-8">
          Track Tennessee appellate cases and get email alerts for new docket entries and filings.
        </p>

        {message && (
          <div
            className={`mb-6 p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Email Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Alert Email
          </h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={saveEmail}
              disabled={email === savedEmail}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>

        {/* Add Case */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Add Case
          </h2>
          <form onSubmit={addCase} className="flex gap-2">
            <input
              type="text"
              value={newCaseNumber}
              onChange={(e) => setNewCaseNumber(e.target.value)}
              placeholder="Paste case URL from pch.tncourts.gov"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading || !newCaseNumber.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Search for your case on{" "}
            <a href="https://pch.tncourts.gov/" target="_blank" rel="noopener" className="underline">
              pch.tncourts.gov
            </a>
            , click into it, then paste the URL here.
          </p>
        </div>

        {/* Tracked Cases */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Tracked Cases ({cases.length})
            </h2>
            <button
              onClick={runCheck}
              disabled={checking || cases.length === 0 || !savedEmail}
              className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {checking ? "Checking..." : "Check Now"}
            </button>
          </div>

          {cases.length === 0 ? (
            <p className="text-gray-400 text-sm">No cases tracked yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-mono text-sm font-medium text-gray-900">{c.case_number}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.case_name}</p>
                  </div>
                  <button
                    onClick={() => removeCase(c.id)}
                    className="text-red-400 hover:text-red-600 text-xs ml-4"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Recent Alerts
          </h2>
          {alerts.length === 0 ? (
            <p className="text-gray-400 text-sm">No alerts sent yet.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-mono text-gray-700">{a.case_number}</span>
                    <span className="text-gray-400 ml-2">
                      {a.entries_count} new entr{a.entries_count === 1 ? "y" : "ies"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(a.sent_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Checks run daily. Data from{" "}
          <a href="https://pch.tncourts.gov/" className="underline" target="_blank" rel="noopener">
            pch.tncourts.gov
          </a>
        </p>
      </div>
    </div>
  );
}
