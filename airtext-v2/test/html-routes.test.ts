import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

/**
 * V3 Phase 2b+3 (V3-PLAN.md section 11): "Per new HTML route: 200 status +
 * correct boot flag + correct canonical/title." Also guards the hard
 * requirement that /, /s/:code, /f/:code, /admin, /account keep working
 * and that an arbitrary unknown path still 404s.
 */

const NEW_ROUTES: Array<{ path: string; titleContains: string }> = [
  { path: "/text", titleContains: "Send text" },
  { path: "/files", titleContains: "Send files" },
  { path: "/nearby", titleContains: "Nearby drops" },
  { path: "/receive", titleContains: "Receive a drop" },
  { path: "/qr", titleContains: "Free QR code generator" },
  { path: "/guide", titleContains: "How AirText works" },
  { path: "/faq", titleContains: "FAQ" },
  { path: "/about", titleContains: "About" },
  { path: "/privacy", titleContains: "Privacy policy" },
  { path: "/terms", titleContains: "Terms of service" },
  { path: "/login", titleContains: "Sign in" },
];

describe("V3 public HTML routes", () => {
  for (const route of NEW_ROUTES) {
    it(`GET ${route.path} returns 200 with its own <title> and canonical link`, async () => {
      const response = await SELF.fetch(`https://example.com${route.path}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<title>${route.titleContains}`);
      expect(html).toContain(`href="https://example.com${route.path}"`);
      // Every public route shares the icon sprite and the new nav.
      expect(html).toContain('id="i-logo"');
      expect(html).toContain('__AIRTEXT_BOOT__');
    });
  }

  it("GET /faq includes FAQPage JSON-LD structured data", async () => {
    const response = await SELF.fetch("https://example.com/faq");
    const html = await response.text();
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("GET / renders the V3 landing page (hero + quick-share + live Wi-Fi strip + FAQ teaser)", async () => {
    const response = await SELF.fetch("https://example.com/");
    expect(response.status).toBe(200);
    const html = await response.text();
    // Quick-share card reuses the same create/upload/join fragments and
    // ids as /text, /files and /receive (V3-PLAN.md section 4.3) -- the
    // landing page is no longer the old 4-tab hero+tabs+notes+join+files
    // experience, it's a marketing page with a working mini quick-share.
    expect(html).toContain('id="create-card"');
    expect(html).toContain('id="files-card"');
    expect(html).toContain('id="join-form"');
    expect(html).toContain('id="quick-share-card"');
    expect(html).toContain('id="wifi-live-strip"');
    expect(html).toContain('id="share-anything-section"');
    expect(html).toContain('id="how-it-works-section"');
    expect(html).toContain('id="device-grid-section"');
    expect(html).toContain('id="faq-teaser-section"');
    // The old sitewide 4-tab board (Available/Open code as home tabs) and
    // marquee ticker are gone -- Nearby now lives at its own /nearby route.
    expect(html).not.toContain('id="notes-section"');
    expect(html).not.toContain('id="ticker-section"');
    expect(html).toContain('"initialAdmin":false');
  });

  it("GET /admin still renders with initialAdmin true", async () => {
    const response = await SELF.fetch("https://example.com/admin");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('"initialAdmin":true');
    expect(html).toContain('id="admin-login-form"');
  });

  it("GET /account still renders with initialAccount true", async () => {
    const response = await SELF.fetch("https://example.com/account");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('"initialAccount":true');
    expect(html).toContain('id="account-login-form"');
  });

  it("GET /s/:code and /f/:code still 200 with the matching boot flags, unchanged", async () => {
    const noteResponse = await SELF.fetch("https://example.com/s/ABC123");
    expect(noteResponse.status).toBe(200);
    const noteHtml = await noteResponse.text();
    expect(noteHtml).toContain('"initialShareCode":"ABC123"');

    const fileResponse = await SELF.fetch("https://example.com/f/ABC123");
    expect(fileResponse.status).toBe(200);
    const fileHtml = await fileResponse.text();
    expect(fileHtml).toContain('"initialFileShareCode":"ABC123"');
  });

  it("an unknown path still 404s", async () => {
    const response = await SELF.fetch("https://example.com/this-route-does-not-exist");
    expect(response.status).toBe(404);
  });
});
