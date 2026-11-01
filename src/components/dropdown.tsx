"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { useFloatingPopup } from "./use-floating-popup";

type Option = { value: string; label: string };

export function Dropdown({ label, name, options, defaultValue, required = false, onValueChange }: { label: string; name: string; options: Option[]; defaultValue?: string; required?: boolean; onValueChange?: (value: string) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const search = useRef({ text: "", time: 0 });
  const initial = defaultValue ?? options[0]?.value ?? "";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex(option => option.value === value);
  const { anchor: button, popup } = useFloatingPopup(open, true);

  useEffect(() => {
    const form = select.current?.form;
    const reset = () => { setValue(initial); setOpen(false); setInvalid(false); queueMicrotask(() => { if (select.current) select.current.value = initial; }); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open) { const option = document.getElementById(`${id}-option-${active}`); const menu = popup.current; if (option && menu) { const top = option.offsetTop, bottom = top + option.offsetHeight; if (top < menu.scrollTop) menu.scrollTo({ top }); else if (bottom > menu.scrollTop + menu.clientHeight) menu.scrollTo({ top: bottom - menu.clientHeight }); } }
  }, [open, active, id, popup]);

  function show() { setActive(Math.max(0, selected)); setOpen(true); }
  function choose(index: number) { if (options[index]) { setValue(options[index].value); onValueChange?.(options[index].value); setInvalid(false); setOpen(false); button.current?.focus(); } }
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(index => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if ((event.key === "Enter" || event.key === " ") && open) { event.preventDefault(); choose(active); }
    else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = (now - search.current.time < 700 ? search.current.text : "") + event.key.toLocaleLowerCase("id-ID");
      search.current = { text, time: now };
      const index = options.findIndex(option => option.label.toLocaleLowerCase("id-ID").startsWith(text));
      if (index >= 0) { event.preventDefault(); setActive(index); setOpen(true); }
    }
  }
  return <div className="dropdown" ref={root}>
    <label htmlFor={`${id}-button`}>{label}</label>
    <select ref={select} className="dropdown-native" name={name} value={value} onChange={event => setValue(event.target.value)} required={required} tabIndex={-1} aria-hidden="true" onInvalid={event => { event.preventDefault(); setInvalid(true); button.current?.focus(); }}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    <button ref={button} id={`${id}-button`} type="button" className="dropdown-trigger" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown}><span>{options[selected]?.label ?? "Pilih"}</span><Icon name="chevron" size={16}/></button>
    {invalid && <span id={`${id}-error`} className="dropdown-error" role="alert">Pilih {label.toLowerCase()}.</span>}
    {open && <div ref={popup} popover="manual" id={`${id}-list`} className="dropdown-menu floating-popup" role="listbox" aria-label={label}>{options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={index === selected} className={`dropdown-option${index === active ? " is-active" : ""}${index === selected ? " is-selected" : ""}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>{option.label}</div>)}</div>}
  </div>;
}
