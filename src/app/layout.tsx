import type { Metadata, Viewport } from "next";
import { FormValidation } from "@/components/form-validation";
import { PwaProvider } from "@/components/pwa-provider";
import { getBusinessBranding } from "@/lib/business-branding";
import "./globals.css";
import "./redesign.css";
import "./document.css";
import "./motion.css";
export async function generateMetadata(): Promise<Metadata> {
  const brand=await getBusinessBranding();
  return {title:brand.name,description:"Pencatatan usaha ayam potong"};
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f6f4" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand=await getBusinessBranding();
  // Tautan pemasangan harus berada di head awal, bukan metadata dinamis yang di-stream ke body.
  return <html lang="id"><head>
    <link rel="manifest" href="/manifest.webmanifest"/>
    <link rel="icon" type="image/png" href="/icons/app-192.png"/>
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>
    <meta name="apple-mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-title" content={brand.name}/>
    <meta name="apple-mobile-web-app-status-bar-style" content="default"/>
  </head><body><FormValidation/><PwaProvider>{children}</PwaProvider></body></html>;
}
