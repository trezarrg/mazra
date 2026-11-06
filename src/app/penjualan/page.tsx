import { SalesListPage } from "@/components/operation-list-page";
import type { Query } from "@/lib/period";
export default async function Page({searchParams}:{searchParams:Promise<Query>}) {return <SalesListPage query={await searchParams}/>;}
