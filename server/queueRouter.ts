import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { users, signupQueue } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { COST_PER_SIGNUP, MAX_BATCH, isValidManusUrl } from "./botUtils";
import { runRealBot } from "./realBot";

export const queueRouter = router({
  /** Start a new signup task */
  start: protectedProcedure
    .input(z.object({
      inviteUrl: z.string().min(1, "URL é obrigatória"),
      quantity: z.number().int().min(1).max(MAX_BATCH),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isValidManusUrl(input.inviteUrl)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL inválida. Apenas links manus.im/invitation/ são aceitos.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check credits
      const [userRow] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const totalCost = input.quantity * COST_PER_SIGNUP;

      if ((userRow?.credits ?? 0) < totalCost) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Créditos insuficientes. Necessário: ${totalCost}, disponível: ${userRow?.credits ?? 0}`,
        });
      }

      // Deduct credits
      await db.update(users)
        .set({ credits: sql`${users.credits} - ${totalCost}` })
        .where(eq(users.id, ctx.user.id));

      // Create queue entry
      const priority = input.quantity === 1 ? 1 : 0;
      const [insertResult] = await db.insert(signupQueue).values({
        userId: ctx.user.id,
        inviteUrl: input.inviteUrl,
        quantity: input.quantity,
        priority,
        status: "pending",
      });

      const queueId = (insertResult as any).insertId;

      // Start REAL bot automation in background
      runRealBot(ctx.user.id, queueId, input.inviteUrl, input.quantity, db);

      return {
        queueId,
        totalCost,
        message: `${input.quantity} cadastro(s) adicionado(s) à fila. Custo: ${totalCost} créditos. Bot REAL iniciado.`,
      };
    }),

  /** List user's queue items */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const items = await db.select().from(signupQueue)
      .where(eq(signupQueue.userId, ctx.user.id))
      .orderBy(desc(signupQueue.createdAt))
      .limit(50);

    return items;
  }),

  /** Cancel a pending or processing queue item */
  cancel: protectedProcedure
    .input(z.object({ queueId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db.select().from(signupQueue)
        .where(and(eq(signupQueue.id, input.queueId), eq(signupQueue.userId, ctx.user.id)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
      if (item.status !== "pending" && item.status !== "processing") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível cancelar itens pendentes ou em processamento" });
      }

      // Refund credits for unprocessed items
      const refund = (item.quantity - item.processed) * COST_PER_SIGNUP;
      await db.update(users)
        .set({ credits: sql`${users.credits} + ${refund}` })
        .where(eq(users.id, ctx.user.id));

      await db.update(signupQueue)
        .set({ status: "cancelled" })
        .where(eq(signupQueue.id, input.queueId));

      return { refund, message: `Cancelado. ${refund} créditos devolvidos.` };
    }),

  /** Get status of a specific queue item */
  status: protectedProcedure
    .input(z.object({ queueId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db.select().from(signupQueue)
        .where(and(eq(signupQueue.id, input.queueId), eq(signupQueue.userId, ctx.user.id)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });

      return item;
    }),
});
