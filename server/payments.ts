import crypto from "crypto";
import { ENV } from "./_core/env";

// ============================================================================
// RAZORPAY SUBSCRIPTION INTEGRATION
// ============================================================================

const RAZORPAY_KEY_ID = ENV.razorpayKeyId;
const RAZORPAY_KEY_SECRET = ENV.razorpayKeySecret;

const PLAN_CONFIG = {
  free: {
    name: "DevPulse Free",
    amount: 0,
    currency: "INR",
    interval: "monthly",
    features: [
      "Up to 2 API collections",
      "3 security scans per day",
      "Basic security scanning",
      "Community support",
    ],
    limits: {
      maxCollections: 2,
      maxScansPerDay: 3,
      maxTeamMembers: 1,
      complianceExport: false,
      killSwitch: false,
      shadowAPI: false,
    },
  },
  pro: {
    name: "DevPulse Pro",
    amount: 99900, // ₹999 in paise (≈ $12 USD)
    currency: "INR",
    interval: "monthly",
    features: [
      "Unlimited API collections",
      "Advanced security scanning",
      "Shadow API detection",
      "Compliance reporting (PCI DSS + OWASP)",
      "Kill switch & budget management",
      "Team collaboration (up to 10 members)",
      "Token analytics & cost forecasting",
      "Priority support",
    ],
    limits: {
      maxCollections: Infinity,
      maxScansPerDay: Infinity,
      maxTeamMembers: 10,
      complianceExport: true,
      killSwitch: true,
      shadowAPI: true,
    },
  },
  enterprise: {
    name: "DevPulse Enterprise",
    amount: 499900, // ₹4,999 in paise (≈ $60 USD)
    currency: "INR",
    interval: "monthly",
    features: [
      "Everything in Pro",
      "Unlimited team members",
      "Custom compliance frameworks",
      "SSO / SAML integration",
      "Dedicated account manager",
      "SLA guarantee (99.9%)",
      "On-premise deployment option",
    ],
    limits: {
      maxCollections: Infinity,
      maxScansPerDay: Infinity,
      maxTeamMembers: Infinity,
      complianceExport: true,
      killSwitch: true,
      shadowAPI: true,
      sso: true,
      prioritySupport: true,
    },
  },
} as const;

type PlanType = keyof typeof PLAN_CONFIG;

interface RazorpayPlanResponse {
  id: string;
  entity: string;
  interval: number;
  period: string;
  item: {
    id: string;
    name: string;
    amount: number;
    currency: string;
  };
}

interface RazorpaySubscriptionResponse {
  id: string;
  entity: string;
  plan_id: string;
  customer_id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "paused";
  current_start?: number;
  current_end?: number;
  ended_at?: number;
  charge_at?: number;
  short_url?: string;
}

interface RazorpayCustomerResponse {
  id: string;
  entity: string;
  email: string;
  name?: string;
  contact?: string;
}

interface RazorpayWebhookPayload {
  entity: "event";
  account_id: string;
  event:
    | "subscription.activated"
    | "subscription.charged"
    | "subscription.cancelled"
    | "subscription.paused"
    | "subscription.resumed"
    | "subscription.halted"
    | "payment.failed"
    | "payment.captured"
    | "refund.processed";
  contains: any[];
  payload: {
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        order_id: string;
        invoice_id?: string;
        subscription_id?: string;
        captured: boolean;
        email: string;
        contact?: string;
        created_at: number;
        error_code?: string;
        error_description?: string;
      };
    };
    subscription?: {
      entity: RazorpaySubscriptionResponse;
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        status: string;
        created_at: number;
      };
    };
  };
  created_at: number;
}

const authHeader = () => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error(
      "Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }
  return `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`;
};

/**
 * Get or create Razorpay plan for a DevPulse plan tier
 */
async function getOrCreatePlan(plan: PlanType): Promise<string> {
  const planConfig = PLAN_CONFIG[plan];
  const planName = `devpulse_${plan}_monthly`;

  // Try to find existing plan
  const listResponse = await fetch(
    `https://api.razorpay.com/v1/plans?count=100`,
    {
      headers: { Authorization: authHeader() },
    }
  );

  if (!listResponse.ok) {
    throw new Error(`Failed to list plans: ${await listResponse.text()}`);
  }

  const { items: plans } = await listResponse.json();
  const existingPlan = plans.find((p: any) => p.item.name === planName);

  if (existingPlan) {
    return existingPlan.id;
  }

  // Create new plan
  const createResponse = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      period: "monthly",
      interval: 1,
      item: {
        name: planName,
        amount: planConfig.amount,
        currency: planConfig.currency,
        description: `${planConfig.name} - Monthly Subscription`,
      },
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create plan: ${await createResponse.text()}`);
  }

  const newPlan: RazorpayPlanResponse = await createResponse.json();
  return newPlan.id;
}

/**
 * Create or get Razorpay customer
 */
async function getOrCreateCustomer(
  userId: number,
  email: string,
  name?: string
): Promise<string> {
  // Try to find existing customer by email
  const listResponse = await fetch(
    `https://api.razorpay.com/v1/customers?count=100`,
    {
      headers: { Authorization: authHeader() },
    }
  );

  if (!listResponse.ok) {
    throw new Error(`Failed to list customers: ${await listResponse.text()}`);
  }

  const { items: customers } = await listResponse.json();
  const existingCustomer = customers.find((c: any) => c.email === email);

  if (existingCustomer) {
    return existingCustomer.id;
  }

  // Create new customer
  const createResponse = await fetch("https://api.razorpay.com/v1/customers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      name: name || email.split("@")[0],
      email,
      notes: {
        userId: userId.toString(),
      },
    }),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Failed to create customer: ${await createResponse.text()}`
    );
  }

  const newCustomer: RazorpayCustomerResponse = await createResponse.json();
  return newCustomer.id;
}

/**
 * Create a Razorpay subscription for recurring billing.
 */
export async function createSubscription(
  userId: number,
  userEmail: string,
  plan: Exclude<PlanType, "free">,
  name?: string
): Promise<{
  subscriptionId: string;
  customerId: string;
  shortUrl?: string;
  status: string;
  planName: string;
  amount: number;
  currency: string;
  keyId: string;
  features: readonly string[];
}> {
  const planId = await getOrCreatePlan(plan);
  const customerId = await getOrCreateCustomer(userId, userEmail, name);

  const planConfig = PLAN_CONFIG[plan];

  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      plan_id: planId,
      customer_id: customerId,
      total_count: 12, // 1 year
      quantity: 1,
      customer_notify: 1,
      notes: {
        userId: userId.toString(),
        userEmail,
        plan,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay subscription creation failed: ${error}`);
  }

  const subscription: RazorpaySubscriptionResponse = await response.json();

  return {
    subscriptionId: subscription.id,
    customerId,
    shortUrl: subscription.short_url,
    status: subscription.status,
    planName: planConfig.name,
    amount: planConfig.amount,
    currency: planConfig.currency,
    keyId: RAZORPAY_KEY_ID!,
    features: planConfig.features,
  };
}

/**
 * Verify Razorpay payment signature after frontend payment completion.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!RAZORPAY_KEY_SECRET) {
    console.error(
      "[Razorpay] Key secret not configured — cannot verify signature"
    );
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(params.signature, "hex")
  );
}

/**
 * Fetch payment details from Razorpay.
 */
export async function getPaymentDetails(paymentId: string): Promise<any> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch payment details: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Process a refund via Razorpay.
 */
export async function processRefund(
  paymentId: string,
  amount: number,
  reason: string = "User requested refund"
): Promise<any> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount,
        notes: { reason },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Refund failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Cancel a Razorpay subscription.
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtCycleEnd: boolean = true
): Promise<any> {
  const endpoint = cancelAtCycleEnd
    ? `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`
    : `https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel?cancel_at_cycle_end=0`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel subscription: ${await response.text()}`);
  }

  return response.json();
}

/**
 * Fetch subscription details from Razorpay.
 */
export async function getSubscriptionDetails(
  subscriptionId: string
): Promise<any> {
  const response = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${subscriptionId}`,
    {
      headers: { Authorization: authHeader() },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch subscription: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch subscription invoices from Razorpay.
 */
export async function getSubscriptionInvoices(
  subscriptionId: string
): Promise<any[]> {
  const response = await fetch(
    `https://api.razorpay.com/v1/invoices?subscription_id=${subscriptionId}`,
    { headers: { Authorization: authHeader() } }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch invoices: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Verify Razorpay webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string = RAZORPAY_KEY_SECRET || ""
): boolean {
  if (!secret) {
    console.error("[Razorpay] Webhook secret not configured");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(signature, "hex")
  );
}

/**
 * Handle Razorpay webhook events.
 * Returns normalized event data for database storage.
 */
export function handleWebhookEvent(payload: RazorpayWebhookPayload): {
  event: string;
  subscriptionId?: string;
  paymentId?: string;
  refundId?: string;
  data: any;
} {
  const event = payload.event;
  let result: any = { event, data: payload };

  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.cancelled":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.halted":
      result.subscriptionId = payload.payload.subscription?.entity.id;
      break;

    case "payment.captured":
    case "payment.failed":
      result.paymentId = payload.payload.payment?.entity.id;
      result.subscriptionId = payload.payload.payment?.entity.subscription_id;
      break;

    case "refund.processed":
      result.refundId = payload.payload.refund?.entity.id;
      result.paymentId = payload.payload.refund?.entity.payment_id;
      break;
  }

  return result;
}

/**
 * Get plan limits for enforcement.
 */
export function getPlanLimits(plan: PlanType) {
  return PLAN_CONFIG[plan].limits;
}

/**
 * Check if a feature is available for a given plan.
 */
export function isFeatureAvailable(
  plan: PlanType,
  feature: keyof (typeof PLAN_CONFIG)["free"]["limits"]
): boolean {
  const limits = PLAN_CONFIG[plan].limits;
  return feature in limits
    ? Boolean(limits[feature as keyof typeof limits])
    : true;
}

export { PLAN_CONFIG, type PlanType, type RazorpayWebhookPayload };
