"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { invalidFormEvent, useFormValidation } from "@/lib/form-validation";
import { Icon } from "./icon";

type Feedback = { kind: "validation" | "server"; message: string };

export function Sheet({ title, trigger, children, className = "button button-primary", description, initialOpen = false, wide = false }: { title: string; trigger: React.ReactNode; children: React.ReactNode; className?: string; description?: string; initialOpen?: boolean; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const submission = useRef<{ pathname: string; query: string } | null>(null);
  const preserveReset = useRef(false);
  const autoOpened = useRef(false);
  const id = useId();
  const pathname = usePathname(), params = useSearchParams(), query = params.toString();
  const error = params.get("error"), success = params.get("ok");
  const previousURL = useRef(`${pathname}?${query}`);
  const [content, setContent] = useState(children);
  const [generation, setGeneration] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(() => initialOpen && error ? { kind: "server", message: error } : null);
  useFormValidation(dialog);

  const close = useCallback(() => {
    preserveReset.current = false; submission.current = null;
    dialog.current?.close();
    document.body.style.overflow = document.querySelector("dialog[open]") ? "hidden" : "";
  }, []);
  useEffect(() => {
    if (initialOpen && !autoOpened.current) { autoOpened.current = true; if (!success) { dialog.current?.showModal(); document.body.style.overflow = "hidden"; } }
  }, [initialOpen, success]);
  useEffect(() => {
    const url = `${pathname}?${query}`;
    if (previousURL.current === url) return;
    previousURL.current = url;
    if (!dialog.current?.open) return;
    const sent = submission.current;
    if (sent && error && pathname === sent.pathname) {
      submission.current = null;
      queueMicrotask(() => setFeedback({ kind: "server", message: error }));
    } else if (success || pathname !== sent?.pathname || !error) close();
  }, [pathname, query, error, success, close]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const invalid = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest("dialog") !== node) return;
      setFeedback({ kind: "validation", message: String((event as CustomEvent).detail) });
    };
    // React resets forms after actions. Keep both controlled and native fields on failure.
    const reset = (event: Event) => { if (preserveReset.current && node.open) { event.preventDefault(); event.stopPropagation(); } };
    node.addEventListener(invalidFormEvent, invalid);
    node.addEventListener("reset", reset, true);
    return () => { node.removeEventListener(invalidFormEvent, invalid); node.removeEventListener("reset", reset, true); node.close(); document.body.style.overflow = document.querySelector("dialog[open]") ? "hidden" : ""; };
  }, []);
  useEffect(() => {
    if (feedback?.kind !== "server") return;
    const frame = requestAnimationFrame(() => { alert.current?.focus({ preventScroll: true }); alert.current?.closest(".sheet-body")?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); });
    return () => cancelAnimationFrame(frame);
  }, [feedback]);

  function open() {
    setContent(children); setGeneration(value => value + 1); setFeedback(null);
    preserveReset.current = false; submission.current = null;
    dialog.current?.showModal(); document.body.style.overflow = "hidden";
  }
  function submitted(event: React.FormEvent<HTMLDialogElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.closest("dialog") !== dialog.current) return;
    submission.current = { pathname, query }; preserveReset.current = true; setFeedback(null);
    let origin = form.querySelector<HTMLInputElement>('input[name="_form_origin"]');
    if (!origin) { origin = document.createElement("input"); origin.type = "hidden"; origin.name = "_form_origin"; form.append(origin); }
    origin.value = `${pathname}${query ? `?${query}` : ""}`;
  }
  return <><button type="button" className={className} onClick={open}>{trigger}</button>
    <dialog ref={dialog} className={`sheet${wide ? " sheet-wide" : ""}`} aria-labelledby={id} onSubmitCapture={submitted} onClose={() => { preserveReset.current = false; submission.current = null; document.body.style.overflow = document.querySelector("dialog[open]") ? "hidden" : ""; }}>
      <div className="sheet-handle"/><header className="sheet-header"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={close} aria-label="Tutup"><Icon name="close"/></button></header>
      <div className="sheet-body">{feedback && <p ref={alert} className="notice is-error sheet-feedback" role="alert" tabIndex={-1}>{feedback.message}</p>}<div key={generation} className="sheet-form-content">{content}</div></div>
    </dialog>
  </>;
}
