"use client";

import { useActionState, useRef, useState } from "react";
import { login, type LoginState } from "@/app/login/actions";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";

const messages: Record<Exclude<LoginState["error"], null>, string> = {
  missing: "Isi email atau nama pengguna dan kata sandi.",
  invalid: "Email, nama pengguna, atau kata sandi salah.",
  config: "Koneksi belum dikonfigurasi. Hubungi pengelola.",
  unavailable: "Tidak dapat masuk saat ini. Periksa koneksi dan coba lagi.",
};

export function LoginForm({ initialError }: { initialError: LoginState["error"] }) {
  const submitting = useRef(false);
  const [state, submit, pending] = useActionState(async (previous: LoginState, formData: FormData) => {
    try {
      return await login(previous, formData);
    } finally {
      submitting.current = false;
    }
  }, { error: initialError });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [edited, setEdited] = useState(false);
  const error = !edited && !pending ? state.error : null;
  const invalid = error === "invalid" || error === "missing";
  const describedBy = error ? "login-error" : undefined;

  return <form action={submit} className="form login-form" aria-busy={pending} onSubmit={event => {
    if (submitting.current || pending) {
      event.preventDefault();
      return;
    }
    submitting.current = true;
    setEdited(false);
  }}>
    <label htmlFor="login-email">Email atau nama pengguna
      <input id="login-email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Email akun Anda" value={identifier} onChange={event => { setIdentifier(event.target.value); setEdited(true); }} aria-invalid={invalid || undefined} aria-describedby={describedBy} required/>
    </label>
    <div className="login-password-field">
      <label htmlFor="login-password">Kata sandi</label>
      <PasswordInput value={password} onChange={value => { setPassword(value); setEdited(true); }} invalid={invalid} describedBy={describedBy}/>
    </div>
    {error && <p id="login-error" className="login-error" role="alert">{messages[error]}</p>}
    <SubmitButton pending={pending} pendingLabel="Sedang masuk...">Masuk</SubmitButton>
  </form>;
}
