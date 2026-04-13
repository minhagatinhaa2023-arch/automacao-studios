import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { users, signupQueue, signupHistory, manusAccounts, apiKeys } from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

export const adminRouter = router({
  /** List all users */
  listUsers: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        credits: users.credits,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);

      return { users: items, total: Number(countResult?.count ?? 0) };
    }),

  /** Set user credits */
  setCredits: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      credits: z.number().int().min(0).max(1000000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(users)
        .set({ credits: input.credits })
        .where(eq(users.id, input.userId));

      return { userId: input.userId, credits: input.credits };
    }),

  /** Set user role */
  setRole: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      role: z.enum(["user", "admin"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      return { userId: input.userId, role: input.role };
    }),

  /** List all queue items (all users) */
  listQueue: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const items = await db.select().from(signupQueue)
        .orderBy(desc(signupQueue.createdAt))
        .limit(limit)
        .offset(offset);

      return items;
    }),

  /** Dashboard stats */
  dashboardStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
    const [queueCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(signupQueue);
    const [successCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(signupHistory).where(sql`status = 'success'`);
    const [failedCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(signupHistory).where(sql`status = 'failed'`);
    const [accountCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(manusAccounts);

    return {
      totalUsers: Number(userCount?.count ?? 0),
      totalQueue: Number(queueCount?.count ?? 0),
      totalSuccess: Number(successCount?.count ?? 0),
      totalFailed: Number(failedCount?.count ?? 0),
      totalAccounts: Number(accountCount?.count ?? 0),
    };
  }),
});
