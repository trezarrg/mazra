"use client";
import { EmptyState } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="access-page"><EmptyState icon="shield" title="Halaman belum dapat dimuat" description="Periksa koneksi Anda lalu coba lagi."/><button type="button" className="button button-primary" onClick={reset}>Coba lagi</button></main>;
}
