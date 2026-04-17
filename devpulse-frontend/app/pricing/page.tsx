"use client";
import Link from "next/link";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Pricing</h1>
            <p className="text-gray-400 mt-1">
              Choose the plan that fits your needs
            </p>
          </div>
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            &larr; Home
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-gray-800 p-8 rounded-lg border border-gray-700">
            <h2 className="text-2xl font-bold mb-2">Free</h2>
            <p className="text-4xl font-bold mb-6">$0/month</p>
            <ul className="space-y-3 mb-8 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> 1 API Collection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Basic Security
                Scanning
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Community Support
              </li>
            </ul>
            <button className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors">
              Get Started
            </button>
          </div>

          <div className="bg-gray-800 p-8 rounded-lg border border-blue-500">
            <div className="text-blue-400 text-sm font-semibold mb-2">
              POPULAR
            </div>
            <h2 className="text-2xl font-bold mb-2">Pro</h2>
            <p className="text-4xl font-bold mb-6">$29/month</p>
            <ul className="space-y-3 mb-8 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Unlimited Collections
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Advanced Security
                Scanning
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Shadow API Detection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Compliance Reports
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Kill Switch & Budget
                Mgmt
              </li>
              <li className="flex items-center gap-2">
                <span className="text green400">✓</span> Team Collaboration (10
                members)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Priority Support
              </li>
            </ul>
            <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors">
              Get Started
            </button>
          </div>

          <div className="bg-gray-800 p-8 rounded-lg border border-purple-500">
            <div className="text-purple-400 text-sm font-semibold mb-2">
              ENTERPRISE
            </div>
            <h2 className="text-2xl font-bold mb-2">Enterprise</h2>
            <p className="text-4xl font-bold mb-6">$99/month</p>
            <ul className="space-y-3 mb-8 text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Everything in Pro
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Unlimited Team Members
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Custom Compliance
                Frameworks
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> SSO / SAML Integration
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Dedicated Account
                Manager
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> SLA Guarantee (99.9%)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span> On-premise Deployment
              </li>
            </ul>
            <button className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors">
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
