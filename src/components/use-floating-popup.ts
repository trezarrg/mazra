"use client";
import { useLayoutEffect, useRef } from "react";

/** Place a popup in the browser's top layer and keep it within the viewport. */
export function useFloatingPopup(open: boolean, matchWidth = false) {
  const anchor = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const trigger = anchor.current, panel = popup.current;
    if (!open || !trigger || !panel) return;
    if (typeof panel.showPopover === "function") panel.showPopover();
    function position() {
      if (!trigger || !panel) return;
      const margin = 8, gap = 6;
      const rect = trigger.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (matchWidth) panel.style.width = `${Math.min(rect.width, width - margin * 2)}px`;
      const limit = Math.max(0, Math.min(matchWidth ? 240 : height, height - margin * 2));
      panel.style.maxHeight = `${limit}px`;
      const box = panel.getBoundingClientRect();
      const below = Math.max(0, height - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const placeAbove = box.height > below && above > below;
      const available = placeAbove ? above : below;
      panel.style.maxHeight = `${Math.max(0, Math.min(limit, available))}px`;
      const actual = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(margin, Math.min(rect.left, width - actual.width - margin))}px`;
      panel.style.top = `${placeAbove ? Math.max(margin, rect.top - gap - actual.height) : Math.min(rect.bottom + gap, height - margin)}px`;
    }
    position();
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position);
    observer.observe(trigger);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); document.removeEventListener("scroll", position, true); if (typeof panel.hidePopover === "function" && panel.matches(":popover-open")) panel.hidePopover(); };
  }, [open, matchWidth]);
  return { anchor, popup };
}
