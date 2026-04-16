import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  features: string[];
}

interface CurrentPlanResponse {
  plan: string;
}

export default function Pricing() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data: plans } = trpc.payment.getPlans.useQuery() as { data: Plan[] | undefined };
  const { data: currentPlan } = trpc.payment.getCurrentPlan.useQuery() as { data: CurrentPlanResponse | undefined };

  const verifyMutation = trpc.payment.verifyPayment.useMutation();

  const createOrderMutation = trpc.payment.createOrder.useMutation();

  const handleSubscribe = async (planId: "pro" | "enterprise") => {
    setLoadingPlan(planId);
    try {
      // 1. Create Razorpay order via backend
      const order = await createOrderMutation.mutateAsync({ plan: planId });

      // 2. Open Razorpay checkout
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "DevPulse",
        description: order.planName,
        order_id: order.orderId,
        handler: function (response: any) {
          // 3. Verify payment on backend
          verifyMutation.mutate(
            {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              plan: planId,
            },
            {
              onSuccess: () => {
                window.location.reload();
              },
              onError: () => {
                alert("Payment verification failed. Please contact support.");
              },
            }
          );
        },
        prefill: {
          name: "",
          email: "",
        },
        theme: {
          color: "#3b82f6",
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        alert("Payment failed. Please try again.");
        setLoadingPlan(null);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || "Failed to initiate payment");
      setLoadingPlan(null);
    }
  };

  const userPlan = currentPlan?.plan ?? "free";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Secure your AI agents with DevPulse. Start free, upgrade when you're ready.
          </p>
          {userPlan !== "free" && (
            <Badge variant="default" className="mt-4">
              Current Plan: {userPlan.charAt(0).toUpperCase() + userPlan.slice(1)}
            </Badge>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Free Plan */}
          <Card className="relative">
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>Get started with basic features</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">₹0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {[
                  "Up to 3 API collections",
                  "Basic security scanning",
                  "Kill switch & budget alerts",
                  "1 team member",
                  "Community support",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full"
                disabled={userPlan === "free"}
              >
                {userPlan === "free" ? "Current Plan" : "Downgrade"}
              </Button>
            </CardFooter>
          </Card>

          {/* Pro Plan */}
          <Card className="relative border-blue-500 shadow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-blue-500">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardDescription>For teams serious about API security</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">₹999</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(plans?.find((p: any) => p.id === "pro")?.features ?? [
                  "Unlimited API collections",
                  "Advanced security scanning",
                  "Shadow API detection",
                  "Compliance reporting (PCI DSS + OWASP)",
                  "Kill switch & budget management",
                  "Team collaboration (up to 10 members)",
                  "Token analytics & cost forecasting",
                  "Priority support",
                ]).map((feature: string) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => handleSubscribe("pro")}
                disabled={userPlan === "pro" || loadingPlan === "pro"}
              >
                {loadingPlan === "pro" ? "Processing..." : userPlan === "pro" ? "Current Plan" : "Upgrade to Pro"}
              </Button>
            </CardFooter>
          </Card>

          {/* Enterprise Plan */}
          <Card className="relative">
            <CardHeader>
              <CardTitle>Enterprise</CardTitle>
              <CardDescription>For organizations with advanced needs</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">₹4,999</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {(plans?.find((p: any) => p.id === "enterprise")?.features ?? [
                  "Everything in Pro",
                  "Unlimited team members",
                  "Custom compliance frameworks",
                  "SSO / SAML integration",
                  "Dedicated account manager",
                  "SLA guarantee (99.9%)",
                  "On-premise deployment option",
                ]).map((feature: string) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                className="w-full border-purple-500 text-purple-600 hover:bg-purple-50"
                onClick={() => handleSubscribe("enterprise")}
                disabled={userPlan === "enterprise" || loadingPlan === "enterprise"}
              >
                {loadingPlan === "enterprise" ? "Processing..." : userPlan === "enterprise" ? "Current Plan" : "Upgrade to Enterprise"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          All plans include 14-day free trial. Cancel anytime. Secure payments via Razorpay.
        </p>
      </div>
    </div>
  );
}
