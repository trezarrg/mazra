"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function DocumentView({ number, title, content, actions, thermal = false }: { number: string; title: string; content: ReactNode; actions?:ReactNode; thermal?:boolean }) {
  const exportSurface = useRef<HTMLDivElement>(null);
  const acting = useRef(false);
  const [image, setImage] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState<"copy" | "share" | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        await document.fonts.ready;
        const node = exportSurface.current?.firstElementChild as HTMLElement | null;
        if (!node) throw new Error("Dokumen belum siap");
        await Promise.all(Array.from(node.querySelectorAll("img")).map(img => img.decode()));
        const { toBlob } = await import("html-to-image");
        const blob = await toBlob(node, { backgroundColor: "#ffffff", pixelRatio: 2, skipFonts: true });
        if (!blob) throw new Error("Gambar tidak dapat dibuat");
        if (!cancelled) setImage(new File([blob], `${number}.png`, { type: "image/png" }));
      } catch {
        if (!cancelled) { setFailed(true); setMessage("Gambar belum dapat disiapkan. Coba lagi, atau gunakan Cetak / PDF."); }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [content, number, attempt]);

  function print() {
    const originalTitle = document.title;
    const pageStyle = document.createElement("style");
    if (thermal) {
      const height = Math.max(50, Math.ceil((exportSurface.current?.firstElementChild?.scrollHeight ?? 0) * 25.4 / 96) + 4);
      pageStyle.textContent = `@page { size: 58mm ${height}mm; margin: 2mm 5mm; }`;
    } else pageStyle.textContent = "@page { size: A4; margin: 14mm; }";
    document.head.appendChild(pageStyle);
    const restore = () => { document.title = originalTitle; pageStyle.remove(); window.removeEventListener("afterprint", restore); };
    document.title = `${title} ${number}`;
    window.addEventListener("afterprint", restore, { once: true });
    try { window.print(); } catch { restore(); setMessage("Dialog cetak belum dapat dibuka. Silakan coba lagi."); }
  }

  function download() {
    if (!image || acting.current) return;
    const url = URL.createObjectURL(image);
    const link = document.createElement("a");
    link.href = url; link.download = image.name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage("Gambar PNG diunduh. Anda dapat melampirkannya di WhatsApp atau aplikasi lain.");
  }

  async function copy() {
    if (!image || acting.current) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setMessage("Browser ini belum mendukung salin gambar. Gunakan Bagikan gambar atau Unduh PNG."); return;
    }
    acting.current = true; setBusy("copy"); setMessage("");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      setMessage("Gambar tersalin. Tempel di percakapan WhatsApp atau aplikasi lain.");
    } catch {
      setMessage("Gambar tidak dapat disalin. Izinkan akses clipboard atau gunakan Unduh PNG.");
    } finally { acting.current = false; setBusy(null); }
  }

  async function share() {
    if (!image || acting.current) return;
    if (!navigator.share || !navigator.canShare?.({ files: [image] })) {
      setMessage("Perangkat ini belum mendukung berbagi gambar langsung. Gunakan Salin gambar atau Unduh PNG untuk dikirim melalui WhatsApp."); return;
    }
    acting.current = true; setBusy("share"); setMessage("");
    try {
      await navigator.share({ files: [image], title: `${title} ${number}` });
      setMessage("Gambar diserahkan ke aplikasi yang dipilih.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Gambar belum dapat dibagikan. Coba lagi atau gunakan Unduh PNG.");
    } finally { acting.current = false; setBusy(null); }
  }

  return <>
    <div className="document-share-toolbar" aria-label="Cetak dan bagikan dokumen">
      <div className="document-share-buttons"><button type="button" className="button button-primary" onClick={print} disabled={!!busy}>Cetak / PDF</button><button type="button" className="button button-secondary" onClick={copy} disabled={!image || !!busy} aria-busy={busy === "copy"}>{busy === "copy" && <span className="spinner" aria-hidden="true"/>}Salin gambar</button><button type="button" className="button button-secondary" onClick={share} disabled={!image || !!busy} aria-busy={busy === "share"}>{busy === "share" && <span className="spinner" aria-hidden="true"/>}Bagikan gambar</button><button type="button" className="button button-secondary" onClick={download} disabled={!image || !!busy}>Unduh PNG</button>{actions}</div>
      <p className="document-share-hint">{preparing ? <><span className="spinner" aria-hidden="true"/>Menyiapkan gambar dokumen...</> : "Bagikan gambar membuka pilihan aplikasi di perangkat Anda, termasuk WhatsApp jika tersedia."}</p>
      {message && <p className="document-share-feedback" role="status">{message}</p>}
      {failed && <button type="button" className="text-link document-retry" onClick={() => { setFailed(false); setPreparing(true); setMessage(""); setAttempt(n => n + 1); }}>Siapkan ulang gambar</button>}
    </div>
    <div className="purchase-document-stage">{content}</div>
    <div ref={exportSurface} className={`purchase-document-stage document-export-surface${thermal ? " is-thermal" : ""}`} aria-hidden="true">{content}</div>
  </>;
}
