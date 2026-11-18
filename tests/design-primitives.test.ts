// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import * as D from "../src/design-system/dom";
import * as R from "../src/design-system/react";
import {
  openDialog,
  bindMenu,
  toast,
  getToast,
  dismissToast,
  subscribeToast,
} from "../src/design-system/behavior";
const toastRoles = vi.hoisted(() => ({ 'toast-duration-info': '3200ms', 'toast-duration-error': '6500ms', 'toast-duration-exit': '300ms' }));
vi.mock('../src/design-system/theme', async importOriginal => ({
  ...await importOriginal(), readTheme: () => ({ roles: toastRoles }),
}));
afterEach(() => {
  D.closeOverlay();
  do { dismissToast(); } while (getToast());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("DOM and React adapter contracts", () => {
  it("forwards DOM table data and accessibility hooks", () => {
    const cell = D.createTableCell("Name", {
      variant: "records",
      attrs: { "data-label": "Person", colspan: 2 },
    });
    expect(cell.dataset.label).toBe("Person");
    expect(cell.colSpan).toBe(2);
  });
  it("defaults to button, treats user text as text, forwards hooks and guards busy without losing focus", () => {
    const onClick = vi.fn(),
      button = D.createButton({
        text: "<img src=x onerror=x>",
        busy: true,
        onClick,
        attrs: { "data-action": "save", "aria-label": "Save" },
      });
    document.body.append(button);
    button.focus();
    button.click();
    expect(button.type).toBe("button");
    expect(button.querySelector("img")).toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(onClick).not.toHaveBeenCalled();
    D.updateButton(button, { busy: false, size: "compact" });
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.dataset.action).toBe("save");
    const html = renderToString(
      createElement(R.Button, { busy: true }, "Save"),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(" disabled=");
  });
  it("preserves native validation and associates label, hint and error IDs", () => {
    const input = D.createInput({
      required: true,
      type: "email",
      attrs: { "aria-describedby": "external" },
    });
    const field = D.createField({
      label: "Email",
      hint: "Hint",
      error: "Invalid",
      control: input,
    });
    document.body.append(field);
    expect(field.querySelector("label")?.htmlFor).toBe(input.id);
    expect(input.getAttribute("aria-describedby")).toBe(
      `external ${input.id}-hint ${input.id}-error`,
    );
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("tw:border-danger");
    expect(
      renderToString(createElement(R.Input, { "aria-invalid": true })),
    ).toContain("tw:border-danger");
    expect(
      renderToString(createElement(R.Select, { "aria-invalid": true })),
    ).toContain("tw:border-danger");
    expect(
      renderToString(createElement(R.Textarea, { "aria-invalid": true })),
    ).toContain("tw:border-danger");
    expect(input.checkValidity()).toBe(false);
  });
  it("keeps checkbox form semantics and switch command semantics", () => {
    const checkbox = D.createCheckbox({
      label: "Permission",
      checked: true,
      name: "permission",
    });
    expect(checkbox.querySelector("input")?.type).toBe("checkbox");
    expect(checkbox.querySelector("input")?.checked).toBe(true);
    const onChange = vi.fn();
    const control = D.createSwitch({
      label: "Enabled",
      checked: true,
      onChange,
    });
    control.click();
    expect(control.getAttribute("role")).toBe("switch");
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
function modal(options: Parameters<typeof openDialog>[1] = {}) {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const dialog = document.createElement("dialog");
  dialog.innerHTML = "<button autofocus>First</button><button>Last</button>";
  Object.defineProperty(dialog, "showModal", {
    value: () => (dialog.open = true),
  });
  Object.defineProperty(dialog, "close", {
    value: () => {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    },
  });
  const api = openDialog(dialog, options);
  return { opener, dialog, api };
}
describe("native switch mode", () => {
  it("preserves form submission and guards busy checkbox activation", () => {
    const changed = vi.fn(),
      control = D.createSwitch({
        mode: "checkbox",
        variant: "capability",
        label: "Permission",
        checked: true,
        name: "permission",
        busy: true,
        onChange: changed,
      });
    document.body.append(control);
    const input = control.querySelector("input")!;
    input.click();
    expect(input.checked).toBe(true);
    D.updateSwitch(control, {
      label: "Permission",
      mode: "checkbox",
      variant: "capability",
      checked: false,
      busy: false,
    });
    expect(input.checked).toBe(false);
    expect(input.name).toBe("permission");
    expect(input.getAttribute("role")).toBe("switch");
    expect(changed).not.toHaveBeenCalled();
  });
});
describe("one native dialog lifecycle", () => {
  it("focuses initially, restores focus/inert/scroll and closes idempotently", () => {
    const close = vi.fn();
    const old = document.createElement("div");
    old.inert = true;
    document.body.append(old);
    document.body.style.overflow = "auto";
    const { opener, dialog, api } = modal({ onClose: close });
    expect(dialog.open).toBe(true);
    expect(opener.inert).not.toBe(true);
    /* Native showModal owns inertness. */ expect(document.activeElement).toBe(
      dialog.firstElementChild,
    );
    expect(document.body.style.overflow).toBe("hidden");
    api.close();
    api.close();
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    expect(opener.inert).toBeFalsy();
    expect(old.inert).toBe(true);
    expect(document.body.style.overflow).toBe("auto");
  });
  it("blocks busy cancellation for Escape/outside/button and allows explicit completion", () => {
    const { dialog, api } = modal({ busy: true });
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    api.requestClose("outside");
    api.requestClose("button");
    expect(dialog.open).toBe(true);
    api.setBusy(false);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(false);
  });
  it("supports ignore and allow policies plus native close cleanup", () => {
    const first = modal({ escape: "ignore", outside: "ignore" });
    first.api.requestClose("escape");
    first.api.requestClose("outside");
    expect(first.dialog.open).toBe(true);
    first.dialog.close();
    expect(first.opener.inert).toBeFalsy();
    const second = modal({ busy: true, busyCancel: "allow" });
    second.api.requestClose();
    expect(second.dialog.open).toBe(false);
  });
  it("leaves later portals to native modal inertness without authoring inert", async () => {
    const { api } = modal();
    const added = document.createElement("div");
    document.body.append(added);
    await Promise.resolve();
    expect(added.inert).not.toBe(true);
    api.close();
    expect(added.inert).toBeFalsy();
  });
});
describe("menu keyboard and shared notifier", () => {
  it("expands text-safe radio choices without selecting the parent and guards disabled nested commands", () => {
    const parent = vi.fn(),
      selected = vi.fn(),
      disabled = vi.fn();
    const menu = D.createMenu({
      variant: "library",
      label: "Appearance",
      items: [
        {
          label: "<img src=x onerror=x>",
          value: "Night paper",
          onSelect: parent,
          options: [
            {
              label: "Night paper",
              checked: true,
              radio: true,
              onSelect: selected,
            },
            {
              label: "Unavailable",
              disabled: true,
              radio: true,
              checked: false,
              onSelect: disabled,
            },
          ],
        },
      ],
    });
    document.body.append(menu.element);
    const buttons = menu.element.querySelectorAll("button");
    expect(menu.element.querySelector("img")).toBeNull();
    expect(buttons[0].textContent).toContain("<img src=x onerror=x>");
    buttons[0].click();
    expect(parent).not.toHaveBeenCalled();
    expect(buttons[0].getAttribute("aria-expanded")).toBe("true");
    expect(buttons[1].getAttribute("role")).toBe("menuitemradio");
    expect(document.activeElement).toBe(buttons[1]);
    buttons[2].click();
    expect(disabled).not.toHaveBeenCalled();
    buttons[1].click();
    expect(selected).toHaveBeenCalledTimes(1);
    menu.dispose();
  });

  it("skips disabled and collapsed items, wraps, Home/End, typeahead and activation", () => {
    const selected = vi.fn();
    const { element, dispose } = D.createMenu({
      label: "Actions",
      items: [
        { label: "Alpha", onSelect: selected },
        { label: "Disabled", disabled: true, onSelect: selected },
        { label: "Beta", onSelect: selected },
        { label: "Charlie", onSelect: selected },
      ],
    });
    document.body.append(element);
    const buttons = element.querySelectorAll("button");
    buttons[0].focus();
    const key = (key: string) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    key("ArrowDown");
    expect(document.activeElement).toBe(buttons[2]);
    key("End");
    expect(document.activeElement).toBe(buttons[3]);
    key("ArrowDown");
    expect(document.activeElement).toBe(buttons[0]);
    key("c");
    expect(document.activeElement).toBe(buttons[3]);
    key("Home");
    key("Enter");
    expect(selected).toHaveBeenCalledOnce();
    dispose();
  });
  it("ArrowUp enters at the last item and handled Escape does not cancel a parent dialog", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<button role="menuitem">Alpha</button><button role="menuitem">Beta</button>';
    root.tabIndex = 0;
    document.body.append(root);
    const parent = vi.fn();
    document.body.addEventListener("keydown", parent);
    const escape = vi.fn(),
      dispose = bindMenu(root, escape);
    root.focus();
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(document.activeElement).toBe(root.lastElementChild);
    parent.mockClear();
    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(escape).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
    dispose();
    document.body.removeEventListener("keydown", parent);
  });
  it("cleans menu listeners and typeahead timers", () => {
    const root = document.createElement("div");
    root.innerHTML = '<button role="menuitem">Alpha</button>';
    const escape = vi.fn(),
      dispose = bindMenu(root, escape);
    dispose();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(escape).not.toHaveBeenCalled();
  });
  it("does not attach notifications to a nonmodal dialog specimen", () => {
    const specimen = document.createElement("dialog");
    specimen.open = true;
    document.body.append(specimen);
    toast("Notification");
    expect(document.getElementById("toast")?.parentElement).toBe(document.body);
  });
  it("keeps the real recipe host in body across modal close", () => {
    toast("First");
    const host = document.getElementById("toast")!;
    const { api } = modal();
    toast("In modal");
    expect(host.parentElement).toBe(document.querySelector("dialog[open]"));
    api.close();
    expect(host.parentElement).toBe(document.body);
    expect(host.textContent).toBe("In modal");
    expect(host.className).toContain("ds-reset");
    expect(host.getAttribute("popover")).toBe("manual");
  });
  it("uses one safe host, replaces messages, restarts duration and notifies both consumers", () => {
    vi.useFakeTimers();
    const listener = vi.fn(),
      unsubscribe = subscribeToast(listener);
    toast("<b>First</b>");
    expect(document.querySelectorAll("#toast")).toHaveLength(1);
    expect(document.querySelector("#toast b")).toBeNull();
    vi.advanceTimersByTime(3000);
    toast("Error", "error");
    vi.advanceTimersByTime(3200);
    expect(getToast()?.text).toBe("Error");
    expect(document.querySelectorAll("#toast")).toHaveLength(1);
    vi.advanceTimersByTime(33000);
    expect(getToast()?.text).toBe("Error");
    document.querySelector<HTMLButtonElement>("#toast button")!.click();
    expect(getToast()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});

describe("P3 review regression contracts", () => {
  it("puts checkbox attrs on the native input in both adapters", () => {
    const dom = D.createCheckbox({
      label: "Permission",
      attrs: {
        "data-bind": "permission",
        id: "permission",
        "aria-describedby": "hint",
      },
    });
    expect(dom.hasAttribute("data-bind")).toBe(false);
    expect(dom.querySelector("input")?.getAttribute("data-bind")).toBe(
      "permission",
    );
    expect(
      renderToString(
        createElement(R.Checkbox, {
          label: "Permission",
          "data-bind": "permission",
          id: "permission",
        }),
      ),
    ).toContain('data-bind="permission"');
  });
  it("shares toggle/menu data and busy state contracts with guarded menu activation", () => {
    const selected = vi.fn();
    const dom = D.createMenu({
      label: "Actions",
      items: [{ label: "Busy", busy: true, onSelect: selected }],
    });
    dom.element.querySelector("button")!.click();
    expect(selected).not.toHaveBeenCalled();
    const html = renderToString(
      createElement(R.Menu, {
        label: "Actions",
        items: [{ label: "Busy", busy: true, onSelect: selected }],
      }),
    );
    expect(html).toContain('data-ds="menu-item"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    const toggle = renderToString(
      createElement(R.ToggleGroup, {
        label: "Mode",
        value: "a",
        items: [{ value: "a", label: "A" }],
      }),
    );
    expect(toggle).toContain('data-ds="button"');
    expect(toggle).toContain('aria-busy="false"');
    dom.dispose();
  });
  it("retains layout and native control identity while setting and clearing field errors", () => {
    const input = D.createInput({
      layout: "tw:flex-1",
      attrs: { "aria-describedby": "external", "data-bind": "name" },
    });
    const root = D.createField({
      label: "Name",
      variant: "ruled",
      control: input,
      hint: "Hint",
      error: "Error",
    });
    document.body.append(root);
    input.focus();
    expect(input.className).toContain("tw:flex-1");
    expect(input.dataset.fieldVariant).toBe("ruled");
    D.updateField(root, { error: undefined });
    expect(document.activeElement).toBe(input);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe(
      `external ${input.id}-hint`,
    );
    expect(root.querySelector("#" + input.id + "-error")).toBeNull();
    expect(input.dataset.bind).toBe("name");
  });
  it("updates buttons and icon buttons without losing named layout or icon appearance", () => {
    const button = D.createButton({
      text: "Save",
      size: "compact",
      layout: "tw:ml-auto",
    });
    D.updateButton(button, { busy: true });
    expect(button.className).toContain("tw:rounded-card");
    expect(button.className).toContain("tw:min-h-control-height-compact");
    expect(button.className).toContain("tw:ml-auto");
    const icon = D.createIconButton({
      label: "Close",
      variant: "small",
      layout: "tw:self-end",
    });
    D.updateButton(icon, { busy: true });
    expect(icon.className).toContain("tw:size-panel");
    expect(icon.className).toContain("tw:self-end");
    expect(icon.dataset.ds).toBe("icon-button");
  });
  it("inherits React Field/Table variants and binds DOM table parts once", () => {
    const field = renderToString(
      createElement(R.Field, {
        variant: "search",
        label: "Name",
        children: (props) => createElement(R.Input, { ...props }),
      }),
    );
    expect(field).toContain('data-field-variant="search"');
    const table = renderToString(
      createElement(
        R.Table,
        { variant: "records" },
        createElement(
          "tbody",
          null,
          createElement(
            R.TableRow,
            null,
            createElement(R.TableCell, null, "Name"),
          ),
        ),
      ),
    );
    expect(table).toContain("tw:max-account:block");
    const parsed = document.createElement("div");
    parsed.innerHTML = table;
    expect(parsed.querySelector("td")?.className).toContain(
      "tw:max-account:grid",
    );
    const parts = D.createTableParts({ variant: "records" });
    expect(parts.cell("Name").className).toContain("tw:max-account:grid");
  });
  it("forwards root hooks, dialog associations and confirm semantics, and Card as", () => {
    const html = renderToString(
      createElement(R.ConfirmDialog, {
        open: true,
        specimen: true,
        title: "Confirm",
        id: "confirm",
        "data-action": "confirm",
        "aria-describedby": "external",
      }),
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain('aria-describedby="external"');
    expect(html).toContain('data-action="confirm"');
    const confirm = D.createConfirmDialog({
      title: "Confirm",
      body: "Sure?",
    }).element;
    expect(confirm.getAttribute("role")).toBe("alertdialog");
    expect(confirm.querySelector("h2")?.id).toBe(
      confirm.getAttribute("aria-labelledby"),
    );
    expect(
      renderToString(
        createElement(R.EmptyState, {
          title: "Empty",
          id: "empty",
          "aria-label": "Pieces",
        }),
      ),
    ).toContain('aria-label="Pieces"');
    expect(
      renderToString(
        createElement(R.ToggleGroup, {
          label: "Mode",
          id: "mode",
          value: "a",
          items: [],
        }),
      ),
    ).toContain('id="mode"');
    expect(renderToString(createElement(R.Card, { as: "aside" }))).toMatch(
      /^<aside/,
    );
  });
  it("distinguishes cancellation from silent disposal and stacks nested dialogs", () => {
    const cancelled = vi.fn(),
      closed = vi.fn();
    const first = modal({ onCancel: cancelled, onClose: closed });
    const nested = modal();
    expect(first.dialog.open).toBe(true);
    nested.api.close();
    expect(first.dialog.open).toBe(true);
    first.api.dispose();
    expect(cancelled).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    const second = modal({ onCancel: cancelled, onClose: closed });
    second.api.requestClose("button");
    expect(cancelled).toHaveBeenCalledWith("button");
    expect(closed).toHaveBeenCalledOnce();
  });
  it("retains toast text for the exit fade and announces errors as alerts", () => {
    vi.useFakeTimers();
    toast("Error", "error");
    const host = document.getElementById("toast")!;
    expect(host.getAttribute("role")).toBe("alert");
    dismissToast();
    expect(host.textContent).toBe("Error×");
    vi.advanceTimersByTime(299);
    expect(host.textContent).toBe("Error×");
    vi.advanceTimersByTime(1);
    expect(host.textContent).toBe("");
    toast("Old");
    dismissToast();
    vi.advanceTimersByTime(100);
    dismissToast();
    toast("Replacement");
    vi.advanceTimersByTime(300);
    expect(host.textContent).toBe("Replacement");
  });
  it("allows spaces in buffered typeahead and keeps the roving item when rebound", () => {
    const menu = D.createMenu({
      label: "Actions",
      items: ["New piece", "New ensemble", "Other"].map((label) => ({
        label,
        onSelect: vi.fn(),
      })),
    });
    document.body.append(menu.element);
    const key = (key: string) =>
      menu.element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    const items = menu.element.querySelectorAll("button");
    items[2].focus();
    for (const letter of "new e") key(letter);
    expect(document.activeElement).toBe(items[1]);
    menu.dispose();
    const dispose = bindMenu(menu.element);
    expect(items[1].tabIndex).toBe(0);
    expect(items[0].tabIndex).toBe(-1);
    dispose();
  });
});

describe("legacy overlay exit transport", () => {
  it("keeps a replacement sheet alive when the opening menu finishes closing", () => {
    let finishExit!: () => void;
    const menu = modal({
      exit: (finish) => {
        finishExit = finish;
      },
    });
    menu.api.close();
    const account = modal();
    const focused = document.activeElement;
    finishExit();
    expect(menu.dialog.open).toBe(false);
    expect(account.dialog.open).toBe(true);
    expect(document.activeElement).toBe(focused);
    expect(document.body.style.overflow).toBe("hidden");
    account.api.close();
  });


});

describe("shared panel motion", () => {
  it("retains native modality during the fade and restores focus only when it finishes", () => {
    vi.useFakeTimers();
    const { dialog, api, opener } = modal({ motion: "panel" });
    expect(dialog.dataset.panelState).toBe("entering");
    vi.advanceTimersByTime(20);
    expect(dialog.dataset.panelState).toBe("open");
    dialog.style.transitionDuration = "0.16s";
    api.requestClose();
    expect(dialog.dataset.panelState).toBe("closing");
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const event = new Event("transitionend");
    Object.defineProperty(event, "propertyName", { value: "opacity" });
    dialog.dispatchEvent(event);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(dialog.hasAttribute("data-panel-state")).toBe(false);
    vi.runAllTimers();
    expect(dialog.open).toBe(false);
  });
});

describe("centered dialog compatibility motion", () => {
  it("retains the modal and scroll lock through the exit, then restores focus", () => {
    vi.useFakeTimers();
    const { dialog, api, opener } = modal({ motion: "sheet" });
    expect(dialog.dataset.panelState).toBe("entering");
    vi.advanceTimersByTime(20);
    expect(dialog.dataset.panelState).toBe("open");
    dialog.style.transitionDuration = "0.22s";
    api.close();
    expect(dialog.dataset.panelState).toBe("closing");
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const event = new Event("transitionend");
    Object.defineProperty(event, "propertyName", { value: "opacity" });
    dialog.dispatchEvent(event);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(dialog.hasAttribute("data-panel-state")).toBe(false);
  });
  it("does not swipe-dismiss centered dialogs, including historical sheet APIs", () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const { dialog, api } = modal({ motion: "sheet", busy: true, onCancel });
    const touch = (type: string, y: number) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, "touches", { value: [{ clientY: y }] });
      dialog.dispatchEvent(event);
    };
    vi.advanceTimersByTime(20);
    touch("touchstart", 100);
    touch("touchmove", 300);
    expect(dialog.style.transform).toBe("");
    touch("touchend", 300);
    vi.advanceTimersByTime(20);
    expect(dialog.open).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog.style.transform).toBe("");
    api.setBusy(false);
    touch("touchstart", 100);
    touch("touchmove", 300);
    touch("touchend", 300);
    vi.advanceTimersByTime(20);
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    api.dispose();
    touch("touchstart", 100);
    touch("touchmove", 300);
    expect(dialog.style.transform).toBe("");
  });
  it("closes immediately under reduced motion and cancels pending entry on disposal", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    try {
      const { dialog, api } = modal({ motion: "sheet" });
      expect(dialog.dataset.panelState).toBe("entering");
      api.close();
      expect(dialog.open).toBe(false);
      const next = modal({ motion: "sheet" });
      next.api.dispose();
      vi.runAllTimers();
      expect(next.dialog.hasAttribute("data-panel-state")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('final review adapter and keyboard regressions', () => {
  it('compares normalized React and DOM specimen markup, including roles, aria, data and classes', async () => {
    const { specimens } = await import('../src/design-system/catalog');
    function normalized(root: ParentNode) {
      const elements = [...root.querySelectorAll('*')];
      const ids = new Map(elements.filter(el => el.id).map(el => [el.id, `part-${elements.indexOf(el)}`]));
      return elements.map(el => ({
        tag: el.tagName,
        attrs: Object.fromEntries([...el.attributes]
          .filter(a => (a.name === 'class' && a.value.trim()) || a.name === 'role' || a.name === 'id' || a.name === 'for' || /^(aria-|data-)/.test(a.name))
          .map(a => [a.name, a.name === 'class' ? a.value.split(/\s+/).filter(Boolean).sort().join(' ') : a.value.split(' ').map(value => ids.get(value) ?? value).join(' ')])
          .sort(([a], [b]) => a.localeCompare(b))),
      }));
    }
    for (const specimen of specimens()) {
      const react = document.createElement('template');
      react.innerHTML = renderToString(specimen.react);
      const dom = document.createDocumentFragment();
      dom.append(specimen.dom());
      expect(normalized(dom), specimen.name).toEqual(normalized(react.content));
    }
  });
  it('wraps Tab in both directions, traps an empty dialog and closes on Escape with focus return', () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function () {
      return [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
    });
    const cancelled = vi.fn();
    const { dialog, opener, api } = modal({ onCancel: cancelled });
    const [first, last] = [...dialog.querySelectorAll('button')];
    const key = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
      dialog.dispatchEvent(event);
      return event;
    };
    last.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    dialog.replaceChildren();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(cancelled).toHaveBeenCalledWith('escape');
    expect(document.activeElement).toBe(opener);
    api.dispose();
  });
  it('omits untitled headings/associations and preserves explicit popover names in both adapters', () => {
    const dom = D.createDialog({ title: '', attrs: { 'aria-label': 'Tempo' } }).element;
    const react = document.createElement('div');
    react.innerHTML = renderToString(createElement(R.Dialog, { open: true, specimen: true, title: '', 'aria-label': 'Tempo' }));
    for (const dialog of [dom, react.querySelector('dialog')!]) {
      expect(dialog.querySelector('h2,header')).toBeNull();
      expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
      expect(dialog.getAttribute('aria-label')).toBe('Tempo');
    }
  });
});

it('uses token durations for toast lifetime and exit rather than numeric defaults', () => {
  vi.useFakeTimers();
  const original = { ...toastRoles };
  Object.assign(toastRoles, { 'toast-duration-info': '0.017s', 'toast-duration-error': '23ms', 'toast-duration-exit': '0.011s' });
  try {
    toast('Short info');
    vi.advanceTimersByTime(16); expect(getToast()?.text).toBe('Short info');
    vi.advanceTimersByTime(1); expect(getToast()).toBeNull();
    expect(document.getElementById('toast')?.textContent).toBe('Short info');
    vi.advanceTimersByTime(11); expect(document.getElementById('toast')?.textContent).toBe('');
    toast('Short error', 'error');
    vi.advanceTimersByTime(22); expect(getToast()?.text).toBe('Short error');
    vi.advanceTimersByTime(10000); expect(getToast()?.text).toBe('Short error');
    dismissToast(); expect(getToast()).toBeNull();
  } finally { Object.assign(toastRoles, original); }
});

it('finishes a sheet through its duration fallback when transitionend is absent', () => {
  vi.useFakeTimers();
  const {dialog,api,opener}=modal({motion:'sheet'});
  vi.advanceTimersByTime(20);
  dialog.style.transitionDuration='0.22s';
  api.close();
  vi.advanceTimersByTime(269);
  expect(dialog.open).toBe(true);
  vi.advanceTimersByTime(1);
  expect(dialog.open).toBe(false);
  expect(document.activeElement).toBe(opener);
});

describe('AICAP-28 overlay decisions', () => {
  it('keeps actionable prompts and errors until dismissed, then delivers queued notices', () => {
    vi.useFakeTimers();
    const selected = vi.fn();
    toast('Reload available', 'info', {action: {label: 'Reload', onSelect: selected}});
    toast('Saved');
    vi.advanceTimersByTime(60000);
    expect(getToast()?.text).toBe('Reload available');
    document.querySelector<HTMLButtonElement>('#toast button')!.click();
    expect(selected).toHaveBeenCalledOnce();
    expect(getToast()?.text).toBe('Saved');
    vi.advanceTimersByTime(3200);
    expect(getToast()).toBeNull();
  });
  it('generates a danger confirmation command and alertdialog semantics in both adapters', () => {
    const confirmed = vi.fn();
    const options = {title: 'Remove member', destructive: true, confirmAction: {label: 'Remove permanently', onConfirm: confirmed}};
    const dom = D.createConfirmDialog(options).element;
    expect(dom.getAttribute('role')).toBe('alertdialog');
    expect(dom.querySelector('button')?.className).toContain('tw:bg-danger');
    dom.querySelector('button')!.click();
    expect(confirmed).toHaveBeenCalledOnce();
    const root = document.createElement('div');
    root.innerHTML = renderToString(createElement(R.ConfirmDialog, {...options, open: true, specimen: true}));
    expect(root.querySelector('dialog')?.getAttribute('role')).toBe('alertdialog');
    expect(root.querySelector('button')?.className).toContain('tw:bg-danger');
  });
  it('fits the visible keyboard viewport and scrolls the focused field without changing the dialog identity', () => {
    vi.useFakeTimers();
    const viewport = Object.assign(new EventTarget(), {width: 390, height: 844, offsetTop: 0, offsetLeft: 0});
    vi.stubGlobal('visualViewport', viewport);
    try {
      const {dialog, api} = modal();
      const focused = dialog.querySelector('button')!;
      const scroll = vi.fn();
      focused.scrollIntoView = scroll;
      focused.focus();
      viewport.height = 380;
      viewport.offsetTop = 25;
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
      expect(dialog.style.maxHeight).toContain('380px');
      expect(dialog.style.top).toContain('25px');
      expect(scroll).toHaveBeenCalledWith({block:'nearest', inline:'nearest', behavior:'instant'});
      api.dispose();
      scroll.mockClear();
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
      expect(scroll).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});


it('inherits field density and keeps error feedback next to a focused control',()=>{
  const html=renderToString(createElement(R.Field,{density:'compact',label:'Email',error:'Check email',children:a=>createElement(R.Input,{...a,type:'email'})}));
  expect(html).toContain('tw:min-h-control-height-compact');
  expect(html).not.toContain('density="');
  const input=D.createInput({density:'compact',type:'email'});
  const field=D.createField({density:'compact',label:'Email',control:input});
  document.body.append(field);input.focus();
  D.updateField(field,{error:'Check email'});
  expect(document.activeElement).toBe(input);
  expect(input.className).toContain('tw:min-h-control-height-compact');
  expect(input.nextElementSibling?.textContent).toBe('Check email');
  expect(input.getAttribute('aria-describedby')).toContain(input.nextElementSibling?.id);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.className).toContain('tw:border-danger');
});


describe('AICAP-28 review fixes', () => {
  it('coalesces identical queued notices and active repeats without extending their lifetime', () => {
    vi.useFakeTimers();
    toast('Unresolved failure', 'error');
    const active = getToast()?.id;
    toast('Unresolved failure', 'error');
    expect(getToast()?.id).toBe(active);
    for (let i = 0; i < 20; i++) toast('Saved');
    dismissToast();
    expect(getToast()?.text).toBe('Saved');
    vi.advanceTimersByTime(2000);
    toast('Saved');
    vi.advanceTimersByTime(1200);
    expect(getToast()).toBeNull();
  });
  it('bounds pending notices to ten, retaining the newest distinct notices in delivery order', () => {
    toast('Unresolved failure', 'error');
    for (let i = 0; i < 30; i++) toast(`Notice ${i}`);
    const delivered: string[] = [];
    dismissToast();
    while (getToast()) { delivered.push(getToast()!.text); dismissToast(); }
    expect(delivered).toEqual(Array.from({length:10}, (_, i) => `Notice ${i + 20}`));
  });
  it('does not coalesce different actions or different persistence policies', () => {
    const first = vi.fn(), second = vi.fn();
    toast('Failure', 'error');
    toast('Retry', 'info', {action:{label:'Retry',onSelect:first}});
    toast('Retry', 'info', {action:{label:'Retry',onSelect:second}});
    dismissToast();document.querySelector<HTMLButtonElement>('#toast button')!.click();
    expect(first).toHaveBeenCalledOnce();expect(second).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('#toast button')!.click();
    expect(second).toHaveBeenCalledOnce();expect(getToast()).toBeNull();
    toast('Failure', 'error');toast('Saved');toast('Saved','info',{persistent:true});
    dismissToast();dismissToast();expect(getToast()?.persistent).toBe(true);
  });
  it('uses a shrinkable wrapping message slot beside actionable toast controls', () => {
    toast('Eine sehr lange Fehlermeldung', 'error', {action:{label:'Erneut versuchen',onSelect(){}}});
    const message = document.querySelector('#toast > span');
    expect(message?.textContent).toBe('Eine sehr lange Fehlermeldung');
    expect(message?.className).toContain('tw:min-w-flush');
    expect(message?.className).toContain('tw:flex-1');
  });
  it('gives library final confirmations the shared danger border', () => {
    const dialog = D.createDialog({variant:'library-prompt', title:'Delete piece', destructive:true, attrs:{role:'alertdialog'}}).element;
    expect(dialog.className).toContain('tw:border-danger');
    expect(dialog.className).not.toContain('tw:border-rule-strong');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
  });
});


it('passes destructive intent from libraryPrompt through the real dialog adapter', async () => {
  const {readFileSync}=await import('node:fs');
  const ts=await import('typescript');
  const source=ts.createSourceFile('main.ts',readFileSync('src/main.ts','utf8'),ts.ScriptTarget.Latest,true);
  const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='libraryPrompt')!;
  const compiled=ts.transpileModule(fn.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const nativeDialog = (options: Parameters<typeof D.createDialog>[0]) => {
    const result = D.createDialog(options);
    Object.defineProperty(result.element, 'showModal', {value:()=>{result.element.open=true;}});
    Object.defineProperty(result.element, 'close', {value:()=>{result.element.open=false;result.element.dispatchEvent(new Event('close'));}});
    return result;
  };
  vi.stubGlobal('matchMedia', () => ({matches:true}));
  const prompt=new Function('document' ,'createInput','createButton','createDialog','t','requestAnimationFrame',compiled+';return libraryPrompt;')(document,D.createInput,D.createButton,nativeDialog,(key:string)=>key,()=>{});
  for(const title of ['Delete piece','Remove voice','Remove all sections']) {
    const result=prompt({title,danger:true,confirmLabel:'Remove'});
    const dialog=document.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.className).toContain('tw:border-danger');
    expect(dialog.querySelector('button[type=submit]')?.className).toContain('tw:bg-danger');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
    dialog.dispatchEvent(new Event('transitionend'));
    expect(await result).toBe('ok');
  }
  vi.unstubAllGlobals();
});


describe("D48 menu presentation policy", () => {
  it.each([1199, 1200, 1440].flatMap(width =>
    [false, true].flatMap(fine => [false, true].map(hover => ({ width, fine, hover })))
  ))("chooses once from width=$width fine=$fine hover=$hover", async ({ width, fine, hover }) => {
    document.documentElement.style.setProperty("--tw-breakpoint-transport", "1200px");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width") ? width >= 1200 : fine && hover,
    }));
    try {
      const { menuPresentation } = await import("../src/design-system/behavior/popover");
      expect(menuPresentation()).toBe(width >= 1200 && fine && hover ? "anchored" : "centered");
    } finally {
      vi.unstubAllGlobals();
      document.documentElement.style.removeProperty("--tw-breakpoint-transport");
    }
  });
});

describe("D49 server table query", () => {
  it("clamps the visible page against available pages including an empty set", async () => {
    const { clampedPageIndex } = await import("../src/admin-table-query");
    expect(clampedPageIndex(1, Math.ceil(30 / 30))).toBe(0);
    expect(clampedPageIndex(1, Math.ceil(31 / 30))).toBe(1);
    expect(clampedPageIndex(5, 0)).toBe(0);
    expect(clampedPageIndex(-1, 4)).toBe(0);
  });
  it.each(["user", "ensemble"])("wires search together with the %s filter, sort, limit and cursor", async filter => {
    const { adminTableParams } = await import("../src/admin-table-query");
    const params = adminTableParams({ filters: { [filter]: "detail-id" }, search: "Anna Testchor", pageSize: 30,
      sort: "name", descending: true, cursor: "page-2" });
    expect(Object.fromEntries(params)).toEqual({ [filter]: "detail-id", search: "Anna Testchor", limit: "30", sort: "name", direction: "desc", cursor: "page-2" });
    expect(adminTableParams({ filters: {}, search: "", pageSize: 10 }).has("search")).toBe(false);
  });
});

describe("D49 table render and request regressions", () => {
  it("resets a page-2 query before commit, debounces server search and retreats from a deleted final row", async () => {
    const { act, Profiler } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { AdminDataTable } = await import("../src/admin-data-table");
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let members = Array.from({ length: 31 }, (_, i) => ({ id: String(i), name: i === 30 ? "Anna" : `Member ${i}` }));
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      const url = new URL(path, "https://fixture.test");
      requests.push(url);
      const matches = members.filter(member => !url.searchParams.get("search") || `${member.name} Testchor`.includes(url.searchParams.get("search")!));
      const start = Number(url.searchParams.get("cursor") ?? 0), limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => ({ items: matches.slice(start, start + limit), nextCursor: start + limit < matches.length ? String(start + limit) : null }) };
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const commits: string[] = [];
    const render = async (search = "", revision = 0) => act(async () => root.render(createElement(Profiler, {
      id: "table", onRender: () => commits.push(`${host.querySelector('section')?.getAttribute('aria-busy')}:${host.textContent}`),
    }, createElement(AdminDataTable, { path: "memberships", columns: [{ id: "name", label: "Name", sort: "name" }],
      caption: "Members", search, filters: { ensemble: "detail-id" }, filtered: !!search, revision }))));
    const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(251); });
    const next = () => act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "Next")!.click(); });
    try {
      await render(); await settle();
      expect(requests).toHaveLength(1);
      await next(); await settle();
      expect(host.textContent).toContain("Page 2");
      expect(host.textContent).toContain("Anna");
      commits.length = 0;
      requests.length = 0;
      await render("A"); await render("Anna"); await render("Anna Testchor");
      expect(requests).toHaveLength(0);
      expect(commits.every(commit => commit.startsWith("true:") && !commit.includes("Page 2") && !commit.includes("Nothing matches"))).toBe(true);
      await settle();
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.get("search")).toBe("Anna Testchor");
      expect(requests[0].searchParams.has("cursor")).toBe(false);
      expect(requests[0].searchParams.get("ensemble")).toBe("detail-id");
      expect(host.textContent).toContain("Anna");
      await render(); await settle(); await next(); await settle();
      requests.length = 0;
      await act(async () => { host.querySelector("th button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(host.textContent).not.toContain("Page 2");
      expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
      await settle();
      expect(host.textContent).toContain("Page 1");
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("cursor")).toBe(false);
      expect(requests[0].searchParams.get("sort")).toBe("name");
      await next(); await settle();
      requests.length = 0;
      await act(async () => { const select = host.querySelector("select")!; select.value = "10"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(host.textContent).not.toContain("Page 2");
      expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
      await settle();
      expect(host.textContent).toContain("Page 1");
      expect(requests).toHaveLength(1);
      expect(requests[0].searchParams.has("cursor")).toBe(false);
      expect(requests[0].searchParams.get("limit")).toBe("10");
      await act(async () => { const select = host.querySelector("select")!; select.value = "30"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await settle(); await next(); await settle();
      members = members.slice(0, 30);
      commits.length = 0;
      await render("", 1); await settle(); await settle();
      expect(host.textContent).toContain("Page 1");
      expect(host.querySelectorAll("tbody tr")).toHaveLength(30);
      expect(commits.some(commit => commit.includes("No members") || commit.includes("Nothing matches"))).toBe(false);
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});


it('does not restore outgoing anchored menu focus over a replacement dialog', () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList);
  const anchor = document.createElement('button');
  document.body.append(anchor);
  let finishExit: (() => void) | undefined;
  const onClose = vi.fn();
  const menu = modal({anchor, onClose, exit: finish => {finishExit = finish;}});
  menu.api.close();
  const account = modal();
  const input = document.createElement('input');input.type = 'checkbox';
  account.dialog.append(input);input.focus();
  finishExit!();
  expect(document.activeElement).toBe(input);
  expect(account.dialog.open).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
  account.api.dispose();menu.api.dispose();vi.unstubAllGlobals();
});
