import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

export const historyRouter = router({
  /** List signup history for current user */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await db.select().from(signupHistory)
        .where(eq(signupHistory.userId, ctx.user.id))
        .orderBy(desc(signupHistory.createdAt))
        .limit(limit)
        .offset(offset);

      return items;
    }),

  /** Delete a failed history entry */
  delete: protectedProcedure
    .input(z.object({ historyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db.select().from(signupHistory)
        .where(and(eq(signupHistory.id, input.historyId), eq(signupHistory.userId, ctx.user.id)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });

      await db.delete(signupHistory).where(eq(signupHistory.id, input.historyId));
      return { success: true };
    }),

  /** List created Manus accounts */
  accounts: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await db.select({
        id: manusAccounts.id,
        email: manusAccounts.email,
        phone: manusAccounts.phone,
        status: manusAccounts.status,
        createdAt: manusAccounts.createdAt,
      }).from(manusAccounts)
        .where(eq(manusAccounts.userId, ctx.user.id))
        .orderBy(desc(manusAccounts.createdAt))
        .limit(limit)
        .offset(offset);

      return items;
    }),

  /** Get account details (including password) */
  accountDetails: protectedProcedure
    .input(z.object({ accountId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [account] = await db.select().from(manusAccounts)
        .where(and(eq(manusAccounts.id, input.accountId), eq(manusAccounts.userId, ctx.user.id)))
        .limit(1);

      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });

      return account;
    }),

  /** Get bot session logs for a queue item */
  botLogs: protectedProcedure
    .input(z.object({ queueId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [session] = await db.select().from(botSessions)
        .where(and(eq(botSessions.queueId, input.queueId), eq(botSessions.userId, ctx.user.id)))
        .orderBy(desc(botSessions.createdAt))
        .limit(1);

      if (!session) return { logs: [], currentStep: null, status: "idle" as const };

      const logs = session.logMessages ? (typeof session.logMessages === "string" ? JSON.parse(session.logMessages) : session.logMessages) : [];
      return {
        logs: logs as string[],
        currentStep: session.currentStep,
        status: session.status,
      };
    }),
});
