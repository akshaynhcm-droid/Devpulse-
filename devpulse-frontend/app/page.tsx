"use client";
import Link from "next/link";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans">
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-blue-500">DevPulse</div>
        <div className="space-x-4">
          <a
            href={`${APP_URL}/dashboard`}
            className="hover:text-blue-400 transition-colors"
          >
            Dashboard
          </a>
          <a
            href={`${APP_URL}/pricing`}
            className="hover:text-blue-400 transition-colors"
          >
            Pricing
          </a>
          <a
            href={`${APP_URL}/api/oauth/login`}
            className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Get Started
          </a>
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
          <a
            href={`${APP_URL}/api/oauth/login`}
            className="bg-white text-slate-900 px-8 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors"
          >
            Start Free Trial
          </a>
          <a
            href={`${APP_URL}/dashboard`}
            className="border border-gray-600 px-8 py-3 rounded-lg hover:border-white transition-colors"
          >
            View Demo
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 px-4 pb-24">
        <FeatureCard
          title="AgentGuard"
          desc="Stops infinite loops and budget bleeds instantly with kill switch."
        />
        <FeatureCard
          title="Shadow API Detection"
          desc="Finds undocumented endpoints in your codebase automatically."
        />
        <FeatureCard
          title="Cost Forecasting"
          desc="Predict your AI spend before the invoice arrives."
        />
        <FeatureCard
          title="Real-time Monitoring"
          desc="Live dashboard with cost anomaly detection and alerts."
        />
        <FeatureCard
          title="Compliance Reports"
          desc="PCI DSS & OWASP compliance reporting with export."
        />
        <FeatureCard
          title="Enterprise Ready"
          desc="MySQL, Docker, Razorpay payments, and production-grade security."
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-24">
        <h2 className="text-3xl font-bold text-center mb-8">Simple, Transparent Pricing</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <h3 className="text-xl font-bold mb-2">Free</h3>
            <p className="text-3xl font-bold mb-4">₹0<span className="text-sm text-gray-400">/mo</span></p>
            <p className="text-gray-400 text-sm">3 collections, basic scanning, 1 team member</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-blue-500">
            <h3 className="text-xl font-bold mb-2 text-blue-400">Pro</h3>
            <p className="text-3xl font-bold mb-4">₹999<span className="text-sm text-gray-400">/mo</span></p>
            <p className="text-gray-400 text-sm">Unlimited collections, full scanning, 10 team members</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl border border-purple-500">
            <h3 className="text-xl font-bold mb-2 text-purple-400">Enterprise</h3>
            <p className="text-3xl font-bold mb-4">₹4,999<span className="text-sm text-gray-400">/mo</span></p>
            <p className="text-gray-400 text-sm">Everything in Pro + SSO, SLA, dedicated support</p>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800 py-8 text-center text-gray-500">
        <div className="space-x-4 mb-4">
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        </div>
        <p>&copy; {new Date().getFullYear()} DevPulse Inc. All rights reserved.</p>
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
