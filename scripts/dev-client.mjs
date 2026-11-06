import { spawn } from "node:child_process";
import { loadClients, verifyTarget } from "./client-config.mjs";

const [id,port="3002"]=process.argv.slice(2);
const client=(await loadClients()).find(c=>c.id===id && c.enabled);
if(!client || !/^\d{2,5}$/.test(port) || Number(port)>65535) throw new Error("Gunakan npm run dev:client -- <id instalasi> [port].");
process.loadEnvFile(`.env.${client.id}.local`);
verifyTarget(client,process.env);
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--port",port],{
  stdio:"inherit",
  env:{...process.env,APP_DEV_INSTANCE:client.id,APP_WORKER_NAME:client.worker,NEXT_PUBLIC_BUSINESS_NAME:client.businessName,NEXT_PUBLIC_BUSINESS_LOGO:client.logo},
});
child.on("exit",code=>{process.exitCode=code??1;});
child.on("error",()=>{console.error("Server klien gagal dimulai.");process.exitCode=1;});
