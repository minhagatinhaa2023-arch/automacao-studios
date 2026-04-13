import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { users, signupHistory } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

export const creditsRouter = router({
  /** Get current user's credit balance */
  balance: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const result = await db.select({ credits: users.credits }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return { credits: result[0]?.credits ?? 0 };
  }),

  /** Admin: add credits to a user */
  addCredits: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      amount: z.number().int().positive().max(100000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(users)
        .set({ credits: sql`${users.credits} + ${input.amount}` })
        .where(eq(users.id, input.userId));

      const result = await db.select({ credits: users.credits }).from(users).where(eq(users.id, input.userId)).limit(1);
      return { userId: input.userId, credits: result[0]?.credits ?? 0 };
    }),

  /** Get user stats: success, failed, total */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [balanceRow] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, ctx.user.id)).limit(1);

    const successResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(signupHistory)
      .where(sql`${signupHistory.userId} = ${ctx.user.id} AND ${signupHistory.status} = 'success'`);

    const failedResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(signupHistory)
      .where(sql`${signupHistory.userId} = ${ctx.user.id} AND ${signupHistory.status} = 'failed'`);

    const totalResult = await db.select({ count: sql<number>`COUNT(*)` })
      .from(signupHistory)
      .where(eq(signupHistory.userId, ctx.user.id));

    return {
      credits: balanceRow?.credits ?? 0,
      success: Number(successResult[0]?.count ?? 0),
      failed: Number(failedResult[0]?.count ?? 0),
      total: Number(totalResult[0]?.count ?? 0),
    };
  }),
});
