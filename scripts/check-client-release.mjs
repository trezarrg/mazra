import {loadClients,verifyTarget} from "./client-config.mjs";
const client=(await loadClients()).find(c=>c.id===process.argv[2] && c.enabled);
if(!client?.url) throw new Error("Alamat instalasi belum dikonfigurasi.");
verifyTarget(client,process.env);
let failure;
for(let attempt=0;attempt<10;attempt++) {
  try {
    const response=await fetch(`${client.url}/login`,{signal:AbortSignal.timeout(15000)});
    const html=await response.text();
    if(response.status!==200 || !html.includes('id="login-email"')) throw new Error("Halaman login belum tersedia.");
    const logo=await fetch(new URL(client.logo,client.url),{signal:AbortSignal.timeout(15000)});
    if(logo.status!==200) throw new Error("Logo instalasi belum tersedia.");
    const identity=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_business_branding`,{method:"POST",headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(15000)});
    if(!identity.ok) throw new Error("Identitas publik belum tersedia.");
    const brand=await identity.json();
    if(brand.logo_path) {
      if(!/^logos\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(brand.logo_path)) throw new Error("Referensi logo usaha tidak valid.");
      const uploaded=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/business-branding/${brand.logo_path}`,{signal:AbortSignal.timeout(15000)});
      if(uploaded.status!==200) throw new Error("Logo usaha belum dapat dibuka.");
      await uploaded.arrayBuffer();
    }
    const auth=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(15000)});
    if(!auth.ok || !(await auth.json()).disable_signup) throw new Error("Konfigurasi autentikasi belum sesuai.");
    console.log(`Alamat publik, aset, dan autentikasi ${client.id} terverifikasi: ${client.url}`);
    process.exit(0);
  } catch(error) { failure=error; await new Promise(resolve=>setTimeout(resolve,2000)); }
}
throw failure;
