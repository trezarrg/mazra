// Identitas bawaan saat pengaturan usaha belum tersedia.
const legacyDemo = process.env.NEXT_PUBLIC_SUPABASE_URL === "https://vcephhquqtppxuvypeft.supabase.co";
export const branding = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME || (legacyDemo ? "Rizki Berkah Abadi Farm" : "Usaha Ayam Potong"),
  logo: process.env.NEXT_PUBLIC_BUSINESS_LOGO || (legacyDemo ? "/Logo.png" : "/brand-default.svg"),
};
