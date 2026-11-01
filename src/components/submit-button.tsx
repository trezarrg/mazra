"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children = "Simpan perubahan", name, value, secondary = false }: { children?: React.ReactNode; name?: string; value?: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" name={name} value={value} className={`button ${secondary ? "button-secondary" : "button-primary"} submit-button`} disabled={pending}>{pending ? <><span className="spinner"/>Memproses…</> : children}</button>;
}
