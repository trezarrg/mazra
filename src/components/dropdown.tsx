"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { useFloatingPopup } from "./use-floating-popup";
import { clearFieldError } from "@/lib/form-validation";

type Option = { value: string; label: string };

export function Dropdown({ label, name, options, defaultValue, required = false, onValueChange }: { label: string; name: string; options: Option[]; defaultValue?: string; required?: boolean; onValueChange?: (value: string) => void }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const focusSearch = useRef(false);
  const initial = defaultValue ?? options[0]?.value ?? "";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.findIndex(option => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const filtered = normalizedQuery ? options.filter(option => option.label.toLocaleLowerCase("id-ID").includes(normalizedQuery)) : options;
  const activeIndex = Math.min(active, filtered.length - 1);
  const { anchor: button, popup } = useFloatingPopup(open, true);

  useEffect(() => {
    const form = select.current?.form;
    const reset = () => { setValue(initial); setOpen(false); setQuery(""); setInvalid(false); queueMicrotask(() => { if (select.current) select.current.value = initial; }); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  useEffect(() => {
    if (!open) return;
    if (focusSearch.current) { searchInput.current?.focus(); focusSearch.current = false; }
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const option = document.getElementById(`${id}-option-${activeIndex}`);
    const menu = popup.current;
    if (!option || !menu) return;
    const top = option.getBoundingClientRect().top;
    const menuTop = menu.getBoundingClientRect().top;
    const bottom = option.getBoundingClientRect().bottom;
    if (top < menuTop) menu.scrollBy({ top: top - menuTop });
    else if (bottom > menu.getBoundingClientRect().bottom) menu.scrollBy({ top: bottom - menu.getBoundingClientRect().bottom });
  }, [open, activeIndex, id, popup]);

  function show() { setQuery(""); setActive(Math.max(0, selected)); focusSearch.current = true; setOpen(true); }
  function choose(index: number) {
    const option = filtered[index];
    if (!option) return;
    setValue(option.value); onValueChange?.(option.value); setInvalid(false); clearFieldError(select.current); setOpen(false); setQuery(""); button.current?.focus();
  }
  function move(event: React.KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); return; }
    if (event.key === "Tab") { setTimeout(() => setOpen(false), 0); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") { event.preventDefault(); choose(activeIndex); }
  }
  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing) return;
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); show(); return; }
    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); setQuery(event.key); setActive(0);
      if (open) searchInput.current?.focus(); else { focusSearch.current = true; setOpen(true); }
      return;
    }
    if (open) move(event);
  }
  return <div className="dropdown" ref={root}>
    <label htmlFor={`${id}-button`}>{label}</label>
    <select ref={select} className="dropdown-native" name={name} value={value} onChange={event => setValue(event.target.value)} required={required} tabIndex={-1} aria-hidden="true" onInvalid={event => { const handled = event.defaultPrevented; event.preventDefault(); setInvalid(true); if (!handled) button.current?.focus(); }}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    <button ref={button} id={`${id}-button`} type="button" className="dropdown-trigger" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} aria-required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={onTriggerKeyDown}><span>{options[selected]?.label ?? "Pilih"}</span><Icon name="chevron" size={16}/></button>
    {open && <input ref={searchInput} className="dropdown-search-inline" type="search" role="combobox" aria-label={`Cari ${label.toLowerCase()}`} aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined} autoComplete="off" placeholder="Ketik untuk mencari" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={move}/>}
    {invalid && <span id={`${id}-error`} className="dropdown-error" role="alert">Pilih {label.toLowerCase()}.</span>}
    {open && <div ref={popup} popover="manual" className="dropdown-menu floating-popup">
      <div id={`${id}-list`} role="listbox" aria-label={label}>{filtered.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={option.value === value} className={`dropdown-option${index === activeIndex ? " is-active" : ""}${option.value === value ? " is-selected" : ""}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>{option.label}</div>)}</div>
      {!filtered.length && <p className="dropdown-empty" role="status">Pilihan tidak ditemukan</p>}
    </div>}
  </div>;
}
