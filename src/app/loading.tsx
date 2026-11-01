export default function Loading() {
  return <main className="loading-shell" aria-busy="true" aria-label="Memuat halaman"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-hero"/><div className="skeleton-grid"><div className="skeleton"/><div className="skeleton"/></div><div className="skeleton skeleton-list"/><span className="sr-only">Memuat data…</span></main>;
}
