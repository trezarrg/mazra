import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { officeRoles } from "@/lib/operations";

export default async function Page() {
  await requireAccess(officeRoles);
  redirect("/keuangan");
}
