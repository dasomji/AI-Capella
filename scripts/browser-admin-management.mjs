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
  await loaded();
  await page.evaluate(() => document.fonts.ready);
  files.push(shots + "/" + name + ".png");
  await page.screenshot({ path: files.at(-1), fullPage: true });
};
async function loaded(scope = page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await assertEventually(async () =>
    assert.equal(
      await scope.locator('[aria-busy="true"]').count() +
        (scope === page ? 0 : await scope.evaluate((el) => Number(el.getAttribute("aria-busy") === "true"))),
      0,
    ),
  );
}
async function ids(scope) {
  return scope
    .locator("tbody tr")
    .evaluateAll((rows) => rows.map((row) => row.dataset.rowId));
}
async function pageNumber(scope, number) {
  await loaded(scope);
  assert.match(
    await scope.locator(".admin-pagination").innerText(),
    new RegExp("Page " + number + "(?:\\D|$)"),
  );
}
async function tabTo(locator) {
  for (let n = 0; n < 80; n++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw Error("Tab did not reach requested control");
}
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
  for (let i = 0; i < 24; i++)
    await db.query(
      'insert into "user"(name,email,email_verified) values($1,$2,true)',
      [
        "Pagination singer " + String(i).padStart(2, "0"),
        "pagination-" + i + "@example.test",
      ],
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
  await loaded(users);
  assert.equal(
    await page.getByRole("region", { name: "Users", exact: true }).count(),
    1,
  );
  // The helper must ignore unrelated busy regions while observing its own root.
  await page.evaluate(() => {
    const unrelated = document.createElement("div");
    unrelated.id = "unrelated-busy";
    unrelated.setAttribute("aria-busy", "true");
    document.body.append(unrelated);
  });
  await loaded(users);
  await page.locator("#unrelated-busy").evaluate((el) => el.remove());
  const pageOneIds = await ids(users);
  await page.route("**/api/admin/users?*", (route) => route.fulfill({
    status: 429, contentType: "application/json",
    body: JSON.stringify({code: "rate_limited", max: 120, unit: "minute"}),
  }), {times: 1});
  await users.getByRole("button", {name: "Next", exact: true}).click();
  await pageNumber(users, 2);
  assert.deepEqual(await ids(users), [], "Failed navigation clears the previous page's rows");
  await users.getByRole("alert").waitFor();
  await users.getByRole("button", {name: "Retry", exact: true}).waitFor();
  await page.getByRole("button", {name: "DE", exact: true}).click();
  await page.locator("main > .admin-data-table").getByRole("button", {name: "Erneut versuchen", exact: true}).click();
  await loaded(page.locator("main > .admin-data-table"));
  await page.getByRole("button", {name: "EN", exact: true}).click();
  await pageNumber(users, 2);
  assert.deepEqual(await ids(users), (await db.query('select id from "user" order by id offset 10 limit 10')).rows.map((r) => r.id));
  assert.equal(await users.getByRole("alert").count(), 0);
  await users.getByRole("button", {name: "Previous", exact: true}).click();
  await pageNumber(users, 1);
  assert.deepEqual(await ids(users), pageOneIds);
  const expectedIds = (
    await db.query('select id from "user" order by id')
  ).rows.map((r) => r.id);
  const visited = [];
  for (let number = 1; ; number++) {
    await pageNumber(users, number);
    visited.push(...(await ids(users)));
    const pager = users.getByRole("button", { name: "Next", exact: true });
    if ((await pager.getAttribute("aria-disabled")) === "true") break;
    await pager.click();
    await loaded(users);
    assert.equal(
      await pager.evaluate((el) => el === document.activeElement),
      true,
      "Next retains keyboard focus",
    );
  }
  assert.deepEqual(visited, expectedIds);
  assert.equal(new Set(visited).size, visited.length);
  // Sort from page 2 with the keyboard, then verify server order in both directions.
  await users.getByRole("button", { name: "Previous", exact: true }).click();
  await pageNumber(users, 2);
  const name = users.getByRole("columnheader", { name: /Name/ });
  await tabTo(name.getByRole("button"));
  await page.keyboard.press("Enter");
  await pageNumber(users, 1);
  assert.equal(await name.getAttribute("aria-sort"), "ascending");
  assert.deepEqual(
    await ids(users),
    (
      await db.query('select id from "user" order by name asc,id asc limit 10')
    ).rows.map((r) => r.id),
  );
  await page.keyboard.press("Enter");
  await pageNumber(users, 1);
  assert.equal(await name.getAttribute("aria-sort"), "descending");
  assert.deepEqual(
    await ids(users),
    (
      await db.query(
        'select id from "user" order by name desc,id desc limit 10',
      )
    ).rows.map((r) => r.id),
  );
  await users
    .getByRole("columnheader", { name: /Email$/ })
    .getByRole("button")
    .click({ modifiers: ["Shift"] });
  await loaded(users);
  assert.equal(await name.getAttribute("aria-sort"), "none");
  assert.equal(
    await users
      .locator('th[aria-sort="ascending"],th[aria-sort="descending"]')
      .count(),
    1,
  );
  assert.deepEqual(
    await ids(users),
    (
      await db.query('select id from "user" order by email asc,id asc limit 10')
    ).rows.map((r) => r.id),
  );
  await users.getByRole("button", { name: "Next", exact: true }).click();
  await pageNumber(users, 2);
  await page.getByRole("searchbox").fill("user@test.com");
  await users
    .getByRole("cell", { name: "user@test.com", exact: true })
    .waitFor();
  await pageNumber(users, 1);
  assert.equal(await users.locator("tbody tr").count(), 1);
  await shot("users-search-sort");
  await users.locator("tbody tr").first().focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Test User", exact: true })
    .waitFor();
  await loaded();
  await shot("user-memberships");
  // More than one membership page makes mutation refresh behavior observable.
  await db.query(
    "insert into memberships(ensemble_id,user_id) select $1,id from \"user\" where email like 'pagination-%' order by id limit 12",
    [ensemble.id],
  );
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
  await loaded(members);
  assert.equal(
    await members
      .getByRole("columnheader", { name: "Actions", exact: true })
      .getAttribute("aria-sort"),
    null,
  );
  await members.getByLabel("Rows per page", { exact: true }).selectOption("10");
  await loaded(members);
  await members
    .getByRole("columnheader", { name: /Name/ })
    .getByRole("button")
    .click();
  await loaded(members);
  // An in-place refresh failure retains both the current page and its Next cursor.
  const refreshIds = await ids(members);
  const refreshRow = members.locator("tbody tr").filter({hasText: "pagination-"}).first();
  await page.route("**/api/admin/memberships?*", (route) => route.fulfill({
    status: 429, contentType: "application/json",
    body: JSON.stringify({code: "rate_limited", max: 120, unit: "minute"}),
  }), {times: 2});
  await refreshRow.getByLabel("Edit music pieces", {exact: true}).check();
  await refreshRow.getByRole("button", {name: "Save permissions", exact: true}).click();
  await confirmation("Browser: refresh failure retains rows and cursor");
  for(let attempt = 0; attempt < 2; attempt++) {
    await loaded(members);
    assert.deepEqual(await ids(members), refreshIds);
    assert.equal(await members.getByRole("button", {name: "Next", exact: true}).getAttribute("aria-disabled"), "false");
    await members.getByRole("button", {name: "Retry", exact: true}).click();
  }
  await loaded(members);
  assert.equal(await members.getByRole("alert").count(), 0);
  assert.deepEqual(await ids(members), refreshIds);
  await members.getByRole("button", { name: "Next", exact: true }).click();
  await pageNumber(members, 2);
  const membershipIds = await ids(members);
  await page.route("**/api/admin/memberships?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.route(
    "**/api/admin/ensembles/" + ensemble.id,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "service_unavailable" }),
      }),
    { times: 1 },
  );
  await row.getByLabel("Edit music pieces", { exact: true }).check();
  await row
    .getByRole("button", { name: "Save permissions", exact: true })
    .click();
  await confirmation("Browser: grant editing");
  assert.deepEqual(
    await ids(members),
    membershipIds,
    "Rows remain visible during mutation refetch",
  );
  await pageNumber(members, 2);
  assert.deepEqual(await ids(members), membershipIds);
  await management
    .getByRole("status")
    .filter({ hasText: "Change saved. Refreshing the view failed." })
    .waitFor();
  assert.equal(
    await page.locator("dialog[open]").count(),
    0,
    "Refresh failure does not reopen mutation dialog",
  );
  await page.unroute("**/api/admin/memberships?*");
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
  const removalRefresh = await holdDetailRefresh(ensemble.id);
  await row.getByRole("button", { name: "Remove member", exact: true }).click();
  await confirmation("Browser: remove the test account");
  await row.waitFor({ state: "hidden" });
  await pageNumber(members, 2);
  assert.equal(
    (
      await db.query(
        'select 1 from memberships m join "user" u on u.id=m.user_id where ensemble_id=$1 and u.email=$2',
        [ensemble.id, "user@test.com"],
      )
    ).rowCount,
    0,
  );
  assert.equal(await management.getByRole("heading", {name: "Memberships", exact: true}).evaluate((el) => el === document.activeElement), true, "Removal moves focus to the membership heading");
  await shot("member-removed");
  await removalRefresh.started;
  await page.getByRole("button", {name: "Close", exact: true}).click();
  await removalRefresh.release();
  await loaded();
  assert.equal(await detail.count(), 0, "A delayed refresh cannot reopen a closed detail");
  await ensembles.getByRole("cell", {name: ensemble.name, exact: true}).click();
  await loaded(members);
  // Open another profile while an older mutation refresh is pending.
  const alternateResponse = await context.request.post(base + "/api/ensembles", {
    headers: {origin: base}, data: {name: "Admin management browser alternate", kind: "choir"},
  });
  assert.equal(alternateResponse.status(), 201);
  const alternate = await alternateResponse.json();
  const staleRefresh = await holdDetailRefresh(ensemble.id);
  const anotherRow = members.locator("tbody tr").filter({hasText: "pagination-"}).first();
  const edit = anotherRow.getByLabel("Transcribe", {exact: true});
  await edit.setChecked(!(await edit.isChecked()));
  await anotherRow.getByRole("button", {name: "Save permissions", exact: true}).click();
  await confirmation("Browser: changing profiles invalidates detail refresh");
  await staleRefresh.started;
  await loaded(members);
  await page.getByRole("button", {name: "Close", exact: true}).click();
  await ensembles.getByRole("cell", {name: alternate.name, exact: true}).click();
  await detail.getByRole("heading", {name: alternate.name, exact: true}).waitFor();
  await staleRefresh.release();
  await loaded();
  assert.equal(await detail.getByRole("heading", {name: alternate.name, exact: true}).count(), 1, "A delayed refresh cannot overwrite another profile");
  await page.getByRole("button", {name: "Close", exact: true}).click();
  await ensembles.getByRole("cell", {name: ensemble.name, exact: true}).click();
  await loaded(members);
  // A clear, translated failure case for the sole remaining lead.
  await members.getByRole("searchbox").fill("admin@test.com");
  await loaded(members);
  await members
    .locator("tbody tr")
    .filter({ hasText: "admin@test.com" })
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
  await page
    .locator("main > .admin-data-table tbody tr")
    .filter({ hasText: ensemble.name })
    .click();
  await management
    .getByRole("button", { name: "Mitglied hinzufügen", exact: true })
    .waitFor();
  await management.locator("tbody tr").first().waitFor();
  await loaded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const wrap = management.locator(".admin-table-wrap").first();
  assert.equal(
    await wrap.evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  for (const control of [
    wrap.getByRole("checkbox").first(),
    wrap
      .getByRole("button", { name: "Berechtigungen speichern", exact: true })
      .first(),
    wrap
      .getByRole("button", { name: "Mitglied entfernen", exact: true })
      .first(),
  ]) {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  }
  await shot("phone-de");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await page.getByRole("searchbox").fill("admin@test.com");
  await page
    .locator("main > .admin-data-table tbody tr")
    .filter({ hasText: "admin@test.com" })
    .waitFor();
  await loaded();
  await page
    .locator("main > .admin-data-table tbody tr")
    .filter({ hasText: "admin@test.com" })
    .click();
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
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // Legacy audit tables share the phone card rule; their labels and data remain readable.
  await page.getByRole("link", { name: "Audit log", exact: true }).click();
  await page.locator(".admin-table-wrap tbody tr").first().waitFor();
  assert.equal(
    await page
      .locator(".admin-table-wrap tbody tr")
      .first()
      .evaluate((el) => getComputedStyle(el).display),
    "block",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    evidence + "/browser-report.md",
    `Admin browser journey: PASS\n\nSign-in, user/ensemble search and sorting, user detail, direct add, inline permission change, removal, last-lead and self-revoke failures, complete pagination, exact ascending/descending row order, page resets for search/sort, keyboard sorting/detail activation, pager focus, failed navigation with translated retry, in-place refresh preserving rows/cursors across failed retries, removal focus, stale detail refresh after closing or changing profiles, German phone cards with reachable controls.\n\n${files.map((f) => "- " + f).join("\n")}\n`,
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

async function holdDetailRefresh(id) {
  let start, release;
  const started = new Promise((resolve) => {start = resolve;});
  const gate = new Promise((resolve) => {release = resolve;});
  const path = "**/api/admin/ensembles/" + id;
  await page.route(path, async (route) => {
    const response = await route.fetch();
    start();
    await gate;
    await route.fulfill({response});
  }, {times: 1});
  return {started, release: async () => {
    const received = page.waitForResponse((r) => r.url() === base + "/api/admin/ensembles/" + id && r.request().method() === "GET");
    release();
    await received;
  }};
}
