import {mkdir} from "node:fs/promises";
import {resolve,relative} from "node:path";
import sharp from "sharp";

export async function generatePwaIcons(logo=process.env.NEXT_PUBLIC_BUSINESS_LOGO||"/brand-default.svg") {
  const root=resolve("public"),source=resolve(root,logo.replace(/^\//,""));
  if(!logo.startsWith("/")||logo.startsWith("//")||relative(root,source).startsWith(".."))throw new Error("Sumber ikon aplikasi tidak valid.");
  await mkdir(resolve(root,"icons"),{recursive:true});
  for(const [name,size,ratio] of [["app-192.png",192,0.76],["app-512.png",512,0.76],["app-maskable-512.png",512,0.64],["apple-touch-icon.png",180,0.76]]) {
    const inner=Math.round(size*ratio);
    const image=await sharp(source).resize(inner,inner,{fit:"inside"}).png().toBuffer();
    await sharp({create:{width:size,height:size,channels:4,background:"#f5f6f4"}}).composite([{input:image,gravity:"centre"}]).png().toFile(resolve(root,"icons",name));
  }
  console.log("Ikon pemasangan aplikasi dibuat dari logo bawaan instalasi.");
}
if(process.argv[1]?.replaceAll("\\","/").endsWith("/generate-pwa-icons.mjs"))await generatePwaIcons();
