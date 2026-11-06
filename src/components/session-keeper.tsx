"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {getBrowserClient} from "@/lib/supabase/browser";

export function SessionKeeper() {
  const router=useRouter();
  useEffect(()=>{
    const client=getBrowserClient();
    const check=()=>{
      if(document.visibilityState!=="visible") return;
      void client.auth.getSession().then(({data,error})=>{
        if(!error && !data.session) router.replace("/login");
      }).catch(()=>{ /* Gangguan jaringan tidak menghapus sesi. */ });
    };
    const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
      if(event==="SIGNED_OUT") router.replace("/login");
    });
    check();
    window.addEventListener("focus",check);
    window.addEventListener("pageshow",check);
    document.addEventListener("visibilitychange",check);
    return ()=>{subscription.unsubscribe();window.removeEventListener("focus",check);window.removeEventListener("pageshow",check);document.removeEventListener("visibilitychange",check);};
  },[router]);
  return null;
}
