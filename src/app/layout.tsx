import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./redesign.css";
import "./motion.css";
export const metadata: Metadata = { title: "Usaha Ayam Potong", description: "Pencatatan usaha ayam potong" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f6f4" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body>{children}</body></html>; }
