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
    const auth=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(15000)});
    if(!auth.ok || !(await auth.json()).disable_signup) throw new Error("Konfigurasi autentikasi belum sesuai.");
    console.log(`Alamat publik, aset, dan autentikasi ${client.id} terverifikasi: ${client.url}`);
    process.exit(0);
  } catch(error) { failure=error; await new Promise(resolve=>setTimeout(resolve,2000)); }
}
throw failure;
