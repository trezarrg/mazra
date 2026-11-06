import {getBusinessBranding} from "@/lib/business-branding";
export const dynamic="force-dynamic";
export async function GET() {
  const brand=await getBusinessBranding();
  return Response.json({
    id:"/",name:brand.name,short_name:brand.name.slice(0,24),lang:"id-ID",start_url:"/",scope:"/",
    display:"standalone",background_color:"#f5f6f4",theme_color:"#245c48",prefer_related_applications:false,
    icons:[
      {src:"/icons/app-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
      {src:"/icons/app-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
      {src:"/icons/app-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
    ],
  },{headers:{"Content-Type":"application/manifest+json","Cache-Control":"public, max-age=300"}});
}
