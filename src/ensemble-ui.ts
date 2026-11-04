import { randomId } from './uuid';
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
const capabilities = ['manageMembers', 'editPieces', 'transcribe'] as const;
function capabilitySwitch(body: HTMLElement, text: string, checked = false) {
  const label = element('label'); label.className = 'capability-switch';
  const input = element('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = checked;
  input.setAttribute('aria-checked', String(checked));
  input.addEventListener('change', () => input.setAttribute('aria-checked', String(input.checked)));
  const track = element('span'); track.className = 'switch-track'; track.setAttribute('aria-hidden', 'true');
  label.append(input, track, document.createTextNode(text)); body.append(label); return input;
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
  const base = `/ensembles/${id}`;
  let isLead = leads(id);
  async function render() {
    await refreshEnsembleNames();
    isLead = leads(id);
    const [members, invitations] = await Promise.all([
      api(`${base}/members`),
      api(`${base}/invitations`),
    ]);
    body.replaceChildren();
    const heading = (key: 'membersHeading' | 'invitationsHeading' | 'inviteHeading') => {
      const h = element('h3', pt(key)); h.className = 'domain-heading'; body.append(h);
    };
    const menu = (row: HTMLElement, actions: { label: string; run: () => Promise<void> }[]) => {
      if (!actions.length) return;
      const details = element('details'); details.className = 'row-menu';
      const summary = element('summary', '⋯'); summary.setAttribute('aria-label', pt('membersInvitations')); details.append(summary);
      const list = element('div'); list.className = 'menu-list';
      for (const item of actions) {
        const b = button(item.label, () => { details.open = false; void action(async () => { await item.run(); await render(); }); });
        b.className = 'menu-item'; list.append(b);
      }
      details.append(list); row.append(details);
      details.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); details.open = false; summary.focus(); } };
    };
    heading('membersHeading');
    for (const m of members) {
      const row = element('section'); row.className = 'member-row';
      const head = element('div'); head.className = 'member-head';
      const identity = element('div'); identity.className = 'member-identity';
      identity.append(element('b', m.name || m.email));
      const email = element('p', m.email); email.className = 'member-email'; identity.append(email); head.append(identity);
      if (m.isLead) { const mark = element('span', pt('lead')); mark.className = 'domain-gold'; head.append(mark); }
      row.append(head);
      const self = m.userId === account?.id;
      const last = m.isLead && members.filter((v: any) => v.isLead).length === 1;
      const actions: { label: string; run: () => Promise<void> }[] = [];
      if (isLead && !m.isLead) actions.push({ label: pt('makeLead'), run: async () => { await api(`${base}/members/${m.id}`, 'PATCH', { isLead: true }); } });
      if (self && m.isLead && !last) actions.push({ label: pt('stepDown'), run: async () => { await api(`${base}/members/${m.id}`, 'PATCH', { isLead: false }); } });
      if (!last && (!m.isLead || isLead)) actions.push({ label: pt(self ? 'leaveEnsemble' : 'removeMember'), run: async () => {
        if (await confirmDialog({ title: pt(self ? 'leaveEnsemble' : 'removeMember'), body: pt('confirmRemove'), confirmLabel: pt('remove'), danger: true })) {
          await api(`${base}/members/${m.id}`, 'DELETE');
          if (self) { location.reload(); return; }
          await membersSheet(id, anchor);
        } else await membersSheet(id, anchor);
      } });
      menu(head, actions);
      if (self && last) { const note = element('p', pt('onlyLead')); note.className = 'ctl-note'; row.append(note); }
      if (!m.isLead) {
        const caps = element('div'); caps.className = 'capability-row';
        for (const cap of capabilities) {
          if (isLead) {
            const input = capabilitySwitch(caps, pt(cap), m.capabilities[cap]);
            input.onchange = () => void action(async () => { try { await api(`${base}/members/${m.id}`, 'PATCH', { [cap]: input.checked }); } finally { await render(); } });
          } else { const state = element('span', `${m.capabilities[cap] ? '✓' : '–'} ${pt(cap)}`); state.className = 'ctl-note'; caps.append(state); }
        }
        row.append(caps);
      }
      body.append(row);
    }
    heading('invitationsHeading');
    for (const i of invitations) {
      const row = element('section'); row.className = 'member-row invitation-row';
      const head = element('div'); head.className = 'member-head';
      const email = element('span', i.email); email.className = 'member-email member-identity'; head.append(email);
      const state = element('span', pt(i.deliveryState === 'not_sent' && i.state === 'pending' ? 'notSent' : i.state as 'pending')); state.className = 'invitation-state'; head.append(state); row.append(head);
      if (i.state === 'pending') menu(head, [
        { label: pt('resend'), run: async () => { try { await api(`${base}/invitations/${i.id}/resend`, 'POST', { idempotencyKey: randomId() }); } catch (e) { const note = element('p', domainError((e as Error).message)); note.className = 'ctl-note'; row.append(note); throw e; } } },
        { label: pt('revoke'), run: async () => { await api(`${base}/invitations/${i.id}`, 'DELETE'); } },
      ]);
      body.append(row);
    }
    heading('inviteHeading');
    const form = element("form");
    const email = field(form, pt("email"), "email");
    email.required = true;
    const label = element('div'); label.className = 'language-toggle'; label.setAttribute('aria-label', pt('emailLanguage'));
    let language = lang;
    const languages = ['de', 'en'] as const;
    for (const l of languages) {
      if (label.childNodes.length) label.append(document.createTextNode(' · '));
      const b = button(l.toUpperCase(), () => { language = l; label.querySelectorAll('button').forEach(v => v.setAttribute('aria-pressed', String(v.textContent === l.toUpperCase()))); });
      b.setAttribute('aria-pressed', String(l === language)); label.append(b);
    }
    form.append(label);
    const grants: Record<string, HTMLInputElement> = {};
    const caps = element('div'); caps.className = 'capability-row';
    if (isLead) for (const cap of capabilities) grants[cap] = capabilitySwitch(caps, pt(cap));
    form.append(caps);
    const send = element("button", pt("invite"));
    send.className = "btn primary";
    form.append(send);
    let key = randomId();
    form.onsubmit = (e) => {
      e.preventDefault();
      send.disabled = true;
      void action(async () => {
        try {
          await api(`${base}/invitations`, "POST", {
            email: email.value,
            language,
            ...(isLead
              ? {
                  capabilities: Object.fromEntries(
                    Object.entries(grants).map(([k, v]) => [k, v.checked]),
                  ),
                }
              : {}),
            idempotencyKey: key,
          });
          key = randomId();
          await render();
        } finally {
          send.disabled = false;
        }
      });
    };
    body.append(form);

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
