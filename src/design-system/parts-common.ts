import type {ToastOptions} from "./recipes/overlays";

export function toastPart(kind: ToastOptions["kind"] = "info") {
  return {
    "data-ds": "toast",
    role: kind === "error" ? "alert" : "status",
    "aria-live": kind === "error" ? "assertive" : "polite",
    "aria-atomic": true,
  } as const;
}

export function activationBlocked(control: {
  disabled?: boolean;
  getAttribute(name: string): string | null;
}) {
  return control.disabled || control.getAttribute("aria-disabled") === "true";
}