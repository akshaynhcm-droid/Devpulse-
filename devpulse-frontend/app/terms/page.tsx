export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-blue-400">
          Terms of Service
        </h1>
        <p className="text-gray-400 mb-4">Last Updated: April 14, 2024</p>

        <div className="space-y-8 text-gray-300">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing and using DevPulse, you agree to be bound by these
              Terms of Service. If you do not agree to these terms, please do
              not use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              2. Use License
            </h2>
            <p>
              Permission is granted to use DevPulse for your personal or
              business use, subject to the restrictions set forth in these
              terms. You may not modify, copy, or distribute the service without
              explicit written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              3. User Responsibilities
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                You are responsible for the security of your API keys and
                credentials
              </li>
              <li>
                You must not use the service for any illegal or unauthorized
                purpose
              </li>
              <li>You agree to provide accurate and complete information</li>
              <li>You are responsible for monitoring your usage and costs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              4. Limitation of Liability
            </h2>
            <p>
              DevPulse is provided "as is" without warranty of any kind. We
              shall not be liable for any damages arising from the use or
              inability to use our service, including but not limited to direct,
              indirect, incidental, or consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              5. Payment Terms
            </h2>
            <p>
              Subscription fees are billed in advance and are non-refundable.
              You agree to pay all charges at the prices in effect when charges
              are incurred. All payments are processed through Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">
              6. Termination
            </h2>
            <p>
              We reserve the right to terminate your access to the service at
              any time, without notice, for any reason, including but not
              limited to violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Contact</h2>
            <p>
              For questions about these Terms of Service, please contact us at
              legal@devpulse.io
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-700">
          <a href="/" className="text-blue-400 hover:text-blue-300">
            &larr; Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
