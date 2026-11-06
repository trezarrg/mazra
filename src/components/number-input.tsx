"use client";
import { useEffect, useRef, useState } from "react";
import { formatDecimal } from "@/lib/format";

function display(value: string) {
  const [whole = "", ...decimals] = value.replace(/\./g, "").replace(/[^\d,]/g, "").split(",");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (decimals.length ? "," + decimals.join("") : "");
}
export function NumberInput({ name, defaultValue = "", value: controlledValue, placeholder, required = false, onValueChange }: { name: string; defaultValue?: string | number; value?: string | number; placeholder?: string; required?: boolean; onValueChange?: (value: string) => void }) {
  const initial = defaultValue === "" ? "" : formatDecimal(defaultValue);
  const [localValue, setLocalValue] = useState(initial);
  const localNumber = localValue.replace(/\./g, "").replace(",", ".");
  const value = controlledValue === undefined || String(controlledValue) === localNumber ? localValue : controlledValue === "" ? "" : formatDecimal(controlledValue);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => {
      setLocalValue(initial);
      if (controlledValue !== undefined) onValueChange?.(String(defaultValue));
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [controlledValue, defaultValue, initial, onValueChange]);
  function change(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const cursor = event.target.selectionStart ?? raw.length;
    const position = raw.slice(0, cursor).replace(/\./g, "").replace(/[^\d,]/g, "").length;
    const next = display(raw);
    setLocalValue(next);
    onValueChange?.(next.replace(/\./g, "").replace(",", "."));
    requestAnimationFrame(() => {
      if (!input.current) return;
      let i = 0, count = 0;
      while (i < next.length && count < position) { if (next[i] !== ".") count++; i++; }
      input.current.setSelectionRange(i, i);
    });
  }
  return <><input ref={input} type="text" inputMode="decimal" value={value} onChange={change} placeholder={placeholder} required={required}/><input type="hidden" name={name} value={value.replace(/\./g, "").replace(",", ".")}/></>;
}
