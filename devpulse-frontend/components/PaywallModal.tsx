"use client";

import { useState } from "react";
import { X, Zap, Crown, AlertCircle, Loader2, Check } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
  limits: Record<string, any>;
}

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  requiredPlan?: "pro" | "enterprise";
  requiredFeature?: string;
  currentPlan?: string;
  apiBase?: string;
}

export default function PaywallModal({
  isOpen,
  onClose,
  title = "Upgrade Required",
  description = "This feature requires a paid plan.",
  requiredPlan = "pro",
  requiredFeature,
  currentPlan = "free",
  apiBase = process.env.NEXT_PUBLIC_API_URL || "/api",
}: PaywallModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = async () => {
    try {
      const res = await fetch(`${apiBase}/payment/plans`);
      const data = await res.json();
      setPlans(data.result?.data || []);
    } catch (err) {
      console.error("Failed to load plans:", err);
    }
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === "free") return;

    setIsLoading(true);
    setError(null);

    try {
      // Get auth token
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please log in to upgrade");
        return;
      }

      const res = await fetch(`${apiBase}/payment/createSubscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || "Failed to create subscription"
        );
      }

      const result = await res.json();
      const subData = result.result?.data;

      if (!subData) {
        throw new Error("Invalid response from server");
      }

      // Load Razorpay checkout
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        const options = {
          key: subData.keyId,
          subscription_id: subData.subscriptionId,
          name: "DevPulse",
          description: `${subData.planName} Subscription`,
          image: "/logo.png",
          handler: function () {
            onClose();
            window.location.reload();
          },
          prefill: {
            email: subData.customerEmail,
            name: subData.customerName,
          },
          theme: {
            color: "#6366f1",
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      };
      document.body.appendChild(script);
    } catch (err: any) {
      setError(err.message || "Failed to create subscription");
    } finally {
      setIsLoading(false);
    }
  };

  // Load plans when modal opens
  if (isOpen && plans.length === 0) {
    loadPlans();
  }

  if (!isOpen) return null;

  const requiredPlanData = plans.find(p => p.id === requiredPlan);
  const currentPlanData = plans.find(p => p.id === currentPlan);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 rounded-lg">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-slate-300 mb-6">{description}</p>

        {requiredFeature && (
          <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg mb-6">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-amber-300">
              Required: {requiredPlan === "enterprise" ? "Enterprise" : "Pro"}{" "}
              plan or higher
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg mb-6 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Plan Cards */}
        <div className="space-y-3 mb-6">
          {plans.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : (
            plans
              .filter(p => p.id !== "free")
              .map(plan => {
                const isRecommended = plan.id === requiredPlan;
                const isCurrent = currentPlan === plan.id;
                const isHigher =
                  (plan.id === "enterprise" && requiredPlan === "pro") ||
                  (plan.id === "pro" && currentPlan === "free");

                return (
                  <div
                    key={plan.id}
                    className={`relative border rounded-lg p-4 transition-all ${
                      isCurrent
                        ? "border-green-500/50 bg-green-900/10"
                        : isRecommended
                          ? "border-indigo-500 bg-indigo-900/20 ring-1 ring-indigo-500"
                          : "border-slate-800 bg-slate-900/50"
                    }`}
                  >
                    {isRecommended && !isCurrent && (
                      <span className="absolute -top-2 right-4 px-2 py-0.5 bg-indigo-600 text-xs font-medium rounded">
                        Recommended
                      </span>
                    )}
                    {isCurrent && (
                      <span className="absolute -top-2 right-4 px-2 py-0.5 bg-green-600 text-xs font-medium rounded flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Current
                      </span>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {plan.id === "pro" ? (
                          <Zap className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <Crown className="w-5 h-5 text-amber-400" />
                        )}
                        <div>
                          <h3 className="font-semibold">{plan.name}</h3>
                          <p className="text-sm text-slate-400">
                            {new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: plan.currency,
                            }).format(plan.amount / 100)}
                            /{plan.interval}
                          </p>
                        </div>
                      </div>

                      {isCurrent ? (
                        <span className="text-sm text-green-400">Active</span>
                      ) : isHigher || plan.id === requiredPlan ? (
                        <button
                          onClick={() => handleUpgrade(plan.id)}
                          disabled={isLoading}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Upgrade"
                          )}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">
                          Lower tier
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="mt-3 space-y-1">
                      {plan.features.slice(0, 3).map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm text-slate-400"
                        >
                          <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            Secure payment via Razorpay. Cancel anytime.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
