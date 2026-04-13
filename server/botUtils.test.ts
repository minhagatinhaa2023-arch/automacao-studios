import { describe, it, expect } from "vitest";
import {
  COST_PER_SIGNUP,
  MAX_BATCH,
  isValidManusUrl,
  generateTempEmail,
  generateVirtualPhone,
  generatePassword,
  calculatePriority,
  isValidQuantity,
  calculateCost,
  calculateRefund,
} from "./botUtils";

// ============================================================
// Tests against the actual production botUtils module
// ============================================================

describe("isValidManusUrl (production)", () => {
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
    // URL parser normalizes /invitation/../admin to /admin
    expect(isValidManusUrl("https://manus.im/invitation/../admin")).toBe(false);
  });
});

describe("generateTempEmail (production)", () => {
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

describe("generateVirtualPhone (production)", () => {
  it("should generate phone numbers with valid prefixes", () => {
    const validPrefixes = ["+1555", "+1666", "+1777", "+44700", "+5511"];
    for (let i = 0; i < 20; i++) {
      const phone = generateVirtualPhone();
      const hasValidPrefix = validPrefixes.some((p) => phone.startsWith(p));
      expect(hasValidPrefix).toBe(true);
    }
  });

  it("should generate phone numbers with correct length", () => {
    for (let i = 0; i < 20; i++) {
      const phone = generateVirtualPhone();
      expect(phone.length).toBeGreaterThanOrEqual(12);
      expect(phone.length).toBeLessThanOrEqual(13);
    }
  });
});

describe("generatePassword (production)", () => {
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

describe("calculatePriority (production)", () => {
  it("should give priority 1 to single signups", () => {
    expect(calculatePriority(1)).toBe(1);
  });

  it("should give priority 0 to batch signups", () => {
    for (const q of [2, 3, 5, 10]) {
      expect(calculatePriority(q)).toBe(0);
    }
  });
});

describe("isValidQuantity (production)", () => {
  it("should accept valid quantities 1-10", () => {
    for (let i = 1; i <= 10; i++) {
      expect(isValidQuantity(i)).toBe(true);
    }
  });

  it("should reject invalid quantities", () => {
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-1)).toBe(false);
    expect(isValidQuantity(11)).toBe(false);
    expect(isValidQuantity(100)).toBe(false);
    expect(isValidQuantity(1.5)).toBe(false);
    expect(isValidQuantity(3.7)).toBe(false);
  });
});

describe("calculateCost (production)", () => {
  it("should calculate correct cost", () => {
    expect(calculateCost(1)).toBe(500);
    expect(calculateCost(5)).toBe(2500);
    expect(calculateCost(10)).toBe(5000);
  });
});

describe("calculateRefund (production)", () => {
  it("should calculate refund for unprocessed items", () => {
    expect(calculateRefund(5, 2)).toBe(1500);
    expect(calculateRefund(10, 0)).toBe(5000);
    expect(calculateRefund(3, 3)).toBe(0);
  });
});

describe("Constants (production)", () => {
  it("should have correct cost per signup", () => {
    expect(COST_PER_SIGNUP).toBe(500);
  });

  it("should have correct max batch size", () => {
    expect(MAX_BATCH).toBe(10);
  });
});
