import { chromium } from "playwright";
import pg from "pg";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const base = process.env.BROWSER_BASE;
if (
  process.env.NODE_ENV !== "test" ||
  !base ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname)
)
  throw Error("Use the isolated browser harness");
const evidence = process.env.BROWSER_EVIDENCE || "/tmp/aicap-admin",
  shots = evidence + "/shots";
await fs.mkdir(shots, { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/seed-dev.ts"],
    { env: process.env, stdio: "inherit" },
  );
  child.once("exit", (code) =>
    code === 0 ? resolve() : reject(Error("Fixture seeding failed")),
  );
});
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  localStorage.setItem("ai-capella-intro-off", "1");
  localStorage.setItem("ai-capella-lang", "en");
});
const page = await context.newPage(),
  errors = [],
  files = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  files.push(shots + "/" + name + ".png");
  await page.screenshot({ path: files.at(-1), fullPage: true });
};
async function confirmation(reason) {
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  await dialog.getByLabel("Reason", { exact: true }).fill(reason);
  await dialog
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("[name=email]").fill("admin@test.com");
  await page.locator("[name=password]").fill("password");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL("**/app");
  const r = await context.request.post(base + "/api/ensembles", {
    headers: { origin: base },
    data: { name: "Admin management browser choir", kind: "choir" },
  });
  assert.equal(r.status(), 201);
  const ensemble = await r.json();
  for (let i = 0; i < 12; i++)
    await db.query(
      'insert into "user"(name,email,email_verified) values($1,$2,true)',
      ["Pagination singer " + i, "pagination-" + i + "@example.test"],
    );
  await page.goto(base + "/admin/users");
  const users = page.getByRole("region", { name: "Users", exact: true });
  await users
    .getByRole("cell", { name: "admin@test.com", exact: true })
    .waitFor();
  await page.getByLabel("Rows per page", { exact: true }).selectOption("10");
  await assertEventually(async () =>
    assert.equal(await users.locator("tbody tr").count(), 10),
  );
  const firstName = await users.locator("tbody tr td").first().textContent();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await assertEventually(async () =>
    assert.notEqual(
      await users.locator("tbody tr td").first().textContent(),
      firstName,
    ),
  );
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await assertEventually(async () =>
    assert.equal(
      await users.locator("tbody tr td").first().textContent(),
      firstName,
    ),
  );
  const name = users.getByRole("columnheader", { name: /Name/ });
  await name.getByRole("button").click();
  await assertEventually(async () =>
    assert.notEqual(await name.getAttribute("aria-sort"), "none"),
  );
  await page.getByRole("searchbox").fill("user@test.com");
  await users
    .getByRole("cell", { name: "user@test.com", exact: true })
    .waitFor();
  assert.equal(await users.locator("tbody tr").count(), 1);
  await shot("users-search-sort");
  await users.getByRole("cell", { name: "user@test.com", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Test User", exact: true })
    .waitFor();
  await shot("user-memberships");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Ensembles", exact: true }).click();
  const ensembles = page.getByRole("region", {
    name: "Ensembles",
    exact: true,
  });
  await ensembles
    .getByRole("cell", { name: ensemble.name, exact: true })
    .waitFor();
  await ensembles
    .getByRole("columnheader", { name: /Name/ })
    .getByRole("button")
    .click();
  await page.getByRole("searchbox").fill("Admin management browser");
  await ensembles
    .getByRole("cell", { name: ensemble.name, exact: true })
    .waitFor();
  await shot("ensembles-search-sort");
  await ensembles
    .getByRole("cell", { name: ensemble.name, exact: true })
    .click();
  const detail = page.locator(".admin-detail"),
    management = detail.locator(".admin-management");
  await management
    .getByRole("button", { name: "Add member", exact: true })
    .click();
  const picker = management.getByRole("region", {
    name: "Choose user",
    exact: true,
  });
  await management.getByRole("searchbox").last().fill("user@test.com");
  await picker
    .getByRole("cell", { name: "user@test.com", exact: true })
    .waitFor();
  await picker
    .getByRole("button", { name: "Choose user", exact: true })
    .click();
  await management
    .getByRole("button", { name: "Add member", exact: true })
    .last()
    .click();
  await shot("add-confirmation");
  await confirmation("Browser: add the existing test account");
  const members = management.getByRole("region", {
    name: "Memberships",
    exact: true,
  });
  let row = members.locator("tbody tr").filter({ hasText: "user@test.com" });
  await row.waitFor();
  await row.getByLabel("Edit music pieces", { exact: true }).check();
  await row
    .getByRole("button", { name: "Save permissions", exact: true })
    .click();
  await confirmation("Browser: grant editing");
  await assertEventually(async () =>
    assert.equal(
      (
        await db.query(
          'select m.edit_music_pieces from memberships m join "user" u on u.id=m.user_id where m.ensemble_id=$1 and u.email=$2',
          [ensemble.id, "user@test.com"],
        )
      ).rows[0]?.edit_music_pieces,
      true,
    ),
  );
  await shot("permission-updated");
  row = members.locator("tbody tr").filter({ hasText: "user@test.com" });
  await row.getByRole("button", { name: "Remove member", exact: true }).click();
  await confirmation("Browser: remove the test account");
  await row.waitFor({ state: "hidden" });
  assert.equal(
    (
      await db.query(
        'select 1 from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1 and u.email=$2',
        [ensemble.id, "user@test.com"],
      )
    ).rowCount,
    0,
  );
  await shot("member-removed");
  // A clear, translated failure case for the sole remaining lead.
  await members
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  const dialog = page.locator("dialog[open]");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("Browser: last lead guard");
  await dialog
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "at least one lead" })
    .waitFor();
  await shot("last-lead-error");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "DE", exact: true }).click();
  await ensembles
    .getByRole("cell", { name: ensemble.name, exact: true })
    .click();
  await management
    .getByRole("button", { name: "Mitglied hinzufügen", exact: true })
    .waitFor();
  await management.locator("tbody tr").first().waitFor();
  await shot("phone-de");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const wrap = management.locator(".admin-table-wrap").first();
  assert.ok(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth));
  assert.equal(
    await wrap.locator("table").evaluate((el) => getComputedStyle(el).display),
    "table",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("searchbox").fill("admin@test.com");
  await page
    .getByRole("cell", { name: "admin@test.com", exact: true })
    .waitFor();
  await page.getByRole("cell", { name: "admin@test.com", exact: true }).click();
  await page
    .getByRole("button", { name: "Revoke sysadmin", exact: true })
    .click();
  await page
    .locator("dialog[open]")
    .getByLabel("Reason", { exact: true })
    .fill("Browser: self revoke guard");
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await page
    .locator("dialog[open]")
    .getByRole("alert")
    .filter({ hasText: "cannot revoke your own" })
    .waitFor();
  await shot("self-revoke-error");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    evidence + "/browser-report.md",
    `Admin browser journey: PASS\n\nSign-in, user/ensemble search and sorting, user detail, direct add, inline permission change, removal, last-lead and self-revoke failures, German phone layout with table-only scrolling.\n\n${files.map((f) => "- " + f).join("\n")}\n`,
  );
  console.log("ADMIN_MANAGEMENT_BROWSER_PASS", files.length, "screenshots");
} catch (e) {
  await shot("failure");
  console.error(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
  await db.end();
}
async function assertEventually(check) {
  let error;
  for (let n = 0; n < 50; n++) {
    try {
      await check();
      return;
    } catch (e) {
      error = e;
      await page.waitForTimeout(100);
    }
  }
  throw error;
}
