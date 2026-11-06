"use client";
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from "react";
import {Sheet} from "./sheet";

type InstallPrompt = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
const Installation=createContext<{prompt:InstallPrompt|null;install:()=>Promise<void>}|null>(null);
const installedListeners=new Set<()=>void>();
let installedThisBrowser=false;
function installed(){return installedThisBrowser || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator&{standalone?:boolean}).standalone===true;}
function subscribeInstalled(listener:()=>void){
  installedListeners.add(listener);
  const media=window.matchMedia("(display-mode: standalone)");media.addEventListener("change",listener);
  return ()=>{installedListeners.delete(listener);media.removeEventListener("change",listener);};
}
const noSubscribe=()=>()=>{};
const notInstalled=()=>false;
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);

export function PwaProvider({children}:{children:ReactNode}) {
  const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
  useEffect(()=>{
    const ready=(event:Event)=>{if("prompt" in event){event.preventDefault();setPrompt(event as InstallPrompt);}};
    const completed=()=>{installedThisBrowser=true;setPrompt(null);installedListeners.forEach(listener=>listener());};
    window.addEventListener("beforeinstallprompt",ready);
    window.addEventListener("appinstalled",completed);
    if("serviceWorker" in navigator && window.isSecureContext) void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(()=>{ /* Browser yang membatasi service worker tetap bisa membuka aplikasi. */ });
    return ()=>{window.removeEventListener("beforeinstallprompt",ready);window.removeEventListener("appinstalled",completed);};
  },[]);
  const install=async()=>{if(!prompt)return;try{await prompt.prompt();await prompt.userChoice;}finally{setPrompt(null);}};
  return <Installation.Provider value={{prompt,install}}>{children}</Installation.Provider>;
}

export function InstallAppButton() {
  const context=useContext(Installation),isInstalled=useSyncExternalStore(subscribeInstalled,installed,notInstalled);
  const ios=useSyncExternalStore(noSubscribe,isIOS,notInstalled);
  const [message,setMessage]=useState("");
  if(!context || isInstalled)return null;
  if(context.prompt)return <><button type="button" className="button button-secondary" onClick={()=>{void context.install().catch(()=>setMessage("Buka menu browser untuk memasang aplikasi."));}}>Pasang aplikasi</button>{message&&<small role="status">{message}</small>}</>;
  return <Sheet title="Pasang aplikasi" trigger="Pasang aplikasi" className="button button-secondary"><p>{ios?"Buka aplikasi melalui Safari, ketuk Bagikan, lalu pilih Tambahkan ke Layar Utama.":"Buka menu browser lalu pilih Pasang aplikasi atau Tambahkan ke layar utama. Di komputer, pilihan pemasangan juga dapat muncul di bilah alamat Chrome atau Edge."}</p><p className="caption">Setelah dipasang, buka dari ikon perangkat. Pencatatan dan pembacaan transaksi tetap memerlukan internet.</p></Sheet>;
}
