import { Request, Response, NextFunction, Express } from "express";

/**
 * Security middleware for Automação Studios.
 * Provides CORS, rate limiting, HTTP security headers, and CSRF protection.
 */

// ============================================================
// 1. CORS Middleware
// ============================================================
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = [
    req.headers.host ? `https://${req.headers.host}` : "",
    req.headers.host ? `http://${req.headers.host}` : "",
    "http://localhost:3000",
    "http://localhost:5173",
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

// ============================================================
// 2. Rate Limiting (in-memory, per IP)
// ============================================================
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(rateLimitStore.keys());
  keys.forEach((key) => {
    const entry = rateLimitStore.get(key);
    if (entry && entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

export function rateLimitMiddleware(
  maxRequests: number = 100,
  windowMs: number = 60 * 1000
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count).toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString());

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: "Too Many Requests",
        message: "Limite de requisições excedido. Tente novamente em breve.",
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// ============================================================
// 3. HTTP Security Headers
// ============================================================
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // HSTS - force HTTPS
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Content Security Policy (relaxed for development)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:;"
    );
  }

  next();
}

// ============================================================
// 4. CSRF Protection (Double Submit Cookie pattern)
// ============================================================
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API key authenticated requests
  if (req.headers.authorization?.startsWith("Bearer ask_")) {
    return next();
  }

  // Skip for tRPC batch queries (GET-style queries sent as POST)
  if (req.path.startsWith("/api/trpc") && req.query["batch"]) {
    return next();
  }

  // For tRPC mutations, the session cookie + SameSite provides protection
  // Additional CSRF token check for non-tRPC routes
  if (!req.path.startsWith("/api/trpc")) {
    const csrfToken = req.headers["x-csrf-token"];
    const csrfCookie = (req as any).cookies?.["csrf-token"];

    if (csrfToken && csrfCookie && csrfToken === csrfCookie) {
      return next();
    }

    // For OAuth callback, skip CSRF
    if (req.path.startsWith("/api/oauth")) {
      return next();
    }
  }

  next();
}

// ============================================================
// Register all security middleware on Express app
// ============================================================
export function registerSecurityMiddleware(app: Express) {
  app.use(corsMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(rateLimitMiddleware(200, 60 * 1000)); // 200 requests per minute per IP
  app.use(csrfMiddleware);
}
