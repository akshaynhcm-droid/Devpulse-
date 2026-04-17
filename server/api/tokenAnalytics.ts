import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";

export const tokenAnalyticsRouter = router({
  recordUsage: protectedProcedure
    .input(
      z.object({
        model: z.string().min(1).max(128),
        promptTokens: z.number().int().min(0),
        completionTokens: z.number().int().min(0),
        thinkingTokens: z.number().int().min(0),
        costUSD: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.recordTokenUsage(
        ctx.user.id,
        input.model,
        input.promptTokens,
        input.completionTokens,
        input.thinkingTokens,
        input.costUSD
      );
      return { success: true };
    }),

  getAnalytics: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).optional() }))
    .query(async ({ input, ctx }) => {
      const usage = await db.getTokenUsageByUserId(
        ctx.user.id,
        input.days || 30
      );

      const byModel: Record<string, any> = {};
      let totalCost = 0;
      let totalTokens = 0;

      for (const record of usage) {
        if (!byModel[record.model]) {
          byModel[record.model] = {
            model: record.model,
            promptTokens: 0,
            completionTokens: 0,
            thinkingTokens: 0,
            totalTokens: 0,
            costUSD: 0,
          };
        }

        byModel[record.model].promptTokens += record.promptTokens;
        byModel[record.model].completionTokens += record.completionTokens;
        byModel[record.model].thinkingTokens += record.thinkingTokens;
        byModel[record.model].totalTokens += record.totalTokens;
        byModel[record.model].costUSD += parseFloat(record.costUSD as any);

        totalCost += parseFloat(record.costUSD as any);
        totalTokens += record.totalTokens;
      }

      return {
        byModel: Object.values(byModel),
        totalTokens,
        totalCost,
        usage: usage.map(u => ({
          date: u.date,
          model: u.model,
          tokens: u.totalTokens,
          cost: parseFloat(u.costUSD as any),
        })),
      };
    }),

  getModelBreakdown: protectedProcedure
    .input(z.object({ model: z.string() }))
    .query(async ({ input, ctx }) => {
      const usage = await db.getTokenUsageByModel(ctx.user.id, input.model);

      return {
        model: input.model,
        usage: usage.map(u => ({
          date: u.date,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          thinkingTokens: u.thinkingTokens,
          totalTokens: u.totalTokens,
          costUSD: parseFloat(u.costUSD as any),
        })),
      };
    }),

  exportAnalytics: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).optional() }))
    .mutation(async ({ input, ctx }) => {
      const usage = await db.getTokenUsageByUserId(
        ctx.user.id,
        input.days || 30
      );

      const csvHeader =
        "Date,Model,Prompt Tokens,Completion Tokens,Thinking Tokens,Total Tokens,Cost (USD)";
      const csvRows = usage.map(
        u =>
          `${new Date(u.date).toISOString()},${u.model},${u.promptTokens},${u.completionTokens},${u.thinkingTokens},${u.totalTokens},${parseFloat(u.costUSD as any).toFixed(6)}`
      );
      const csv = [csvHeader, ...csvRows].join("\n");

      const totalCost = usage.reduce(
        (sum, u) => sum + parseFloat(u.costUSD as any),
        0
      );
      const totalTokens = usage.reduce((sum, u) => sum + u.totalTokens, 0);

      return {
        csv,
        totalCost,
        totalTokens,
        recordCount: usage.length,
        exportDate: new Date().toISOString(),
      };
    }),
});
