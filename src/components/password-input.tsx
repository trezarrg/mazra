"use client";
import { useState } from "react";
import { Icon } from "./icon";
export function PasswordInput({ value, onChange, invalid = false, describedBy }: { value: string; onChange: (value: string) => void; invalid?: boolean; describedBy?: string }) {
  const [visible, setVisible] = useState(false);
  return <span className="login-password"><input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan kata sandi" value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} required/><button type="button" className="password-toggle" aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible} aria-controls="login-password" onClick={() => setVisible(!visible)}><Icon name="eye" size={20}/></button></span>;
}
