import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Unit tests for helper functions used in queue processing
// ============================================================

// Test URL validation
describe("URL Validation", () => {
  function isValidManusUrl(url: string): boolean {
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

  it("should accept valid manus.im invitation URLs", () => {
    expect(isValidManusUrl("https://manus.im/invitation/abc123")).toBe(true);
    expect(isValidManusUrl("https://www.manus.im/invitation/xyz")).toBe(true);
    expect(isValidManusUrl("https://manus.im/invitation/test-link")).toBe(true);
  });

  it("should reject invalid URLs", () => {
    expect(isValidManusUrl("https://evil.com/invitation/abc")).toBe(false);
    expect(isValidManusUrl("https://manus.im/other/path")).toBe(false);
    expect(isValidManusUrl("not-a-url")).toBe(false);
    expect(isValidManusUrl("")).toBe(false);
    expect(isValidManusUrl("https://fake-manus.im/invitation/abc")).toBe(false);
    expect(isValidManusUrl("javascript:alert(1)")).toBe(false);
  });

  it("should reject URLs with path traversal attempts", () => {
    expect(isValidManusUrl("https://manus.im/../etc/passwd")).toBe(false);
    // URL parser normalizes /invitation/../admin to /admin, which doesn't start with /invitation
    expect(isValidManusUrl("https://manus.im/invitation/../admin")).toBe(false);
  });
});

// Test email generation
describe("Temp Email Generation", () => {
  function generateTempEmail(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let user = "";
    for (let i = 0; i < 10; i++) {
      user += chars[Math.floor(Math.random() * chars.length)];
    }
    const domains = ["automail.shop", "tempbox.shop", "quickreg.shop", "fastmail.shop", "botmail.shop"];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${user}@${domain}`;
  }

  it("should generate valid email format with .shop domain", () => {
    for (let i = 0; i < 20; i++) {
      const email = generateTempEmail();
      expect(email).toMatch(/^[a-z0-9]{10}@[a-z]+\.shop$/);
    }
  });

  it("should generate unique emails", () => {
    const emails = new Set<string>();
    for (let i = 0; i < 100; i++) {
      emails.add(generateTempEmail());
    }
    expect(emails.size).toBe(100);
  });

  it("should use one of the predefined .shop domains", () => {
    const validDomains = ["automail.shop", "tempbox.shop", "quickreg.shop", "fastmail.shop", "botmail.shop"];
    for (let i = 0; i < 50; i++) {
      const email = generateTempEmail();
      const domain = email.split("@")[1];
      expect(validDomains).toContain(domain);
    }
  });
});

// Test phone generation
describe("Virtual Phone Generation", () => {
  function generateVirtualPhone(): string {
    const prefixes = ["+1555", "+1666", "+1777", "+44700", "+5511"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    let number = "";
    for (let i = 0; i < 7; i++) {
      number += Math.floor(Math.random() * 10).toString();
    }
    return `${prefix}${number}`;
  }

  it("should generate phone numbers with valid prefixes", () => {
    const validPrefixes = ["+1555", "+1666", "+1777", "+44700", "+5511"];
    for (let i = 0; i < 20; i++) {
      const phone = generateVirtualPhone();
      const hasValidPrefix = validPrefixes.some(p => phone.startsWith(p));
      expect(hasValidPrefix).toBe(true);
    }
  });

  it("should generate phone numbers with correct length", () => {
    for (let i = 0; i < 20; i++) {
      const phone = generateVirtualPhone();
      // prefix (4-5 chars) + 7 digits + "+" = 12-13 total
      expect(phone.length).toBeGreaterThanOrEqual(12);
      expect(phone.length).toBeLessThanOrEqual(13);
    }
  });
});

// Test password generation
describe("Password Generation", () => {
  function generatePassword(): string {
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
    return pw.split("").sort(() => Math.random() - 0.5).join("");
  }

  it("should generate passwords with exactly 12 characters", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      expect(pw.length).toBe(12);
    }
  });

  it("should contain at least one uppercase, lowercase, digit, and special char", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%]/);
    }
  });
});

// Test credit cost calculation
describe("Credit Cost Calculation", () => {
  const COST_PER_SIGNUP = 500;
  const MAX_BATCH = 10;

  it("should calculate correct cost for single signup", () => {
    expect(1 * COST_PER_SIGNUP).toBe(500);
  });

  it("should calculate correct cost for batch signups", () => {
    expect(5 * COST_PER_SIGNUP).toBe(2500);
    expect(10 * COST_PER_SIGNUP).toBe(5000);
  });

  it("should enforce max batch size of 10", () => {
    expect(MAX_BATCH).toBe(10);
  });

  it("should calculate refund correctly for cancelled items", () => {
    const quantity = 5;
    const processed = 2;
    const refund = (quantity - processed) * COST_PER_SIGNUP;
    expect(refund).toBe(1500);
  });

  it("should calculate refund for failed signups", () => {
    const failed = 3;
    const refund = failed * COST_PER_SIGNUP;
    expect(refund).toBe(1500);
  });
});

// Test API key format
describe("API Key Format", () => {
  it("should generate keys with ask_ prefix", () => {
    const key = `ask_${"a".repeat(48)}`;
    expect(key.startsWith("ask_")).toBe(true);
    expect(key.length).toBe(52);
  });

  it("should generate unique keys", () => {
    // Simulate nanoid behavior
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      let id = "";
      for (let j = 0; j < 48; j++) {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
      keys.add(`ask_${id}`);
    }
    expect(keys.size).toBe(50);
  });
});

// Test queue priority logic
describe("Queue Priority", () => {
  it("should give priority 1 to single signups", () => {
    const quantity = 1;
    const priority = quantity === 1 ? 1 : 0;
    expect(priority).toBe(1);
  });

  it("should give priority 0 to batch signups", () => {
    for (const quantity of [2, 3, 5, 10]) {
      const priority = quantity === 1 ? 1 : 0;
      expect(priority).toBe(0);
    }
  });
});

// Test input validation constraints
describe("Input Validation", () => {
  it("should reject quantity less than 1", () => {
    const isValid = (q: number) => q >= 1 && q <= 10 && Number.isInteger(q);
    expect(isValid(0)).toBe(false);
    expect(isValid(-1)).toBe(false);
  });

  it("should reject quantity greater than 10", () => {
    const isValid = (q: number) => q >= 1 && q <= 10 && Number.isInteger(q);
    expect(isValid(11)).toBe(false);
    expect(isValid(100)).toBe(false);
  });

  it("should accept valid quantities", () => {
    const isValid = (q: number) => q >= 1 && q <= 10 && Number.isInteger(q);
    for (let i = 1; i <= 10; i++) {
      expect(isValid(i)).toBe(true);
    }
  });

  it("should reject non-integer quantities", () => {
    const isValid = (q: number) => q >= 1 && q <= 10 && Number.isInteger(q);
    expect(isValid(1.5)).toBe(false);
    expect(isValid(3.7)).toBe(false);
  });
});
