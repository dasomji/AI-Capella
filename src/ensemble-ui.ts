import { randomId } from "./uuid";
import { api } from "./domain-client";
import {
  account,
  leads,
  ensembleById,
  refreshEnsembleNames,
} from "./ensembles";
import { pt, lang, domainError } from "./i18n";
import {
  createButton,
  updateButton,
  createInput,
  createSelect,
  createField,
  createSwitch,
  updateSwitch,
  createSheet,
  createIconButton,
  createMenu,
  createConfirmDialog,
  closeOverlay,
  toast,
} from "./design-system/dom";
import { icon } from "./icons";
import { t } from "./i18n";
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
};
function button(text: string, fn: () => void) {
  return createButton({ text, onClick: fn });
}
function field(
  body: HTMLElement,
  label: string,
  type = "text",
  variant: "domain" | "domain-create" = "domain",
) {
  const input = createInput({ type });
  body.append(createField({ label, control: input, variant }));
  return input;
}
const capabilities = ["manageMembers", "editPieces", "transcribe"] as const;
function capabilitySwitch(body: HTMLElement, text: string, checked = false) {
  const label = createSwitch({
    variant: "capability",
    mode: "checkbox",
    label: text,
    checked,
    onChange: (value) =>
      updateSwitch(label, {
        variant: "capability",
        label: text,
        checked: value,
      }),
  });
  body.append(label);
  return label.querySelector<HTMLInputElement>("input")!;
}
function openSheet(
  title: string,
  content: HTMLElement,
  opener?: HTMLElement,
  onClose?: () => void,
) {
  const sheet = createSheet({
    variant: "domain-sheet",
    title,
    content,
    attrs: { tabindex: -1 },
    behavior: {
      opener: opener ?? document.activeElement,
      initialFocus: () => sheet.element,
      outside: "close",
      onClose,
    },
  });
  const head = sheet.element.querySelector("header")!;
  const grab = element("span");
  grab.className = "sheet-grab";
  grab.setAttribute("aria-hidden", "true");
  const close = createIconButton({
    label: t("close"),
    onClick: () => sheet.requestClose(),
  });
  close.innerHTML = icon("close");
  head.prepend(grab);
  head.append(close);
  sheet.open();
  return sheet;
}
function confirmDialog(options: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
}) {
  return new Promise<boolean>((resolve) => {
    let confirmed = false;
    const actions = document.createDocumentFragment();
    actions.append(
      createButton({ text: t("cancel"), onClick: () => dialog.requestClose() }),
      createButton({
        text: options.confirmLabel,
        intent: options.danger ? "danger" : "primary",
        attrs: { autofocus: true },
        onClick: () => {
          confirmed = true;
          dialog.close();
        },
      }),
    );
    const dialog = createConfirmDialog({
      title: options.title,
      body: options.body,
      actions,
      behavior: {
        opener: document.activeElement,
        onClose: () => resolve(confirmed),
      },
    });
    dialog.open();
  });
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
  const name = field(body, pt("ensembleName"), "text", "domain-create");
  name.required = true;
  name.maxLength = 200;
  const kind = createSelect({
    variant: "domain",
    options: ["choir", "band", "other"].map((k) => ({
      value: k,
      label: pt(k as "choir"),
    })),
  });
  body.append(kind);
  const save = createButton({
    text: pt("createEnsemble"),
    intent: "primary",
    type: "submit",
  });
  body.append(save);
  body.onsubmit = (e) => {
    e.preventDefault();
    if (save.getAttribute("aria-disabled") === "true") return;
    updateButton(save, { busy: true });
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
        updateButton(save, { busy: false });
      }
    });
  };
  openSheet(pt("createEnsemble"), body);
}
export async function membersSheet(id: string, anchor?: HTMLElement) {
  const body = element("div");
  body.className = "sheet-body domain-sheet";
  const menus: (() => void)[] = [];
  openSheet(pt("membersInvitations"), body, anchor, () =>
    menus.splice(0).forEach((dispose) => dispose()),
  );
  const base = `/ensembles/${id}`;
  let isLead = leads(id);
  async function render() {
    await refreshEnsembleNames();
    isLead = leads(id);
    const [members, invitations] = await Promise.all([
      api(`${base}/members`),
      api(`${base}/invitations`),
    ]);
    menus.splice(0).forEach((dispose) => dispose());
    body.replaceChildren();
    const heading = (
      key: "membersHeading" | "invitationsHeading" | "inviteHeading",
    ) => {
      const h = element("h3", pt(key));
      h.className = "domain-heading";
      body.append(h);
    };
    const menu = (
      row: HTMLElement,
      actions: { label: string; run: () => Promise<void | false> }[],
    ) => {
      if (!actions.length) return;
      const details = element("details");
      details.className = "row-menu";
      const summary = element("summary", "⋯");
      summary.setAttribute("aria-label", pt("membersInvitations"));
      details.append(summary);
      const menu = createMenu({
        variant: "member",
        label: pt("membersInvitations"),
        items: actions.map((item) => ({
          label: item.label,
          onSelect: () => {
            details.open = false;
            summary.focus();
            const at = [...body.querySelectorAll(".row-menu summary")].indexOf(summary);
            void action(async () => {
              if (await item.run() === false) return;
              await render();
              const triggers = body.querySelectorAll<HTMLElement>(".row-menu summary");
              triggers[Math.min(at, triggers.length - 1)]?.focus();
            });
          },
        })),
        onEscape: () => {
          details.open = false;
          summary.focus();
        },
      });
      menus.push(menu.dispose);
      details.append(menu.element);
      row.append(details);
      details.addEventListener("toggle", () =>
        summary.setAttribute("aria-expanded", String(details.open)),
      );
      summary.setAttribute("aria-haspopup", "menu");
      summary.setAttribute("aria-controls", menu.element.id);
      details.onkeydown = (e) => {
        if (
          e.target === summary &&
          (e.key === "ArrowDown" || e.key === "ArrowUp")
        ) {
          e.preventDefault();
          details.open = true;
          const items =
            menu.element.querySelectorAll<HTMLElement>("[role=menuitem]");
          (e.key === "ArrowUp" ? items[items.length - 1] : items[0])?.focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          details.open = false;
          summary.focus();
        }
      };
    };
    heading("membersHeading");
    for (const m of members) {
      const row = element("section");
      row.className = "member-row";
      const head = element("div");
      head.className = "member-head";
      const identity = element("div");
      identity.className = "member-identity";
      identity.append(element("b", m.name || m.email));
      const email = element("p", m.email);
      email.className = "member-email";
      identity.append(email);
      head.append(identity);
      if (m.isLead) {
        const mark = element("span", pt("lead"));
        mark.className = "domain-gold";
        head.append(mark);
      }
      row.append(head);
      const self = m.userId === account?.id;
      const last =
        m.isLead && members.filter((v: any) => v.isLead).length === 1;
      const actions: { label: string; run: () => Promise<void | false> }[] = [];
      if (isLead && !m.isLead)
        actions.push({
          label: pt("makeLead"),
          run: async () => {
            await api(`${base}/members/${m.id}`, "PATCH", { isLead: true });
          },
        });
      if (self && m.isLead && !last)
        actions.push({
          label: pt("stepDown"),
          run: async () => {
            await api(`${base}/members/${m.id}`, "PATCH", { isLead: false });
          },
        });
      if (!last && (!m.isLead || isLead))
        actions.push({
          label: pt(self ? "leaveEnsemble" : "removeMember"),
          run: async () => {
            if (
              await confirmDialog({
                title: pt(self ? "leaveEnsemble" : "removeMember"),
                body: pt("confirmRemove"),
                confirmLabel: pt("remove"),
                danger: true,
              })
            ) {
              await api(`${base}/members/${m.id}`, "DELETE");
              if (self) {
                location.reload();
                return;
              }
            } else return false;
          },
        });
      menu(head, actions);
      if (self && last) {
        const note = element("p", pt("onlyLead"));
        note.className = "ctl-note";
        row.append(note);
      }
      if (!m.isLead) {
        const caps = element("div");
        caps.className = "capability-row";
        for (const cap of capabilities) {
          if (isLead) {
            const input = capabilitySwitch(caps, pt(cap), m.capabilities[cap]);
            input.onchange = () =>
              void action(async () => {
                const checked = input.checked;
                const label = input.parentElement!;
                updateSwitch(label, {variant:"capability", label:pt(cap), checked, busy:true});
                try {
                  await api(`${base}/members/${m.id}`, "PATCH", {[cap]:checked});
                  m.capabilities[cap] = checked;
                } finally {
                  updateSwitch(label, {variant:"capability", label:pt(cap), checked:m.capabilities[cap], busy:false});
                }
              });
          } else {
            const state = element(
              "span",
              `${m.capabilities[cap] ? "✓" : "–"} ${pt(cap)}`,
            );
            state.className = "ctl-note";
            caps.append(state);
          }
        }
        row.append(caps);
      }
      body.append(row);
    }
    heading("invitationsHeading");
    for (const i of invitations) {
      const row = element("section");
      row.className = "member-row invitation-row";
      const head = element("div");
      head.className = "member-head";
      const email = element("span", i.email);
      email.className = "member-email member-identity";
      head.append(email);
      const state = element(
        "span",
        pt(
          i.deliveryState === "not_sent" && i.state === "pending"
            ? "notSent"
            : (i.state as "pending"),
        ),
      );
      state.className = "invitation-state";
      head.append(state);
      row.append(head);
      if (i.state === "pending")
        menu(head, [
          {
            label: pt("resend"),
            run: async () => {
              try {
                await api(`${base}/invitations/${i.id}/resend`, "POST", {
                  idempotencyKey: randomId(),
                });
              } catch (e) {
                const note = element("p", domainError((e as Error).message));
                note.className = "ctl-note";
                row.append(note);
                throw e;
              }
            },
          },
          {
            label: pt("revoke"),
            run: async () => {
              await api(`${base}/invitations/${i.id}`, "DELETE");
            },
          },
        ]);
      body.append(row);
    }
    heading("inviteHeading");
    const form = element("form");
    const email = field(form, pt("email"), "email");
    email.required = true;
    const label = element("div");
    label.setAttribute("role", "group");
    label.setAttribute("aria-label", pt("emailLanguage"));
    let language = lang;
    for (const l of ["de", "en"] as const) {
      if (label.childNodes.length) label.append(document.createTextNode(" · "));
      const b = createButton({
        variant: "domain-language",
        text: l.toUpperCase(),
        pressed: l === language,
        onClick: () => {
          language = l;
          label
            .querySelectorAll("button")
            .forEach((v) =>
              updateButton(v, { pressed: v.textContent === l.toUpperCase() }),
            );
        },
      });
      label.append(b);
    }
    form.append(label);
    const grants: Record<string, HTMLInputElement> = {};
    const caps = element("div");
    caps.className = "capability-row";
    if (isLead)
      for (const cap of capabilities)
        grants[cap] = capabilitySwitch(caps, pt(cap));
    form.append(caps);
    const send = createButton({
      text: pt("invite"),
      intent: "primary",
      type: "submit",
    });
    form.append(send);
    let key = randomId();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (send.getAttribute("aria-disabled") === "true") return;
      updateButton(send, { busy: true });
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
          updateButton(send, { busy: false });
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
