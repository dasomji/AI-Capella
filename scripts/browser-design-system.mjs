/** Run in /dev/design-system with Playwright page.evaluate or the shared browser evaluator.
 * Tests real emitted CSS and native focus behavior; throws on a mismatch. No server setup.
 */
export async function verifyDesignSystemPage({ specimens } = {}) {
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
  for (const name of ["navigation/admin", "workspace/wordmark", "workspace/page", "workspace/definitions", "button-size/compact/quiet/default", "toggle-group/admin-language", "dialog/admin-reason", "dialog/admin-confirm", "table/records", "table/metrics", "status/admin", "badge/admin"])
    if (!rows.some(row => row.dataset.specimen === name)) throw Error("Missing admin parity specimen: " + name);
  for (const name of ["field-group/transcription", "card/tour", "card/power-hint", "dialog/domain-sheet", "dialog/transcription", "dialog/transcription-review", "menu/job", "switch-native/comparison/false"])
    if (!rows.some(row => row.dataset.specimen === name)) throw Error("Missing isolated DOM parity specimen: " + name);
  const mismatches = [];
  // Read-only record rows contain controls; only keyboard-openable rows are commands.
  for (const renderer of ["react", "dom"]) {
    const record = document.querySelector(`[data-specimen="table/records"] [data-renderer="${renderer}"] tbody tr`);
    if (!record || getComputedStyle(record).cursor === "pointer")
      throw Error("Static record row has command appearance: " + renderer);
    record.tabIndex = 0;
    record.dataset.href = "/example";
    if (getComputedStyle(record).cursor !== "pointer")
      throw Error("Openable record row missing command appearance: " + renderer);
    record.removeAttribute("tabindex");
    record.removeAttribute("data-href");
  }
  let elements = 0,
    properties = 0,
    attributes = 0;
  const checkedRows = specimens ? rows.filter(row => specimens.includes(row.dataset.specimen)) : rows;
  if (specimens && checkedRows.length !== specimens.length) throw Error("Requested comparison specimen missing");
  for (const row of checkedRows) {
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
        for (const prop of [...left].filter(prop => !prop.startsWith("--"))) {
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
    "--ds-control-height-touch",
  );
  document.documentElement.style.setProperty("--ds-control-height-touch", "57px");
  const after = buttons.map((e) => getComputedStyle(e).minHeight);
  if (original)
    document.documentElement.style.setProperty("--ds-control-height-touch", original);
  else document.documentElement.style.removeProperty("--ds-control-height-touch");
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
    specimens: checkedRows.length,
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
  const escaped = new Promise(resolve => modal.element.addEventListener("close", resolve, {once: true}));
  modal.element.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  await escaped;
  assert(!modal.element.open && !opener.inert, "Escape cleanup");
  assert(document.activeElement === opener, "Focus return");
  const next = D.createSheet({ title: "Sheet", body: "Outside closes" });
  next.open();
  const closed = new Promise(resolve => next.element.addEventListener("close", resolve, { once: true }));
  next.element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: -1,
      clientY: -1,
    }),
  );
  await closed;
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

export async function verifyDesignSystemContexts({ specimens } = {}) {
  await document.fonts.ready;
  const style = document.createElement("style");
  style.textContent =
    ".ds-specimen-pair>[data-renderer]{width:100%!important;max-width:none!important;padding:0!important;min-height:0!important}[data-specimen] *,[data-specimen] *::before,[data-specimen] *::after{animation:none!important;transition:none!important}";
  document.head.append(style);
  const matches = el => !specimens || specimens.includes(el.closest('[data-specimen]').dataset.specimen);
  const a = [...document.querySelectorAll('[data-renderer="react"]')].filter(matches),
    b = [...document.querySelectorAll('[data-renderer="dom"]')].filter(matches);
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
          for (const prop of [...left].filter(prop => !prop.startsWith("--"))) {
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
  const F = await import("/src/design-system/browser-fixture.tsx");
  const results = [];
  const assert = (condition, message) => {
    if (!condition) throw Error(message);
    results.push(message);
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (condition, message) => {
    const deadline = performance.now() + 2000;
    while (!condition()) {
      if (performance.now() >= deadline) throw Error(message);
      await wait(16);
    }
  };
  const focusAudit = document.createElement("div");
  focusAudit.style.textTransform = "uppercase";
  document.body.append(focusAudit);
  try {
    for (const [variant, offset] of [["standard", "4px"], ["player-play", "2px"]]) {
      const button = D.createButton({ variant, text: "Focus offset" });
      focusAudit.append(button);
      button.focus({ preventScroll: true });
      assert(button.matches(":focus-visible"), `${variant} fixture has keyboard focus`);
      assert(getComputedStyle(button).outlineOffset === offset, `${variant} focus offset is ${offset}`);
    }
    const input = D.createInput({ variant: "admin", value: "MixedCase" });
    const field = D.createField({ variant: "admin", label: "MixedCase", control: input });
    focusAudit.append(field);
    assert(getComputedStyle(field).textTransform === "none" && getComputedStyle(field.querySelector("label")).textTransform === "none" && getComputedStyle(input).textTransform === "none", "Admin field and control retain normal casing inside uppercase parent");
  } finally { focusAudit.remove(); }
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
    await until(() => fixture.calls.close === 1, "React fade completes cancellation");
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
  await until(() => !nested.element.isConnected, "Nested centered confirm exit completes");
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
  await until(() => !parent.element.isConnected, "Parent centered detail exit completes");
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
  await until(() => !safari.element.isConnected, "Safari centered dialog exit completes");
  assert(
    document.activeElement === opener,
    "minor9 pointer opener focus return without activeElement",
  );
  const content = document.createElement("div");
  content.textContent = "Sheet contents";
  const sheet = D.createSheet({ title: "Exit regression", content, behavior: { opener } });
  sheet.open();
  const close = sheet.close;
  await until(() => sheet.element.dataset.panelState === "open", "Sheet enters open state");
  const nativeSheet = sheet.element;
  B.toast("Sheet toast then close");
  close();
  assert(
    nativeSheet.open && nativeSheet.isConnected && nativeSheet.dataset.panelState === "closing",
    "M2 sheet remains in top layer during exit",
  );
  assert(
    document.getElementById("toast").textContent === "Sheet toast then close",
    "M1 sheet toast survives close request",
  );
  await until(() => !nativeSheet.isConnected, "Sheet exit completes via transition or duration fallback");
  assert(
    !nativeSheet.isConnected &&
      document.getElementById("toast").getClientRects().length > 0,
    "M1/M2 sheet completes exit and toast persists",
  );
  // Swipe uses the existing touch transport, real layout and the same exit lifecycle.
  const swipeSheet = D.createSheet({ title: "Swipe regression", content: document.createElement("div"), behavior: { opener } });
  swipeSheet.open();
  const swipeClose = swipeSheet.close;
  await wait(240);
  const swipeDialog = swipeSheet.element, panel = swipeDialog;
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
    swipeDialog.open && swipeDialog.dataset.panelState === "open",
    "D12 centered dialog ignores swipe gestures",
  );
  swipeClose();
  await until(() => !swipeDialog.isConnected, "Centered dialog closes through native lifecycle");
  assert(!swipeDialog.isConnected, "D12 explicit dismissal completes");
  B.dismissToast();
  assert(
    document.getElementById("toast").textContent === "Sheet toast then close",
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
  const D = await import("/src/design-system/dom/index.ts");
  const sheet = D.createSheet({ title: "Reduced motion", content: document.createElement("div") });
  sheet.open();
  const close = sheet.close;
  const dialog = document.querySelector("dialog:modal");
  close();
  if (dialog.open || dialog.isConnected)
    throw Error("Reduced motion exit must be immediate");
  return { reducedMotionImmediate: true };
}


/** D08–D11/D15/D17: real emitted sizes and feedback in both adapters. */
export async function verifyOwnerComponents() {
  const records=[];
  const {matchBreakpoint}=await import('/src/design-system/theme/index.ts');
  const touch=matchMedia('(any-pointer: coarse)').matches || matchBreakpoint('panel','max').matches;
  for(const renderer of ['react','dom']) {
    for(const size of ['standard','compact','full-width','touch']) {
      const button=document.querySelector(`[data-specimen="button-size/${size}/primary/default"] [data-renderer="${renderer}"] button`);
      if(!button) throw Error('Missing decided button size '+size);
      const rect=button.getBoundingClientRect(), css=getComputedStyle(button);
      const expected=size==='compact'&&!touch?32:44;
      if(rect.height<expected || rect.width<expected) throw Error(`${renderer} ${size} target ${rect.width}×${rect.height} below ${expected}`);
      if(size==='full-width' && Math.abs(rect.width-button.parentElement.getBoundingClientRect().width)>1) throw Error('Full-width size does not fill its container');
      records.push({renderer,size,width:rect.width,height:rect.height,radius:css.borderRadius});
    }
    for(const density of ['standard','compact','touch']) {
      for(const kind of ['field','checkbox','switch','icon-button']) {
        const root=document.querySelector(`[data-specimen="${kind}-size/${density}"] [data-renderer="${renderer}"]`);
        const target=kind==='field'?root.querySelector('input'):kind==='checkbox'?root.querySelector('label'):root.querySelector('button');
        const rect=target.getBoundingClientRect();
        const expected=density==='compact'&&!touch?32:44;
        if(rect.height<expected || rect.width<expected) throw Error(`${renderer} ${kind} ${density} target ${rect.width}×${rect.height} below ${expected}`);
        if(kind==='field') {
          const error=root.querySelector('[role=alert]');
          if(!error || !target.getAttribute('aria-describedby')?.split(' ').includes(error.id) || target.getAttribute('aria-invalid')!=='true') throw Error('Field feedback association lost');
          if(getComputedStyle(error).textAlign==='center') throw Error('Field error is detached from writing line');
          if(error.getBoundingClientRect().top < rect.bottom-1) throw Error('Error must follow field');
        }
      }
    }
    const accountPassword=document.querySelector(`[data-specimen="field/account-password/input/normal"] [data-renderer="${renderer}"] input`);
    if(accountPassword.getBoundingClientRect().height<44) throw Error('Account password must use shared target height');
    for(const variant of ['standard','small','transcription','admin-close','admin-copy','library-menu']) {
      const icon=document.querySelector(`[data-specimen="icon-button/${variant}"] [data-renderer="${renderer}"] button`);
      const r=icon.getBoundingClientRect();if(r.width<44||r.height<44)throw Error(`${renderer} ${variant} icon target below 44`);
    }
    if(touch)for(const variant of ['domain-language','transcription-language','review-item','account-link','password-toggle']) {
      const action=document.querySelector(`[data-specimen="button/${variant}/secondary/default"] [data-renderer="${renderer}"] button`);
      const r=action.getBoundingClientRect();if(r.width<44||r.height<44)throw Error(`${renderer} ${variant} touch target below 44`);
    }
    const normal=document.querySelector(`[data-specimen="field/ruled/input/normal"] [data-renderer="${renderer}"] input`);
    const boxed=document.querySelector(`[data-specimen="field/search/input/normal"] [data-renderer="${renderer}"] input`);
    if(getComputedStyle(normal).borderTopWidth!=='0px'||getComputedStyle(normal).borderBottomWidth==='0px') throw Error('Normal forms must use writing lines');
    if(getComputedStyle(boxed).borderTopWidth==='0px') throw Error('Search must use a box');
    const luminance=paint=>{
      const rgb=paint.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});
      return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
    };
    for(const checked of [false,true]) {
      const track=document.querySelector(`[data-specimen="switch/shared-device/${checked}"] [data-renderer="${renderer}"] [role=switch]`);
      const thumb=track.querySelector('span'),a=luminance(getComputedStyle(track).backgroundColor),b=luminance(getComputedStyle(thumb).backgroundColor);
      if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<3)throw Error(`${renderer} switch ${checked} thumb contrast below 3:1`);
    }
    const shared=document.querySelector(`[data-specimen="switch/shared-device/true"] [data-renderer="${renderer}"] [role=switch]`);
    if(!shared || getComputedStyle(shared).display==='none') throw Error('Immediate shared-device setting must show a switch');
    const jobs=document.querySelector(`[data-specimen="empty/jobs-hidden"] [data-renderer="${renderer}"] section`);
    if(getComputedStyle(jobs).display!=='none') throw Error('Irrelevant scan work must remain hidden');
  }
  return {touch,records};
}
