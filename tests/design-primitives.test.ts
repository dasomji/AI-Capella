// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import * as D from "../src/design-system/dom";
import * as R from "../src/design-system/react";
import { exitLegacyOverlay } from "../src/design-system/behavior/dialog";
import {
  openDialog,
  bindMenu,
  toast,
  getToast,
  dismissToast,
  subscribeToast,
} from "../src/design-system/behavior";
afterEach(() => {
  D.closeOverlay();
  dismissToast();
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
    D.updateButton(button, { busy: false, variant: "pill" });
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
    vi.advanceTimersByTime(3300);
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
      variant: "pill",
      layout: "tw:ml-auto",
    });
    D.updateButton(button, { busy: true });
    expect(button.className).toContain("tw:rounded-chip");
    expect(button.className).toContain("tw:ml-auto");
    const icon = D.createIconButton({
      label: "Close",
      variant: "small",
      layout: "tw:self-end",
    });
    D.updateButton(icon, { busy: true });
    expect(icon.className).toContain("tw:size-32");
    expect(icon.className).toContain("tw:self-end");
    expect(icon.dataset.ds).toBe("icon-button");
  });
  it("inherits React Field/Table variants and binds DOM table parts once", () => {
    const field = renderToString(
      createElement(R.Field, {
        variant: "admin",
        label: "Name",
        children: (props) => createElement(R.Input, { ...props }),
      }),
    );
    expect(field).toContain('data-field-variant="admin"');
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
      "tw:max-account:block",
    );
    const parts = D.createTableParts({ variant: "records" });
    expect(parts.cell("Name").className).toContain("tw:max-account:block");
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
    expect(host.textContent).toBe("Error");
    vi.advanceTimersByTime(299);
    expect(host.textContent).toBe("Error");
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

  it("waits for transitionend or the 160ms fallback and skips waiting under reduced motion", () => {
    vi.useFakeTimers();
    const finish = vi.fn(),
      root = document.createElement("div");
    root.innerHTML = '<div class="overlay-panel"></div>';
    root.className = "open";
    exitLegacyOverlay(root, finish);
    expect(root.classList.contains("closing")).toBe(true);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(159);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(finish).toHaveBeenCalledOnce();
    finish.mockClear();
    exitLegacyOverlay(root, finish);
    root.firstElementChild!.dispatchEvent(
      new Event("transitionend", { bubbles: true }),
    );
    expect(finish).toHaveBeenCalledOnce();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    finish.mockClear();
    exitLegacyOverlay(root, finish);
    expect(finish).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
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

describe("shared sheet motion", () => {
  it("retains the modal and scroll lock through the exit, then restores focus", () => {
    vi.useFakeTimers();
    const { dialog, api, opener } = modal({ motion: "sheet" });
    expect(dialog.dataset.sheetState).toBe("entering");
    vi.advanceTimersByTime(20);
    expect(dialog.dataset.sheetState).toBe("open");
    dialog.style.transitionDuration = "0.22s";
    api.close();
    expect(dialog.dataset.sheetState).toBe("closing");
    expect(dialog.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const event = new Event("transitionend");
    Object.defineProperty(event, "propertyName", { value: "transform" });
    dialog.dispatchEvent(event);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(dialog.hasAttribute("data-sheet-state")).toBe(false);
  });
  it("routes swipe dismissal through busy cancellation and releases touch listeners", () => {
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
    expect(dialog.style.transform).toContain("192px");
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
    expect(onCancel).toHaveBeenCalledWith("swipe");
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
      expect(dialog.dataset.sheetState).toBe("open");
      api.close();
      expect(dialog.open).toBe(false);
      const next = modal({ motion: "sheet" });
      next.api.dispose();
      vi.runAllTimers();
      expect(next.dialog.hasAttribute("data-sheet-state")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
