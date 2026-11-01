"use client";

import { useCallback, useRef } from "react";
import { formatDecimal } from "@/lib/format";

// Interpolation uses integers so the final displayed amount never loses precision.
export function AnimatedNumber({ value }: { value: string | number }) {
  const text = String(value);
  const formatted = formatDecimal(text);
  const previous = useRef("0");
  const attach = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const before = previous.current;
    if (!/^-?\d+(\.\d+)?$/.test(text) || !/^-?\d+(\.\d+)?$/.test(before)) return;
    const decimals = Math.max(text.split(".")[1]?.length ?? 0, before.split(".")[1]?.length ?? 0);
    const parse = (raw: string) => {
      const [whole, fraction = ""] = raw.replace("-", "").split(".");
      return BigInt(whole + fraction.padEnd(decimals, "0")) * (raw.startsWith("-") ? BigInt(-1) : BigInt(1));
    };
    const start = parse(before), end = parse(text);
    if (motion.matches || document.hidden || start === end) { previous.current = text; element.textContent = formatted; return; }
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); observer.disconnect(); element.textContent = formatted; };
    const preferenceChanged = () => { if (motion.matches) finish(); };
    const visibilityChanged = () => { if (document.hidden) finish(); };
    const run = () => {
      observer.disconnect();
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / 850);
        const eased = BigInt(Math.round((1 - Math.pow(1 - progress, 3)) * 10000));
        const current = start + (end - start) * eased / BigInt(10000);
        const digits = (current < BigInt(0) ? -current : current).toString().padStart(decimals + 1, "0");
        const raw = `${current < BigInt(0) ? "-" : ""}${decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits}`;
        element.textContent = progress === 1 ? formatted : formatDecimal(raw);
        previous.current = progress === 1 ? text : raw;
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) run(); }, { threshold: .1 });
    observer.observe(element);
    motion.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      finish();
      motion.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [text, formatted]);
  return <span className="animated-number" aria-label={formatted}><span className="number-reserve" aria-hidden="true">{formatted}</span><span ref={attach} aria-hidden="true">{formatted}</span></span>;
}
