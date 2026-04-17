"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, CreditCard, ArrowRight } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface CurrentPlan {
  plan: string;
  status: string;
  limits?: Record<string, unknown>;
}

/**
 * Razorpay hosted-checkout success redirect target. Razorpay appends
 * ?razorpay_payment_id, ?razorpay_subscription_id, ?razorpay_signature
 * to the callback URL when it returns the user to our site. We don't
 * trust those for activation — activation happens via the signed
 * webhook at POST /api/payments.handleWebhook. This page is a pure UX
 * confirmation that polls the user's plan until it reflects the upgrade.
 */
export default function BillingSuccessPage() {
  const [current, setCurrent] = useState<CurrentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/payments.getCurrentPlan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          const data = json?.result?.data ?? json;
          setCurrent(data);
          setLoading(false);
          if (data?.plan === "free" && attempts < 20) {
            setTimeout(() => setAttempts(a => a + 1), 3000);
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [attempts]);

  const upgraded = current?.plan && current.plan !== "free";

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-8 text-center">
        {upgraded ? (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold">Payment successful</h1>
            <p className="text-gray-400 mt-2">
              Welcome to DevPulse{" "}
              <span className="capitalize font-semibold text-blue-300">
                {current?.plan}
              </span>
              . Your new plan is active — scans, collections, and team-member
              limits have been lifted.
            </p>
          </>
        ) : loading ? (
          <>
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto" />
            <h1 className="text-2xl font-bold mt-4">Finalizing payment…</h1>
            <p className="text-gray-400 mt-2">
              Razorpay has processed your payment. We&apos;re waiting for the
              webhook to activate your plan. This usually takes a few seconds.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-10 h-10 text-yellow-400" />
            </div>
            <h1 className="text-2xl font-bold">Almost done</h1>
            <p className="text-gray-400 mt-2">
              Your payment is processing. If your plan doesn&apos;t reflect the
              upgrade within a few minutes, please refresh — activation is
              driven by the signed Razorpay webhook and rarely, it may arrive
              out-of-order.
            </p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-8 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Go to dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/billing"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-gray-700 hover:bg-gray-800 text-gray-200 text-sm font-medium transition-colors"
          >
            View invoices
          </Link>
        </div>
      </div>
    </div>
  );
}
