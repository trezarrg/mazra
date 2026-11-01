"use client";
import { useState } from "react";
import { Icon } from "./icon";
export function PasswordInput() {
  const [visible, setVisible] = useState(false);
  return <span className="login-password"><input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan kata sandi" required/><button type="button" className="password-toggle" aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible} aria-controls="login-password" onClick={() => setVisible(!visible)}><Icon name="eye" size={20}/></button></span>;
}
