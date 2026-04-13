/**
 * Shared utility functions for the bot automation system.
 * Extracted for testability and reuse.
 */

export const COST_PER_SIGNUP = 500;
export const MAX_BATCH = 10;

/** Validate that URL is a manus.im invitation link */
export function isValidManusUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "manus.im" || parsed.hostname === "www.manus.im") &&
      parsed.pathname.startsWith("/invitation")
    );
  } catch {
    return false;
  }
}

/** Generate a random temp email with .shop domain */
export function generateTempEmail(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let user = "";
  for (let i = 0; i < 10; i++) {
    user += chars[Math.floor(Math.random() * chars.length)];
  }
  const domains = ["automail.shop", "tempbox.shop", "quickreg.shop", "fastmail.shop", "botmail.shop"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${user}@${domain}`;
}

/** Generate a random virtual phone number */
export function generateVirtualPhone(): string {
  const prefixes = ["+1555", "+1666", "+1777", "+44700", "+5511"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let number = "";
  for (let i = 0; i < 7; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${number}`;
}

/** Generate a random password with uppercase, lowercase, digits, and special chars */
export function generatePassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%";
  const all = upper + lower + digits + special;
  let pw = "";
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  for (let i = 0; i < 8; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  return pw
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/** Calculate the priority for a queue item */
export function calculatePriority(quantity: number): number {
  return quantity === 1 ? 1 : 0;
}

/** Validate quantity input */
export function isValidQuantity(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= MAX_BATCH;
}

/** Calculate total cost for a signup batch */
export function calculateCost(quantity: number): number {
  return quantity * COST_PER_SIGNUP;
}

/** Calculate refund for unprocessed items */
export function calculateRefund(quantity: number, processed: number): number {
  return (quantity - processed) * COST_PER_SIGNUP;
}
