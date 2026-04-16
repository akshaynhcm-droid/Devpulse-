"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function OnboardingPage() {
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = async () => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/progress`);
      const json = await res.json();
      setProgress(json);
    } catch (err) {
      console.error("Failed to fetch onboarding:", err);
    } finally {
      setLoading(false);
    }
  };

  const completeStep = async (step: string) => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (res.ok) fetchProgress();
    } catch (err) {
      console.error("Failed to complete step:", err);
    }
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  const steps = [
    { id: "import_collection", title: "Import a Collection", description: "Import your first API collection to get started" },
    { id: "run_scan", title: "Run a Security Scan", description: "Scan your collection for vulnerabilities" },
    { id: "review_findings", title: "Review Findings", description: "Review and prioritize security findings" },
    { id: "invite_team", title: "Invite Team Members", description: "Add colleagues to collaborate" },
    { id: "setup_compliance", title: "Setup Compliance Reporting", description: "Configure PCI DSS or OWASP reporting" },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Onboarding</h1>
            <p className="text-gray-400 mt-1">Get started with DevPulse in 5 steps</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-6">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`p-6 rounded-lg border ${
                  progress?.[step.id]
                    ? "bg-green-900/20 border-green-500"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`w-6 h-6 rounded-full border-2 ${
                          progress?.[step.id]
                            ? "bg-green-500 border-green-500"
                            : "bg-gray-700 border-gray-600"
                        }`}
                      >
                        {progress?.[step.id] && (
                          <svg className="w-4 h-4 text-white ml-1" fill="none" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-sm text-gray-400">{step.description}</p>
                  </div>
                  {!progress?.[step.id] && (
                    <button
                      onClick={() => completeStep(step.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
