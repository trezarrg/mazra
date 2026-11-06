import type { Metadata, Viewport } from "next";
import { FormValidation } from "@/components/form-validation";
import "./globals.css";
import "./redesign.css";
import "./document.css";
import "./motion.css";
export const metadata: Metadata = { title: "Usaha Ayam Potong", description: "Pencatatan usaha ayam potong" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f6f4" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body><FormValidation/>{children}</body></html>; }
