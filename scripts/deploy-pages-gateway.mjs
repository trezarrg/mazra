import {readFile} from "node:fs/promises";
import {loadClients} from "./client-config.mjs";

const client=(await loadClients()).find(c=>c.id===process.argv[2] && c.enabled);
if(!client) throw new Error("Instalasi tidak tersedia.");
if(!client.pagesProject) { console.log("Instalasi ini tidak memakai Pages gateway."); process.exit(0); }
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/.test(account??"")||!token) throw new Error("Kredensial Cloudflare belum diisi.");
const path=`/accounts/${account}/pages/projects`;
async function api(suffix,options={},allowMissing=false) {
  const response=await fetch(`https://api.cloudflare.com/client/v4${suffix}`,{
    ...options,headers:{Authorization:`Bearer ${token}`,...options.headers},
  });
  const body=await response.json();
  if(response.status===404 && allowMissing) return null;
  if(!response.ok||!body.success) throw new Error(`Cloudflare menolak operasi gateway (${response.status}): ${(body.errors??[]).map(e=>e.message).join('; ')}`);
  return body.result;
}
// Jangan mengambil alih proyek Pages yang memiliki tujuan aplikasi berbeda.
const existing=await api(`${path}/${client.pagesProject}`,{},true);
if(existing && existing.deployment_configs?.production?.services?.APP?.service!==client.worker) throw new Error("Pages sudah ada dengan binding berbeda; tinjau tujuan sebelum rilis.");
if(existing && existing.production_branch!=="main") throw new Error("Cabang produksi Pages berbeda dari konfigurasi rilis.");
if(!existing) await api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
  name:client.pagesProject,production_branch:"main",
  deployment_configs:{production:{compatibility_date:"2026-10-30",services:{APP:{service:client.worker}}}},
})});
const form=new FormData();
form.set("manifest","{}");
form.set("branch","main");
form.set("commit_dirty","true");
form.set("_worker.js",new Blob([await readFile(new URL("../deployments/pages-gateway.mjs",import.meta.url),"utf8")],{type:"application/javascript+module"}),"_worker.js");
form.set("_routes.json",new Blob([JSON.stringify({version:1,include:["/*"],exclude:[]})],{type:"application/json"}),"_routes.json");
const deployment=await api(`${path}/${client.pagesProject}/deployments`,{method:"POST",body:form});
let current=deployment;
for(let attempt=0;attempt<30;attempt++) {
  if(current.latest_stage?.name==="deploy" && current.latest_stage.status==="success") break;
  if(["failure","failed","canceled"].includes(current.latest_stage?.status)) throw new Error("Publikasi gateway gagal; periksa deployment Pages.");
  await new Promise(resolve=>setTimeout(resolve,2000));
  current=await api(`${path}/${client.pagesProject}/deployments/${deployment.id}`);
}
if(current.latest_stage?.name!=="deploy" || current.latest_stage.status!=="success") throw new Error("Publikasi gateway belum selesai; periksa status Pages sebelum melanjutkan.");
console.log(`Gateway terbit: https://${client.pagesProject}.pages.dev (${deployment.id}).`);
