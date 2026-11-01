"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./icon";

export function Sheet({ title, trigger, children, className = "button button-primary", description, initialOpen = false }: { title: string; trigger: React.ReactNode; children: React.ReactNode; className?: string; description?: string; initialOpen?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const error = params.get("error");
  const [openingQuery, setOpeningQuery] = useState(query);
  const firstRender = useRef(true);
  useEffect(() => { if(initialOpen){dialog.current?.showModal();document.body.style.overflow="hidden";} }, [initialOpen]);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (!error) {
      dialog.current?.close();
      dialog.current?.querySelectorAll("form").forEach(form => form.reset());
    }
  }, [pathname, query, error]);
  useEffect(() => () => { document.body.style.overflow = ""; }, []);
  function close() { dialog.current?.close(); document.body.style.overflow = ""; }
  return <><button type="button" className={className} onClick={() => { setOpeningQuery(query); dialog.current?.showModal(); document.body.style.overflow = "hidden"; }}>{trigger}</button><dialog ref={dialog} className="sheet" aria-labelledby={id} onClose={() => { document.body.style.overflow = ""; }} onClick={e => { if (e.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}><div className="sheet-handle"/><header className="sheet-header"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={close} aria-label="Tutup"><Icon name="close"/></button></header><div className="sheet-body">{error && query !== openingQuery && <p className="notice is-error" role="alert">{error}</p>}{children}</div></dialog></>;
}
