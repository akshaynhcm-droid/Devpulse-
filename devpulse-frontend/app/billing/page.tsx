"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import {
  Loader2,
  CreditCard,
  Download,
  AlertCircle,
  Check,
  X,
  Crown,
  Zap,
} from "lucide-react";

interface Invoice {
  id: string;
  razorpayPaymentId: string;
  amount: string;
  currency: string;
  status: string;
  receipt: string | null;
  description: string | null;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
  limits: Record<string, any>;
}

export default function BillingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<{
    plan: string;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, invoicesRes, plansRes] = await Promise.all([
        trpc.payment.getSubscriptionStatus.query(),
        trpc.payment.getInvoices.query(),
        trpc.payment.getPlans.query(),
      ]);

      setSubscription(statusRes);
      setInvoices(invoicesRes.invoices || []);
      setPlans(plansRes);
    } catch (err) {
      setError("Failed to load billing data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === "free") return;

    setIsProcessing(true);
    try {
      const result = await trpc.payment.createSubscription.mutate({
        plan: planId as "pro" | "enterprise",
      });

      // Load Razorpay checkout
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        const options = {
          key: result.keyId,
          subscription_id: result.subscriptionId,
          name: "DevPulse",
          description: `${result.planName} Subscription`,
          image: "/logo.png",
          handler: function (response: any) {
            // Payment successful
            loadBillingData();
          },
          prefill: {
            email: result.customerEmail,
            name: result.customerName,
          },
          theme: {
            color: "#6366f1",
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      };
      document.body.appendChild(script);
    } catch (err) {
      setError("Failed to create subscription");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async (immediately: boolean) => {
    setIsProcessing(true);
    try {
      await trpc.payment.cancelSubscription.mutate({ immediately });
      setShowCancelConfirm(false);
      loadBillingData();
    } catch (err) {
      setError("Failed to cancel subscription");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-400 bg-green-900/30 border-green-500";
      case "pending":
        return "text-yellow-400 bg-yellow-900/30 border-yellow-500";
      case "cancelled":
        return "text-red-400 bg-red-900/30 border-red-500";
      case "past_due":
        return "text-orange-400 bg-orange-900/30 border-orange-500";
      default:
        return "text-gray-400 bg-gray-900/30 border-gray-500";
    }
  };

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
    }).format(num);
  };

  const currentPlan = plans.find(p => p.id === subscription?.plan);
  const isPaidPlan =
    subscription?.plan !== "free" && subscription?.plan !== "none";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-900/30 border border-red-500 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Current Plan</h2>

          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold capitalize">
                  {currentPlan?.name || subscription?.plan || "Free"}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm border ${getStatusColor(
                    subscription?.status || "none"
                  )}`}
                >
                  {subscription?.status === "active" && isPaidPlan
                    ? subscription?.cancelAtPeriodEnd
                      ? "Cancels at period end"
                      : "Active"
                    : subscription?.status || "None"}
                </span>
              </div>

              {isPaidPlan && subscription?.currentPeriodEnd && (
                <p className="text-slate-400">
                  Next billing date:{" "}
                  {format(
                    new Date(subscription.currentPeriodEnd),
                    "MMMM d, yyyy"
                  )}
                </p>
              )}
            </div>

            {isPaidPlan && !subscription?.cancelAtPeriodEnd && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/50 rounded-lg transition-colors"
              >
                Cancel Subscription
              </button>
            )}
          </div>
        </div>

        {/* Available Plans */}
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`bg-slate-900/50 border rounded-lg p-6 ${
                subscription?.plan === plan.id
                  ? "border-indigo-500 ring-1 ring-indigo-500"
                  : "border-slate-800"
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                {plan.id === "pro" && (
                  <Zap className="w-5 h-5 text-indigo-400" />
                )}
                {plan.id === "enterprise" && (
                  <Crown className="w-5 h-5 text-amber-400" />
                )}
                <h3 className="font-semibold">{plan.name}</h3>
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold">
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: plan.currency,
                  }).format(plan.amount / 100)}
                </span>
                <span className="text-slate-400">/{plan.interval}</span>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.slice(0, 4).map((feature, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-slate-300"
                  >
                    <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {subscription?.plan === plan.id ? (
                <button
                  disabled
                  className="w-full py-2 bg-slate-800 text-slate-400 rounded-lg cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : plan.id === "free" ? (
                <button
                  disabled={subscription?.plan === "free"}
                  className="w-full py-2 bg-slate-800 text-slate-400 rounded-lg cursor-not-allowed"
                >
                  {subscription?.plan === "free" ? "Current Plan" : "Downgrade"}
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isProcessing}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : subscription?.plan === "free" ? (
                    "Upgrade"
                  ) : (
                    "Switch Plan"
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Invoice History */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Invoice History</h2>

          {invoices.length === 0 ? (
            <EmptyState
              compact
              icon={<span>🧾</span>}
              title="No invoices yet"
              description="Once you subscribe to a paid plan your receipts and payment history will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-400 text-sm border-b border-slate-800">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(invoice => (
                    <tr
                      key={invoice.id}
                      className="border-b border-slate-800/50"
                    >
                      <td className="py-4 text-sm">
                        {format(new Date(invoice.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="py-4 text-sm">
                        {invoice.description || "Subscription payment"}
                      </td>
                      <td className="py-4 text-sm">
                        {formatAmount(invoice.amount, invoice.currency)}
                      </td>
                      <td className="py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs border ${getStatusColor(
                            invoice.status
                          )}`}
                        >
                          {invoice.status}
                        </span>
                      </td>
                      <td className="py-4">
                        {invoice.receipt ? (
                          <a
                            href={`https://dashboard.razorpay.com/receipts/${invoice.receipt}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        ) : (
                          <span className="text-slate-500 text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-400" />
                <h3 className="text-lg font-semibold">Cancel Subscription?</h3>
              </div>

              <p className="text-slate-300 mb-6">
                You can cancel immediately or at the end of your billing period.
                If you cancel immediately, you&apos;ll lose access to premium
                features right away.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => handleCancel(true)}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Cancel Now"
                  )}
                </button>
                <button
                  onClick={() => handleCancel(false)}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "At Period End"
                  )}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 mx-auto" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
