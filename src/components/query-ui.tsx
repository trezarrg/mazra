import Link from "next/link";
import type { Query } from "@/lib/period";
import { Notice } from "./ui";
export function Feedback({query,error=false}:{query:Query;error?:boolean}) {return <>{query.error&&<Notice error>{query.error}</Notice>}{query.ok&&<Notice>Data berhasil disimpan.</Notice>}{error&&<Notice error>Data tidak dapat dimuat. Coba muat ulang halaman.</Notice>}</>;}
export function Pagination({query,hasNext,path}:{query:Query;hasNext:boolean;path:string}) {
  const page=pageNumber(query);function link(n:number){const params=new URLSearchParams();Object.entries(query).forEach(([k,v])=>{if(v&&!["page","ok","error","r"].includes(k))params.set(k,v);});params.set("page",String(n));return `${path}?${params}`;}
  return page>1||hasNext?<nav className="pagination" aria-label="Halaman data">{page>1&&<Link className="button button-secondary" href={link(page-1)}>Sebelumnya</Link>}<span>Halaman {page}</span>{hasNext&&<Link className="button button-secondary" href={link(page+1)}>Berikutnya</Link>}</nav>:null;
}
export function pageNumber(query:Query){return Math.max(1,Math.min(100000,Number.parseInt(query.page??"1",10)||1));}
