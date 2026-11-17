import { bindRowMenu } from "./design-system/behavior";
import { transcriptionJobRecipe } from "./design-system/recipes/shell";
import {
  createButton,
  updateButton as updatePrimitiveButton,
  createInput,
  createField,
  createFieldGroup,
  createSwitch,
  updateSwitch,
  createDialog,
  createIconButton,
  createMenu,
  type ButtonOptions,
} from "./design-system/dom";
import { matchBreakpoint } from "./design-system/theme";
import { isOffline } from "./offline-state";
import { photoThumbnail } from "./photo-thumbnail";
import type { Socket } from "socket.io-client";
import { api, ApiError } from "./domain-client";
import { ensembleById, canEditPieces } from "./ensembles";
import { icon, type IconName } from "./icons";
import { lang, tr } from "./i18n";
import { safeSvg } from "./safe-svg";
import {
  jobPresentation,
  reorderPhotos,
  reviewItems,
  type TranscriptionJob,
  type ReviewItem,
} from "./transcription-model";
import type { MeasureSource, ValidationReport } from "./score-validation";
const canTranscribe = (id: string) => {
  const e = ensembleById(id);
  return !isOffline() && !!e && (e.isLead || e.capabilities.transcribe);
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function button(
  text: string,
  run: () => void,
  options: Omit<ButtonOptions, "text"> = {},
) {
  return createButton({ text, onClick: run, ...options });
}
// Keep the existing class hooks used by browser journeys and screen layout.
// Appearance and state still come exclusively from the shared builder.
const transcriptionControlRecipes = new WeakMap<HTMLButtonElement, string>();
function attachTranscriptionControl(button: HTMLButtonElement, recipe: string) {
  transcriptionControlRecipes.set(button, recipe);
  button.classList.add(...recipe.split(" "));
}
function updateButton(button: HTMLButtonElement, options: Parameters<typeof updatePrimitiveButton>[1]) {
  const recipe = transcriptionControlRecipes.get(button);
  updatePrimitiveButton(button, options);
  if (recipe) button.classList.add(...recipe.split(" "));
}
function errorText(e: unknown) {
  return tr(e instanceof ApiError ? e.code : "error");
}
async function resource(path: string, signal?: AbortSignal) {
  const r = await fetch("/api" + path, { cache: "no-store", signal });
  if (!r.ok) {
    const d = await r.json();
    throw new ApiError(d.code, r.status);
  }
  return r;
}
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function modal(title: string, wide = false) {
  const modal = createDialog({
      title,
      variant: wide ? "transcription-review" : "transcription",
      behavior: {
        opener: document.activeElement,
        outside: "ignore",
        busyCancel: "allow",
      },
    }),
    d = modal.element;
  d.classList.add(...transcriptionJobRecipe().dialog.split(" "));
  if (wide) d.classList.add("transcription-review");
  const close = createIconButton({
    variant: "transcription",
    label: tr("close"),
    icon: document.createTextNode("×"),
    onClick: () => modal.requestClose(),
  });
  close.classList.add("tx-close");
  d.querySelector("header")!.append(close);
  modal.open();
  return d;
}
interface Upload {
  file: File;
  url?: string;
  id?: string;
  pages?: number;
  error?: string;
  progress: number;
}
export function installTranscription(options: {
  beforeListen: () => boolean;
  reviewCleanup: () => () => void;
  socket: Socket;
  ensemble: () => string;
  entry: HTMLElement;
  jobs: HTMLElement;
  open: (xml: string, title: string, id?: string) => Promise<void>;
}) {
  let scope = "",
    generation = 0,
    refreshSequence = 0,
    jobs: TranscriptionJob[] = [],
    dialog: HTMLDialogElement | undefined,
    importButton: HTMLButtonElement | undefined,
    permissionNote: HTMLElement | undefined;
  const entry = options.entry,
    host = options.jobs;
  host.classList.add(...transcriptionJobRecipe().list.split(" "));
  const socket = options.socket;
  const jobMenus: (() => void)[] = [];
  const base = () => `/ensembles/${scope}`;
  async function refresh() {
    const e = scope,
      g = generation,
      sequence = ++refreshSequence;
    if (!canTranscribe(e)) return;
    try {
      const rows = await api<TranscriptionJob[]>(`${base()}/transcriptions`);
      if (g !== generation || sequence !== refreshSequence || !canTranscribe(e))
        return;
      if (JSON.stringify(jobs) !== JSON.stringify(rows)) {
        jobs = rows;
        renderJobs();
      }
    } catch (e) {
      if (g === generation) {
        host.replaceChildren(el("p", errorText(e), transcriptionJobRecipe().error));
      }
    }
  }
  function sync() {
    const next = options.ensemble();
    if (scope !== next) {
      scope = next;
      generation++;
      dialog?.close();
      jobs = [];
      host.replaceChildren();
    }
    const allowed = canTranscribe(scope);
    entry.hidden = !allowed;
    host.hidden = !allowed;
    if (!allowed) {
      generation++;
      jobs = [];
      host.replaceChildren();
      dialog?.close();
    }
    if (importButton) {
      updateButton(importButton, {
        disabled:
          !canEditPieces(scope) || importButton.dataset.valid !== "true",
        busy: importButton.dataset.pending === "true",
      });
      permissionNote!.hidden = canEditPieces(scope);
    }
    if (allowed) {
      socket.emit("ensemble:join", scope);
      void refresh();
    }
  }
  function renderJobs() {
    jobMenus.splice(0).forEach((dispose) => dispose());
    host.replaceChildren();
    const visible = jobs.filter((j) => !j.imported_piece_id);
    host.hidden = !canTranscribe(scope) || !visible.length;
    if (!visible.length) return;
    host.append(el("h2", tr("work")));
    for (const j of visible) {
      const p = jobPresentation(j),
        card = el("article", undefined, transcriptionJobRecipe().root);
      card.dataset.job = j.id;
      const title =
        j.options?.title || j.pages[0]?.original_filename || tr("startTitle");
      card.append(el("h3", title));
      const status = el("p", p.text, transcriptionJobRecipe().pencil);
      status.setAttribute("role", "status");
      card.append(status);
      const segments = el("div", undefined, transcriptionJobRecipe().segments);
      segments.setAttribute("aria-label", p.text);
      p.segments.forEach((s, i) => {
        const bar = el("span", undefined, transcriptionJobRecipe().segment + " " + s);
        bar.title = tr("page", { n: i + 1 });
        segments.append(bar);
      });
      card.append(segments);
      const actions = el("div", undefined, transcriptionJobRecipe().actions);
      if (j.state === "completed")
        actions.append(
          button(tr("review"), () => void review(j, title), {
            variant: "standard",
            intent: "primary",
          }),
        );
      const menu = el("details"),
        summary = el("summary", "⋯");
      summary.setAttribute("aria-label", title);
      menu.append(summary);
      const items: { label: string; onSelect: () => void }[] = [];
      const action = (kind: string) =>
        items.push({
          label: tr(kind),
          onSelect: () => {
            menu.open = false;
            summary.focus();
            void api(`${base()}/transcriptions/${j.id}/${kind}`, "POST")
              .then(refresh)
              .catch((e) => {
                status.textContent = errorText(e);
              });
          },
        });
      if (["queued", "running"].includes(j.state)) action("cancel");
      if (["failed", "cancelled"].includes(j.state)) action("retry");
      items.push({
        label: tr("original"),
        onSelect: () => {
          menu.open = false;
          summary.focus();
          const page = j.pages[0];
          if (page)
            void resource(`${base()}/originals/${page.object_id}`)
              .then((r) => r.blob())
              .then((b) => download(b, page.original_filename || "original"))
              .catch((e) => {
                status.textContent = errorText(e);
              });
        },
      });
      const built = createMenu({
        variant: "job",
        label: title,
        items,
        onEscape: () => {
          menu.open = false;
          summary.focus();
        },
      });
      jobMenus.push(built.dispose);
      summary.setAttribute("aria-haspopup", "menu");
      summary.setAttribute("aria-controls", built.element.id);
      menu.addEventListener("toggle", () =>
        summary.setAttribute("aria-expanded", String(menu.open)),
      );
      summary.onkeydown = (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          menu.open = true;
          const choices =
            built.element.querySelectorAll<HTMLElement>("[role=menuitem]");
          (event.key === "ArrowUp"
            ? choices[choices.length - 1]
            : choices[0]
          )?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          menu.open = false;
        }
      };
      menu.append(built.element);
      jobMenus.push(bindRowMenu(menu, built.element));
      actions.append(menu);
      card.append(actions);
      host.append(card);
    }
  }
  async function start() {
    sync();
    if (!canTranscribe(scope)) return;
    const limits = await api<{ pdf: number; photo: number; pages: number }>(
      "/transcription/config",
    );
    sync();
    const destination = options.ensemble(),
      path = `/ensembles/${destination}`;
    let key = crypto.randomUUID(),
      lastBody = "";
    let files: Upload[] = [],
      busy = false,
      drag = -1;
    let lyricLanguage = "";
    const d = modal(
      `${tr("startTitle")} ${lang === "de" ? "für" : "for"} ${ensembleById(destination)?.name ?? ""}`,
    );
    dialog = d;
    const choices = el("div", undefined, transcriptionJobRecipe().choices),
      strip = el("div", undefined, transcriptionJobRecipe().photos),
      title = createInput({ variant: "transcription" }),
      language = el("div", undefined, transcriptionJobRecipe().language),
      total = el("p", undefined, transcriptionJobRecipe().pencil),
      notice = el("p", tr("private"), transcriptionJobRecipe().pencil),
      errors = el("p", undefined, transcriptionJobRecipe().error);
    errors.setAttribute("role", "alert");
    title.maxLength = 200;
    title.autocomplete = "off";
    function field(label: string, node: HTMLElement) {
      node.id = `tx-${label}`;
      if (node instanceof HTMLInputElement) {
        d.append(
          createField({
            variant: "transcription",
            layout: "tw:my-section",
            label: tr(label),
            control: node,
          }),
        );
        node.parentElement!.classList.add(...transcriptionJobRecipe().field.split(" "));
        node.previousElementSibling!.classList.add("tx-label");
      } else {
        const wrap = createFieldGroup({ variant: "transcription", labelId: `${node.id}-label`, layout: "tw:my-section", label: tr(label), content: node });
        wrap.classList.add(...transcriptionJobRecipe().field.split(" "));
        wrap.firstElementChild!.classList.add("tx-label");
        d.append(wrap);
      }
    }
    const pdf = el("input"),
      photos = el("input"),
      camera = el("input");
    pdf.type = photos.type = camera.type = "file";
    pdf.accept = "application/pdf";
    photos.accept = "image/jpeg,image/png,image/webp";
    photos.multiple = true;
    camera.accept = "image/jpeg";
    camera.setAttribute("capture", "environment");
    function choose(
      input: HTMLInputElement,
      label: string,
      name: IconName,
      sub: string,
    ) {
      const b = button("", () => input.click(), { variant: "tile" });
      b.innerHTML = icon(name);
      b.append(el("span", tr(label)), el("span", tr(sub), transcriptionJobRecipe().pencil));
      updateButton(b, { pressed: false });
      attachTranscriptionControl(b, transcriptionJobRecipe().tile);
      choices.append(b);
      input.hidden = true;
      d.append(input);
      return b;
    }
    const pdfChoice = choose(pdf, "pdf", "file", "pdfHint"),
      photoChoice = choose(photos, "photos", "camera", "photosHint");
    if (matchMedia("(pointer:coarse)").matches)
      choose(camera, "capture", "camera", "photosHint");
    function setFiles(input: HTMLInputElement, isPdf = false) {
      if (busy) return;
      const added = Array.from(input.files ?? []);
      input.value = "";
      if (isPdf || files.some((f) => f.file.type === "application/pdf")) {
        files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
        files = [];
      }
      for (const file of added) {
        const supported = isPdf
          ? file.type === "application/pdf"
          : ["image/jpeg", "image/png", "image/webp"].includes(file.type);
        files.push({
          file,
          progress: 0,
          error: !supported
            ? tr("unsupported_image_format")
            : file.size > (isPdf ? limits.pdf : limits.photo)
              ? tr("body_too_large")
              : undefined,
        });
      }
      if (isPdf && !title.value)
        title.value = added[0]?.name.replace(/\.pdf$/i, "") ?? "";
      renderFiles();
      for (const f of files)
        if (!isPdf && !f.url && !f.error)
          void photoThumbnail(f.file)
            .then((blob) => {
              if (!d.isConnected || !files.includes(f)) return;
              f.url = URL.createObjectURL(blob);
              renderFiles();
            })
            .catch(() => {
              f.error = tr("invalid_source");
              renderFiles();
            });
    }

    pdf.onchange = () => setFiles(pdf, true);
    photos.onchange = () => setFiles(photos);
    camera.onchange = () => setFiles(camera);
    function renderFiles() {
      title.disabled = busy;
      language
        .querySelectorAll("button")
        .forEach((b) => updateButton(b, { disabled: busy }));
      updateButton(pdfChoice, {
        pressed: files.some((f) => f.file.type === "application/pdf"),
      });
      updateButton(photoChoice, {
        pressed: files.some((f) => f.file.type !== "application/pdf"),
      });
      strip.replaceChildren();
      files.forEach((f, i) => {
        const tile = el("div", undefined, transcriptionJobRecipe().photo);
        tile.draggable = !busy;
        tile.ondragstart = (e) => {
          drag = i;
          e.dataTransfer?.setData("text/plain", String(i));
        };
        tile.ondragover = (e) => e.preventDefault();
        tile.ondrop = (e) => {
          e.preventDefault();
          if (!busy) {
            files = reorderPhotos(files, drag, i);
            renderFiles();
          }
        };
        if (f.url) {
          const img = el("img");
          img.src = f.url;
          img.alt = tr("page", { n: i + 1 });
          tile.append(img);
        }
        tile.append(el("span", `${i + 1}. ${f.file.name}`));
        const controls = el("div", undefined, transcriptionJobRecipe().actions);
        for (const [label, delta] of [
          ["left", -1],
          ["right", 1],
        ] as const) {
          const b = button(
            delta < 0 ? "←" : "→",
            () => {
              files = reorderPhotos(files, i, i + delta);
              renderFiles();
            },
            { variant: "standard", size: "compact" },
          );
          b.setAttribute("aria-label", tr(label));
          updateButton(b, {
            disabled: busy || i + delta < 0 || i + delta >= files.length,
          });
          controls.append(b);
        }
        const remove = button(
          tr("remove"),
          () => {
            if (f.url) URL.revokeObjectURL(f.url);
            files.splice(i, 1);
            renderFiles();
          },
          { variant: "standard", size: "compact" },
        );
        updateButton(remove, { disabled: busy });
        controls.append(remove);
        tile.append(controls);
        const progress = el("progress");
        progress.max = 100;
        progress.value = f.progress;
        progress.setAttribute("aria-label", f.file.name);
        tile.append(progress);
        if (f.error) tile.append(el("p", f.error, transcriptionJobRecipe().error));
        strip.append(tile);
      });
      total.textContent = tr("pages", {
        n: files.reduce((n, f) => n + (f.pages ?? 1), 0),
        size: (
          files.reduce((n, f) => n + f.file.size, 0) /
          1024 /
          1024
        ).toLocaleString(lang === "de" ? "de-DE" : "en-US", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      });
      updateButton(submit, {
        disabled:
          !files.length ||
          files.some((f) => !!f.error) ||
          files.reduce((n, f) => n + (f.pages ?? 1), 0) > limits.pages,
        busy,
      });
      if (errors.textContent === tr("page_limit")) errors.textContent = "";
      if (files.reduce((n, f) => n + (f.pages ?? 1), 0) > limits.pages)
        errors.textContent = tr("page_limit");
      choices
        .querySelectorAll("button")
        .forEach((b) => updateButton(b, { disabled: busy }));
    }
    language.setAttribute("role", "group");
    for (const value of ["de", "en", "la", "other", ""]) {
      if (language.childElementCount)
        language.append(el("span", "·", transcriptionJobRecipe().pencil));
      const chip = button(
        value ? tr(value) : "—",
        () => {
          lyricLanguage = value;
          language
            .querySelectorAll("button")
            .forEach((b) =>
              updateButton(b, { pressed: b.dataset.value === value }),
            );
        },
        { variant: "transcription-language" },
      );
      chip.dataset.value = value;
      updateButton(chip, { pressed: value === "" });
      language.append(chip);
    }
    const submit = button(tr("start"), () => void upload(), {
      variant: "standard",
      intent: "primary",
      layout: ["tw:w-full", "tw:mt-inline"],
    });
    async function upload() {
      if (busy || !canTranscribe(destination)) return;
      busy = true;
      errors.textContent = "";
      renderFiles();
      try {
        for (const f of files) {
          if (f.id) continue;
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api" + path + "/originals");
            xhr.setRequestHeader(
              "X-Original-Filename",
              encodeURIComponent(f.file.name),
            );
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                f.progress = (e.loaded / e.total) * 100;
                renderFiles();
              }
            };
            xhr.onload = () => {
              let data;
              try {
                data = JSON.parse(xhr.responseText);
              } catch {
                reject(new ApiError("error", xhr.status));
                return;
              }
              if (xhr.status >= 200 && xhr.status < 300) {
                f.id = data.id;
                f.pages = data.pages;
                resolve();
              } else {
                errors.textContent = tr(data.code);
                reject(new ApiError(data.code, xhr.status));
              }
            };
            xhr.onerror = () => reject(new Error("network"));
            d.addEventListener("close", () => xhr.abort(), { once: true });
            xhr.onabort = () => reject(new Error("aborted"));
            xhr.send(f.file);
          });
        }
        const body = JSON.stringify({
          sourceObjects: files.map((f) => f.id),
          options: {
            title: title.value,
            ...(lyricLanguage ? { language: lyricLanguage } : {}),
          },
        });
        if (body !== lastBody) {
          key = crypto.randomUUID();
          lastBody = body;
        }
        const r = await fetch("/api" + path + "/transcriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body,
        });
        if (!r.ok) {
          const data = await r.json();
          throw new ApiError(data.code, r.status);
        }
        d.close();
        await refresh();
      } catch (e) {
        errors.textContent = errorText(e);
      } finally {
        busy = false;
        if (d.isConnected) renderFiles();
      }
    }
    attachTranscriptionControl(submit, transcriptionJobRecipe().start);
    d.append(choices, strip);
    field("title", title);
    field("language", language);
    d.append(total, notice, errors, submit);
    renderFiles();
    d.addEventListener("close", () => {
      files.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      if (dialog === d) dialog = undefined;
    });
  }
  async function review(job: TranscriptionJob, title: string) {
    const cleanup = options.reviewCleanup();
    const destination = scope,
      path = `/ensembles/${destination}/transcriptions/${job.id}`,
      d = modal(title, true);
    dialog = d;
    const error = el("p", undefined, transcriptionJobRecipe().error);
    error.setAttribute("role", "alert");
    d.append(error);
    try {
      const [xml, report] = await Promise.all([
        resource(path + "/result").then((r) => r.text()),
        api<{ measures: MeasureSource[]; validation: ValidationReport | null }>(
          path + "/report",
        ),
      ]);
      if (!d.isConnected) return;
      const items = reviewItems(report),
        layout = el("div", undefined, transcriptionJobRecipe().reviewLayout),
        main = el("div", undefined, transcriptionJobRecipe().scoreWrap),
        score = el("div", undefined, transcriptionJobRecipe().score),
        panel = el("aside", undefined, transcriptionJobRecipe().reviewPanel),
        original = el("figure", undefined, transcriptionJobRecipe().original);
      main.append(score, original);
      original.hidden = true;
      const imageUrls = new Map<number, string>();
      let imageAbort: AbortController | undefined;
      let imageUrl = "",
        imageGeneration = 0;
      let currentPage = 1;
      async function showOriginal(page: number) {
        currentPage = page;
        const p = job.pages[page - 1];
        if (!p) return;
        const request = ++imageGeneration;
        imageAbort?.abort();
        imageAbort = new AbortController();
        original.hidden = false;
        try {
          let url = imageUrls.get(page);
          if (!url) {
            const response = await resource(
                `/ensembles/${destination}/originals/${p.object_id}/pages/${p.source_page}`,
                imageAbort.signal,
              ),
              blob = await response.blob();
            if (request !== imageGeneration || !d.isConnected) return;
            url = URL.createObjectURL(blob);
            imageUrls.set(page, url);
          }
          imageUrl = url;
          const img = el("img");
          img.src = imageUrl;
          img.alt = tr("page", { n: page });
          original.replaceChildren(
            el("figcaption", tr("page", { n: page })),
            img,
          );
        } catch (e) {
          if (request === imageGeneration)
            original.replaceChildren(el("p", errorText(e), transcriptionJobRecipe().error));
        }
      }
      d.addEventListener("close", () => {
        cleanup();
        imageGeneration++;
        imageAbort?.abort();
        imageUrls.forEach((url) => URL.revokeObjectURL(url));
        importButton = undefined;
        permissionNote = undefined;
        if (dialog === d) dialog = undefined;
      });
      panel.append(
        el(
          "h2",
          tr(report.validation?.structurallyValid ? "valid" : "invalid"),
        ),
        el(
          "p",
          tr("counts", {
            warnings: items.filter((i) => i.kind === "warning").length,
            uncertainties: items.filter((i) => i.kind === "uncertainty").length,
          }),
          transcriptionJobRecipe().pencil,
        ),
      );
      let comparing = false;
      const comparison = createSwitch({
        mode: "checkbox",
        variant: "comparison",
        label: tr("compare"),
        checked: false,
        onChange: setComparison,
      });
      const narrowToggle = createButton({
        text: tr("showOriginal"),
        pressed: false,
        onClick: () => setComparison(!comparing),
      });
      const narrowControls = el("div", undefined, transcriptionJobRecipe().comparisonToggle);
      narrowControls.append(narrowToggle);
      const wideControls = el("div", undefined, transcriptionJobRecipe().comparisonWide);
      wideControls.append(comparison);
      // Above the panes, so switching back never requires scrolling through the review form.
      function setComparison(checked: boolean) {
        comparing = checked;
        main.dataset.comparison = checked ? "original" : "score";
        updateSwitch(comparison, { variant: "comparison", label: tr("compare"), checked });
        updateButton(narrowToggle, { text: tr(checked ? "showScore" : "showOriginal"), pressed: checked });
        if (checked) void showOriginal(currentPage);
        else {
          imageGeneration++;
          imageAbort?.abort();
          original.hidden = true;
        }
      }
      panel.append(wideControls);
      const list = el("ul", undefined, transcriptionJobRecipe().reviewItems);
      function focusItem(item: ReviewItem) {
        const target = score.querySelector<SVGGraphicsElement>(
          `[id="review-measure-${item.measure}"]`,
        );
        target?.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
        target?.classList.remove(...transcriptionJobRecipe().flash.split(" "));
        requestAnimationFrame(() => target?.classList.add(...transcriptionJobRecipe().flash.split(" ")));
        if (item.page) {
          currentPage = item.page;
          setComparison(true);
        }
      }
      for (const item of items) {
        const li = el("li"),
          b = button(
            `${item.measure ? tr("measure", { n: item.measure }) : ""}${item.part ? " · " + tr("voice") + " " + item.part : ""} · ${item.message ?? reason(item.code)}`,
            () => focusItem(item),
            { variant: "review-item" },
          );
        const glyph = el(
          "span",
          item.kind === "warning" ? "!" : "?",
          `${transcriptionJobRecipe().glyph} ${item.kind}`,
        );
        glyph.setAttribute("aria-hidden", "true");
        b.classList.add("tx-review-item");
        b.prepend(glyph);
        b.setAttribute("aria-label", `${tr(item.kind)}: ${b.textContent}`);
        b.title = tr(item.kind) + (item.message ? ": " + item.message : "");
        li.append(b);
        list.append(li);
      }
      panel.append(list);
      for (const p of job.pages)
        if (p.state === "skipped")
          panel.append(
            el("p", tr("skipped", { n: p.page_number + 1 }), transcriptionJobRecipe().pencil),
          );
      const actions = el("div", undefined, transcriptionJobRecipe().reviewActions);
      importButton = button(tr("import"), () => void importResult(), {
        variant: "standard",
        intent: "primary",
      });
      importButton.dataset.valid = String(
        !!report.validation?.structurallyValid,
      );
      permissionNote = el("p", tr("needEditor"), transcriptionJobRecipe().pencil);
      permissionNote.hidden = canEditPieces(destination);
      updateButton(importButton, {
        disabled:
          !canEditPieces(destination) || !report.validation?.structurallyValid,
      });
      async function importResult() {
        if (
          !importButton ||
          importButton.disabled ||
          importButton.dataset.pending === "true"
        )
          return;
        const b = importButton;
        updateButton(b, { busy: true });
        b.dataset.pending = "true";
        try {
          const piece = await api<{ id: string }>(path + "/import", "POST");
          d.close();
          await refresh();
          await options.open(xml, title, piece.id);
        } catch (e) {
          error.textContent = errorText(e);
          b.dataset.pending = "false";
          updateButton(b, {
            busy: false,
            disabled: !canEditPieces(destination),
          });
        }
      }
      const secondary = el("div", undefined, transcriptionJobRecipe().secondary);
      secondary.append(
        button(tr("report"), () =>
          download(
            new Blob([JSON.stringify(report, null, 2)], {
              type: "application/json",
            }),
            "transcription-report.json",
          ),
        ),
        button(tr("xml"), () =>
          download(
            new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }),
            "transcription.musicxml",
          ),
        ),
        button(tr("listen"), () => {
          if (!options.beforeListen()) return;
          d.close();
          void options.open(xml, title).catch((e) => {
            error.textContent = errorText(e);
          });
        }),
      );
      secondary.querySelectorAll("button").forEach((b) => {
        updateButton(b, { variant: "standard", intent: "quiet", size: "compact" });
        b.classList.add("tx-link");
      });
      actions.append(importButton, secondary, permissionNote);
      panel.append(actions);
      layout.append(main, panel);
      d.append(narrowControls, layout);
      const [{ default: create }, { VerovioToolkit }] = await Promise.all([
        import("verovio/wasm"),
        import("verovio/esm"),
      ]);
      if (!d.isConnected) return;
      const toolkit = new VerovioToolkit(await create());
      toolkit.setOptions({
        scale: 45,
        pageWidth: matchBreakpoint("score", "below").matches ? 900 : 1800,
        pageHeight: matchBreakpoint("score", "below").matches ? 1200 : 2400,
        adjustPageHeight: true,
        svgViewBox: true,
        footer: "none",
        breaks: "auto",
      });
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      doc
        .querySelectorAll("part")
        .item(0)
        ?.querySelectorAll("measure")
        .forEach((m, i) => m.setAttribute("id", `review-measure-${i + 1}`));
      doc.querySelectorAll("multiple-rest").forEach((rest) => rest.remove());
      if (!toolkit.loadData(new XMLSerializer().serializeToString(doc)))
        throw new Error("engrave");
      for (let page = 1; page <= toolkit.getPageCount(); page++) {
        const container = el("div", undefined, transcriptionJobRecipe().scorePage);
        container.append(safeSvg(toolkit.renderToSVG(page)));
        score.append(container);
      }
      // MusicXML ids survive Verovio layout; never renumber rendered systems.
      // Expand multi-measure rests in this review-only copy so every annotated bar is visible.
      const measureBounds = new Map(
        [...score.querySelectorAll<SVGGraphicsElement>("g.measure")].map(
          (m) => [m.id, m.getBBox()],
        ),
      );
      const ns = "http://www.w3.org/2000/svg";
      for (const item of items) {
        if (!item.measure) continue;
        const target = score.querySelector<SVGGraphicsElement>(
          `[id="review-measure-${item.measure}"]`,
        );
        if (!target || target.querySelector(".tx-mark." + item.kind)) continue;
        const bounds = measureBounds.get(target.id)!,
          rect = document.createElementNS(ns, "rect"),
          mark = document.createElementNS(ns, "text");
        rect.setAttribute("x", String(bounds.x));
        rect.setAttribute("y", String(bounds.y - 100));
        rect.setAttribute("width", String(bounds.width));
        rect.setAttribute("height", String(bounds.height + 100));
        rect.classList.add(...transcriptionJobRecipe().wash.split(" "));
        mark.setAttribute("x", String(bounds.x));
        mark.setAttribute("y", String(bounds.y - 20));
        mark.setAttribute("font-size", "320");
        mark.setAttribute(
          "x",
          String(bounds.x + (target.querySelector(".tx-mark") ? 380 : 0)),
        );
        mark.classList.add(...(transcriptionJobRecipe().mark + " " + item.kind).split(" "));
        mark.textContent = item.kind === "warning" ? "!" : "?";
        if (item.kind === "warning") {
          const circle = document.createElementNS(ns, "circle");
          circle.setAttribute(
            "cx",
            String(
              bounds.x + (target.querySelector(".tx-mark") ? 380 : 0) + 80,
            ),
          );
          circle.setAttribute("cy", String(bounds.y - 125));
          circle.setAttribute("r", "155");
          circle.classList.add(...transcriptionJobRecipe().markRing.split(" "));
          target.append(circle);
        }
        if (!target.querySelector(".tx-wash")) target.prepend(rect);
        target.append(mark);
      }
      // Fit the engraved content, including review marks, rather than the source paper size.
      // Cap at 1.8× Verovio's natural scale so short results remain comfortable to read.
      for (const container of score.querySelectorAll<HTMLElement>(
        ".tx-score-page",
      )) {
        const svg = container.querySelector<SVGSVGElement>("svg")!,
          definition = svg.querySelector<SVGSVGElement>(".definition-scale"),
          margin = svg.querySelector<SVGGraphicsElement>(".page-margin");
        if (!definition || !margin) continue;
        const bounds = margin.getBBox(),
          padding = 300;
        if (!bounds.width || !bounds.height) continue;
        const scale =
            svg.viewBox.baseVal.width / definition.viewBox.baseVal.width,
          width = bounds.width + padding * 2,
          height = bounds.height + padding * 2;
        definition.setAttribute(
          "viewBox",
          `${bounds.x + 500 - padding} ${bounds.y + 500 - padding} ${width} ${height}`,
        );
        svg.setAttribute("viewBox", `0 0 ${width * scale} ${height * scale}`);
        container.style.maxWidth = `${Math.min(900, width * scale * 1.8)}px`;
      }
    } catch (e) {
      console.error("Transcription review failed", e);
      error.textContent = errorText(e);
    }
  }
  entry.onclick = () =>
    void start().catch((e) => {
      host.replaceChildren(el("p", errorText(e), transcriptionJobRecipe().error));
    });
  socket.on("connect", sync);
  const onProgress = (event: { ensembleId: string; jobId: string }) => {
    if (event.ensembleId !== scope) return;
    const g = generation;
    void api<TranscriptionJob>(`${base()}/transcriptions/${event.jobId}`)
      .then((job) => {
        if (g !== generation) return;
        jobs = [job, ...jobs.filter((j) => j.id !== job.id)].sort((a, b) =>
          String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
        );
        renderJobs();
      })
      .catch(() => void refresh());
  };
  socket.on("transcription:progress", onProgress);
  window.addEventListener("offline:changed", sync);
  window.addEventListener("membership:changed", sync);
  window.addEventListener("ensemble:changed", sync);
  const timer = setInterval(() => void refresh(), 8000);
  sync();
  return {
    refresh: sync,
    dispose() {
      jobMenus.splice(0).forEach((dispose) => dispose());
      clearInterval(timer);
      socket.off("connect", sync);
      socket.off("transcription:progress", onProgress);
      window.removeEventListener("offline:changed", sync);
      window.removeEventListener("membership:changed", sync);
      window.removeEventListener("ensemble:changed", sync);
      dialog?.close();
    },
  };
}
/** Plain language groupings cover structural diagnostic families without exposing validator codes. */
function reason(code: string) {
  if (code === "reviewPassage") return tr(code);
  if (/tie|slur/.test(code)) return tr("checkTies");
  if (/duration|alignment|meter|pickup/.test(code)) return tr("checkTiming");
  if (/identity|part|tacet/.test(code)) return tr("checkVoice");
  if (/lyric/.test(code)) return tr("checkLyrics");
  if (/key|clef|time/.test(code)) return tr("checkNotation");
  return tr("unknown");
}
