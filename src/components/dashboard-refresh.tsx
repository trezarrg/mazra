"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DashboardRefresh() {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  useEffect(() => {
    const refresh=() => { if(!pending && document.visibilityState==="visible" && !document.querySelector("dialog[open]")) startTransition(() => router.refresh()); };
    const interval=setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus",refresh); document.removeEventListener("visibilitychange",refresh); };
  },[router,pending]);
  return null;
}
