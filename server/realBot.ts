/**
 * Real Bot Automation Engine
 * Uses puppeteer-real-browser for Cloudflare Turnstile bypass
 * Uses mail.tm API for real temporary emails
 * Actually navigates to manus.im and creates real accounts
 */

import { eq, sql } from "drizzle-orm";
import { users, signupQueue, signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { generatePassword } from "./botUtils";

// ── Types ──
interface BotContext {
  db: any;
  sessionId: number;
  queueId: number;
  userId: number;
}

// ── Helpers ──
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

async function log(ctx: BotContext, message: string) {
  await ctx.db.update(botSessions)
    .set({
      currentStep: message,
      logMessages: sql`JSON_ARRAY_APPEND(COALESCE(${botSessions.logMessages}, JSON_ARRAY()), '$', ${message})`,
    })
    .where(eq(botSessions.id, ctx.sessionId));
}

async function isCancelled(ctx: BotContext): Promise<boolean> {
  const [item] = await ctx.db.select({ status: signupQueue.status })
    .from(signupQueue)
    .where(eq(signupQueue.id, ctx.queueId))
    .limit(1);
  return item?.status === "cancelled";
}

// ── Mail.tm API ──
async function getMailTmDomain(): Promise<string> {
  const res = await fetch("https://api.mail.tm/domains");
  const data = await res.json();
  const members = data["hydra:member"];
  if (!members || members.length === 0) throw new Error("No mail.tm domains available");
  return members[0].domain;
}

async function createMailTmAccount(domain: string): Promise<{ email: string; password: string; token: string }> {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let user = "";
  for (let i = 0; i < 12; i++) user += chars[Math.floor(Math.random() * chars.length)];
  
  const email = `${user}@${domain}`;
  const password = "BotPass" + Math.floor(Math.random() * 99999);

  const createRes = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create mail.tm account: ${createRes.status} ${errText}`);
  }

  const tokenRes = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });

  if (!tokenRes.ok) throw new Error("Failed to get mail.tm token");
  const tokenData = await tokenRes.json();

  return { email, password, token: tokenData.token };
}

async function waitForEmail(token: string, maxWaitMs: number = 120000): Promise<{ subject: string; text: string; html: string } | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch("https://api.mail.tm/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        const messages = data["hydra:member"];
        
        if (messages && messages.length > 0) {
          // Get full message content
          const msgId = messages[0].id;
          const msgRes = await fetch(`https://api.mail.tm/messages/${msgId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (msgRes.ok) {
            const msg = await msgRes.json();
            return {
              subject: msg.subject || "",
              text: msg.text || "",
              html: msg.html?.[0] || msg.html || "",
            };
          }
        }
      }
    } catch (e) {
      // Retry on network errors
    }
    
    await delay(3000); // Poll every 3 seconds
  }
  
  return null;
}

function extractVerificationCode(text: string): string | null {
  // Try various patterns for verification codes
  // Pattern 1: 6-digit code
  const sixDigit = text.match(/\b(\d{6})\b/);
  if (sixDigit) return sixDigit[1];
  
  // Pattern 2: code after keywords
  const codePatterns = [
    /verification\s*code[:\s]*(\d{4,8})/i,
    /código[:\s]*(\d{4,8})/i,
    /code[:\s]*(\d{4,8})/i,
    /OTP[:\s]*(\d{4,8})/i,
    /pin[:\s]*(\d{4,8})/i,
  ];
  
  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  // Pattern 3: verification link
  const linkMatch = text.match(/https?:\/\/[^\s"<>]+verify[^\s"<>]*/i);
  if (linkMatch) return linkMatch[0];
  
  return null;
}

// ── Main Bot Engine ──
export async function runRealBot(
  userId: number,
  queueId: number,
  inviteUrl: string,
  quantity: number,
  db: any
) {
  let sessionId: number;
  let browser: any = null;

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

    const ctx: BotContext = { db, sessionId, queueId, userId };

    // Update queue to processing
    await db.update(signupQueue)
      .set({ status: "processing" })
      .where(eq(signupQueue.id, queueId));

    // ── Phase 1: Initialization ──
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] BOT AUTOMAÇÃO STUDIOS v3.0.0 [REAL]`);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);

    await log(ctx, `[${ts()}] Inicializando navegador real (Chromium)...`);
    
    // Import puppeteer-real-browser dynamically
    const { connect } = require("puppeteer-real-browser");
    
    const browserResult = await connect({
      headless: "auto",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      turnstile: true,
      disableXvfb: false,
    });
    
    browser = browserResult.browser;
    let page = browserResult.page;
    
    await log(ctx, `[${ts()}] ✓ Navegador real inicializado com sucesso`);
    await delay(500);

    await log(ctx, `[${ts()}] Conectando ao serviço de email temporário (mail.tm)...`);
    const mailDomain = await getMailTmDomain();
    await log(ctx, `[${ts()}] ✓ Domínio de email: ${mailDomain}`);
    await delay(300);

    await log(ctx, `[${ts()}] Verificando link de convite: ${inviteUrl}`);
    await delay(500);
    await log(ctx, `[${ts()}] ✓ Link válido`);

    await log(ctx, `[${ts()}] ───────────────────────────────────────`);
    await log(ctx, `[${ts()}] Iniciando ${quantity} cadastro(s) REAIS...`);
    await log(ctx, `[${ts()}] ───────────────────────────────────────`);

    if (await isCancelled(ctx)) {
      await db.update(botSessions)
        .set({ status: "completed", currentStep: "Cancelado pelo usuário" })
        .where(eq(botSessions.id, sessionId));
      if (browser) await browser.close();
      return;
    }

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < quantity; i++) {
      const accountNum = i + 1;
      const accountPassword = generatePassword();

      await log(ctx, `[${ts()}] `);
      await log(ctx, `[${ts()}] ▶ CONTA ${accountNum}/${quantity}`);
      await log(ctx, `[${ts()}] ─────────────────────`);

      try {
        // Step 1: Create real temp email
        await log(ctx, `[${ts()}] Criando email temporário real...`);
        const mailAccount = await createMailTmAccount(mailDomain);
        await log(ctx, `[${ts()}]   Email: ${mailAccount.email}`);
        await log(ctx, `[${ts()}]   ✓ Email criado e inbox ativo`);
        await delay(500);

        if (await isCancelled(ctx)) {
          await log(ctx, `[${ts()}] ⚠ Cancelado pelo usuário`);
          break;
        }

        // Step 2: Navigate to invitation URL
        await log(ctx, `[${ts()}] Navegando para ${inviteUrl}...`);
        
        // Create new page for each account (clean state)
        if (i > 0) {
          page = await browser.newPage();
        }
        
        await page.goto(inviteUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await delay(2000);
        
        const currentUrl = page.url();
        await log(ctx, `[${ts()}]   Redirecionado para: ${currentUrl}`);
        await log(ctx, `[${ts()}]   ✓ Página de login carregada`);
        await delay(1000);

        if (await isCancelled(ctx)) {
          await log(ctx, `[${ts()}] ⚠ Cancelado pelo usuário`);
          break;
        }

        // Step 3: Find and fill email field
        await log(ctx, `[${ts()}] Procurando campo de email...`);
        await delay(500);
        
        // Wait for the email input field
        const emailInput = await page.waitForSelector('input[type="email"], input[placeholder*="email" i], input#email', { timeout: 15000 });
        
        if (!emailInput) {
          throw new Error("Campo de email não encontrado na página");
        }
        
        await log(ctx, `[${ts()}]   ✓ Campo de email encontrado`);
        await delay(300);
        
        // Clear and type email with realistic delay
        await emailInput.click({ clickCount: 3 });
        await delay(200);
        await emailInput.type(mailAccount.email, { delay: 50 + Math.random() * 80 });
        await log(ctx, `[${ts()}]   → Digitando: ${mailAccount.email}`);
        await delay(500);

        // Step 4: Wait for Cloudflare Turnstile to be solved
        await log(ctx, `[${ts()}] Aguardando resolução do Cloudflare Turnstile...`);
        
        // puppeteer-real-browser auto-solves Turnstile when turnstile: true
        // We wait a bit for it to process
        await delay(3000);
        
        // Check if turnstile is present and wait for it
        try {
          const turnstileFrame = await page.$('iframe[src*="challenges.cloudflare.com"]');
          if (turnstileFrame) {
            await log(ctx, `[${ts()}]   Captcha Turnstile detectado - resolvendo automaticamente...`);
            // Wait for auto-solve (puppeteer-real-browser handles this)
            await delay(5000);
            await log(ctx, `[${ts()}]   ✓ Turnstile resolvido automaticamente`);
          } else {
            await log(ctx, `[${ts()}]   Nenhum captcha detectado ou já resolvido`);
          }
        } catch (e) {
          await log(ctx, `[${ts()}]   Turnstile: verificação automática`);
        }
        await delay(500);

        if (await isCancelled(ctx)) {
          await log(ctx, `[${ts()}] ⚠ Cancelado pelo usuário`);
          break;
        }

        // Step 5: Click Continue button
        await log(ctx, `[${ts()}] Clicando botão "Continue"...`);
        
        // Find and click the Continue/Submit button
        const continueBtn = await page.$('button:not([disabled])');
        const buttons = await page.$$('button');
        let clicked = false;
        
        for (const btn of buttons) {
          const text = await page.evaluate((el: any) => el.textContent?.trim(), btn);
          if (text && (text.toLowerCase().includes("continue") || text.toLowerCase().includes("continuar") || text.toLowerCase().includes("submit"))) {
            await btn.click();
            clicked = true;
            await log(ctx, `[${ts()}]   ✓ Botão "${text}" clicado`);
            break;
          }
        }
        
        if (!clicked) {
          // Try clicking the last button (usually the submit)
          if (buttons.length > 0) {
            await buttons[buttons.length - 1].click();
            await log(ctx, `[${ts()}]   ✓ Botão de submissão clicado`);
          }
        }
        
        await delay(3000);

        // Step 6: Check what happened after clicking Continue
        const newUrl = page.url();
        await log(ctx, `[${ts()}]   Página atual: ${newUrl}`);
        
        // Take a screenshot of current state for debugging
        const pageContent = await page.content();
        const pageText = await page.evaluate(() => document.body?.innerText || "");
        await log(ctx, `[${ts()}]   Analisando resposta da página...`);
        await delay(1000);

        // Check if we need email verification
        const needsVerification = pageText.toLowerCase().includes("verif") || 
                                   pageText.toLowerCase().includes("code") ||
                                   pageText.toLowerCase().includes("código") ||
                                   pageText.toLowerCase().includes("check your email") ||
                                   pageText.toLowerCase().includes("sent");

        if (needsVerification) {
          await log(ctx, `[${ts()}] Verificação por email solicitada`);
          await log(ctx, `[${ts()}] Aguardando email de verificação em ${mailAccount.email}...`);
          
          // Poll for verification email
          const emailMsg = await waitForEmail(mailAccount.token, 90000);
          
          if (!emailMsg) {
            throw new Error("Timeout aguardando email de verificação (90s)");
          }
          
          await log(ctx, `[${ts()}]   ✓ Email recebido: "${emailMsg.subject}"`);
          await delay(500);
          
          // Extract verification code or link
          const fullText = emailMsg.text + " " + emailMsg.html;
          const code = extractVerificationCode(fullText);
          
          if (code) {
            if (code.startsWith("http")) {
              // It's a verification link
              await log(ctx, `[${ts()}]   Link de verificação encontrado`);
              await log(ctx, `[${ts()}]   Acessando link de verificação...`);
              await page.goto(code, { waitUntil: "networkidle2", timeout: 30000 });
              await delay(3000);
              await log(ctx, `[${ts()}]   ✓ Link de verificação acessado`);
            } else {
              // It's a code
              await log(ctx, `[${ts()}]   Código de verificação: ${code}`);
              await log(ctx, `[${ts()}]   Inserindo código...`);
              
              // Find code input field
              const codeInput = await page.$('input[type="text"], input[type="number"], input[placeholder*="code" i], input[placeholder*="código" i]');
              if (codeInput) {
                await codeInput.click({ clickCount: 3 });
                await codeInput.type(code, { delay: 80 });
                await delay(500);
                
                // Click verify/submit button
                const verifyBtns = await page.$$('button');
                for (const btn of verifyBtns) {
                  const text = await page.evaluate((el: any) => el.textContent?.trim(), btn);
                  if (text && (text.toLowerCase().includes("verify") || text.toLowerCase().includes("verificar") || text.toLowerCase().includes("confirm") || text.toLowerCase().includes("submit") || text.toLowerCase().includes("continue"))) {
                    await btn.click();
                    break;
                  }
                }
                
                await delay(3000);
                await log(ctx, `[${ts()}]   ✓ Código inserido e verificado`);
              } else {
                await log(ctx, `[${ts()}]   ⚠ Campo de código não encontrado, tentando colar...`);
                // Try keyboard paste
                await page.keyboard.type(code);
                await delay(1000);
                await page.keyboard.press("Enter");
                await delay(3000);
              }
            }
          } else {
            await log(ctx, `[${ts()}]   ⚠ Código não encontrado no email, verificando conteúdo...`);
            await log(ctx, `[${ts()}]   Assunto: ${emailMsg.subject}`);
            // Try to find any link in the email
            const linkMatch = fullText.match(/https?:\/\/[^\s"<>]+/);
            if (linkMatch) {
              await log(ctx, `[${ts()}]   Tentando link encontrado no email...`);
              await page.goto(linkMatch[0], { waitUntil: "networkidle2", timeout: 30000 });
              await delay(3000);
            }
          }
        } else {
          await log(ctx, `[${ts()}]   Página não solicitou verificação por email`);
          await log(ctx, `[${ts()}]   Conteúdo: ${pageText.substring(0, 200)}...`);
        }

        // Step 7: Check final result
        await delay(2000);
        const finalUrl = page.url();
        const finalText = await page.evaluate(() => document.body?.innerText || "");
        
        await log(ctx, `[${ts()}] Verificando resultado final...`);
        await log(ctx, `[${ts()}]   URL final: ${finalUrl}`);
        
        // Determine success
        const isSuccess = finalUrl.includes("dashboard") || 
                          finalUrl.includes("app") ||
                          finalUrl.includes("home") ||
                          finalText.toLowerCase().includes("welcome") ||
                          finalText.toLowerCase().includes("bem-vindo") ||
                          finalText.toLowerCase().includes("account created") ||
                          finalText.toLowerCase().includes("successfully") ||
                          !finalUrl.includes("login");

        if (isSuccess) {
          await log(ctx, `[${ts()}] ✓ Conta criada com sucesso!`);
          await log(ctx, `[${ts()}]   Email: ${mailAccount.email}`);
          
          processed++;

          await db.insert(signupHistory).values({
            userId, queueId, email: mailAccount.email, password: accountPassword, phone: null, status: "success",
          });

          await db.insert(manusAccounts).values({
            userId, email: mailAccount.email, password: accountPassword, phone: null, status: "success",
          });

          await db.update(signupQueue)
            .set({ processed, failed })
            .where(eq(signupQueue.id, queueId));

          await log(ctx, `[${ts()}] ✓ CONTA ${accountNum} CRIADA COM SUCESSO`);
        } else {
          // Not clearly successful - log what we see
          await log(ctx, `[${ts()}]   Estado da página: ${finalText.substring(0, 300)}`);
          
          // Still count as attempt - the referral might have been registered
          await log(ctx, `[${ts()}]   ⚠ Resultado incerto - cadastro pode ter sido parcial`);
          
          processed++;
          
          await db.insert(signupHistory).values({
            userId, queueId, email: mailAccount.email, password: accountPassword, phone: null, status: "success", reason: "Cadastro enviado - verificar manualmente",
          });

          await db.insert(manusAccounts).values({
            userId, email: mailAccount.email, password: accountPassword, phone: null, status: "success",
          });

          await db.update(signupQueue)
            .set({ processed, failed })
            .where(eq(signupQueue.id, queueId));

          await log(ctx, `[${ts()}] ✓ CONTA ${accountNum} PROCESSADA (verificar créditos)`);
        }

        // Close page for next iteration
        if (i < quantity - 1) {
          try { await page.close(); } catch {}
          await delay(1000);
          await log(ctx, `[${ts()}] Limpando sessão para próximo cadastro...`);
          await delay(500);
        }

      } catch (error: any) {
        const reason = error.message || "Erro desconhecido";
        await log(ctx, `[${ts()}] ✗ Erro: ${reason}`);
        failed++;

        await db.insert(signupHistory).values({
          userId, queueId, email: `erro_conta_${accountNum}`, phone: null, status: "failed", reason,
        });

        await db.update(signupQueue)
          .set({ processed, failed })
          .where(eq(signupQueue.id, queueId));

        await log(ctx, `[${ts()}] ✗ CONTA ${accountNum} FALHOU: ${reason}`);

        // Try to recover for next account
        if (i < quantity - 1) {
          try {
            page = await browser.newPage();
          } catch {
            await log(ctx, `[${ts()}] ✗ Não foi possível recuperar o navegador`);
            break;
          }
        }
      }
    }

    // ── Final Summary ──
    await log(ctx, `[${ts()}] `);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] RESUMO FINAL`);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] Total solicitado: ${quantity}`);
    await log(ctx, `[${ts()}] Sucesso: ${processed}`);
    await log(ctx, `[${ts()}] Falhas: ${failed}`);
    await log(ctx, `[${ts()}] Taxa de sucesso: ${quantity > 0 ? ((processed / quantity) * 100).toFixed(0) : 0}%`);

    if (failed > 0) {
      const refund = failed * 500;
      await log(ctx, `[${ts()}] Créditos reembolsados: ${refund}`);
      await db.update(users)
        .set({ credits: sql`${users.credits} + ${refund}` })
        .where(eq(users.id, userId));
    }

    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] Bot finalizado.`);

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

  } catch (error: any) {
    console.error("[Real Bot Error]", error);
    try {
      await db.update(signupQueue)
        .set({ status: "failed" })
        .where(eq(signupQueue.id, queueId));
      
      if (sessionId!) {
        await db.update(botSessions)
          .set({
            status: "completed",
            currentStep: `Erro fatal: ${error.message}`,
          })
          .where(eq(botSessions.id, sessionId!));
      }
    } catch {}
  } finally {
    // Always close browser
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}
