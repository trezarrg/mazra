"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { businessLogoLimit } from "@/lib/business-logo";

export function BusinessLogoField({ logo, name, disabled }: { logo:string; name:string; disabled:boolean }) {
  const objectURL=useRef<string|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  useEffect(()=>()=>{if(objectURL.current)URL.revokeObjectURL(objectURL.current);},[]);
  return <div className="business-identity business-logo-field">
    <span className="brand-mark large brand-logo"><Image src={preview??logo} alt="Logo usaha" width={64} height={64} unoptimized/></span>
    <div><strong>{name}</strong>{disabled?<span>Profil usaha</span>:<label>Logo usaha<input type="file" name="logo" accept="image/png,image/jpeg,image/webp" onChange={event=>{
      const file=event.currentTarget.files?.[0];
      event.currentTarget.setCustomValidity(file&&file.size>businessLogoLimit?"Ukuran logo maksimal 2 MB.":"");
      if(objectURL.current)URL.revokeObjectURL(objectURL.current);
      objectURL.current=file&&file.size<=businessLogoLimit?URL.createObjectURL(file):null;
      setPreview(objectURL.current);
    }}/><small className="caption">PNG, JPG, atau WebP · Maks. 2 MB</small></label>}</div>
  </div>;
}
