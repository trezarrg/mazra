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
  return {title:brand.name,description:"Pencatatan usaha ayam potong",manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:brand.name,statusBarStyle:"default"},icons:{icon:"/icons/app-192.png",apple:"/icons/apple-touch-icon.png"}};
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f6f4" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body><FormValidation/><PwaProvider>{children}</PwaProvider></body></html>; }
