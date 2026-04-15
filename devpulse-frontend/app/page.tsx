"use client";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-blue-500">DevPulse</div>
        <div className="space-x-4">
          <Link
            href="/dashboard"
            className="hover:text-blue-400 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard"
            className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <div className="text-center py-24 px-4">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
          Secure Your AI Agents
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          Real-time security scanning, cost anomaly detection, and PII redaction
          for production LLM applications.
        </p>
        <div className="flex justify-center space-x-4">
          <Link
            href="/dashboard"
            className="bg-white text-slate-900 px-8 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors"
          >
            View Demo
          </Link>
          <a
            href="#docs"
            className="border border-gray-600 px-8 py-3 rounded-lg hover:border-white transition-colors"
          >
            Documentation
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 px-4 pb-24">
        <FeatureCard
          title="AgentGuard"
          desc="Stops infinite loops and budget bleeds instantly."
        />
        <FeatureCard
          title="Shadow API Detection"
          desc="Finds undocumented endpoints in your codebase."
        />
        <FeatureCard
          title="Cost Forecasting"
          desc="Predict your AI spend before the invoice arrives."
        />
        <FeatureCard
          title="Real-time Monitoring"
          desc="Live WebSocket dashboard for immediate insights."
        />
        <FeatureCard
          title="VS Code Integration"
          desc="Inline security warnings directly in your editor."
        />
        <FeatureCard
          title="Enterprise Ready"
          desc="PostgreSQL, Docker, and production-grade security."
        />
      </div>

      <footer className="border-t border-slate-800 py-8 text-center text-gray-500">
        <p>&copy; 2024 DevPulse Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 hover:border-blue-500 transition-colors">
      <h3 className="text-xl font-bold mb-2 text-blue-400">{title}</h3>
      <p className="text-gray-400">{desc}</p>
    </div>
  );
}
