import { z } from "zod";
import {
  router,
  protectedProcedure,
  publicProcedure,
  adminProcedure,
} from "../_core/trpc";
import * as db from "../db";
import { nanoid } from "nanoid";
import {
  createSubscription as createRazorpaySubscription,
  cancelSubscription as cancelRazorpaySubscription,
  getSubscriptionDetails,
  getSubscriptionInvoices,
  verifyWebhookSignature,
  handleWebhookEvent,
  getPlanLimits,
  PLAN_CONFIG,
  type RazorpayWebhookPayload,
  processRefund,
} from "../payments";
import { desc } from "drizzle-orm";
import { subscriptions, payments } from "../../drizzle/schema";

export const paymentsRouter = router({
  createSubscription: protectedProcedure
    .input(z.object({ plan: z.enum(["pro", "enterprise"]).default("pro") }))
    .mutation(async ({ input, ctx }) => {
      const subscription = await createRazorpaySubscription(
        ctx.user.id,
        ctx.user.email ?? "",
        input.plan,
        ctx.user.name ?? undefined
      );

      await db.createSubscription({
        id: nanoid(),
        userId: ctx.user.id,
        plan: input.plan,
        razorpaySubscriptionId: subscription.subscriptionId,
        razorpayCustomerId: subscription.customerId,
        status: "pending",
      });

      return subscription;
    }),

  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    if (!subscription?.razorpaySubscriptionId) {
      return { status: "none", plan: subscription?.plan || "free" };
    }

    const razorpayData = await getSubscriptionDetails(
      subscription.razorpaySubscriptionId
    );

    if (razorpayData.status !== subscription.status) {
      await db.updateSubscriptionStatus(subscription.id, razorpayData.status);
    }

    return {
      status: razorpayData.status,
      plan: subscription.plan,
      currentPeriodStart: razorpayData.current_start
        ? new Date(razorpayData.current_start * 1000)
        : null,
      currentPeriodEnd: razorpayData.current_end
        ? new Date(razorpayData.current_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }),

  cancelSubscription: protectedProcedure
    .input(z.object({ immediately: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      if (!subscription?.razorpaySubscriptionId) {
        throw new Error("No active subscription found");
      }

      const result = await cancelRazorpaySubscription(
        subscription.razorpaySubscriptionId,
        !input.immediately
      );

      await db.updateSubscriptionStatus(
        subscription.id,
        input.immediately ? "cancelled" : "active",
        !input.immediately
      );

      if (input.immediately) {
        await db.updateUserPlan(ctx.user.id, "free");
      }

      return { success: true, status: result.status };
    }),

  getInvoices: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    if (!subscription?.razorpaySubscriptionId) {
      return { invoices: [] };
    }

    const invoices = await getSubscriptionInvoices(
      subscription.razorpaySubscriptionId
    );

    for (const invoice of invoices) {
      if (invoice.payment_id && invoice.amount) {
        await db.createOrUpdatePayment({
          id: nanoid(),
          userId: ctx.user.id,
          subscriptionId: subscription.id,
          razorpayPaymentId: invoice.payment_id,
          razorpayOrderId: invoice.order_id,
          amount: invoice.amount / 100,
          currency: invoice.currency || "INR",
          status: invoice.status === "paid" ? "captured" : "created",
          receipt: invoice.receipt_number,
          description: invoice.description,
          createdAt: new Date(invoice.date * 1000),
        });
      }
    }

    const payments = await db.getPaymentsByUserId(ctx.user.id);

    return {
      invoices: payments.map(p => ({
        id: p.id,
        razorpayPaymentId: p.razorpayPaymentId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        receipt: p.receipt,
        description: p.description,
        createdAt: p.createdAt,
      })),
    };
  }),

  handleWebhook: publicProcedure
    .input(z.any())
    .mutation(async ({ input, ctx }) => {
      const signature = ctx.req.headers["x-razorpay-signature"] as string;
      const payload = JSON.stringify(input);

      if (!verifyWebhookSignature(payload, signature)) {
        throw new Error("Invalid webhook signature");
      }

      const event = handleWebhookEvent(input as RazorpayWebhookPayload);

      switch (event.event) {
        case "subscription.activated":
          if (event.subscriptionId) {
            const sub = await db.getSubscriptionByRazorpayId(
              event.subscriptionId
            );
            if (sub) {
              await db.updateSubscriptionStatus(sub.id, "active");
              await db.updateUserPlan(sub.userId, sub.plan);
            }
          }
          break;

        case "subscription.charged":
          if (event.data.payload.payment?.entity) {
            const payment = event.data.payload.payment.entity;
            const sub = await db.getSubscriptionByRazorpayId(
              payment.subscription_id
            );
            if (sub) {
              await db.createOrUpdatePayment({
                id: nanoid(),
                userId: sub.userId,
                subscriptionId: sub.id,
                razorpayPaymentId: payment.id,
                razorpayOrderId: payment.order_id,
                amount: payment.amount / 100,
                currency: payment.currency,
                status: "captured",
                createdAt: new Date(payment.created_at * 1000),
              });
            }
          }
          break;

        case "subscription.cancelled":
          if (event.subscriptionId) {
            const sub = await db.getSubscriptionByRazorpayId(
              event.subscriptionId
            );
            if (sub) {
              await db.updateSubscriptionStatus(sub.id, "cancelled");
              await db.updateUserPlan(sub.userId, "free");
            }
          }
          break;

        case "payment.failed":
          if (event.data.payload.payment?.entity) {
            const payment = event.data.payload.payment.entity;
            const sub = await db.getSubscriptionByRazorpayId(
              payment.subscription_id
            );
            if (sub) {
              await db.updateSubscriptionStatus(sub.id, "past_due");
            }
          }
          break;

        case "refund.processed":
          if (event.data.payload.refund?.entity) {
            const refund = event.data.payload.refund.entity;
            await db.updatePaymentRefundStatus(
              refund.payment_id,
              refund.amount / 100,
              "full"
            );
          }
          break;
      }

      return { received: true };
    }),

  getPlans: publicProcedure.query(() => {
    return Object.entries(PLAN_CONFIG).map(([key, config]) => ({
      id: key,
      name: config.name,
      amount: config.amount,
      currency: config.currency,
      interval: config.interval,
      features: [...config.features],
      limits: config.limits,
    }));
  }),

  getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    const limits = getPlanLimits((subscription?.plan as any) || "free");

    return {
      plan: subscription?.plan || "free",
      status: subscription?.status || "none",
      limits,
    };
  }),

  // Admin procedures
  processRefund: adminProcedure
    .input(
      z.object({
        paymentId: z.string(),
        amount: z.number().optional(),
        reason: z.string().default("Admin initiated refund"),
      })
    )
    .mutation(async ({ input }) => {
      const payment = await db.getPaymentByRazorpayId(input.paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      const refundAmount =
        input.amount || parseFloat(payment.amount as string) * 100;
      const result = await processRefund(
        input.paymentId,
        refundAmount,
        input.reason
      );

      await db.updatePaymentRefundStatus(
        input.paymentId,
        refundAmount / 100,
        input.amount ? "partial" : "full"
      );

      return {
        success: true,
        refundId: result.id,
        amount: refundAmount / 100,
        status: result.status,
      };
    }),
});
