import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { users, signupQueue, signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import {
  COST_PER_SIGNUP,
  MAX_BATCH,
  isValidManusUrl,
  generateTempEmail,
  generateVirtualPhone,
  generatePassword,
  calculatePriority,
  calculateRefund,
} from "./botUtils";

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

      // Start bot simulation in background
      simulateBot(ctx.user.id, queueId, input.inviteUrl, input.quantity, db);

      return {
        queueId,
        totalCost,
        message: `${input.quantity} cadastro(s) adicionado(s) à fila. Custo: ${totalCost} créditos.`,
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

  /** Cancel a pending queue item */
  cancel: protectedProcedure
    .input(z.object({ queueId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [item] = await db.select().from(signupQueue)
        .where(and(eq(signupQueue.id, input.queueId), eq(signupQueue.userId, ctx.user.id)))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
      if (item.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível cancelar itens pendentes" });
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

      // Get bot session
      const [session] = await db.select().from(botSessions)
        .where(eq(botSessions.queueId, input.queueId))
        .orderBy(desc(botSessions.createdAt))
        .limit(1);

      return { ...item, botSession: session ?? null };
    }),
});

/** Simulate bot processing in background */
async function simulateBot(userId: number, queueId: number, inviteUrl: string, quantity: number, db: any) {
  try {
    // Create bot session
    const [sessionInsert] = await db.insert(botSessions).values({
      userId,
      queueId,
      status: "running",
      currentStep: "Iniciando bot...",
      logMessages: JSON.stringify(["[BOT] Sessão iniciada"]),
    });
    const sessionId = (sessionInsert as any).insertId;

    // Update queue to processing
    await db.update(signupQueue)
      .set({ status: "processing" })
      .where(eq(signupQueue.id, queueId));

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < quantity; i++) {
      const email = generateTempEmail();
      const phone = generateVirtualPhone();
      const password = generatePassword();

      const steps = [
        `[${i + 1}/${quantity}] Gerando email temporário: ${email}`,
        `[${i + 1}/${quantity}] Gerando número virtual: ${phone}`,
        `[${i + 1}/${quantity}] Abrindo link de convite...`,
        `[${i + 1}/${quantity}] Preenchendo formulário de cadastro...`,
        `[${i + 1}/${quantity}] Inserindo email: ${email}`,
        `[${i + 1}/${quantity}] Inserindo senha...`,
        `[${i + 1}/${quantity}] Inserindo telefone: ${phone}`,
        `[${i + 1}/${quantity}] Aguardando SMS de confirmação...`,
        `[${i + 1}/${quantity}] SMS recebido! Código: ${Math.floor(100000 + Math.random() * 900000)}`,
        `[${i + 1}/${quantity}] Confirmando cadastro...`,
      ];

      for (const step of steps) {
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

        // Check if cancelled
        const [queueItem] = await db.select({ status: signupQueue.status })
          .from(signupQueue)
          .where(eq(signupQueue.id, queueId))
          .limit(1);

        if (queueItem?.status === "cancelled") {
          await db.update(botSessions)
            .set({ status: "completed", currentStep: "Cancelado pelo usuário" })
            .where(eq(botSessions.id, sessionId));
          return;
        }

        await db.update(botSessions)
          .set({
            currentStep: step,
            logMessages: sql`JSON_ARRAY_APPEND(COALESCE(${botSessions.logMessages}, JSON_ARRAY()), '$', ${step})`,
          })
          .where(eq(botSessions.id, sessionId));
      }

      // Simulate success/failure (90% success rate)
      const isSuccess = Math.random() < 0.9;

      if (isSuccess) {
        processed++;

        await db.insert(signupHistory).values({
          userId,
          queueId,
          email,
          password,
          phone,
          status: "success",
        });

        await db.insert(manusAccounts).values({
          userId,
          email,
          password,
          phone,
          status: "success",
        });

        await db.update(botSessions)
          .set({
            currentStep: `[${i + 1}/${quantity}] Cadastro concluído com sucesso!`,
            logMessages: sql`JSON_ARRAY_APPEND(COALESCE(${botSessions.logMessages}, JSON_ARRAY()), '$', ${`[${i + 1}/${quantity}] ✓ Conta criada: ${email}`})`,
          })
          .where(eq(botSessions.id, sessionId));
      } else {
        failed++;

        const reasons = [
          "Timeout ao aguardar SMS",
          "Email já registrado",
          "Captcha não resolvido",
          "Erro de rede",
          "Formulário expirou",
        ];
        const reason = reasons[Math.floor(Math.random() * reasons.length)];

        await db.insert(signupHistory).values({
          userId,
          queueId,
          email,
          phone,
          status: "failed",
          reason,
        });

        await db.update(botSessions)
          .set({
            currentStep: `[${i + 1}/${quantity}] Falha: ${reason}`,
            logMessages: sql`JSON_ARRAY_APPEND(COALESCE(${botSessions.logMessages}, JSON_ARRAY()), '$', ${`[${i + 1}/${quantity}] ✗ Falha: ${reason}`})`,
          })
          .where(eq(botSessions.id, sessionId));
      }

      // Update queue progress
      await db.update(signupQueue)
        .set({ processed, failed })
        .where(eq(signupQueue.id, queueId));
    }

    // Complete
    const finalStatus = failed === quantity ? "failed" : "completed";
    await db.update(signupQueue)
      .set({ status: finalStatus, processed, failed })
      .where(eq(signupQueue.id, queueId));

    await db.update(botSessions)
      .set({
        status: "completed",
        currentStep: `Concluído: ${processed} sucesso, ${failed} falha(s)`,
      })
      .where(eq(botSessions.id, sessionId));

    // Refund failed signups
    if (failed > 0) {
      const refund = failed * COST_PER_SIGNUP;
      await db.update(users)
        .set({ credits: sql`${users.credits} + ${refund}` })
        .where(eq(users.id, userId));
    }
  } catch (error) {
    console.error("[Bot Simulation Error]", error);
    await db.update(signupQueue)
      .set({ status: "failed" })
      .where(eq(signupQueue.id, queueId));
  }
}
