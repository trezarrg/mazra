import { randomUUID } from "node:crypto";
import { formatDate, formatDecimal } from "@/lib/format";
import { Sheet } from "@/components/sheet";
import { EmptyState, ListRow } from "@/components/ui";
import { MeasurementForm } from "./forms";

export type ReceivingTask = { id: string; document_no: number; purchase_date: string; supplier_name: string; product_name: string; origin: string | null; estimated_weight: string | null };

export function ReceivingQueue({ tasks, today, error = false }: { tasks: ReceivingTask[]; today: string; error?: boolean }) {
  return <>
    {tasks.map(task => <Sheet key={task.id} title={`Timbang DO #${task.document_no}`} className="row-button" trigger={<ListRow title={`${task.supplier_name} · DO #${task.document_no}`} subtitle={`${task.product_name} · ${formatDate(task.purchase_date)}${task.origin ? ` · ${task.origin}` : ""}`} trailing={<span className="text-link">Timbang</span>}/>}>
      <div className="document-summary"><strong>{task.supplier_name}</strong><p>{task.product_name}{task.origin ? ` · ${task.origin}` : ""}</p>{task.estimated_weight && <p>Perkiraan DO {formatDecimal(task.estimated_weight)} kg</p>}</div>
      <MeasurementForm id={randomUUID()} today={today} doId={task.id}/>
    </Sheet>)}
    {!error && !tasks.length && <EmptyState title="Tidak ada DO yang perlu ditimbang pada periode ini"/>}
  </>;
}
