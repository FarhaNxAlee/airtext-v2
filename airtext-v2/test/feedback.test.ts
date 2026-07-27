import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("POST /api/feedback", () => {
  it("accepts the account_request category used by the /account request-an-account form", async () => {
    const response = await SELF.fetch("https://example.com/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "account_request",
        email: "requester@test.local",
        message: "Name: Jane Doe\n\nI'd like an account to share files with my team.",
      }),
    });
    expect(response.status).toBe(201);

    const row = await env.DB.prepare("SELECT category FROM feedback WHERE email = ?")
      .bind("requester@test.local")
      .first<{ category: string }>();
    expect(row?.category).toBe("account_request");
  });
});
