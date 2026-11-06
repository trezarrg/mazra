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
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const height = viewport?.height ?? window.innerHeight;
      if (matchWidth) panel.style.width = `${Math.min(rect.width, width - margin * 2)}px`;
      const limit = Math.max(0, Math.min(matchWidth ? 240 : height, height - margin * 2));
      panel.style.maxHeight = `${limit}px`;
      const box = panel.getBoundingClientRect();
      const anchorTop = Math.max(top + margin, Math.min(rect.top, top + height - margin));
      const anchorBottom = Math.max(top + margin, Math.min(rect.bottom, top + height - margin));
      const below = Math.max(0, top + height - anchorBottom - gap - margin);
      const above = Math.max(0, anchorTop - top - gap - margin);
      const placeAbove = box.height > below && above > below;
      const available = placeAbove ? above : below;
      panel.style.maxHeight = `${Math.max(0, Math.min(limit, available))}px`;
      const actual = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(left + margin, Math.min(rect.left, left + width - actual.width - margin))}px`;
      panel.style.top = `${placeAbove ? Math.max(top + margin, anchorTop - gap - actual.height) : Math.min(anchorBottom + gap, top + height - margin)}px`;
    }
    position();
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    document.addEventListener("scroll", position, true);
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); });
    observer.observe(trigger);
    observer.observe(panel);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", position); window.visualViewport?.removeEventListener("resize", position); window.visualViewport?.removeEventListener("scroll", position); document.removeEventListener("scroll", position, true); if (typeof panel.hidePopover === "function" && panel.matches(":popover-open")) panel.hidePopover(); };
  }, [open, matchWidth]);
  return { anchor, popup };
}
