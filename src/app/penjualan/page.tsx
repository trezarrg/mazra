import { OperationListPage } from "@/components/operation-list-page";
import type { Query } from "@/lib/period";
export default async function Page({searchParams}:{searchParams:Promise<Query>}) {return <OperationListPage query={await searchParams} kind="sale" title="Penjualan" path="/penjualan"/>;}
