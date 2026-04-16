/**
 * Patch for Razorpay webhook signature verification
 * 
 * CRITICAL SECURITY FIX: The current implementation has a bug where
 * if the signature is missing or malformed, the verification silently fails.
 * 
 * Replace the webhook handler in server/_core/index.ts with this secure version:
 */

/**
 * SECURE Razorpay webhook handler - replace lines ~317-346 in server/_core/index.ts
 */
export function createSecureRazorpayWebhookHandler(ENV: any, db: any) {
  return async function(req: any, res: any) {
    const signature = req.headers[\"x-razorpay-signature\"] as string;
    const webhookSecret = ENV.razorpayWebhookSecret;

    if (!webhookSecret) {
      console.warn(\"[Razorpay] Webhook secret not configured — rejecting webhook\");
      res.status(500).json({ error: \"Webhook not configured\" });
      return;
    }

    if (!signature) {
      console.warn(\"[Razorpay] No signature provided in request\");
      res.status(400).json({ error: \"Missing signature\" });
      return;
    }

    // Verify webhook signature using timing-safe comparison
    const payload = req.body.toString(\"utf-8\");
    const expectedSignature = crypto
      .createHmac(\"sha256\", webhookSecret)
      .update(payload)
      .digest(\"hex\");

    const isValidSignature = secureCompare(`sha256=${expectedSignature}`, signature);

    if (!isValidSignature) {
      console.warn(\"[Razorpay] Invalid webhook signature\");
      res.status(400).json({ error: \"Invalid signature\" });
      return;
    }

    // Process valid webhook...
  };
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, \"utf-8\"), Buffer.from(b, \"utf-8\"));
  } catch {
    return false;
  }
}
