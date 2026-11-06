"use client";

import { useEffect, type RefObject } from "react";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export const invalidFormEvent = "app:invalid-form";

function visibleControl(field: HTMLElement): HTMLElement {
  return field instanceof HTMLSelectElement ? field.closest(".dropdown")?.querySelector<HTMLElement>(".dropdown-trigger") ?? field : field;
}
export function clearFieldError(field: HTMLElement | null) {
  if (!field) return;
  const control = visibleControl(field);
  control.removeAttribute("data-invalid"); control.removeAttribute("aria-invalid"); control.classList.remove("field-attention");
}
function message(field: Field) {
  const label = (field instanceof HTMLSelectElement ? field.closest(".dropdown")?.querySelector("label")?.textContent : field.labels?.[0]?.textContent)?.replace(/opsional/gi, "").trim() || "isian ini";
  if (field.validity.valueMissing) return field instanceof HTMLSelectElement ? `Pilih ${label.toLowerCase()}.` : field instanceof HTMLInputElement && field.type === "checkbox" ? "Centang persetujuan yang diperlukan." : `Isi ${label.toLowerCase()}.`;
  if (field instanceof HTMLInputElement && field.type === "email" && field.validity.typeMismatch) return "Masukkan alamat email yang valid.";
  return `Periksa format ${label.toLowerCase()}.`;
}

export function useFormValidation(scope?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scope?.current ?? document;
    let first: { field: Field; control: HTMLElement } | null = null;
    let frame = 0, disposed = false;
    let batch: ReturnType<typeof setTimeout> | null = null;
    const invalid = (event: Event) => {
      const field = event.target;
      if (event.defaultPrevented || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      if (field.closest("dialog") && !field.closest("dialog")?.open) return;
      event.preventDefault();
      const control = visibleControl(field);
      control.setAttribute("data-invalid", "true"); control.setAttribute("aria-invalid", "true");
      if (first) return;
      first = { field, control };
      batch = setTimeout(() => {
        const target = first; first = null;
        if (!target || disposed || !target.control.isConnected) return;
        for (let parent = target.control.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        target.field.form?.dispatchEvent(new CustomEvent(invalidFormEvent, { bubbles: true, detail: message(target.field) }));
        frame = requestAnimationFrame(() => {
          target.control.focus({ preventScroll: true });
          target.control.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
          target.control.classList.remove("field-attention");
          void target.control.offsetWidth;
          target.control.classList.add("field-attention");
        });
      }, 0);
    };
    const edited = (event: Event) => {
      const field = event.target;
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && field.validity.valid) clearFieldError(field);
    };
    root.addEventListener("invalid", invalid, true);
    root.addEventListener("input", edited, true); root.addEventListener("change", edited, true);
    return () => { disposed = true; if (batch) clearTimeout(batch); cancelAnimationFrame(frame); root.removeEventListener("invalid", invalid, true); root.removeEventListener("input", edited, true); root.removeEventListener("change", edited, true); };
  }, [scope]);
}
