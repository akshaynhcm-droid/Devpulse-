import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-blue-400">
          Privacy Policy
        </h1>
        <p className="text-gray-400 mb-4">Last Updated: April 15, 2025</p>

        <div className="space-y-8 text-gray-300">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              1. Information We Collect
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Account information (email, name) provided during registration</li>
              <li>API collection data you import for security scanning</li>
              <li>Usage metrics (token consumption, model usage, costs)</li>
              <li>Security scan results and findings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              2. How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To provide and improve our security scanning and monitoring services</li>
              <li>To track and report on AI agent costs and usage</li>
              <li>To detect anomalies and alert you to potential security issues</li>
              <li>To process payments and manage subscriptions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              3. Data Storage and Security
            </h2>
            <p>
              Your data is stored using industry-standard encryption at rest and in
              transit. We use TLS 1.3 for all communications and AES-256 for
              data at rest. Database access is restricted to authorized personnel
              only, with full audit logging.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              4. Data Retention
            </h2>
            <p>
              We retain your account data for as long as your account is active.
              Scan results and usage data are retained for 90 days. You may
              request deletion of your data at any time by contacting
              privacy@devpulse.io.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              5. Third-Party Services
            </h2>
            <p>
              We use Razorpay for payment processing and do not store your full
              credit card information. We may integrate with GitHub and Slack
              based on your configuration, sharing only the data necessary for
              those integrations to function.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              6. Your Rights
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Right to access your personal data</li>
              <li>Right to rectification of inaccurate data</li>
              <li>Right to erasure (&quot;right to be forgotten&quot;)</li>
              <li>Right to data portability</li>
              <li>Right to object to processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Contact</h2>
            <p>
              For privacy-related inquiries, contact us at{" "}
              <a href="mailto:privacy@devpulse.io" className="text-blue-400 hover:text-blue-300">
                privacy@devpulse.io
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-700">
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
