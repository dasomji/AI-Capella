import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureDesign } from "./browser-design.mjs";
import { assertPlayerContrast } from "./browser-themes.mjs";
const base = process.env.BROWSER_BASE || "http://localhost:3000",
  evidence =
    process.env.BROWSER_EVIDENCE || `${process.cwd()}/.review-evidence/browser`;
fs.mkdirSync(`${evidence}/shots`, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const a = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  }),
  b = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
for (const c of [a, b])
  await c.addInitScript(() =>
    localStorage.setItem("ai-capella-intro-off", "1"),
  );
const p = await a.newPage(),
  q = await b.newPage(),
  errors = [];
for (const page of [p, q]) page.on("pageerror", (e) => errors.push(e.message));
const suffix = Date.now(),
  emailA = `lead-${suffix}@example.test`,
  emailB = `member-${suffix}@example.test`,
  password = "Browser-fixture-password-42";
const shot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('#app.mode-landing #landing').count()) {
    await page.waitForFunction(() => !document.querySelector('.ls-name') || document.querySelector('.ls-name.light-settled'));
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  }
  return page.screenshot({ path: `${evidence}/shots/${name}.png`, fullPage: true });
};
async function mailLink(email, contains = "") {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (
      await fetch(
        `${process.env.MAILPIT_URL || "http://127.0.0.1:28025"}/api/v1/messages`,
      )
    ).json();
    for (const mail of list.messages.filter((m) =>
      m.To.some((t) => t.Address === email),
    )) {
      const msg = await (
        await fetch(
          `${process.env.MAILPIT_URL || "http://127.0.0.1:28025"}/api/v1/message/${mail.ID}`,
        )
      ).json();
      const link = msg.Text.match(/https?:\/\/[^\s<>]+/g)?.find((x) =>
        x.includes(contains),
      );
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("No fixture email");
}
async function signup(page, email, name) {
  await page.locator("[name=name]").fill(name);
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.locator("form button[type=submit]").click();
  await page
    .getByRole("status")
    .filter({ hasText: "Check your email" })
    .waitFor();
  await page.goto(await mailLink(email, "verify-email"));
  await page.locator('[name=password]').fill(password);
  await page.locator('[name=confirm]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.getByRole('status').filter({hasText:'Email verified'}).waitFor();
}
async function signin(page, email) {
  if (!(await page.locator("[name=email]").count())) await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.locator("form button[type=submit]").click();
}
async function request(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch("/api" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, method, body },
  );
}
try {
  console.log("signup lead");
  await p.goto(base);
  await p
    .locator("nav")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await signup(p, emailA, "Lead Singer");
  await signin(p, emailA);
  await p.waitForURL("**/app");
  await p.getByText("Not in an ensemble yet", { exact: true }).waitFor();
  await shot(p, "title-empty-dark");
  await p.getByRole("button", { name: "Create ensemble", exact: true }).click();
  await p.getByLabel("Name", { exact: true }).fill("Browser Choir");
  await p.locator(".domain-sheet button.primary").click();
  await p.locator(".ens-switch").waitFor();
  const ensembles = (await request(p, "/ensembles")).body,
    e = ensembles[0].id;
  await p.addInitScript(() => localStorage.removeItem("ai-capella-seen"));
  await p.reload();
  await p.locator("#mode-solo-btn").waitFor({ state: "visible" });
  await shot(p, "title-ensemble-dark");
  await p.locator("#mode-solo-btn").click();
  await p
    .locator("#import-input")
    .setInputFiles("public/evening-rise.musicxml");
  await p.locator(".play-btn").waitFor({ state: "visible" });
  await p.locator("#library-back-btn").click();
  await p.locator(".ens-switch").click();
  await p.getByText("Members & invitations", { exact: true }).click();
  await p.getByLabel("Email", { exact: true }).fill(emailB);
  await p.getByRole("button", { name: "Invite", exact: true }).click();
  await p.getByText(emailB, { exact: true }).waitFor();
  await shot(p, "members-dark");
  // Full theme matrix reloads with persisted design in captureDesign.
  console.log("invite member");
  const invite = await mailLink(emailB, "/invite/");
  await q.goto(invite);
  await q
    .getByRole("heading", { name: "Invitation to Browser Choir" })
    .waitFor();
  await shot(q, "invite-dark");
  // Invitation theme matrix is captured separately.
  await q.getByRole("button", { name: "Create account", exact: true }).click();
  await signup(q, emailB, "Member Singer");
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await signin(q, emailB);
  assert.equal(await q.evaluate(()=>sessionStorage.getItem("lightscore-invite") !== null),true);
  await q.getByRole("button", {name:"Accept invitation", exact:true}).click();
  await q.waitForURL("**/app");
  if (await q.locator("#mode-solo-btn").isVisible())
    await q.locator("#mode-solo-btn").click();
  await q.getByText("Evening Rise", { exact: true }).first().waitFor();
  assert.equal(await q.locator(".song-more").count(), 0);
  await q.getByText("Evening Rise", { exact: true }).first().click();
  await q.locator(".play-btn").waitFor({ state: "visible" });
  assert.equal(await q.locator(".t-save").isVisible(), false);
  await q.locator(".play-btn").click();
  await q.waitForTimeout(800);
  await q.locator(".play-btn").click();
  await assertPlayerContrast(q);
  await shot(q, "player-dark");
  await q
    .locator("#import-input")
    .setInputFiles("public/evening-rise.musicxml");
  await q.locator("#local-practice-note").waitFor();
  assert.equal((await request(q, `/ensembles/${e}/pieces`)).body.length, 1);
  console.log("grant edit");
  const members = (await request(p, `/ensembles/${e}/members`)).body,
    member = members.find((m) => m.email === emailB);
  await request(p, `/ensembles/${e}/members/${member.id}`, "PATCH", {
    editPieces: true,
  });
  await q.waitForTimeout(3500);
  await q.locator("#library-back-btn").click();
  await q.locator(".song-more").waitFor();
  await q.locator(".song-more").click();
  await q.getByText("Rename", { exact: true }).click();
  await q.locator(".dialog input").fill("Renamed piece");
  await q.getByRole("button", { name: "Save", exact: true }).click();
  await p.keyboard.press("Escape");
  await p.getByText("Renamed piece", { exact: true }).first().waitFor();
  // Granular independent edits survive a revision conflict; force the stale revision in the UI request.
  const piece = (await request(p, `/ensembles/${e}/pieces`)).body[0];
  await request(p, `/ensembles/${e}/pieces/${piece.id}`, "PATCH", {
    op: "partName",
    key: "a",
    value: "Voice A",
    expectedRevision: piece.revision,
  });
  await q.route(`**/api/ensembles/${e}/pieces/${piece.id}`, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      await route.continue({
        postData: JSON.stringify({ ...body, expectedRevision: piece.revision }),
      });
    } else await route.continue();
  });
  await q.locator(".song-more").click();
  await q.getByText("Rename", { exact: true }).click();
  await q.locator(".dialog input").fill("Conflict name");
  await q.getByRole("button", { name: "Save", exact: true }).click();
  await q
    .getByText("Someone else just changed this – reloaded.", { exact: true })
    .waitFor();
  await q.unrouteAll();
  console.log("conflict passed");
  assert.equal(
    (await request(p, `/ensembles/${e}/pieces/${piece.id}`)).body.settings
      .partNames.a,
    "Voice A",
  );

  await request(p, `/ensembles/${e}/members/${member.id}`, "PATCH", { manageMembers: true });
  await captureDesign(browser, p, q, base, evidence);
  await request(p, `/ensembles/${e}/members/${member.id}`, "PATCH", { manageMembers: false });
  console.log("invitation errors");
  const emailC = `other-${suffix}@example.test`;
  const pending = await request(p, `/ensembles/${e}/invitations`, "POST", {
    email: emailC,
    language: "en",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(pending.status, 201);
  const otherLink = await mailLink(emailC, "/invite/");
  const r = await a.newPage();
  await r.goto(otherLink);
  await r.getByRole("button", { name: "Accept invitation" }).click();
  await r.getByText(/You are signed in as/).waitFor();
  await r
    .getByRole("button", { name: "Sign out and switch account" })
    .waitFor();
  await shot(r, "invite-wrong-account");
  await request(p, `/ensembles/${e}/invitations/${pending.body.id}`, "DELETE");
  await r.reload();
  await r
    .getByText("This invitation has been revoked.", { exact: true })
    .waitFor();
  await shot(r, "invite-revoked");
  await r.close();
  await p.goto(base);
  await p.evaluate(() => { localStorage.removeItem("ai-capella-seen"); sessionStorage.removeItem("ai-capella-mode-switch"); });
  await p.goto(base + "/app");
  await p.locator("#mode-solo-btn").waitFor({ state: "visible" });
  await p.locator("#mode-solo-btn").click();
  await p.locator("#lib-menu-btn").click();
  await p.getByText("Account and devices", { exact: true }).click();
  await p.getByText(/This device/).waitFor();
  await request(p, `/ensembles/${e}/members/${member.id}`, "DELETE");
  await q
    .getByText("You are no longer a member of Browser Choir.", { exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Sign out", exact: true }).click();
  await p.waitForURL("**/?state=signed-out");
  // Exercise the destructive account sheet after the sign-out scenario.
  await signin(p, emailA);
  await p.waitForURL("**/app");
  await p.locator("#mode-solo-btn").waitFor({ state: "visible" });
  await p.locator("#mode-solo-btn").click();
  await p.locator("#lib-menu-btn").click();
  await p.getByText("Account and devices", { exact: true }).click();
  await p.getByRole("button", { name: "Delete account", exact: true }).click();
  await p
    .locator(".domain-sheet")
    .getByText("Browser Choir", { exact: true })
    .waitFor();
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p
    .getByRole("button", { name: "Permanently delete account", exact: true })
    .click();
  await p.waitForURL("**/?state=signed-out");
  assert.deepEqual(errors, []);
  console.log("Phase 2b browser scenarios passed", evidence);
} catch (error) {
  console.error(error);
  await p.screenshot({path:`${evidence}/shots/failure-lead.png`,fullPage:true}).catch(e => console.error(e.message));
  await q.screenshot({path:`${evidence}/shots/failure-member.png`,fullPage:true}).catch(e => console.error(e.message));
  console.error("LEAD", await p.locator("body").innerText());
  console.error("MEMBER", await q.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
