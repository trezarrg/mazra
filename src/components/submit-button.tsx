"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children = "Simpan perubahan", name, value, secondary = false, pending = false, pendingLabel = "Memproses..." }: { children?: React.ReactNode; name?: string; value?: string; secondary?: boolean; pending?: boolean; pendingLabel?: string }) {
  const { pending: formPending } = useFormStatus();
  const busy = pending || formPending;
  return <button type="submit" name={name} value={value} className={`button ${secondary ? "button-secondary" : "button-primary"} submit-button`} disabled={busy} aria-busy={busy} aria-live="polite">{busy ? <><span className="spinner" aria-hidden="true"/>{pendingLabel}</> : children}</button>;
}
