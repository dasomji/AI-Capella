import { api } from "./domain-client";
import {
  account,
  leads,
  ensembleById,
  refreshEnsembleNames,
} from "./ensembles";
import { pt, lang, domainError } from "./i18n";
import { openSheet, closeOverlay, confirmDialog, toast } from "./ui";
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
};
function button(text: string, fn: () => void) {
  const b = element("button", text);
  b.type = "button";
  b.className = "btn";
  b.onclick = fn;
  return b;
}
function field(body: HTMLElement, label: string, type = "text") {
  const l = element("label", label),
    i = element("input");
  i.type = type;
  l.append(i);
  body.append(l);
  return i;
}
async function action(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    toast(domainError((e as Error).message), "error");
  }
}
export function createEnsembleSheet(done: (id: string) => void) {
  const body = element("form");
  body.className = "sheet-body domain-sheet";
  const name = field(body, pt("ensembleName"));
  name.required = true;
  name.maxLength = 200;
  const kind = element("select");
  for (const k of ["choir", "band", "other"] as const) {
    const o = element("option", pt(k));
    o.value = k;
    kind.append(o);
  }
  body.append(kind);
  const save = element("button", pt("createEnsemble"));
  save.className = "btn primary";
  body.append(save);
  body.onsubmit = (e) => {
    e.preventDefault();
    save.disabled = true;
    void action(async () => {
      try {
        const result = await api("/ensembles", "POST", {
          name: name.value,
          kind: kind.value,
        });
        await refreshEnsembleNames();
        closeOverlay();
        done(result.id);
      } finally {
        save.disabled = false;
      }
    });
  };
  openSheet(pt("createEnsemble"), body);
}
export async function membersSheet(id: string, anchor?: HTMLElement) {
  const body = element("div");
  body.className = "sheet-body domain-sheet";
  openSheet(pt("membersInvitations"), body, anchor);
  const base = `/ensembles/${id}`,
    isLead = leads(id);
  async function render() {
    const [members, invitations] = await Promise.all([
      api(`${base}/members`),
      api(`${base}/invitations`),
    ]);
    body.replaceChildren();
    for (const m of members) {
      const row = element("section");
      row.className = "member-row";
      row.append(element("b", m.name || m.email));
      const email = element("p", m.email);
      email.className = "ctl-note";
      row.append(email);
      if (m.isLead) {
        const mark = element("span", pt("lead"));
        mark.className = "domain-gold";
        row.append(mark);
      } else
        for (const cap of [
          "manageMembers",
          "editPieces",
          "transcribe",
        ] as const) {
          const input = field(row, pt(cap), "checkbox");
          input.checked = m.capabilities[cap];
          input.disabled = !isLead;
          input.onchange = () =>
            void action(async () => {
              await api(`${base}/members/${m.id}`, "PATCH", {
                [cap]: input.checked,
              });
              await render();
            });
        }
      if (isLead && !m.isLead)
        row.append(
          button(
            pt("makeLead"),
            () =>
              void action(async () => {
                await api(`${base}/members/${m.id}`, "PATCH", { isLead: true });
                await render();
              }),
          ),
        );
      const last =
        m.isLead && members.filter((v: any) => v.isLead).length === 1;
      if (m.userId === account?.id && m.isLead) {
        const b = button(
          pt("stepDown"),
          () =>
            void action(async () => {
              await api(`${base}/members/${m.id}`, "PATCH", { isLead: false });
              await refreshEnsembleNames();
              await render();
            }),
        );
        b.disabled = last;
        row.append(b);
        if (last) row.append(element("p", pt("lastLead")));
      }
      if (!m.isLead || isLead) {
        const b = button(
          pt("removeMember"),
          () =>
            void action(async () => {
              if (
                await confirmDialog({
                  title: pt("removeMember"),
                  body: pt("confirmRemove"),
                  confirmLabel: pt("remove"),
                  danger: true,
                })
              ) {
                await api(`${base}/members/${m.id}`, "DELETE");
                await membersSheet(id, anchor);
              }
            }),
        );
        b.disabled = last;
        row.append(b);
      }
      body.append(row);
    }
    const form = element("form");
    const email = field(form, pt("email"), "email");
    email.required = true;
    const label = element("label", pt("emailLanguage")),
      language = element("select");
    for (const l of ["de", "en"]) {
      const o = element("option", l.toUpperCase());
      o.value = l;
      language.append(o);
    }
    language.value = lang;
    label.append(language);
    form.append(label);
    const grants: Record<string, HTMLInputElement> = {};
    if (isLead)
      for (const cap of ["manageMembers", "editPieces", "transcribe"] as const)
        grants[cap] = field(form, pt(cap), "checkbox");
    const send = element("button", pt("invite"));
    send.className = "btn primary";
    form.append(send);
    let key = crypto.randomUUID();
    form.onsubmit = (e) => {
      e.preventDefault();
      send.disabled = true;
      void action(async () => {
        try {
          await api(`${base}/invitations`, "POST", {
            email: email.value,
            language: language.value,
            ...(isLead
              ? {
                  capabilities: Object.fromEntries(
                    Object.entries(grants).map(([k, v]) => [k, v.checked]),
                  ),
                }
              : {}),
            idempotencyKey: key,
          });
          key = crypto.randomUUID();
          await render();
        } finally {
          send.disabled = false;
        }
      });
    };
    body.append(form);
    for (const i of invitations) {
      const row = element("section");
      row.className = "member-row";
      row.append(
        element("b", i.email),
        element("span", pt(i.state as "pending")),
      );
      if (i.deliveryState === "not_sent")
        row.append(element("p", pt("notSent")));
      if (i.state === "pending") {
        row.append(
          button(
            pt("resend"),
            () =>
              void action(async () => {
                await api(`${base}/invitations/${i.id}/resend`, "POST", {
                  idempotencyKey: crypto.randomUUID(),
                });
                await render();
              }),
          ),
          button(
            pt("revoke"),
            () =>
              void action(async () => {
                await api(`${base}/invitations/${i.id}`, "DELETE");
                await render();
              }),
          ),
        );
      }
      body.append(row);
    }
  }
  try {
    await render();
  } catch (e) {
    body.textContent = domainError((e as Error).message);
  }
}
export async function leaveEnsemble(id: string, done: () => void) {
  try {
    await api(
      `/ensembles/${id}/members/${ensembleById(id)?.membershipId}`,
      "DELETE",
    );
    await refreshEnsembleNames();
    done();
  } catch (e) {
    toast(domainError((e as Error).message), "error");
  }
}
