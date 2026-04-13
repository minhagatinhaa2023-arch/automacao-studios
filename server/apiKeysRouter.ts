import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { apiKeys } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

export const apiKeysRouter = router({
  /** List user's API keys */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const keys = await db.select({
      id: apiKeys.id,
      key: apiKeys.key,
      label: apiKeys.label,
      active: apiKeys.active,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys)
      .where(eq(apiKeys.userId, ctx.user.id))
      .orderBy(desc(apiKeys.createdAt));

    return keys;
  }),

  /** Generate a new API key */
  create: protectedProcedure
    .input(z.object({
      label: z.string().min(1).max(100).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const key = `ask_${nanoid(48)}`;

      await db.insert(apiKeys).values({
        userId: ctx.user.id,
        key,
        label: input?.label ?? "API Key",
        active: true,
      });

      return { key, label: input?.label ?? "API Key" };
    }),

  /** Revoke an API key */
  revoke: protectedProcedure
    .input(z.object({ keyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [key] = await db.select().from(apiKeys)
        .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.userId, ctx.user.id)))
        .limit(1);

      if (!key) throw new TRPCError({ code: "NOT_FOUND", message: "API Key não encontrada" });

      await db.update(apiKeys)
        .set({ active: false })
        .where(eq(apiKeys.id, input.keyId));

      return { success: true };
    }),

  /** Delete an API key */
  delete: protectedProcedure
    .input(z.object({ keyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(apiKeys)
        .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.userId, ctx.user.id)));

      return { success: true };
    }),
});
