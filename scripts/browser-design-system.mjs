/** Run in /dev/design-system with Playwright page.evaluate or the shared browser evaluator.
 * Tests real emitted CSS and native focus behavior; throws on a mismatch. No server setup.
 */
export async function verifyDesignSystemPage() {
  for (
    let attempt = 0;
    attempt < 100 && !document.querySelector("[data-renderer=dom] button");
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  await document.fonts.ready;
  const sheet = document.createElement("style");
  sheet.textContent =
    "[data-specimen] *,[data-specimen] *::before,[data-specimen] *::after {animation:none!important;transition:none!important}";
  document.head.append(sheet);
  const rows = [...document.querySelectorAll("[data-specimen]")];
  if (rows.length < 180) throw Error("Showcase missing primitives");
  for (const name of ["button/account-link/secondary/default", "button/password-toggle/secondary/default", "field/ruled-account/input/invalid", "control-group/trailing-action", "toggle-group/language-separated", "status/account/error"])
    if (!rows.some(row => row.dataset.specimen === name)) throw Error("Missing account parity specimen: " + name);
  for (const name of ["navigation/admin", "workspace/page", "workspace/definitions", "button/dense-sort/secondary/default", "toggle-group/admin-language", "dialog/admin-reason", "dialog/admin-confirm", "table/records", "table/metrics", "status/admin", "badge/admin"])
    if (!rows.some(row => row.dataset.specimen === name)) throw Error("Missing admin parity specimen: " + name);
  const mismatches = [];
  let elements = 0,
    properties = 0,
    attributes = 0;
  for (const row of rows) {
    const a = row.querySelector('[data-renderer="react"]'),
      b = row.querySelector('[data-renderer="dom"]');
    const react = [...a.querySelectorAll("*")],
      dom = [...b.querySelectorAll("*")];
    if (react.length !== dom.length) {
      mismatches.push({
        name: row.dataset.specimen,
        structure: [react.length, dom.length],
      });
      continue;
    }
    // Compare all attributes, resolving generated association IDs to their part index.
    const attrs = (el, nodes) =>
      Object.fromEntries(
        [...el.attributes]
          .filter(
            (a) =>
              !["class", "style", "value", "checked", "selected"].includes(
                a.name,
              ),
          )
          .map((a) => {
            let value = a.value;
            if (a.name === "id") value = "part-" + nodes.indexOf(el);
            if (
              [
                "for",
                "aria-labelledby",
                "aria-describedby",
                "aria-controls",
              ].includes(a.name)
            )
              value = value
                .split(" ")
                .map((id) => {
                  const part = nodes.find((n) => n.id === id);
                  return part ? "part-" + nodes.indexOf(part) : id;
                })
                .join(" ");
            return [a.name, value];
          })
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    for (let index = 0; index < react.length; index++) {
      attributes++;
      const left = attrs(react[index], react),
        right = attrs(dom[index], dom);
      if (
        react[index].tagName !== dom[index].tagName ||
        JSON.stringify(left) !== JSON.stringify(right)
      )
        mismatches.push({
          name: row.dataset.specimen,
          index,
          attributes: { left, right },
          tags: [react[index].tagName, dom[index].tagName],
        });
      // Native state is a property in DOM and an attribute during React SSR/hydration.
      for (const key of [
        "value",
        "checked",
        "disabled",
        "required",
        "readOnly",
      ])
        if (key in react[index] && react[index][key] !== dom[index][key])
          mismatches.push({
            name: row.dataset.specimen,
            index,
            state: key,
            left: react[index][key],
            right: dom[index][key],
          });
    }
    for (let index = 0; index < react.length; index++)
      for (const pseudo of [null, "::before", "::after"]) {
        const left = getComputedStyle(react[index], pseudo),
          right = getComputedStyle(dom[index], pseudo);
        elements++;
        for (const prop of [...left]) {
          properties++;
          if (left.getPropertyValue(prop) !== right.getPropertyValue(prop))
            mismatches.push({
              name: row.dataset.specimen,
              index,
              pseudo,
              prop,
              left: left.getPropertyValue(prop),
              right: right.getPropertyValue(prop),
            });
        }
      }
  }
  const normal = document.querySelector(
    '[data-specimen="button/standard/secondary/default"]',
  );
  const buttons = [...normal.querySelectorAll("button")],
    previous = buttons.map((e) => getComputedStyle(e).minHeight);
  const original = document.documentElement.style.getPropertyValue(
    "--ds-control-height",
  );
  document.documentElement.style.setProperty("--ds-control-height", "57px");
  const after = buttons.map((e) => getComputedStyle(e).minHeight);
  if (original)
    document.documentElement.style.setProperty("--ds-control-height", original);
  else document.documentElement.style.removeProperty("--ds-control-height");
  if (
    after.length !== 2 ||
    !after.every((value) => value === "57px") ||
    previous.some((value) => value === "57px")
  )
    throw Error(
      "Token-only mutation failed " + JSON.stringify({ previous, after }),
    );
  sheet.remove();
  return {
    theme: document.documentElement.dataset.theme,
    specimens: rows.length,
    elements,
    properties,
    attributes,
    mismatches,
    tokenChange: { previous, after },
  };
}
export async function verifyDesignSystemBehavior() {
  const D = await import("/src/design-system/dom/index.ts");
  const B = await import("/src/design-system/behavior/index.ts");
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
  };
  const opener = document.createElement("button");
  opener.textContent = "Opener";
  document.body.append(opener);
  opener.focus();
  const first = D.createButton({ text: "First" }),
    last = D.createButton({ text: "Last" });
  const content = document.createElement("div");
  content.append(first, last);
  const modal = D.createDialog({
    title: "Behavior",
    content,
    behavior: { opener, busy: true },
  });
  modal.open();
  assert(document.activeElement === first, "Initial focus");
  assert(!opener.inert, "Native modal must not author inert on portals");
  last.focus();
  last.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(document.activeElement === first, "Forward focus wrap");
  first.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(document.activeElement === last, "Backward focus wrap");
  modal.element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(modal.element.open, "Busy Escape must stay open");
  modal.element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: -1,
      clientY: -1,
    }),
  );
  assert(modal.element.open, "Busy outside must stay open");
  modal.setBusy(false);
  modal.element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(!modal.element.open && !opener.inert, "Escape cleanup");
  assert(document.activeElement === opener, "Focus return");
  const next = D.createSheet({ title: "Sheet", body: "Outside closes" });
  next.open();
  next.element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: -1,
      clientY: -1,
    }),
  );
  assert(!next.element.open, "Outside policy");
  let selected = 0;
  const menu = D.createMenu({
    label: "Actions",
    items: [
      { label: "Alpha", onSelect: () => selected++ },
      { label: "Disabled", disabled: true, onSelect: () => selected++ },
      { label: "Beta", onSelect: () => selected++ },
    ],
  });
  document.body.append(menu.element);
  const items = menu.element.querySelectorAll("button");
  items[0].focus();
  menu.element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(document.activeElement === items[2], "Skip disabled menu item");
  menu.element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(selected === 1, "Keyboard menu activation");
  const busy = D.createButton({
    text: "Busy",
    busy: true,
    onClick: () => selected++,
  });
  document.body.append(busy);
  busy.focus();
  busy.click();
  assert(
    selected === 1 && document.activeElement === busy && !busy.disabled,
    "Focusable busy guard",
  );
  const existingHost = document.getElementById("toast");
  B.toast("<unsafe text>");
  assert(document.querySelectorAll("#toast").length === 1, "Singleton toast");
  assert(
    document.querySelector("#toast").textContent === "<unsafe text>",
    "Safe toast text",
  );
  B.dismissToast();
  if (!existingHost) document.getElementById("toast")?.remove();
  menu.dispose();
  menu.element.remove();
  opener.remove();
  busy.remove();
  return {
    dialogFocus: true,
    inert: true,
    tabWrap: true,
    focusReturn: true,
    escape: true,
    outside: true,
    busyCancel: true,
    menuKeyboard: true,
    busyButton: true,
    toast: true,
  };
}

export async function verifyDesignSystemContexts() {
  await document.fonts.ready;
  const style = document.createElement("style");
  style.textContent =
    ".ds-specimen-pair>[data-renderer]{width:100%!important;max-width:none!important;padding:0!important;min-height:0!important}[data-specimen] *,[data-specimen] *::before,[data-specimen] *::after{animation:none!important;transition:none!important}";
  document.head.append(style);
  const a = [...document.querySelectorAll('[data-renderer="react"]')],
    b = [...document.querySelectorAll('[data-renderer="dom"]')];
  const mismatches = [];
  let properties = 0;
  try {
    for (const el of a) el.classList.add("auth-shell");
    for (const el of b) el.classList.add("admin-shell");
    for (let i = 0; i < a.length; i++) {
      const react = [...a[i].querySelectorAll("*")],
        dom = [...b[i].querySelectorAll("*")];
      for (let j = 0; j < react.length; j++)
        for (const pseudo of [null, "::before", "::after"]) {
          const left = getComputedStyle(react[j], pseudo),
            right = getComputedStyle(dom[j], pseudo);
          for (const prop of [...left]) {
            properties++;
            if (left.getPropertyValue(prop) !== right.getPropertyValue(prop))
              mismatches.push({
                name: a[i].closest("[data-specimen]").dataset.specimen,
                index: j,
                pseudo,
                prop,
                left: left.getPropertyValue(prop),
                right: right.getPropertyValue(prop),
              });
          }
        }
    }
  } finally {
    for (const el of a) el.classList.remove("auth-shell");
    for (const el of b) el.classList.remove("admin-shell");
    style.remove();
  }
  return {
    theme: document.documentElement.dataset.theme,
    properties,
    mismatches,
  };
}

/** Native-browser regressions for B1, M1–M3/M5 and minor behavior contracts. */
export async function verifyP3ReviewFixes() {
  const D = await import("/src/design-system/dom/index.ts");
  const B = await import("/src/design-system/behavior/index.ts");
  const L = await import("/src/ui.ts");
  const F = await import("/src/design-system/browser-fixture.tsx");
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
    results.push(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const opener = document.createElement("button");
  opener.textContent = "Regression opener";
  document.body.append(opener);
  opener.focus();
  const fixture = F.mountReactFixture();
  await wait(60);
  try {
    const dialog = document.getElementById("p3-react-dialog"),
      first = document.getElementById("p3-react-first"),
      last = document.getElementById("p3-react-last");
    assert(
      dialog.open && dialog.parentElement === document.body,
      "B1 React portal modal opens",
    );
    assert(document.activeElement === first, "B1 React initial focus");
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );
    assert(document.activeElement === first, "B1 React forward Tab wrap");
    first.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    assert(document.activeElement === last, "B1 React backward Tab wrap");
    assert(
      fixture.calls.close === 0 && fixture.calls.cancel === 0,
      "minor6 StrictMode silent replay",
    );
    B.toast("React toast then close");
    const host = document.getElementById("toast");
    fixture.render(false);
    await wait(30);
    assert(
      host.isConnected &&
        host.parentElement === document.body &&
        host.getClientRects().length > 0 &&
        host.textContent === "React toast then close",
      "M1 React toast survives controlled close",
    );
    assert(document.activeElement === opener, "B1 React focus returns");
    assert(
      fixture.calls.close === 0,
      "minor6 parent close has no notification",
    );
    fixture.render(true);
    await wait(20);
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    assert(
      fixture.calls.close === 1 && fixture.calls.cancel === 1,
      "minor6 cancellation and completed close once",
    );
  } finally {
    fixture.dispose();
  }
  const parent = D.createDrawer({
    title: "Parent drawer",
    content: D.createButton({
      text: "Confirm",
      attrs: { id: "p3-parent-action" },
    }),
    behavior: { opener },
  });
  parent.open();
  const nested = D.createConfirmDialog({
    title: "Nested confirm",
    content: D.createButton({ text: "Cancel" }),
  });
  nested.open();
  assert(
    parent.element.open && nested.element.open,
    "minor9 nested confirm stacks above drawer",
  );
  nested.close();
  assert(
    parent.element.open &&
      document.activeElement === parent.element.querySelector("button"),
    "minor9 nested focus returns inside drawer",
  );
  const portal = F.mountReactFixture();
  await wait(30);
  assert(
    document.getElementById("p3-react-dialog").open &&
      !document.getElementById("p3-react-fixture").inert,
    "minor9 later React portal stays operable",
  );
  portal.dispose();
  B.toast("Toast pointer");
  document
    .getElementById("toast")
    .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  assert(parent.element.open, "minor9 toast pointer does not cancel drawer");
  parent.close();
  // Simulate Safari pointer activation leaving activeElement on body.
  opener.focus();
  opener.blur();
  opener.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  const safari = D.createDialog({
    title: "Safari",
    content: D.createButton({ text: "Done" }),
  });
  safari.open();
  safari.close();
  assert(
    document.activeElement === opener,
    "minor9 pointer opener focus return without activeElement",
  );
  const content = document.createElement("div");
  content.textContent = "Sheet contents";
  const close = L.openSheet("Exit regression", content, opener);
  await wait(80);
  const legacy = document.querySelector("dialog:modal");
  B.toast("Legacy toast then close");
  close();
  assert(
    legacy.open && legacy.isConnected && legacy.querySelector(".closing"),
    "M2 legacy remains in top layer during exit",
  );
  assert(
    document.getElementById("toast").textContent === "Legacy toast then close",
    "M1 legacy toast survives close request",
  );
  await wait(190);
  assert(
    !legacy.isConnected &&
      document.getElementById("toast").getClientRects().length > 0,
    "M1/M2 legacy completes exit and toast persists",
  );
  // Swipe uses the existing touch transport, real layout and the same exit lifecycle.
  const swipeClose = L.openSheet(
    "Swipe regression",
    document.createElement("div"),
    opener,
  );
  await wait(240);
  const swipeDialog = document.querySelector("dialog:modal"),
    panel = swipeDialog.querySelector(".sheet");
  const touch = (type, y) =>
    panel.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches:
          type === "touchend"
            ? []
            : [
                new Touch({
                  identifier: 1,
                  target: panel,
                  clientY: y,
                  clientX: 30,
                }),
              ],
      }),
    );
  touch("touchstart", 40);
  touch("touchmove", 240);
  touch("touchend", 240);
  await wait(25);
  assert(
    swipeDialog.open && swipeDialog.querySelector(".closing"),
    "M2 swipe starts exit transition",
  );
  await wait(180);
  assert(!swipeDialog.isConnected, "M2 swipe completes dismissal");
  swipeClose();
  B.dismissToast();
  assert(
    document.getElementById("toast").textContent === "Legacy toast then close",
    "M1 text retained during fade",
  );
  await wait(310);
  assert(
    document.getElementById("toast").textContent === "",
    "M1 fade completion clears text",
  );
  const select = D.createSelect({
      variant: "domain",
      options: [{ value: "one", label: "One" }],
    }),
    checkbox = D.createCheckbox({ label: "Native" }),
    boundary = document.createElement("div");
  boundary.append(select, checkbox);
  document.body.append(boundary);
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  assert(
    scheme ===
      (document.documentElement.dataset.theme === "parchment"
        ? "light"
        : "dark"),
    "M3 explicit theme color-scheme",
  );
  assert(
    getComputedStyle(select).colorScheme === scheme &&
      getComputedStyle(checkbox.querySelector("input")).colorScheme === scheme,
    "M3 native select and checkbox inherit theme scheme",
  );
  boundary.style.visibility = "hidden";
  boundary.style.pointerEvents = "none";
  boundary.style.accentColor = "auto";
  boundary.style.printColorAdjust = "exact";
  assert(
    getComputedStyle(select).visibility === "hidden" &&
      getComputedStyle(select).pointerEvents === "none" &&
      getComputedStyle(select).printColorAdjust === "exact",
    "M3 hidden and pointer-disabled ancestor inheritance",
  );
  boundary.remove();
  const menu = F.mountReactMenuFixture();
  try {
    const trigger = menu.container.querySelector("button");
    trigger.click();
    await wait(30);
    const buttons = menu.container.querySelectorAll('[role^="menuitem"]');
    assert(
      document.activeElement === buttons[0] &&
        trigger.getAttribute("aria-expanded") === "true",
      "minor5 React Menu trigger opens and focuses",
    );
    buttons[1].focus();
    menu.render();
    await wait(20);
    assert(
      buttons[1].tabIndex === 0 && buttons[0].tabIndex === -1,
      "minor7 React rerender preserves roving item",
    );
    const key = (key) =>
      buttons[1].dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    for (const letter of "new e") key(letter);
    assert(
      document.activeElement === buttons[1] && menu.selected === 0,
      "minor7 multiword typeahead does not activate on space",
    );
    buttons[2].click();
    assert(menu.selected === 0, "M5 React busy menu click guarded");
    key("Escape");
    await wait(20);
    assert(
      document.activeElement === trigger &&
        trigger.getAttribute("aria-expanded") === "false",
      "minor5 React Menu Escape returns focus",
    );
  } finally {
    menu.dispose();
  }
  opener.remove();
  B.dismissToast();
  return { results, count: results.length };
}

/** Call in a browser context with reducedMotion: reduce. */
export async function verifyP3ReducedMotion() {
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    throw Error("Requires reduced-motion browser context");
  const L = await import("/src/ui.ts");
  const close = L.openSheet("Reduced motion", document.createElement("div"));
  const dialog = document.querySelector("dialog:modal");
  close();
  if (dialog.open || dialog.isConnected)
    throw Error("Reduced motion exit must be immediate");
  return { reducedMotionImmediate: true };
}
