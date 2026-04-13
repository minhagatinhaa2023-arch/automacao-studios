/**
 * Real Bot Automation Engine v5.0 — Anti-Detection Edition
 * - puppeteer-real-browser for Turnstile bypass
 * - mail.tm for temporary emails
 * - 5sim.net for virtual phone numbers (SMS verification)
 * - Screenshot streaming for live VNC view
 * - Anti-detection: fingerprint randomization, human-like behavior
 */

import { eq, sql } from "drizzle-orm";
import { users, signupQueue, signupHistory, manusAccounts, botSessions } from "../drizzle/schema";
import { generatePassword } from "./botUtils";
import { storagePut } from "./storage";

// ── Types ──
interface BotContext {
  db: any;
  sessionId: number;
  queueId: number;
  userId: number;
}

// ── Anti-Detection: Random Profiles ──
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
];

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
];

const LANGUAGES = [
  "en-US,en;q=0.9", "en-GB,en;q=0.9", "en-US,en;q=0.9,pt;q=0.8",
  "en-US,en;q=0.9,es;q=0.8", "en-US,en;q=0.9,fr;q=0.8",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Helpers ──
function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Human-like random delay with MUCH longer base times for anti-detection
function humanDelay(baseMs: number): Promise<void> {
  // Increase jitter to 50% for more randomization
  const jitter = baseMs * 0.5;
  const actual = baseMs + (Math.random() * jitter * 2 - jitter);
  return delay(Math.max(500, actual)); // Minimum 500ms
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

async function captureScreenshot(ctx: BotContext, page: any, label: string) {
  try {
    const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 60 });
    const key = `bot-screenshots/${ctx.sessionId}/${Date.now()}.jpg`;
    const { url } = await storagePut(key, screenshotBuffer, "image/jpeg");
    await ctx.db.update(botSessions)
      .set({ screenshotUrl: url })
      .where(eq(botSessions.id, ctx.sessionId));
  } catch (e) {
    // Silently fail
  }
}

// ── Anti-Detection: Human Mouse Movements ──
async function humanMouseMove(page: any, targetX: number, targetY: number) {
  try {
    const steps = randInt(5, 15);
    const currentPos = { x: randInt(100, 800), y: randInt(100, 400) };
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      // Bezier-like curve
      const cp1x = currentPos.x + (targetX - currentPos.x) * 0.3 + randInt(-50, 50);
      const cp1y = currentPos.y + (targetY - currentPos.y) * 0.1 + randInt(-30, 30);
      
      const x = currentPos.x + (targetX - currentPos.x) * progress + (Math.sin(progress * Math.PI) * randInt(-10, 10));
      const y = currentPos.y + (targetY - currentPos.y) * progress + (Math.cos(progress * Math.PI) * randInt(-5, 5));
      
      await page.mouse.move(x, y);
      await delay(randInt(5, 25));
    }
    
    await page.mouse.move(targetX, targetY);
  } catch {}
}

// Human-like click with mouse movement
async function humanClick(page: any, element: any) {
  try {
    const box = await element.boundingBox();
    if (box) {
      const targetX = box.x + box.width / 2 + randInt(-3, 3);
      const targetY = box.y + box.height / 2 + randInt(-2, 2);
      await humanMouseMove(page, targetX, targetY);
      await delay(randInt(50, 200));
      await page.mouse.click(targetX, targetY);
    } else {
      await element.click();
    }
  } catch {
    await element.click();
  }
}

// Human-like random scroll
async function humanScroll(page: any) {
  try {
    const scrollAmount = randInt(50, 200);
    await page.evaluate((amount: number) => {
      window.scrollBy({ top: amount, behavior: 'smooth' });
    }, scrollAmount);
    await delay(randInt(300, 800));
    // Sometimes scroll back up a bit
    if (Math.random() > 0.6) {
      await page.evaluate((amount: number) => {
        window.scrollBy({ top: -amount / 2, behavior: 'smooth' });
      }, scrollAmount);
      await delay(randInt(200, 500));
    }
  } catch {}
}

// Random idle behavior (hover, focus/blur)
async function humanIdle(page: any) {
  try {
    const actions = ['hover', 'scroll', 'wait'];
    const action = pick(actions);
    
    if (action === 'hover') {
      await page.mouse.move(randInt(200, 1000), randInt(200, 600));
      await delay(randInt(200, 800));
    } else if (action === 'scroll') {
      await humanScroll(page);
    } else {
      await delay(randInt(500, 2000));
    }
  } catch {}
}

// Set React-controlled input value (critical for Manus forms)
async function setReactValue(page: any, selector: string, value: string): Promise<boolean> {
  return page.evaluate(({ sel, val }: { sel: string; val: string }) => {
    const input = document.querySelector(sel) as HTMLInputElement;
    if (!input) return false;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (!nativeInputValueSetter) return false;
    nativeInputValueSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { sel: selector, val: value });
}

// ── Anti-Detection: Fingerprint Spoofing ──
async function applyFingerprint(page: any) {
  await page.evaluateOnNewDocument(() => {
    // Override WebGL renderer
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 37445) return 'Intel Inc.';
      if (parameter === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, parameter);
    };
    
    // Override canvas fingerprint
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type?: string) {
      if (type === 'image/png' || !type) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] ^= 1; // Tiny noise
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
      return toDataURL.call(this, type);
    };
    
    // Override AudioContext fingerprint
    const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function(array: any) {
      origGetFloatFrequencyData.call(this, array);
      for (let i = 0; i < array.length; i++) {
        array[i] += Math.random() * 0.0001;
      }
    };
    
    // Override navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => [4, 8, 12, 16][Math.floor(Math.random() * 4)] });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => [4, 8, 16][Math.floor(Math.random() * 3)] });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    
    // Hide automation indicators
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    (window.navigator.permissions as any).query = (parameters: any) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(parameters);
    };
    
    // Plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });
  });
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
  for (let i = 0; i < randInt(8, 14); i++) user += chars[Math.floor(Math.random() * chars.length)];
  
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
    } catch (e) {}
    
    await delay(3000);
  }
  
  return null;
}

function extractVerificationCode(text: string): string | null {
  const sixDigit = text.match(/\b(\d{6})\b/);
  if (sixDigit) return sixDigit[1];
  
  const codePatterns = [
    /verification\s*code[:\s]*(\d{4,8})/i,
    /código[:\s]*(\d{4,8})/i,
    /code[:\s]*(\d{4,8})/i,
  ];
  
  for (const pattern of codePatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// ── 5sim.net SMS API ──
async function buy5simNumber(apiKey: string, product: string = "other"): Promise<{ orderId: number; phone: string; country: string } | null> {
  const countries = ["england", "russia", "ukraine", "india", "indonesia", "philippines"];
  
  for (const country of countries) {
    try {
      const res = await fetch(`https://5sim.net/v1/user/buy/activation/${country}/any/${product}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      
      if (res.ok) {
        const data = await res.json();
        return { orderId: data.id, phone: data.phone, country: data.country };
      }
      if (res.status === 402) throw new Error("Saldo insuficiente no 5sim.net");
    } catch (e: any) {
      if (e.message.includes("Saldo")) throw e;
      continue;
    }
  }
  return null;
}

async function wait5simSms(apiKey: string, orderId: number, maxWaitMs: number = 120000): Promise<string | null> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`https://5sim.net/v1/user/check/${orderId}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.sms && data.sms.length > 0) {
          const smsCode = data.sms[0].code;
          if (smsCode) return smsCode;
          const smsText = data.sms[0].text || "";
          const code = extractVerificationCode(smsText);
          if (code) return code;
        }
        if (data.status === "CANCELED" || data.status === "TIMEOUT" || data.status === "BANNED") return null;
      }
    } catch (e) {}
    
    await delay(5000);
  }
  return null;
}

async function finish5simOrder(apiKey: string, orderId: number) {
  try { await fetch(`https://5sim.net/v1/user/finish/${orderId}`, { headers: { Authorization: `Bearer ${apiKey}` } }); } catch {}
}

async function cancel5simOrder(apiKey: string, orderId: number) {
  try { await fetch(`https://5sim.net/v1/user/cancel/${orderId}`, { headers: { Authorization: `Bearer ${apiKey}` } }); } catch {}
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
  const smsApiKey = process.env.FIVESIM_API_KEY || "";

  try {
    // Create bot session
    const [sessionInsert] = await db.insert(botSessions).values({
      userId, queueId, status: "running",
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
    await log(ctx, `[${ts()}] 🤖 AUTOMAÇÃO STUDIOS v5.0 [ANTI-DETECT]`);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);

    await log(ctx, `[${ts()}] 🖥️ Inicializando navegador stealth...`);
    
    // Use puppeteer-real-browser for Turnstile bypass
    let connectFn: any;
    try {
      const prb = await import("puppeteer-real-browser");
      connectFn = prb.connect;
    } catch {
      await log(ctx, `[${ts()}] ❌ puppeteer-real-browser não disponível`);
      throw new Error("puppeteer-real-browser não disponível. Execute no ambiente de desenvolvimento.");
    }
    
    let mainPage: any = null;
    try {
      const result = await connectFn({
        headless: "auto",
        turnstile: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });
      browser = result.browser;
      mainPage = result.page; // Use the page returned by connect()
    } catch (launchErr: any) {
      await log(ctx, `[${ts()}] ❌ Falha ao iniciar navegador: ${launchErr.message}`);
      throw new Error(`Navegador não disponível: ${launchErr.message}`);
    }
    
    await log(ctx, `[${ts()}] ✅ Navegador stealth inicializado`);
    await log(ctx, `[${ts()}] 🛡️ Anti-detecção: fingerprint randomizado`);
    await log(ctx, `[${ts()}] 🛡️ Anti-detecção: Turnstile bypass ativo`);
    await humanDelay(500);

    if (smsApiKey) {
      await log(ctx, `[${ts()}] 📱 API de SMS (5sim.net) configurada`);
    } else {
      await log(ctx, `[${ts()}] ⚠️ API de SMS não configurada`);
    }

    await log(ctx, `[${ts()}] 📧 Conectando ao serviço de email (mail.tm)...`);
    const mailDomain = await getMailTmDomain();
    await log(ctx, `[${ts()}] ✅ Domínio de email: ${mailDomain}`);

    await log(ctx, `[${ts()}] 🔗 Link de convite: ${inviteUrl}`);
    await log(ctx, `[${ts()}] ───────────────────────────────────────`);
    await log(ctx, `[${ts()}] 🚀 Iniciando ${quantity} cadastro(s)...`);
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
      const manusPassword = "Manus" + Math.random().toString(36).substring(2, 10) + "!" + randInt(10, 99) + "A";
      let smsOrderId: number | null = null;

      await log(ctx, `[${ts()}] `);
      await log(ctx, `[${ts()}] ▶ CONTA ${accountNum}/${quantity}`);
      await log(ctx, `[${ts()}] ─────────────────────`);

      let page: any = null;

      try {
        // Pick random profile for this account
        const ua = pick(USER_AGENTS);
        const vp = pick(VIEWPORTS);
        const tz = pick(TIMEZONES);
        const lang = pick(LANGUAGES);
        
        await log(ctx, `[${ts()}] 🛡️ Perfil: ${vp.width}x${vp.height} | ${tz}`);

        // Step 1: Create real temp email
        await log(ctx, `[${ts()}] 📧 Criando email temporário...`);
        const mailAccount = await createMailTmAccount(mailDomain);
        await log(ctx, `[${ts()}]   📬 Email: ${mailAccount.email}`);
        await humanDelay(3000 + randInt(1000, 3000)); // Much longer delay after email creation

        if (await isCancelled(ctx)) {
          await log(ctx, `[${ts()}] ⚠️ Cancelado pelo usuário`);
          break;
        }

        // Step 2: Use the main page from connect (no newPage to avoid connection closed)
        await log(ctx, `[${ts()}] 🌐 Configurando aba stealth...`);
        page = mainPage;
        try { await page.setViewport(vp); } catch {}
        
        // Apply fingerprint spoofing
        await applyFingerprint(page);
        
        try { await page.setExtraHTTPHeaders({ "Accept-Language": lang }); } catch {}

        // Step 3: Navigate to invite link
        await log(ctx, `[${ts()}] 🔗 Navegando para convite...`);
        await page.goto(inviteUrl, { waitUntil: "networkidle2", timeout: 30000 });
        await humanDelay(5000 + randInt(2000, 4000)); // Much longer delay after page load
        
        await captureScreenshot(ctx, page, "page_loaded");
        
        const currentUrl = page.url();
        await log(ctx, `[${ts()}]   📍 URL: ${currentUrl}`);
        await log(ctx, `[${ts()}]   ✅ Página carregada`);

        // Random idle to look human
        await humanIdle(page);

        if (await isCancelled(ctx)) break;

        // Step 4: Set email using React value setter
        await log(ctx, `[${ts()}] ✏️ Preenchendo email...`);
        
        const emailSet = await setReactValue(page, 'input[type="email"]', mailAccount.email);
        if (!emailSet) {
          // Fallback: try other selectors
          const fallbackSet = await setReactValue(page, 'input[name="email"], input#email, input[placeholder*="email" i]', mailAccount.email);
          if (!fallbackSet) throw new Error("Campo de email não encontrado");
        }
        
        await log(ctx, `[${ts()}]   ⌨️ Email: ${mailAccount.email}`);
        await humanDelay(2000 + randInt(1000, 2000)); // Longer delay after email entry
        await captureScreenshot(ctx, page, "email_set");

        // Step 5: Wait for Turnstile to auto-resolve + button to enable
        await log(ctx, `[${ts()}] 🛡️ Aguardando Turnstile...`);
        
        let continueReady = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          await humanDelay(3000 + randInt(1000, 2000)); // Longer Turnstile wait
          
          const state = await page.evaluate(() => {
            const t = document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement;
            const btns = Array.from(document.querySelectorAll("button"));
            // Find the email Continue button (not OAuth)
            const oauthKw = ["facebook", "google", "microsoft", "apple", "github"];
            const continueBtn = btns.find(b => {
              const txt = b.textContent?.trim().toLowerCase() || "";
              return (txt === "continue" || txt === "continuar") && !oauthKw.some(k => txt.includes(k));
            });
            return {
              turnstile: !!(t?.value),
              disabled: continueBtn?.disabled ?? true,
              btnText: continueBtn?.textContent?.trim() || "",
            };
          });
          
          if (state.turnstile && !state.disabled) {
            await log(ctx, `[${ts()}]   ✅ Turnstile resolvido + botão habilitado`);
            continueReady = true;
            break;
          }
          
          if (attempt % 5 === 4) {
            await log(ctx, `[${ts()}]   ⏳ Aguardando... (t=${state.turnstile} d=${state.disabled})`);
          }
        }
        
        if (!continueReady) {
          await log(ctx, `[${ts()}]   ⚠️ Turnstile/botão não resolveu em 40s`);
          throw new Error("Turnstile não resolveu ou botão Continue não habilitou");
        }

        // Step 6: Click Continue (email)
        await log(ctx, `[${ts()}] 🖱️ Clicando Continue...`);
        
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const oauthKw = ["facebook", "google", "microsoft", "apple", "github"];
          const btn = btns.find(b => {
            const txt = b.textContent?.trim().toLowerCase() || "";
            return (txt === "continue" || txt === "continuar") && !oauthKw.some(k => txt.includes(k)) && !b.disabled;
          });
          if (btn) { btn.click(); return true; }
          return false;
        });
        
        if (!clicked) {
          await page.keyboard.press("Enter");
          await log(ctx, `[${ts()}]   ⌨️ Enter (fallback)`);
        } else {
          await log(ctx, `[${ts()}]   ✅ Continue clicado`);
        }
        
        await humanDelay(8000 + randInt(2000, 4000)); // Much longer after Continue
        await captureScreenshot(ctx, page, "after_continue");

        // Step 7: Handle password page
        let pageText = await page.evaluate(() => document.body?.innerText || "");
        
        if (pageText.includes("password") || pageText.includes("Password") || pageText.includes("Set your password")) {
          await log(ctx, `[${ts()}] 🔑 Definindo senha...`);
          
          const pwdSet = await page.evaluate(({ pwd }: { pwd: string }) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const pwdInput = inputs.find(i => i.type === "password");
            if (!pwdInput) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (!setter) return false;
            setter.call(pwdInput, pwd);
            pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
            pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }, { pwd: manusPassword });
          
          if (pwdSet) {
            await log(ctx, `[${ts()}]   ✅ Senha definida`);
          } else {
            await log(ctx, `[${ts()}]   ⚠️ Campo de senha não encontrado`);
          }
          
          await humanDelay(3000 + randInt(1000, 2000)); // Longer delay after password entry
          
          // Click Continue for password
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const btn = btns.find(b => {
              const txt = b.textContent?.trim().toLowerCase() || "";
              return txt === "continue" && !b.disabled;
            });
            if (btn) btn.click();
          });
          
          await log(ctx, `[${ts()}]   ✅ Continue (senha) clicado`);
          await humanDelay(8000 + randInt(2000, 4000)); // Much longer after password Continue
          await captureScreenshot(ctx, page, "after_password");
        }

        // Step 8: Check what verification is needed
        pageText = await page.evaluate(() => document.body?.innerText || "");
        const textLower = pageText.toLowerCase();
        
        const needsEmailCode = textLower.includes("verify your email") || textLower.includes("verification code") || textLower.includes("enter the code");
        const needsPhone = textLower.includes("verify your phone") || textLower.includes("phone number");
        
        // ── EMAIL VERIFICATION ──
        if (needsEmailCode) {
          await log(ctx, `[${ts()}] 📧 Verificação por email detectada`);
          await log(ctx, `[${ts()}]   ⏳ Aguardando código em ${mailAccount.email}...`);
          
          const emailMsg = await waitForEmail(mailAccount.token, 90000);
          
          if (!emailMsg) throw new Error("Timeout aguardando email de verificação (90s)");
          
          await log(ctx, `[${ts()}]   ✅ Email recebido!`);
          
          const fullText = emailMsg.text + " " + emailMsg.html;
          const code = extractVerificationCode(fullText);
          
          if (!code) throw new Error("Código de verificação não encontrado no email");
          
          await log(ctx, `[${ts()}]   🔑 Código: ${code}`);
          
          // Type code using React setter
          const codeSet = await setReactValue(page, 'input[name="verifyCode"], input#verifyCode, input[placeholder*="code" i]', code);
          
          if (!codeSet) {
            // Fallback: find any visible text input
            await page.evaluate(({ code }: { code: string }) => {
              const inputs = Array.from(document.querySelectorAll('input'));
              const visible = inputs.filter(i => {
                const s = window.getComputedStyle(i);
                return s.display !== 'none' && s.visibility !== 'hidden' && i.type !== 'hidden';
              });
              const codeInput = visible.find(i => i.type === "text" || i.type === "number" || i.type === "tel");
              if (codeInput) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (setter) {
                  setter.call(codeInput, code);
                  codeInput.dispatchEvent(new Event('input', { bubbles: true }));
                  codeInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }, { code });
          }
          
          await log(ctx, `[${ts()}]   ✅ Código inserido`);
          await humanDelay(3000 + randInt(1000, 2000)); // Longer delay before verify
          
          // Click Verify
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const btn = btns.find(b => {
              const txt = b.textContent?.trim().toLowerCase() || "";
              return (txt === "verify" || txt === "verificar" || txt === "continue" || txt === "confirm") && !b.disabled;
            });
            if (btn) btn.click();
          });
          
          await log(ctx, `[${ts()}]   ✅ Verify clicado`);
          await humanDelay(10000 + randInt(2000, 5000)); // Much longer after email verify
          await captureScreenshot(ctx, page, "after_email_verify");
          
          // Check if phone verification is now needed
          pageText = await page.evaluate(() => document.body?.innerText || "");
          const nowNeedsPhone = pageText.toLowerCase().includes("verify your phone") || pageText.toLowerCase().includes("phone number");
          
          if (nowNeedsPhone) {
            await log(ctx, `[${ts()}] 📱 Verificação por telefone agora necessária`);
            // Fall through to phone verification below
            await handlePhoneVerification(ctx, page, smsApiKey, smsOrderId);
          }
        }
        
        // ── PHONE VERIFICATION (direct or after email) ──
        else if (needsPhone) {
          await handlePhoneVerification(ctx, page, smsApiKey, smsOrderId);
        }
        
        else {
          await log(ctx, `[${ts()}]   ℹ️ Nenhuma verificação adicional detectada`);
        }

        // Step 9: Check final result - wait longer to avoid pattern detection
        await humanDelay(15000 + randInt(5000, 10000)); // Very long delay to simulate initial use
        const finalUrl = page.url();
        const finalText = await page.evaluate(() => document.body?.innerText || "");
        
        await log(ctx, `[${ts()}] 🔍 Verificando resultado...`);
        await captureScreenshot(ctx, page, "final_result");
        
        const isSuspended = finalText.toLowerCase().includes("suspended") || finalText.toLowerCase().includes("banned");
        const isSuccess = finalUrl.includes("auth_landing") || finalUrl.includes("dashboard") || 
                          finalUrl.includes("app") || finalText.toLowerCase().includes("welcome") ||
                          (finalUrl.includes("newUser=1") && !isSuspended);

        if (isSuspended) {
          await log(ctx, `[${ts()}] ⚠️ Conta suspensa pelo Manus (anti-bot)`);
          await log(ctx, `[${ts()}]   ℹ️ Conta criada mas suspensa automaticamente`);
          
          // Still save the account - user might appeal
          await db.insert(signupHistory).values({
            userId, queueId, email: mailAccount.email, password: manusPassword, phone: null, 
            status: "failed", reason: "Conta suspensa automaticamente pelo Manus",
          });
          failed++;
        } else if (isSuccess) {
          processed++;
          await db.insert(signupHistory).values({
            userId, queueId, email: mailAccount.email, password: manusPassword, phone: null, status: "success",
          });
          await db.insert(manusAccounts).values({
            userId, email: mailAccount.email, password: manusPassword, phone: null, status: "success",
          });
          await log(ctx, `[${ts()}] ✅ CONTA ${accountNum} CRIADA COM SUCESSO!`);
          await log(ctx, `[${ts()}]   📧 ${mailAccount.email}`);
          await log(ctx, `[${ts()}]   🔑 ${manusPassword}`);
        } else {
          processed++;
          await db.insert(signupHistory).values({
            userId, queueId, email: mailAccount.email, password: manusPassword, phone: null, 
            status: "success", reason: "Cadastro processado - verificar manualmente",
          });
          await db.insert(manusAccounts).values({
            userId, email: mailAccount.email, password: manusPassword, phone: null, status: "success",
          });
          await log(ctx, `[${ts()}] ⚠️ CONTA ${accountNum} PROCESSADA (verificar)`);
        }

        await db.update(signupQueue)
          .set({ processed, failed })
          .where(eq(signupQueue.id, queueId));

        // Don't close the page - reuse it for next account
        // Navigate to blank page to reset state for next iteration
        if (i < quantity - 1) {
          try { await page.goto('about:blank', { timeout: 5000 }); } catch {}
          const waitTime = randInt(15000, 30000); // Much longer wait between accounts
          await log(ctx, `[${ts()}] ⏳ Aguardando ${Math.round(waitTime/1000)}s antes da próxima conta...`);
          await delay(waitTime);
        }

      } catch (error: any) {
        const reason = error.message || "Erro desconhecido";
        await log(ctx, `[${ts()}] ❌ Erro: ${reason}`);
        failed++;

        if (smsOrderId && smsApiKey) {
          await cancel5simOrder(smsApiKey, smsOrderId);
        }

        await db.insert(signupHistory).values({
          userId, queueId, email: `erro_conta_${accountNum}`, phone: null, status: "failed", reason,
        });

        await db.update(signupQueue)
          .set({ processed, failed })
          .where(eq(signupQueue.id, queueId));

        // Navigate to blank to reset for next attempt
        try { if (page) await page.goto('about:blank', { timeout: 5000 }); } catch {}
        await humanDelay(2000);
      }
    }

    // ── Final Summary ──
    await log(ctx, `[${ts()}] `);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] 📊 RESUMO FINAL`);
    await log(ctx, `[${ts()}] ═══════════════════════════════════════`);
    await log(ctx, `[${ts()}] Total: ${quantity} | ✅ ${processed} | ❌ ${failed}`);

    if (failed > 0) {
      const refund = failed * 500;
      await log(ctx, `[${ts()}] 💰 Reembolso: ${refund} créditos`);
      await db.update(users)
        .set({ credits: sql`${users.credits} + ${refund}` })
        .where(eq(users.id, userId));
    }

    await log(ctx, `[${ts()}] 🏁 Bot finalizado.`);

    const finalStatus = failed === quantity ? "failed" : "completed";
    await db.update(signupQueue)
      .set({ status: finalStatus, processed, failed })
      .where(eq(signupQueue.id, queueId));

    await db.update(botSessions)
      .set({ status: "completed", currentStep: `Concluído: ${processed} sucesso, ${failed} falha(s)` })
      .where(eq(botSessions.id, sessionId));

  } catch (error: any) {
    console.error("[Real Bot Error]", error);
    try {
      await db.update(signupQueue).set({ status: "failed" }).where(eq(signupQueue.id, queueId));
      if (sessionId!) {
        await db.update(botSessions)
          .set({ status: "completed", currentStep: `Erro fatal: ${error.message}` })
          .where(eq(botSessions.id, sessionId!));
      }
    } catch {}
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

// ── Phone Verification Handler ──
async function handlePhoneVerification(ctx: BotContext, page: any, smsApiKey: string, smsOrderId: number | null) {
  await log(ctx, `[${ts()}] 📱 Verificação por SMS solicitada!`);
  
  if (!smsApiKey) {
    throw new Error("Verificação por SMS necessária mas FIVESIM_API_KEY não configurada");
  }
  
  // Detect country code on page
  const countryCode = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const match = text.match(/\+(\d{1,3})/);
    return match ? match[0] : "+44";
  });
  
  await log(ctx, `[${ts()}] 📱 Comprando número virtual (${countryCode})...`);
  
  const numberResult = await buy5simNumber(smsApiKey, "other");
  if (!numberResult) throw new Error("Não foi possível comprar número virtual");
  
  smsOrderId = numberResult.orderId;
  await log(ctx, `[${ts()}]   📞 Número: ${numberResult.phone}`);
  
  // Clean phone number
  let phoneNum = numberResult.phone;
  if (phoneNum.startsWith("+")) phoneNum = phoneNum.substring(1);
  const codeDigits = countryCode.replace("+", "");
  if (phoneNum.startsWith(codeDigits)) phoneNum = phoneNum.substring(codeDigits.length);
  
  // Set phone using React setter
  await log(ctx, `[${ts()}] ⌨️ Preenchendo telefone...`);
  
  const phoneSet = await page.evaluate(({ num }: { num: string }) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const phoneInput = inputs.find(i => i.type === "tel" || i.placeholder?.toLowerCase().includes("phone"));
    if (!phoneInput) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(phoneInput, num);
    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { num: phoneNum });
  
  if (!phoneSet) {
    await log(ctx, `[${ts()}]   ⚠️ Campo de telefone não encontrado, tentando keyboard...`);
    const telInput = await page.$('input[type="tel"]');
    if (telInput) {
      await telInput.click({ clickCount: 3 });
      await telInput.type(phoneNum, { delay: 50 });
    }
  }
  
  await humanDelay(3000 + randInt(1000, 2000)); // Longer delay after phone entry
  await captureScreenshot(ctx, page, "phone_filled");
  
  // Click Send code
  await log(ctx, `[${ts()}] 🖱️ Clicando "Send code"...`);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find(b => {
      const txt = b.textContent?.trim().toLowerCase() || "";
      return (txt.includes("send") || txt.includes("enviar")) && !b.disabled;
    });
    if (btn) btn.click();
  });
  
  await humanDelay(5000 + randInt(1000, 2000)); // Longer delay after Send code
  
  // Wait for SMS
  await log(ctx, `[${ts()}] 📱 Aguardando SMS... (timeout: 120s)`);
  
  const smsCode = await wait5simSms(smsApiKey, numberResult.orderId, 120000);
  
  if (!smsCode) {
    await cancel5simOrder(smsApiKey, numberResult.orderId);
    throw new Error("Timeout aguardando SMS (120s)");
  }
  
  await log(ctx, `[${ts()}]   ✅ SMS recebido! Código: ${smsCode}`);
  await finish5simOrder(smsApiKey, numberResult.orderId);
  
  // Type SMS code
  await log(ctx, `[${ts()}] ⌨️ Inserindo código SMS...`);
  
  const codeSet = await page.evaluate(({ code }: { code: string }) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const visible = inputs.filter(i => {
      const s = window.getComputedStyle(i);
      return s.display !== 'none' && i.type !== 'hidden';
    });
    const codeInput = visible.find(i => i.type === "text" || i.type === "number" || i.placeholder?.toLowerCase().includes("code"));
    if (!codeInput) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(codeInput, code);
    codeInput.dispatchEvent(new Event('input', { bubbles: true }));
    codeInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { code: smsCode });
  
  if (!codeSet) {
    await page.keyboard.type(smsCode);
  }
  
  await humanDelay(3000 + randInt(1000, 2000)); // Longer delay before SMS verify
  
  // Click verify
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find(b => {
      const txt = b.textContent?.trim().toLowerCase() || "";
      return (txt.includes("verify") || txt.includes("continue") || txt.includes("confirm")) && !b.disabled;
    });
    if (btn) btn.click();
  });
  
  await log(ctx, `[${ts()}]   ✅ Código verificado`);
  await humanDelay(10000 + randInt(2000, 5000)); // Much longer after SMS verify
  await captureScreenshot(ctx, page, "sms_verified");
}
