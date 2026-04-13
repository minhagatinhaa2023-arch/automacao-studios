import { Router, Request, Response, NextFunction } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { users, apiKeys, signupQueue, signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { getDb } from "./db";
import {
  COST_PER_SIGNUP,
  MAX_BATCH,
  isValidManusUrl,
} from "./botUtils";
import { runRealBot } from "./realBot";

const apiRouter = Router();

/**
 * API Key authentication middleware
 * Expects: Authorization: Bearer ask_xxxxx
 */
async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ask_")) {
    res.status(401).json({ error: "Unauthorized", message: "API key inválida ou ausente. Use: Authorization: Bearer ask_xxxxx" });
    return;
  }

  const key = authHeader.replace("Bearer ", "");
  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "Internal Server Error", message: "Database unavailable" });
    return;
  }

  const [apiKeyRow] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.key, key), eq(apiKeys.active, true)))
    .limit(1);

  if (!apiKeyRow) {
    res.status(401).json({ error: "Unauthorized", message: "API key inválida ou revogada" });
    return;
  }

  // Attach user info to request
  const [user] = await db.select().from(users).where(eq(users.id, apiKeyRow.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized", message: "Usuário não encontrado" });
    return;
  }

  (req as any).apiUser = user;
  (req as any).db = db;
  next();
}

apiRouter.use(authenticateApiKey);

/**
 * GET /api/v1/balance
 * Returns the user's current credit balance
 */
apiRouter.get("/balance", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  res.json({
    success: true,
    data: {
      credits: user.credits,
      costPerSignup: COST_PER_SIGNUP,
      maxBatch: MAX_BATCH,
    },
  });
});

/**
 * POST /api/v1/signup
 * Start a new signup task
 * Body: { inviteUrl: string, quantity: number }
 */
apiRouter.post("/signup", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;
  const { inviteUrl, quantity } = req.body;

  if (!inviteUrl || typeof inviteUrl !== "string") {
    res.status(400).json({ error: "Bad Request", message: "inviteUrl é obrigatório" });
    return;
  }

  if (!isValidManusUrl(inviteUrl)) {
    res.status(400).json({ error: "Bad Request", message: "URL inválida. Apenas links manus.im/invitation/ são aceitos." });
    return;
  }

  const qty = parseInt(quantity) || 1;
  if (qty < 1 || qty > MAX_BATCH) {
    res.status(400).json({ error: "Bad Request", message: `Quantidade deve ser entre 1 e ${MAX_BATCH}` });
    return;
  }

  const totalCost = qty * COST_PER_SIGNUP;
  if (user.credits < totalCost) {
    res.status(400).json({
      error: "Insufficient Credits",
      message: `Créditos insuficientes. Necessário: ${totalCost}, disponível: ${user.credits}`,
    });
    return;
  }

  // Deduct credits
  await db.update(users)
    .set({ credits: sql`${users.credits} - ${totalCost}` })
    .where(eq(users.id, user.id));

  // Create queue entry
  const priority = qty === 1 ? 1 : 0;
  const [insertResult] = await db.insert(signupQueue).values({
    userId: user.id,
    inviteUrl,
    quantity: qty,
    priority,
    status: "pending",
  });

  const queueId = (insertResult as any).insertId;

  // Start REAL bot automation in background
  runRealBot(user.id, queueId, inviteUrl, qty, db);

  res.json({
    success: true,
    data: {
      queueId,
      totalCost,
      quantity: qty,
      message: `${qty} cadastro(s) adicionado(s) à fila.`,
    },
  });
});

/**
 * GET /api/v1/status/:queueId
 * Get status of a queue item
 */
apiRouter.get("/status/:queueId", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;
  const queueId = parseInt(req.params.queueId);

  if (!queueId || isNaN(queueId)) {
    res.status(400).json({ error: "Bad Request", message: "queueId inválido" });
    return;
  }

  const [item] = await db.select().from(signupQueue)
    .where(and(eq(signupQueue.id, queueId), eq(signupQueue.userId, user.id)))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Not Found", message: "Item não encontrado" });
    return;
  }

  const [session] = await db.select().from(botSessions)
    .where(eq(botSessions.queueId, queueId))
    .orderBy(desc(botSessions.createdAt))
    .limit(1);

  res.json({
    success: true,
    data: {
      id: item.id,
      status: item.status,
      quantity: item.quantity,
      processed: item.processed,
      failed: item.failed,
      inviteUrl: item.inviteUrl,
      createdAt: item.createdAt,
      currentStep: session?.currentStep ?? null,
      botStatus: session?.status ?? "idle",
    },
  });
});

/**
 * POST /api/v1/cancel/:queueId
 * Cancel a pending/processing queue item
 */
apiRouter.post("/cancel/:queueId", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;
  const queueId = parseInt(req.params.queueId);

  if (!queueId || isNaN(queueId)) {
    res.status(400).json({ error: "Bad Request", message: "queueId inválido" });
    return;
  }

  const [item] = await db.select().from(signupQueue)
    .where(and(eq(signupQueue.id, queueId), eq(signupQueue.userId, user.id)))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Not Found", message: "Item não encontrado" });
    return;
  }

  if (item.status !== "pending" && item.status !== "processing") {
    res.status(400).json({ error: "Bad Request", message: "Só é possível cancelar itens pendentes ou em processamento" });
    return;
  }

  const refund = (item.quantity - item.processed) * COST_PER_SIGNUP;
  await db.update(users)
    .set({ credits: sql`${users.credits} + ${refund}` })
    .where(eq(users.id, user.id));

  await db.update(signupQueue)
    .set({ status: "cancelled" })
    .where(eq(signupQueue.id, queueId));

  res.json({
    success: true,
    data: {
      refund,
      message: `Cancelado. ${refund} créditos devolvidos.`,
    },
  });
});

/**
 * GET /api/v1/accounts
 * List created accounts
 */
apiRouter.get("/accounts", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const items = await db.select({
    id: manusAccounts.id,
    email: manusAccounts.email,
    phone: manusAccounts.phone,
    status: manusAccounts.status,
    createdAt: manusAccounts.createdAt,
  }).from(manusAccounts)
    .where(eq(manusAccounts.userId, user.id))
    .orderBy(desc(manusAccounts.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    success: true,
    data: items,
    pagination: { limit, offset },
  });
});

/**
 * GET /api/v1/accounts/:accountId
 * Get account details including password
 */
apiRouter.get("/accounts/:accountId", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;
  const accountId = parseInt(req.params.accountId);

  if (!accountId || isNaN(accountId)) {
    res.status(400).json({ error: "Bad Request", message: "accountId inválido" });
    return;
  }

  const [account] = await db.select().from(manusAccounts)
    .where(and(eq(manusAccounts.id, accountId), eq(manusAccounts.userId, user.id)))
    .limit(1);

  if (!account) {
    res.status(404).json({ error: "Not Found", message: "Conta não encontrada" });
    return;
  }

  res.json({
    success: true,
    data: account,
  });
});

/**
 * GET /api/v1/history
 * List signup history
 */
apiRouter.get("/history", async (req: Request, res: Response) => {
  const user = (req as any).apiUser;
  const db = (req as any).db;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const items = await db.select().from(signupHistory)
    .where(eq(signupHistory.userId, user.id))
    .orderBy(desc(signupHistory.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    success: true,
    data: items,
    pagination: { limit, offset },
  });
});



export { apiRouter };
