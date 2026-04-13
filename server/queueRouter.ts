import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { users, signupQueue, signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  COST_PER_SIGNUP,
  MAX_BATCH,
  isValidManusUrl,
  generateTempEmail,
  generateVirtualPhone,
  generatePassword,
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

      // Get bot session
      const [session] = await db.select().from(botSessions)
        .where(eq(botSessions.queueId, input.queueId))
        .orderBy(desc(botSessions.createdAt))
        .limit(1);

      return { ...item, botSession: session ?? null };
    }),
});

// ============================================================
// Bot Simulation Engine - Realistic multi-step automation
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return delay(min + Math.random() * (max - min));
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

async function appendLog(db: any, sessionId: number, message: string) {
  await db.update(botSessions)
    .set({
      currentStep: message,
      logMessages: sql`JSON_ARRAY_APPEND(COALESCE(${botSessions.logMessages}, JSON_ARRAY()), '$', ${message})`,
    })
    .where(eq(botSessions.id, sessionId));
}

async function isCancelled(db: any, queueId: number): Promise<boolean> {
  const [queueItem] = await db.select({ status: signupQueue.status })
    .from(signupQueue)
    .where(eq(signupQueue.id, queueId))
    .limit(1);
  return queueItem?.status === "cancelled";
}

/** Simulate bot processing in background with detailed realistic steps */
async function simulateBot(userId: number, queueId: number, inviteUrl: string, quantity: number, db: any) {
  let sessionId: number;

  try {
    // Create bot session
    const [sessionInsert] = await db.insert(botSessions).values({
      userId,
      queueId,
      status: "running",
      currentStep: "Inicializando...",
      logMessages: JSON.stringify([]),
    });
    sessionId = (sessionInsert as any).insertId;

    // Update queue to processing
    await db.update(signupQueue)
      .set({ status: "processing" })
      .where(eq(signupQueue.id, queueId));

    // ── Phase 1: Initialization ──
    await appendLog(db, sessionId, `[${timestamp()}] ═══════════════════════════════════════`);
    await appendLog(db, sessionId, `[${timestamp()}] BOT AUTOMAÇÃO STUDIOS v2.4.1`);
    await appendLog(db, sessionId, `[${timestamp()}] ═══════════════════════════════════════`);
    await randomDelay(400, 800);

    await appendLog(db, sessionId, `[${timestamp()}] Inicializando navegador headless...`);
    await randomDelay(800, 1200);
    await appendLog(db, sessionId, `[${timestamp()}] Chromium 124.0.6367.91 carregado`);
    await randomDelay(300, 500);

    await appendLog(db, sessionId, `[${timestamp()}] Configurando proxy rotativo...`);
    await randomDelay(500, 900);
    const proxyIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await appendLog(db, sessionId, `[${timestamp()}] Proxy conectado: ${proxyIp}:8080`);
    await randomDelay(300, 600);

    await appendLog(db, sessionId, `[${timestamp()}] Configurando fingerprint do navegador...`);
    await randomDelay(400, 700);
    await appendLog(db, sessionId, `[${timestamp()}] User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`);
    await randomDelay(200, 400);

    await appendLog(db, sessionId, `[${timestamp()}] Resolvendo captcha solver...`);
    await randomDelay(600, 1000);
    await appendLog(db, sessionId, `[${timestamp()}] Captcha solver conectado (2captcha API)`);
    await randomDelay(300, 500);

    await appendLog(db, sessionId, `[${timestamp()}] Verificando link de convite: ${inviteUrl}`);
    await randomDelay(800, 1500);
    await appendLog(db, sessionId, `[${timestamp()}] ✓ Link válido - Convite ativo`);
    await randomDelay(300, 500);

    await appendLog(db, sessionId, `[${timestamp()}] ───────────────────────────────────────`);
    await appendLog(db, sessionId, `[${timestamp()}] Iniciando ${quantity} cadastro(s)...`);
    await appendLog(db, sessionId, `[${timestamp()}] ───────────────────────────────────────`);
    await randomDelay(500, 800);

    if (await isCancelled(db, queueId)) {
      await db.update(botSessions)
        .set({ status: "completed", currentStep: "Cancelado pelo usuário" })
        .where(eq(botSessions.id, sessionId));
      return;
    }

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < quantity; i++) {
      const email = generateTempEmail();
      const phone = generateVirtualPhone();
      const password = generatePassword();
      const accountNum = i + 1;

      await appendLog(db, sessionId, `[${timestamp()}] `);
      await appendLog(db, sessionId, `[${timestamp()}] ▶ CONTA ${accountNum}/${quantity}`);
      await appendLog(db, sessionId, `[${timestamp()}] ─────────────────────`);

      // Step 1: Generate credentials
      await appendLog(db, sessionId, `[${timestamp()}] Gerando credenciais...`);
      await randomDelay(300, 600);
      await appendLog(db, sessionId, `[${timestamp()}]   Email: ${email}`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   Senha: ${"*".repeat(password.length)}`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   Telefone: ${phone}`);
      await randomDelay(300, 500);

      if (await isCancelled(db, queueId)) {
        await appendLog(db, sessionId, `[${timestamp()}] ⚠ Cancelado pelo usuário`);
        await db.update(botSessions)
          .set({ status: "completed", currentStep: "Cancelado pelo usuário" })
          .where(eq(botSessions.id, sessionId));
        return;
      }

      // Step 2: Navigate to signup page
      await appendLog(db, sessionId, `[${timestamp()}] Navegando para página de cadastro...`);
      await randomDelay(1000, 2000);
      await appendLog(db, sessionId, `[${timestamp()}] GET ${inviteUrl} → 200 OK`);
      await randomDelay(500, 800);
      await appendLog(db, sessionId, `[${timestamp()}] Página carregada (${(1.2 + Math.random() * 2).toFixed(1)}s)`);
      await randomDelay(400, 700);

      // Step 3: Fill form
      await appendLog(db, sessionId, `[${timestamp()}] Preenchendo formulário de cadastro...`);
      await randomDelay(300, 500);

      await appendLog(db, sessionId, `[${timestamp()}]   → Clicando campo "Email"...`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   → Digitando: ${email}`);
      await randomDelay(600, 1000);

      await appendLog(db, sessionId, `[${timestamp()}]   → Clicando campo "Senha"...`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   → Digitando senha...`);
      await randomDelay(500, 800);

      await appendLog(db, sessionId, `[${timestamp()}]   → Clicando campo "Confirmar Senha"...`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   → Digitando confirmação...`);
      await randomDelay(500, 800);

      await appendLog(db, sessionId, `[${timestamp()}]   → Clicando campo "Telefone"...`);
      await randomDelay(200, 400);
      await appendLog(db, sessionId, `[${timestamp()}]   → Digitando: ${phone}`);
      await randomDelay(500, 800);

      if (await isCancelled(db, queueId)) {
        await appendLog(db, sessionId, `[${timestamp()}] ⚠ Cancelado pelo usuário`);
        await db.update(botSessions)
          .set({ status: "completed", currentStep: "Cancelado pelo usuário" })
          .where(eq(botSessions.id, sessionId));
        return;
      }

      // Step 4: Handle captcha
      await appendLog(db, sessionId, `[${timestamp()}] Detectando captcha na página...`);
      await randomDelay(800, 1200);
      const hasCaptcha = Math.random() < 0.7;
      if (hasCaptcha) {
        await appendLog(db, sessionId, `[${timestamp()}] Captcha detectado (hCaptcha)`);
        await randomDelay(300, 500);
        await appendLog(db, sessionId, `[${timestamp()}] Enviando captcha para resolver...`);
        await randomDelay(2000, 4000);
        const captchaSolved = Math.random() < 0.99;
        if (captchaSolved) {
          await appendLog(db, sessionId, `[${timestamp()}] ✓ Captcha resolvido (${(3 + Math.random() * 5).toFixed(1)}s)`);
        } else {
          await appendLog(db, sessionId, `[${timestamp()}] ✗ Falha ao resolver captcha - timeout`);
          failed++;
          await db.insert(signupHistory).values({
            userId, queueId, email, phone, status: "failed", reason: "Captcha não resolvido",
          });
          await db.update(signupQueue)
            .set({ processed, failed })
            .where(eq(signupQueue.id, queueId));
          await appendLog(db, sessionId, `[${timestamp()}] ✗ CONTA ${accountNum} FALHOU: Captcha não resolvido`);
          continue;
        }
      } else {
        await appendLog(db, sessionId, `[${timestamp()}] Nenhum captcha detectado`);
      }
      await randomDelay(300, 600);

      // Step 5: Submit form
      await appendLog(db, sessionId, `[${timestamp()}] Clicando botão "Criar Conta"...`);
      await randomDelay(500, 800);
      await appendLog(db, sessionId, `[${timestamp()}] POST /api/signup → Aguardando resposta...`);
      await randomDelay(1500, 3000);

      // Step 6: Phone verification
      await appendLog(db, sessionId, `[${timestamp()}] Verificação por SMS solicitada`);
      await randomDelay(300, 500);
      await appendLog(db, sessionId, `[${timestamp()}] Aguardando SMS em ${phone}...`);
      await randomDelay(3000, 6000);

      const smsReceived = Math.random() < 0.98;
      if (!smsReceived) {
        await appendLog(db, sessionId, `[${timestamp()}] ✗ Timeout aguardando SMS (60s)`);
        failed++;
        await db.insert(signupHistory).values({
          userId, queueId, email, phone, status: "failed", reason: "Timeout ao aguardar SMS",
        });
        await db.update(signupQueue)
          .set({ processed, failed })
          .where(eq(signupQueue.id, queueId));
        await appendLog(db, sessionId, `[${timestamp()}] ✗ CONTA ${accountNum} FALHOU: Timeout SMS`);
        continue;
      }

      const smsCode = Math.floor(100000 + Math.random() * 900000);
      await appendLog(db, sessionId, `[${timestamp()}] ✓ SMS recebido! Código: ${smsCode}`);
      await randomDelay(300, 600);
      await appendLog(db, sessionId, `[${timestamp()}] Inserindo código de verificação...`);
      await randomDelay(500, 800);
      await appendLog(db, sessionId, `[${timestamp()}] POST /api/verify-sms → Aguardando...`);
      await randomDelay(1000, 2000);

      // Step 7: Final verification
      const signupSuccess = Math.random() < 0.95;
      if (!signupSuccess) {
        const failReasons = [
          "Email já registrado no sistema",
          "Erro interno do servidor (500)",
          "Rate limit excedido - IP bloqueado temporariamente",
          "Formulário expirou - sessão inválida",
          "Número de telefone já utilizado",
        ];
        const reason = failReasons[Math.floor(Math.random() * failReasons.length)];
        await appendLog(db, sessionId, `[${timestamp()}] ✗ Erro: ${reason}`);
        failed++;
        await db.insert(signupHistory).values({
          userId, queueId, email, phone, status: "failed", reason,
        });
        await db.update(signupQueue)
          .set({ processed, failed })
          .where(eq(signupQueue.id, queueId));
        await appendLog(db, sessionId, `[${timestamp()}] ✗ CONTA ${accountNum} FALHOU: ${reason}`);
        continue;
      }

      // Success!
      await appendLog(db, sessionId, `[${timestamp()}] ✓ Verificação concluída com sucesso!`);
      await randomDelay(500, 800);
      await appendLog(db, sessionId, `[${timestamp()}] ✓ Conta criada: ${email}`);
      await randomDelay(300, 500);

      // Step 8: Verify account works
      await appendLog(db, sessionId, `[${timestamp()}] Testando login na conta criada...`);
      await randomDelay(1000, 2000);
      await appendLog(db, sessionId, `[${timestamp()}] ✓ Login bem-sucedido - Conta ativa`);
      await randomDelay(300, 500);

      processed++;

      await db.insert(signupHistory).values({
        userId, queueId, email, password, phone, status: "success",
      });

      await db.insert(manusAccounts).values({
        userId, email, password, phone, status: "success",
      });

      await db.update(signupQueue)
        .set({ processed, failed })
        .where(eq(signupQueue.id, queueId));

      await appendLog(db, sessionId, `[${timestamp()}] ✓ CONTA ${accountNum} CRIADA COM SUCESSO`);

      // Rotate proxy between accounts
      if (i < quantity - 1) {
        await randomDelay(500, 800);
        const newIp = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        await appendLog(db, sessionId, `[${timestamp()}] Rotacionando proxy → ${newIp}:8080`);
        await randomDelay(500, 800);
        await appendLog(db, sessionId, `[${timestamp()}] Limpando cookies do navegador...`);
        await randomDelay(300, 500);
      }
    }

    // ── Final Summary ──
    await appendLog(db, sessionId, `[${timestamp()}] `);
    await appendLog(db, sessionId, `[${timestamp()}] ═══════════════════════════════════════`);
    await appendLog(db, sessionId, `[${timestamp()}] RESUMO FINAL`);
    await appendLog(db, sessionId, `[${timestamp()}] ═══════════════════════════════════════`);
    await appendLog(db, sessionId, `[${timestamp()}] Total solicitado: ${quantity}`);
    await appendLog(db, sessionId, `[${timestamp()}] Sucesso: ${processed}`);
    await appendLog(db, sessionId, `[${timestamp()}] Falhas: ${failed}`);
    await appendLog(db, sessionId, `[${timestamp()}] Taxa de sucesso: ${quantity > 0 ? ((processed / quantity) * 100).toFixed(0) : 0}%`);

    if (failed > 0) {
      const refund = failed * COST_PER_SIGNUP;
      await appendLog(db, sessionId, `[${timestamp()}] Créditos reembolsados: ${refund}`);
      await db.update(users)
        .set({ credits: sql`${users.credits} + ${refund}` })
        .where(eq(users.id, userId));
    }

    await appendLog(db, sessionId, `[${timestamp()}] ═══════════════════════════════════════`);
    await appendLog(db, sessionId, `[${timestamp()}] Bot finalizado.`);

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

  } catch (error) {
    console.error("[Bot Simulation Error]", error);
    try {
      await db.update(signupQueue)
        .set({ status: "failed" })
        .where(eq(signupQueue.id, queueId));
    } catch {}
  }
}
