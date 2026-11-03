import {
  ensembleSchema,
  memberSchema,
  invitationSchema,
  metadataSchema,
} from "../src/api/domain";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { io as connect } from "socket.io-client";
process.env.NODE_ENV = "test";
process.env.MAIL_TRANSPORT = "capture";
process.env.PORT = "23001";
process.env.BETTER_AUTH_URL = "http://localhost:23001";
process.env.TRUSTED_ORIGINS = "http://localhost:23001";
process.env.TZ = "America/New_York";
const { server, io } = await import("../server/start");
const { pool } = await import("../server/db/index.server");
const { captureMail } = await import("../server/mail.server");
const { clock } = await import("../server/domain-http.server");
const base = process.env.BETTER_AUTH_URL;
after(async () => {
  await new Promise<void>((r) => io.close(() => r()));
  server.close();
  await pool.end();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  return fetch(base + "/api/" + path, {
    method,
    headers: { origin: base, cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function ok(path: string, method = "GET", body?: unknown, cookie = "") {
  const r = await request(path, method, body, cookie);
  assert.ok(r.ok, `${method} ${path}: ${r.status} ${await r.clone().text()}`);
  const data = await r.json();
  for (const value of Array.isArray(data) ? data : [data]) {
    if (value?.membershipId) ensembleSchema.parse(value);
    else if (value?.userId && value?.capabilities) memberSchema.parse(value);
    else if (value?.deliveryState) invitationSchema.parse(value);
    else if (value?.contentHash && value?.settings) metadataSchema.parse(value);
  }
  return data;
}
async function register(
  email = `${crypto.randomUUID()}@example.test`,
  callbackURL = base + "/?state=verified",
) {
  const password = "domain-fixture-password-42";
  const response = await ok("auth/sign-up/email", "POST", {
    email,
    password,
    name: "Singer",
    callbackURL,
  });
  for (
    let n = 0;
    n < 100 && !captureMail.messages.some((m) => m.to === email);
    n++
  )
    await delay(10);
  const link = captureMail.messages
    .filter((m) => m.to === email)
    .at(-1)!
    .text.match(/https?:\/\/\S+/)![0];
  return { email, password, response, link };
}
async function signin(a: { email: string; password: string }) {
  const r = await request("auth/sign-in/email", "POST", a);
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const user = await ok("me", "GET", undefined, cookie);
  return { cookie, id: user.user.id, email: a.email };
}
async function account() {
  const a = await register();
  await fetch(a.link, { redirect: "manual" });
  return signin(a);
}
const xml =
  '<score-partwise><part id="P1"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
test(
  "ensemble capabilities, invitation journey, lead races, library isolation and sockets",
  { timeout: 90000 },
  async () => {
    const lead = await account(),
      other = await account(),
      outsider = await account();
    const e = await ok(
        "ensembles",
        "POST",
        { name: "Choir", kind: "choir" },
        lead.cookie,
      ),
      f = await ok("ensembles", "POST", { name: "Other" }, outsider.cookie);
    const path = `ensembles/${e.id}`;
    await pool.query('update "user" set language=$2 where id=$1', [
      other.id,
      "de",
    ]);
    const invite = await ok(
      path + "/invitations",
      "POST",
      { email: other.email, idempotencyKey: "invite-1" },
      lead.cookie,
    );
    assert.match(captureMail.messages.at(-1)!.subject, /Einladung/);
    const raw = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
    assert.ok(!JSON.stringify(invite).includes(raw));
    assert.equal(
      (
        await pool.query("select token_hash from invitations where id=$1", [
          invite.id,
        ])
      ).rows[0].token_hash.length,
      64,
    );
    assert.equal(
      (
        await request(
          "invitations/" + raw + "/accept",
          "POST",
          {},
          outsider.cookie,
        )
      ).status,
      403,
    );
    const m = await ok(
      "invitations/" + raw + "/accept",
      "POST",
      {},
      other.cookie,
    );
    assert.deepEqual(m.capabilities, {
      manageMembers: false,
      editPieces: false,
      transcribe: false,
    });
    assert.deepEqual(
      await ok("invitations/" + raw + "/accept", "POST", {}, other.cookie),
      m,
    );
    assert.equal(
      (
        await request(
          path + "/invitations",
          "POST",
          { email: other.email, idempotencyKey: "member" },
          lead.cookie,
        )
      ).status,
      409,
    );
    const body = {
      title: "Large score",
      idempotencyKey: "piece",
      content: {
        format: "musicxml",
        schemaVersion: 1,
        body: xml.replace("<part id=", `<!--${"x".repeat(950000)}--><part id=`),
      },
    };
    assert.equal(
      (await request(path + "/pieces", "POST", body, other.cookie)).status,
      403,
    );
    const piece = await ok(path + "/pieces", "POST", body, lead.cookie);
    const p = path + "/pieces/" + piece.id;
    assert.equal(
      (await ok(path + "/pieces", "POST", body, lead.cookie)).id,
      piece.id,
    );
    const list = await ok(path + "/pieces", "GET", undefined, other.cookie);
    assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes("score-partwise"));
    let r = await request(p + "/versions/1", "GET", undefined, other.cookie);
    assert.equal(r.headers.get("etag"), `"${piece.contentHash}"`);
    assert.equal(
      r.headers.get("cache-control"),
      "private, max-age=31536000, immutable",
    );
    assert.ok((await r.text()).length > 900000);
    for (const suffix of [
      `pieces/${piece.id}`,
      `pieces/${piece.id}/versions/1`,
      `members/${m.id}`,
      `invitations/${invite.id}`,
    ]) {
      const method = suffix.startsWith("members")
        ? "DELETE"
        : suffix.startsWith("invitations")
          ? "DELETE"
          : "GET";
      assert.equal(
        (
          await request(
            `ensembles/${f.id}/${suffix}`,
            method,
            undefined,
            outsider.cookie,
          )
        ).status,
        404,
      );
    }
    assert.equal(
      (await request(path + "/pieces", "GET", undefined, outsider.cookie))
        .status,
      404,
    );
    for (const capability of ["editPieces", "transcribe", "manageMembers"]) {
      await ok(
        path + "/members/" + m.id,
        "PATCH",
        { [capability]: true },
        lead.cookie,
      );
      if (capability === "editPieces") {
        await ok(p, "PATCH", { op: "title", value: "Edited" }, other.cookie);
      } else if (capability === "transcribe") {
        assert.equal(
          (
            await request(
              p,
              "PATCH",
              { op: "title", value: "No" },
              other.cookie,
            )
          ).status,
          403,
        );
      } else {
        assert.equal(
          (
            await request(
              path + "/members/" + m.id,
              "PATCH",
              { editPieces: true },
              other.cookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              path + "/invitations",
              "POST",
              {
                email: "escalate@example.test",
                capabilities: { editPieces: true },
                idempotencyKey: "bad",
              },
              other.cookie,
            )
          ).status,
          403,
        );
        const leads = await ok(
          path + "/members",
          "GET",
          undefined,
          other.cookie,
        );
        const leader = leads.find((x: any) => x.isLead);
        assert.equal(
          (
            await request(
              path + "/members/" + leader.id,
              "DELETE",
              undefined,
              other.cookie,
            )
          ).status,
          403,
        );
      }
      await ok(
        path + "/members/" + m.id,
        "PATCH",
        { [capability]: false },
        lead.cookie,
      );
      assert.equal(
        (
          await request(
            capability === "manageMembers" ? path + "/members" : p,
            capability === "manageMembers" ? "GET" : "PATCH",
            capability === "manageMembers"
              ? undefined
              : { op: "title", value: "No" },
            other.cookie,
          )
        ).status,
        403,
      );
    }
    await ok(
      path + "/members/" + m.id,
      "PATCH",
      { editPieces: true },
      lead.cookie,
    );
    await ok(
      path + "/members/" + m.id,
      "PATCH",
      { transcribe: true },
      lead.cookie,
    );
    await ok(
      path + "/members/" + m.id,
      "PATCH",
      { transcribe: false },
      lead.cookie,
    );
    await ok(
      p,
      "PATCH",
      { op: "title", value: "Independent grants" },
      other.cookie,
    );
    const own = (await ok("ensembles", "GET", undefined, other.cookie)).find(
      (x: any) => x.id === e.id,
    );
    assert.deepEqual(own.capabilities, {
      manageMembers: false,
      editPieces: true,
      transcribe: false,
    });
    assert.equal(own.membershipId, m.id);
    await ok(
      path + "/members/" + m.id,
      "PATCH",
      { editPieces: false },
      lead.cookie,
    );
    await Promise.all([
      ok(
        p,
        "PATCH",
        { op: "partName", key: "P1", value: "Soprano" },
        lead.cookie,
      ),
      ok(p, "PATCH", { op: "clef", key: "P1", value: "treble" }, lead.cookie),
    ]);
    const updated = await ok(p, "GET", undefined, lead.cookie);
    assert.equal(updated.settings.partNames.P1, "Soprano");
    assert.equal(updated.settings.clefOverrides.P1, "treble");
    assert.equal(
      (
        await request(
          p,
          "PATCH",
          { op: "replace", value: { bpm: 80 }, expectedRevision: 1 },
          lead.cookie,
        )
      ).status,
      409,
    );
    for (const bad of [
      "<score-partwise>",
      "<score-partwise><part/></score-partwise>",
      "<other><note/></other>",
    ])
      assert.equal(
        (
          await request(
            path + "/pieces",
            "POST",
            {
              title: "Invalid",
              content: { format: "musicxml", schemaVersion: 1, body: bad },
            },
            lead.cookie,
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await request(
          path + "/pieces",
          "POST",
          {
            title: "Huge",
            content: {
              format: "musicxml",
              schemaVersion: 1,
              body: "x".repeat(21 * 1024 * 1024),
            },
          },
          lead.cookie,
        )
      ).status,
      413,
    );
    const version = await ok(
      p + "/versions",
      "POST",
      {
        expectedRevision: updated.revision,
        content: { format: "musicxml", schemaVersion: 1, body: xml },
      },
      lead.cookie,
    );
    assert.equal(version.versionNo, 2);
    await Promise.all([
      ok(
        path + "/reorder",
        "POST",
        { pieceIds: [piece.id], expectedOrder: [piece.id] },
        lead.cookie,
      ),
      ok(
        path + "/reorder",
        "POST",
        { pieceIds: [piece.id], expectedOrder: [piece.id] },
        lead.cookie,
      ),
    ]);
    const socket = connect(base + "/rehearsal", {
      forceNew: true,
      extraHeaders: { origin: base, cookie: other.cookie },
      transports: ["websocket"],
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const join = (id: string) =>
      new Promise<any>((resolve) => socket.emit("ensemble:join", id, resolve));
    assert.deepEqual(await join(f.id), { code: "not_found" });
    assert.deepEqual(await join(e.id), { ok: true });
    const event = new Promise<any>((resolve) =>
      socket.once("library:changed", resolve),
    );
    await ok(p, "PATCH", { op: "swing", value: true }, lead.cookie);
    assert.equal((await event).ensembleId, e.id);
    const all = await ok(path + "/members", "GET", undefined, lead.cookie),
      lm = all.find((x: any) => x.userId === lead.id);
    assert.equal(
      (
        await request(
          "account",
          "DELETE",
          { deleteEnsembleIds: [] },
          lead.cookie,
        )
      ).status,
      409,
    );
    await ok(path + "/members/" + m.id, "PATCH", { isLead: true }, lead.cookie);
    const demotions = await Promise.all([
      request(
        path + "/members/" + lm.id,
        "PATCH",
        { isLead: false },
        lead.cookie,
      ),
      request(
        path + "/members/" + m.id,
        "PATCH",
        { isLead: false },
        other.cookie,
      ),
    ]);
    assert.deepEqual(demotions.map((r) => r.status).sort(), [200, 409]);
    const left = (
      await pool.query(
        "select * from memberships where ensemble_id=$1 and is_lead",
        [e.id],
      )
    ).rows[0];
    assert.ok(left);
    // Make the original account lead again, then remove the socket user.
    if (left.user_id !== lead.id)
      await ok(
        path + "/members/" + lm.id,
        "PATCH",
        { isLead: true },
        other.cookie,
      );
    await ok(path + "/members/" + m.id, "DELETE", undefined, lead.cookie);
    let received = false;
    socket.on("library:changed", () => (received = true));
    await ok(p, "PATCH", { op: "swing", value: false }, lead.cookie);
    await delay(100);
    assert.equal(received, false);
    assert.deepEqual(await join(e.id), { code: "not_found" });
    socket.close();
    await ok(p, "DELETE", undefined, lead.cookie);
    assert.equal((await request(p, "GET", undefined, lead.cookie)).status, 404);
    // New-user journey retains the invitation path through Better Auth verification.
    const email = `new-${crypto.randomUUID()}@example.test`;
    await ok(
      path + "/invitations",
      "POST",
      { email, language: "de", idempotencyKey: "new" },
      lead.cookie,
    );
    const token = captureMail.messages
      .at(-1)!
      .text.match(/\/invite\/(\S+)/)![1];
    const preview = await ok("invitations/" + token);
    const newUser = await register(email, preview.callbackURL);
    assert.deepEqual(newUser.response, { status: true });
    const duplicate = await ok("auth/sign-up/email", "POST", {
      name: "Same",
      email,
      password: newUser.password,
    });
    assert.deepEqual(duplicate, newUser.response);
    const verify = await fetch(newUser.link, { redirect: "manual" });
    assert.equal(verify.headers.get("location"), preview.callbackURL);
    const signed = await signin(newUser);
    await ok("invitations/" + token + "/accept", "POST", {}, signed.cookie);
    assert.ok(
      (
        await pool.query(
          "select action from audit_events where ensemble_id=$1",
          [e.id],
        )
      ).rowCount! > 10,
    );
  },
);
test(
  "invitation rotation, bounds, expiry and revocation under DST clock",
  { timeout: 30000 },
  async () => {
    const lead = await account(),
      e = await ok("ensembles", "POST", { name: "Invitations" }, lead.cookie),
      path = `ensembles/${e.id}`;
    const actual = clock.now;
    let now = Date.parse("2026-11-01T01:59:30-04:00");
    clock.now = () => new Date(now);
    try {
      const email = `invite-${crypto.randomUUID()}@example.test`,
        recipient = await account();
      let inv = await ok(
        path + "/invitations",
        "POST",
        { email: recipient.email, idempotencyKey: "one" },
        lead.cookie,
      );
      let token = captureMail.messages
        .at(-1)!
        .text.match(/\/invite\/(\S+)/)![1];
      const initial = token;
      assert.equal(
        (
          await request(
            path + "/invitations/" + inv.id + "/resend",
            "POST",
            { idempotencyKey: "two" },
            lead.cookie,
          )
        ).status,
        429,
      );
      for (let n = 2; n <= 5; n++) {
        now += 60000;
        inv = await ok(
          path + "/invitations/" + inv.id + "/resend",
          "POST",
          { idempotencyKey: String(n) },
          lead.cookie,
        );
        const count = captureMail.messages.length;
        assert.deepEqual(
          await ok(
            path + "/invitations/" + inv.id + "/resend",
            "POST",
            { idempotencyKey: String(n) },
            lead.cookie,
          ),
          inv,
        );
        assert.equal(captureMail.messages.length, count);
      }
      assert.equal((await request("invitations/" + initial)).status, 409);
      now += 60000;
      assert.equal(
        (
          await request(
            path + "/invitations/" + inv.id + "/resend",
            "POST",
            { idempotencyKey: "six" },
            lead.cookie,
          )
        ).status,
        429,
      );
      token = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
      now += 14 * 86400000;
      assert.equal((await ok("invitations/" + token)).state, "expired");
      const expired = await request(
        "invitations/" + token + "/accept",
        "POST",
        {},
        recipient.cookie,
      );
      assert.equal((await expired.json()).code, "expired");
      inv = await ok(
        path + "/invitations",
        "POST",
        { email, idempotencyKey: "revoke" },
        lead.cookie,
      );
      token = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
      await ok(
        path + "/invitations/" + inv.id,
        "DELETE",
        undefined,
        lead.cookie,
      );
      assert.equal((await ok("invitations/" + token)).state, "revoked");
    } finally {
      clock.now = actual;
    }
  },
);

test(
  "delivery failure persists, reinvite refreshes, transfer is atomic and sysadmin does not escalate",
  { timeout: 30000 },
  async () => {
    const lead = await account(),
      member = await account(),
      e = await ok("ensembles", "POST", { name: "Transfer" }, lead.cookie),
      path = `ensembles/${e.id}`;
    const { mailer } = await import("../server/mail.server");
    const original = mailer.send;
    const realClock = clock.now;
    let now = Date.parse("2026-03-08T23:59:30-04:00");
    clock.now = () => new Date(now);
    try {
      mailer.send = async () => {
        throw Error("fixture provider failure");
      };
      const inv = await ok(
        path + "/invitations",
        "POST",
        { email: member.email, idempotencyKey: "failed" },
        lead.cookie,
      );
      assert.equal(inv.deliveryState, "not_sent");
      assert.equal(
        (await ok(path + "/invitations", "GET", undefined, lead.cookie))[0]
          .deliveryState,
        "not_sent",
      );
      mailer.send = original;
      now += 60000;
      const refreshed = await ok(
        path + "/invitations",
        "POST",
        {
          email: member.email,
          idempotencyKey: "retry",
          capabilities: { transcribe: true },
        },
        lead.cookie,
      );
      assert.equal(refreshed.id, inv.id);
      assert.equal(refreshed.deliveryState, "sent");
      const token = captureMail.messages
        .at(-1)!
        .text.match(/\/invite\/(\S+)/)![1];
      const m = await ok(
        "invitations/" + token + "/accept",
        "POST",
        {},
        member.cookie,
      );
      assert.deepEqual(m.capabilities, {
        manageMembers: false,
        editPieces: false,
        transcribe: true,
      });
      await pool.query("insert into platform_roles(user_id) values($1)", [
        member.id,
      ]);
      assert.equal(
        (await request(path + "/members", "GET", undefined, member.cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await request(
            path + "/invitations",
            "POST",
            {
              email: "sysadmin@example.test",
              idempotencyKey: "bad",
              sysadmin: true,
            },
            lead.cookie,
          )
        ).status,
        400,
      );
      await ok(
        path + "/members/" + m.id,
        "PATCH",
        { isLead: true, stepDown: true },
        lead.cookie,
      );
      assert.equal(
        (await request(path, "PATCH", { name: "Cannot rename" }, lead.cookie))
          .status,
        403,
      );
      await ok(path, "PATCH", { name: "New lead" }, member.cookie);
      await ok("account", "DELETE", { deleteEnsembleIds: [] }, lead.cookie);
      assert.equal(
        (await request("me", "GET", undefined, lead.cookie)).status,
        401,
      );
      assert.equal(
        (
          await request(
            "account",
            "DELETE",
            { deleteEnsembleIds: [] },
            member.cookie,
          )
        ).status,
        409,
      );
    } finally {
      mailer.send = original;
      clock.now = realClock;
    }
  },
);

test(
  "native score response hashes exact bytes and older invitation retries do not send again",
  { timeout: 30000 },
  async () => {
    const lead = await account(),
      e = await ok("ensembles", "POST", { name: "Native" }, lead.cookie),
      path = `ensembles/${e.id}`;
    const score = {
      title: "MIDI",
      parts: [{ id: "P1", name: "Voice" }],
      notes: [
        {
          partId: "P1",
          midi: 60,
          startBeat: 0,
          durationBeats: 1,
          measureNumber: 1,
        },
      ],
      measures: [{ number: 1, startBeat: 0, beats: 4, beatType: 4, fifths: 0 }],
      slurs: [],
      totalBeats: 4,
      rehearsalMarks: [],
    };
    const piece = await ok(
      path + "/pieces",
      "POST",
      {
        title: "MIDI",
        content: { format: "score", schemaVersion: 1, body: score },
      },
      lead.cookie,
    );
    const { metadataSchema } = await import("../src/api/domain");
    metadataSchema.parse(piece);
    const response = await request(
        path + "/pieces/" + piece.id + "/versions/1",
        "GET",
        undefined,
        lead.cookie,
      ),
      body = await response.text();
    const { createHash } = await import("node:crypto");
    assert.equal(
      createHash("sha256").update(body).digest("hex"),
      piece.contentHash,
    );
    assert.deepEqual(JSON.parse(body), score);
    const second = await ok(
      path + "/pieces",
      "POST",
      {
        title: "Second",
        content: { format: "score", schemaVersion: 1, body: score },
      },
      lead.cookie,
    );
    await Promise.all([
      ok(
        path + "/reorder",
        "POST",
        {
          pieceIds: [piece.id, second.id],
          expectedOrder: [piece.id, second.id],
        },
        lead.cookie,
      ),
      ok(
        path + "/reorder",
        "POST",
        {
          pieceIds: [second.id, piece.id],
          expectedOrder: [piece.id, second.id],
        },
        lead.cookie,
      ),
    ]);
    const reordered = await ok(path + "/pieces", "GET", undefined, lead.cookie);
    assert.equal(new Set(reordered.map((x: any) => x.sortKey)).size, 2);
    assert.deepEqual(
      new Set(reordered.map((x: any) => x.id)),
      new Set([piece.id, second.id]),
    );
    assert.equal((await request(path + "/pieces", "GET")).status, 401);
    const actual = clock.now;
    let now = Date.parse("2026-03-08T23:59:30-04:00");
    clock.now = () => new Date(now);
    try {
      const inv = await ok(
        path + "/invitations",
        "POST",
        { email: "keys@example.test", idempotencyKey: "first" },
        lead.cookie,
      );
      now += 60000;
      await ok(
        path + "/invitations/" + inv.id + "/resend",
        "POST",
        { idempotencyKey: "second" },
        lead.cookie,
      );
      now += 60000;
      const count = captureMail.messages.length;
      await ok(
        path + "/invitations",
        "POST",
        { email: "keys@example.test", idempotencyKey: "first" },
        lead.cookie,
      );
      assert.equal(captureMail.messages.length, count);
    } finally {
      clock.now = actual;
    }
  },
);

test(
  "review: cross-state send windows, schema contracts, payload replays and negative settings",
  { timeout: 60000 },
  async () => {
    const { ensembleSchema, memberSchema, invitationSchema, metadataSchema } =
      await import("../src/api/domain");
    const lead = await account(),
      manager = await account(),
      victim = await account();
    const e = ensembleSchema.parse(
        await ok("ensembles", "POST", { name: "Review" }, lead.cookie),
      ),
      path = `ensembles/${e.id}`;
    ensembleSchema.parse(
      await ok(path, "PATCH", { name: "Review renamed" }, lead.cookie),
    );
    (await ok("ensembles", "GET", undefined, lead.cookie)).forEach(
      (x: unknown) => ensembleSchema.parse(x),
    );
    const actual = clock.now;
    let now = Date.now();
    clock.now = () => new Date(now);
    try {
      const email = `loop-${crypto.randomUUID()}@example.test`;
      for (let i = 0; i < 5; i++) {
        const inv = invitationSchema.parse(
          await ok(
            path + "/invitations",
            "POST",
            { email, idempotencyKey: "loop-" + i },
            lead.cookie,
          ),
        );
        await ok(
          path + "/invitations/" + inv.id,
          "DELETE",
          undefined,
          lead.cookie,
        );
        const blocked = await request(
          path + "/invitations",
          "POST",
          { email, idempotencyKey: "blocked-" + i },
          lead.cookie,
        );
        assert.equal(blocked.status, 429);
        assert.equal((await blocked.json()).code, "send_cooldown");
        now += 60000;
      }
      assert.equal(
        (
          await request(
            path + "/invitations",
            "POST",
            { email, idempotencyKey: "six" },
            lead.cookie,
          )
        ).status,
        429,
      );
      now += 86400000;
      const renewed = await ok(
        path + "/invitations",
        "POST",
        { email, idempotencyKey: "after-window" },
        lead.cookie,
      );
      invitationSchema.parse(renewed);
      const input = {
        title: "Score",
        content: { format: "musicxml", schemaVersion: 1, body: xml },
        idempotencyKey: "payload",
      };
      const piece = metadataSchema.parse(
        await ok(path + "/pieces", "POST", input, lead.cookie),
      );
      assert.equal(
        (
          await request(
            path + "/pieces",
            "POST",
            { ...input, title: "Different" },
            lead.cookie,
          )
        ).status,
        422,
      );
      for (const [op, value, key] of [
        ["partName", "x".repeat(201), "P1"],
        ["clef", "alto", "P1"],
        ["removed", "yes", "P1"],
        ["split", { staff: 1 }, "P1"],
        ["saved", 999999, "bpm"],
        ["defaults", { bad: "value" }, "percussion"],
      ])
        assert.equal(
          (
            await request(
              path + "/pieces/" + piece.id,
              "PATCH",
              { op, value, key },
              lead.cookie,
            )
          ).status,
          400,
        );
      const changed = metadataSchema.parse(
        await ok(
          path + "/pieces/" + piece.id,
          "PATCH",
          { op: "split", key: "P1", value: true },
          lead.cookie,
        ),
      );
      const reordered = await ok(
        path + "/reorder",
        "POST",
        { pieceIds: [piece.id], expectedOrder: [piece.id] },
        lead.cookie,
      );
      assert.equal(reordered[0].revision, changed.revision);
      assert.equal(
        (
          await request(
            path + "/reorder",
            "POST",
            { pieceIds: [piece.id], expectedOrder: [] },
            lead.cookie,
          )
        ).status,
        409,
      );
      const body = await request(
        path + "/pieces/" + piece.id + "/versions/1",
        "GET",
        undefined,
        lead.cookie,
      );
      assert.equal(
        body.headers.get("content-type"),
        "application/octet-stream",
      );
      assert.match(body.headers.get("content-disposition")!, /attachment/);
      assert.equal(
        body.headers.get("content-security-policy"),
        "sandbox; default-src 'none'",
      );
      assert.equal(body.headers.get("x-content-type-options"), "nosniff");
      await ok(path + "/pieces/" + piece.id, "DELETE", undefined, lead.cookie);
      assert.equal(
        (await ok(path + "/pieces", "POST", input, lead.cookie)).id,
        piece.id,
      );
      assert.equal(
        (await ok(path + "/pieces", "GET", undefined, lead.cookie)).length,
        0,
      );
      // Large ordinary requests are rejected before JSON parsing, including malformed JSON.
      const tooLarge = await fetch(base + "/api/" + path, {
        method: "PATCH",
        headers: {
          origin: base,
          cookie: lead.cookie,
          "Content-Type": "application/json",
        },
        body: "{" + "x".repeat(17000),
      });
      assert.equal(tooLarge.status, 413);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(9000)));
          controller.enqueue(new TextEncoder().encode("x".repeat(9000)));
          controller.close();
        },
      });
      const chunked = await fetch(base + "/api/" + path, {
        method: "PATCH",
        headers: {
          origin: base,
          cookie: lead.cookie,
          "Content-Type": "application/json",
        },
        body: stream,
        duplex: "half",
      } as any);
      assert.equal(chunked.status, 413);
      const mi = await ok(
        path + "/invitations",
        "POST",
        { email: manager.email, idempotencyKey: "manager" },
        lead.cookie,
      );
      let token = captureMail.messages
        .at(-1)!
        .text.match(/\/invite\/(\S+)/)![1];
      const mm = memberSchema.parse(
        await ok(
          "invitations/" + token + "/accept",
          "POST",
          {},
          manager.cookie,
        ),
      );
      await ok(
        path + "/members/" + mm.id,
        "PATCH",
        { manageMembers: true },
        lead.cookie,
      );
      const vi = await ok(
        path + "/invitations",
        "POST",
        {
          email: victim.email,
          capabilities: { editPieces: true },
          idempotencyKey: "lead-grant",
        },
        lead.cookie,
      );
      now += 60000;
      const resent = await ok(
        path + "/invitations",
        "POST",
        { email: victim.email, idempotencyKey: "manager-resend" },
        manager.cookie,
      );
      assert.equal(resent.capabilities.editPieces, true);
      token = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
      await ok(
        path + "/members/" + mm.id,
        "PATCH",
        { manageMembers: false },
        lead.cookie,
      );
      const revoked = await request(
        "invitations/" + token + "/accept",
        "POST",
        {},
        victim.cookie,
      );
      assert.equal((await revoked.json()).code, "revoked");
      // Co-leads may demote equals; deferred database guard rejects removing the remaining lead.
      await ok(
        path + "/members/" + mm.id,
        "PATCH",
        { isLead: true },
        lead.cookie,
      );
      const lm = (
        await ok(path + "/members", "GET", undefined, lead.cookie)
      ).find((m: any) => m.userId === lead.id);
      await ok(
        path + "/members/" + lm.id,
        "PATCH",
        { isLead: false },
        manager.cookie,
      );
      assert.equal(
        (
          await request(
            path + "/members/" + mm.id,
            "PATCH",
            { isLead: false },
            manager.cookie,
          )
        ).status,
        409,
      );
      await assert.rejects(
        pool.query("update memberships set is_lead=false where id=$1", [mm.id]),
        /requires a lead/,
      );
    } finally {
      clock.now = actual;
    }
  },
);

test(
  "review: account closure confirmation, recent auth and pre-hijack recovery",
  { timeout: 60000 },
  async () => {
    const u = await account();
    const e = await ok("ensembles", "POST", { name: "Sole" }, u.cookie);
    let r = await request(
      "account",
      "DELETE",
      { deleteEnsembleIds: [] },
      u.cookie,
    );
    assert.equal(r.status, 409);
    assert.deepEqual((await r.json()).current, [e.id]);
    await pool.query(
      "update session set created_at=now()-interval '1 hour' where user_id=$1",
      [u.id],
    );
    r = await request(
      "account",
      "DELETE",
      { deleteEnsembleIds: [e.id] },
      u.cookie,
    );
    assert.equal(r.status, 401);
    await ok(
      "account",
      "DELETE",
      { deleteEnsembleIds: [e.id], password: "domain-fixture-password-42" },
      u.cookie,
    );
    assert.equal(
      (await pool.query("select 1 from ensembles where id=$1", [e.id]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select 1 from audit_events where action='account.delete' and target_id=$1",
          [u.id],
        )
      ).rowCount,
      1,
    );
    const pre = await register();
    await ok("auth/sign-up/email", "POST", {
      email: pre.email,
      password: "victim-new-password-43",
      name: "Victim",
    });
    for (
      let n = 0;
      n < 100 &&
      !captureMail.messages
        .filter((m) => m.to === pre.email)
        .at(-1)!
        .text.includes("/reset-password/");
      n++
    )
      await delay(10);
    const link = captureMail.messages
      .filter((m) => m.to === pre.email)
      .at(-1)!
      .text.match(/https?:\/\/\S+/)![0];
    assert.match(link, /reset-password/);
    const token = new URL(link).pathname.split("/").at(-1);
    await ok("auth/reset-password", "POST", {
      token,
      newPassword: "victim-new-password-43",
    });
    assert.equal(
      (
        await request("auth/sign-in/email", "POST", {
          email: pre.email,
          password: pre.password,
        })
      ).status,
      401,
    );
    const recovered = await signin({
      email: pre.email,
      password: "victim-new-password-43",
    });
    assert.ok(recovered.cookie);
    const passwordResponse = await request(
      "auth/change-password",
      "POST",
      {
        currentPassword: "victim-new-password-43",
        newPassword: "replacement-password-44",
        revokeOtherSessions: true,
      },
      recovered.cookie,
    );
    assert.equal(passwordResponse.status, 200);
    assert.equal(Object.hasOwn(await passwordResponse.json(), "token"), false);
  },
);

test(
  "review: socket capability updates preserve other subscribers; background failures preserve commit and rooms",
  { timeout: 20000 },
  async () => {
    const { onLibraryChange, libraryChanged } = await import(
      "../server/domain.server"
    );
    const lead = await account(),
      other = await account();
    const e = await ok("ensembles", "POST", { name: "Sockets" }, lead.cookie),
      path = `ensembles/${e.id}`;
    await ok(
      path + "/invitations",
      "POST",
      { email: other.email, idempotencyKey: "sockets" },
      lead.cookie,
    );
    const token = captureMail.messages
      .at(-1)!
      .text.match(/\/invite\/(\S+)/)![1];
    const m = await ok(
      "invitations/" + token + "/accept",
      "POST",
      {},
      other.cookie,
    );
    const sockets = [lead, other].map((u) =>
      connect(base, {
        extraHeaders: { cookie: u.cookie, origin: base },
        transports: ["websocket"],
        reconnection: false,
      }),
    );
    try {
      for (const s of sockets) {
        if (!s.connected)
          await new Promise<void>((resolve, reject) => {
            s.once("connect", resolve);
            s.once("connect_error", reject);
          });
        await new Promise((resolve) => s.emit("ensemble:join", e.id, resolve));
      }
      const event = new Promise((resolve) =>
        sockets[1].once("membership:changed", resolve),
      );
      await ok(
        path + "/members/" + m.id,
        "PATCH",
        { editPieces: true },
        lead.cookie,
      );
      await event;
      const room = "ensemble:" + e.id;
      for (const s of sockets)
        assert.ok(io.sockets.sockets.get(s.id!)!.rooms.has(room));
      const unsubscribe = onLibraryChange(async () => {
        throw Error("emitter failure");
      });
      const piece = await ok(
        path + "/pieces",
        "POST",
        {
          title: "Committed",
          content: { format: "musicxml", schemaVersion: 1, body: xml },
        },
        lead.cookie,
      );
      unsubscribe();
      assert.equal(
        (await ok(path + "/pieces/" + piece.id, "GET", undefined, lead.cookie))
          .title,
        "Committed",
      );
      const original = pool.query.bind(pool);
      let checks = 0;
      (pool as any).query = (...args: any[]) => {
        if (
          typeof args[0] === "string" &&
          args[0].startsWith("select m.user_id,s.token")
        ) {
          checks++;
          return Promise.reject(Error("transient membership read"));
        }
        return (original as any)(...args);
      };
      try {
        await libraryChanged(e.id, []);
        await delay(50);
        assert.equal(checks, 1);
        for (const s of sockets)
          assert.ok(io.sockets.sockets.get(s.id!)!.rooms.has(room));
      } finally {
        pool.query = original as typeof pool.query;
      }
    } finally {
      sockets.forEach((s) => s.close());
    }
  },
);

test(
  "review: daily budgets, user mutation throttle, depth bound and expired pending renewal",
  { timeout: 30000 },
  async () => {
    const { env } = await import("../server/env.server");
    const u = await account(),
      e = await ok("ensembles", "POST", { name: "Budgets" }, u.cookie),
      path = `ensembles/${e.id}`;
    const now = new Date();
    await pool.query(
      "insert into invitation_sends(ensemble_id,email,inviter_id,created_at) select $1,'used@example.test',$2,$3 from generate_series(1,$4::int)",
      [e.id, u.id, now, env.INVITE_ENSEMBLE_DAILY_MAX],
    );
    assert.equal(
      (
        await request(
          path + "/invitations",
          "POST",
          { email: "new@example.test", idempotencyKey: "daily" },
          u.cookie,
        )
      ).status,
      429,
    );
    await pool.query("delete from invitation_sends where ensemble_id=$1", [
      e.id,
    ]);
    await pool.query(
      "insert into invitation_sends(ensemble_id,email,inviter_id,created_at) select 'other-ensemble','used@example.test',$1,$2 from generate_series(1,$3::int)",
      [u.id, now, env.INVITE_USER_DAILY_MAX],
    );
    assert.equal(
      (
        await request(
          path + "/invitations",
          "POST",
          { email: "new@example.test", idempotencyKey: "daily-user" },
          u.cookie,
        )
      ).status,
      429,
    );
    await pool.query("delete from invitation_sends where inviter_id=$1", [
      u.id,
    ]);
    await pool.query(
      "insert into rate_limit(key,count,last_request) values($1,$2,$3) on conflict(key) do update set count=excluded.count,last_request=excluded.last_request",
      ["domain:" + u.id, env.DOMAIN_USER_MINUTE_MAX, now.getTime()],
    );
    assert.equal(
      (await request(path, "PATCH", { name: "Throttled" }, u.cookie)).status,
      429,
    );
    await pool.query("delete from rate_limit where key=$1", ["domain:" + u.id]);
    await pool.query(
      "update rate_limit set count=$2,last_request=$3 where key=$1",
      ["ensemble-create:" + u.id, env.ENSEMBLE_USER_DAILY_MAX, now.getTime()],
    );
    assert.equal(
      (await request("ensembles", "POST", { name: "Too many" }, u.cookie))
        .status,
      429,
    );
    let nested: any = true;
    for (let n = 0; n < 70; n++) nested = { child: nested };
    assert.equal(
      (await request(path, "PATCH", { name: nested }, u.cookie)).status,
      422,
    );
    const original = clock.now;
    let time = now.getTime();
    clock.now = () => new Date(time);
    try {
      const input = {
        email: "expired-window@example.test",
        idempotencyKey: "start",
      };
      const inv = await ok(path + "/invitations", "POST", input, u.cookie);
      for (let i = 1; i < 5; i++) {
        time += 60000;
        await ok(
          path + "/invitations/" + inv.id + "/resend",
          "POST",
          { idempotencyKey: "retry-" + i },
          u.cookie,
        );
      }
      time += 15 * 86400000;
      assert.equal(
        (
          await ok(
            path + "/invitations",
            "POST",
            { ...input, idempotencyKey: "renew" },
            u.cookie,
          )
        ).state,
        "pending",
      );
    } finally {
      clock.now = original;
    }
  },
);

test("review: rollback failure preserves original error and discards the connection", async () => {
  const { transaction } = await import("../server/domain.server");
  const connect = pool.connect;
  const original = Error("original failure");
  let discarded = false;
  const statements: string[] = [];
  (pool as any).connect = async () => ({
    query: async (sql: string) => {
      statements.push(sql);
      if (sql === "rollback") throw Error("rollback failure");
    },
    release: (broken: boolean) => {
      discarded = broken;
    },
  });
  try {
    await assert.rejects(
      transaction(async () => {
        throw original;
      }),
      (error) => error === original,
    );
    assert.equal(discarded, true);
    assert.ok(statements.some((s) => s.includes("lock_timeout")));
    assert.ok(statements.some((s) => s.includes("statement_timeout")));
  } finally {
    pool.connect = connect;
  }
});

test(
  "review: current issuer capabilities clamp acceptance and departure revokes issued invitations",
  { timeout: 30000 },
  async () => {
    const lead = await account(),
      manager = await account(),
      recipient = await account();
    const e = await ok("ensembles", "POST", { name: "Issuer" }, lead.cookie),
      path = `ensembles/${e.id}`;
    await ok(
      path + "/invitations",
      "POST",
      { email: manager.email, idempotencyKey: "join-manager" },
      lead.cookie,
    );
    let token = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
    const m = await ok(
      "invitations/" + token + "/accept",
      "POST",
      {},
      manager.cookie,
    );
    await ok(
      path + "/members/" + m.id,
      "PATCH",
      { manageMembers: true },
      lead.cookie,
    );
    const i = await ok(
      path + "/invitations",
      "POST",
      { email: recipient.email, idempotencyKey: "clamp" },
      manager.cookie,
    );
    token = captureMail.messages.at(-1)!.text.match(/\/invite\/(\S+)/)![1];
    // Legacy grants must be clamped at the acceptance boundary even if no route changed them.
    await pool.query(
      "update invitations set edit_music_pieces=true where id=$1",
      [i.id],
    );
    const accepted = await ok(
      "invitations/" + token + "/accept",
      "POST",
      {},
      recipient.cookie,
    );
    assert.equal(accepted.capabilities.editPieces, false);
    const pending = await ok(
      path + "/invitations",
      "POST",
      { email: "departed@example.test", idempotencyKey: "departed" },
      manager.cookie,
    );
    await ok(path + "/members/" + m.id, "DELETE", undefined, manager.cookie);
    assert.equal(
      (
        await pool.query("select state from invitations where id=$1", [
          pending.id,
        ])
      ).rows[0].state,
      "revoked",
    );
    const deny = await request(
      path,
      "PATCH",
      { name: "Denied" },
      recipient.cookie,
    );
    assert.equal(deny.status, 403);
    assert.ok(
      (
        await pool.query(
          "select 1 from audit_events where actor_id=$1 and outcome='denied'",
          [recipient.id],
        )
      ).rowCount,
    );
    const { rateLimitAddress } = await import("../server/client-ip.server");
    assert.equal(
      rateLimitAddress("2001:db8:1:2::1"),
      rateLimitAddress("2001:db8:1:2:ffff::1"),
    );
    assert.notEqual(
      rateLimitAddress("2001:db8:1:2::1"),
      rateLimitAddress("2001:db8:1:3::1"),
    );
  },
);
