import { test, expect, type Page } from "@playwright/test";

let ip = 10;
test.beforeEach(async ({context}) => { await context.setExtraHTTPHeaders({"CF-Connecting-IP":`203.0.113.${ip++}`}); });
async function createNote(page: Page, once = false) {
  await page.goto("/text");
  await page.locator("#share-title").fill(`Browser fixture ${Date.now()}`);
  await page.locator("#share-text").fill('{"hello":"AirText"}');
  if (once) await page.locator("#burn-toggle").check({force:true});
  await page.locator("#create-submit").click();
  await expect(page.locator("#qr-modal")).toBeVisible();
  const link=await page.locator("#qr-link-input").inputValue();
  await page.locator('#qr-modal [data-action="close-qr-modal"]').first().click();
  return link;
}

test("anonymous recent drops, owner opening, smart text and Nearby search", async ({page}) => {
  const errors: string[]=[]; page.on("pageerror",e=>errors.push(e.message));
  await createNote(page);
  await page.locator("#recent-drops summary").click();
  await page.locator("#recent-drops").getByRole("button",{name:"Open",exact:true}).first().click();
  await expect(page.locator("#modal-text")).toContainText("AirText");
  await page.getByRole("button",{name:"Format JSON",exact:true}).click();
  await page.keyboard.press("Escape");
  await page.goto("/nearby");
  await expect(page.locator("#nearby-drop-list")).toContainText("Browser fixture");
  await page.locator("#nearby-search").fill("no-matching-fixture");
  await expect(page.locator("#nearby-drop-list")).toContainText("No drops match");
  expect(errors).toEqual([]);
});

test("Open once stays off Nearby, permits owner reads and only one recipient read", async ({page,browser}) => {
  const link=await createNote(page,true);
  await page.locator("#recent-drops summary").click();
  await page.locator("#recent-drops").getByRole("button",{name:"Open",exact:true}).first().click();
  await expect(page.locator("#modal-text")).toContainText("AirText");
  const receiver=await browser.newContext(); const view=await receiver.newPage();
  await view.goto(link);
  await expect(view.locator("#modal-text")).toContainText("AirText");
  await view.reload();
  await expect(view.locator("#modal-error")).toBeVisible();
  await receiver.close();
});

test("multi-file owner downloads create a ZIP without consuming recipient attachments", async ({page}) => {
  await page.goto("/files");
  await page.locator("#file-input").setInputFiles([{name:"first.txt",mimeType:"text/plain",buffer:Buffer.from("first")},{name:"second.txt",mimeType:"text/plain",buffer:Buffer.from("second")}]);
  await page.locator("#file-title").fill("Browser file batch");
  await page.locator("#file-burn-control").click();
  await page.locator("#file-upload-submit").click();
  await expect(page.locator("#qr-modal")).toBeVisible();
  await page.locator('#qr-modal [data-action="close-qr-modal"]').first().click();
  await page.locator("#recent-drops summary").click();
  await page.locator("#recent-drops").getByRole("button",{name:"Open",exact:true}).first().click();
  await expect(page.locator("#file-batch-tools")).toContainText("Owner downloads do not consume");
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download all (2)",exact:true}).click();
  expect((await downloaded).suggestedFilename()).toBe("airtext-files.zip");
});

test("encrypted creation sends ciphertext and complete links decrypt in a separate browser", async ({page,browser}) => {
  await page.goto("/login");
  await page.locator("#login-email").fill("e2e@airtext.test");
  await page.locator("#login-password").fill("e2e-test-password-only");
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator("#login-admin-hint")).toBeVisible();
  await page.goto("/text");
  await expect(page.locator("#encryption-option")).toBeVisible();
  await page.locator("#share-title").fill("Encrypted browser fixture");
  const plaintext="browser-only-secret " + Date.now();
  await page.locator("#share-text").fill(plaintext);
  await page.locator("#encrypt-note-toggle").check();
  const request=page.waitForRequest(r=>r.url().endsWith("/api/items") && r.method()==="POST");
  await page.locator("#create-submit").click();
  const body=(await request).postDataJSON();
  expect(body.encrypted).toBe(true); expect(body.text).not.toContain(plaintext); expect(body.key).toBeUndefined();
  await expect(page.locator("#qr-modal")).toBeVisible();
  const link=await page.locator("#qr-link-input").inputValue(); expect(link).toContain("#key=");
  await page.locator('#qr-modal [data-action="close-qr-modal"]').first().click();
  await page.locator("#recent-drops summary").click();
  await page.locator("#recent-drops").getByRole("button",{name:"Open",exact:true}).first().click();
  await page.locator('#item-modal [data-action="open-edit-item-modal"]').click();
  await page.locator("#edit-item-text").fill(plaintext + " edited");
  await page.locator("#edit-item-submit").click();
  await expect(page.locator("#edit-item-modal")).toBeHidden();
  const receiver=await browser.newContext(); const view=await receiver.newPage();
  await view.goto(link); await expect(view.locator("#modal-text")).toContainText(plaintext + " edited");
  await expect(view.locator("#modal-lock-badge")).toHaveText("Browser encrypted");
  await receiver.close();
});

test("public and admin layouts fit phone, tablet and desktop widths", async ({page}) => {
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  for (const width of [360,768,1440]) {
    await page.setViewportSize({width,height:900});
    for(const route of ["/","/nearby","/account","/admin"]) {
      await page.goto(route); await page.waitForTimeout(150);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1),`${route} at ${width}px`).toBe(true);
      if(route==="/admin") await expect(page.locator('nav[aria-label="Mobile navigation"]')).toBeHidden();
    }
  }
  await page.goto("/login");
  await page.locator("#login-email").fill("e2e@airtext.test");
  await page.locator("#login-password").fill("e2e-test-password-only");
  await page.locator("#login-submit").click();
  await expect(page.locator("#login-admin-hint")).toBeVisible();
  for(const width of [360,768,1440]) {
    await page.setViewportSize({width,height:900}); await page.goto("/admin");
    await expect(page.locator("#admin-dashboard")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1),`Admin shell at ${width}px`).toBe(true);
  }
  expect(errors).toEqual([]);
});
