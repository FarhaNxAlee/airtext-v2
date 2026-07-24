import { describe, it, expect } from "vitest";
import { hmacHex, hashPin, constantTimeEqual, randomBase64Url, randomShareCode } from "../src/lib/crypto";
import { CONFIG } from "../src/lib/config";

describe("hmacHex", () => {
  it("is deterministic for the same secret and message", async () => {
    const a = await hmacHex("secret", "message");
    const b = await hmacHex("secret", "message");
    expect(a).toBe(b);
  });

  it("differs when the secret or message changes", async () => {
    const base = await hmacHex("secret", "message");
    expect(await hmacHex("other-secret", "message")).not.toBe(base);
    expect(await hmacHex("secret", "other-message")).not.toBe(base);
  });

  it("returns lowercase hex", async () => {
    const digest = await hmacHex("secret", "message");
    expect(digest).toMatch(/^[0-9a-f]+$/);
    expect(digest).toHaveLength(64); // SHA-256 -> 32 bytes -> 64 hex chars
  });
});

describe("hashPin", () => {
  it("produces the same hash for the same secret/salt/pin", async () => {
    const a = await hashPin("secret", "salt", "1234");
    const b = await hashPin("secret", "salt", "1234");
    expect(a).toBe(b);
  });

  it("differs when the salt changes", async () => {
    const a = await hashPin("secret", "salt-1", "1234");
    const b = await hashPin("secret", "salt-2", "1234");
    expect(a).not.toBe(b);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEqual("abc", "abcdef")).toBe(false);
  });

  it("treats null/undefined as empty string", () => {
    expect(constantTimeEqual(null, undefined)).toBe(true);
    expect(constantTimeEqual("", null)).toBe(true);
    expect(constantTimeEqual("a", null)).toBe(false);
  });
});

describe("randomBase64Url", () => {
  it("generates URL-safe strings with no padding", () => {
    const value = randomBase64Url(16);
    expect(value).not.toMatch(/[+/=]/);
  });

  it("generates distinct values across calls", () => {
    const values = new Set(Array.from({ length: 20 }, () => randomBase64Url(16)));
    expect(values.size).toBe(20);
  });
});

describe("randomShareCode", () => {
  it("generates a code of the configured length using only the safe alphabet", () => {
    const code = randomShareCode(CONFIG.SHARE_CODE_LENGTH);
    expect(code).toHaveLength(CONFIG.SHARE_CODE_LENGTH);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  });
});
