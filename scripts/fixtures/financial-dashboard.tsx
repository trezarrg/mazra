import { FinancialDashboard } from "../../src/components/financial-dashboard";
import { DashboardRefresh } from "../../src/components/dashboard-refresh";
import type { Summary } from "../../src/lib/summary";
import type { Reminders } from "../../src/lib/reminders";

const empty=()=>({count:0,total:"0",items:[]});
function bill(kind:string,index:number,date:string|null,balance="2500000") {
  return {kind,partner_id:"20000000-0000-4000-8000-000000000001",source_id:`10000000-0000-4000-8000-${String(index).padStart(12,"0")}`,partner_name:kind==="payable"?"Supplier Sukamaju":"Resto Sederhana",reference:`INV-${index}`,document_date:"2026-11-01",due_date:date,total:"3500000",paid:"1000000",credited:"0",balance};
}
const reminders:Reminders={today:"2026-11-05",receivable:{
  overdue:{count:1,total:"2500000",items:[bill("receivable",1,"2026-11-04")]},
  today:{count:7,total:"17500000",items:Array.from({length:5},(_,i)=>bill("receivable",i+2,"2026-11-05"))},
  tomorrow:empty(),unscheduled:{count:2,total:"4000000",items:[]}
},payable:{overdue:empty(),today:{count:1,total:"4500000",items:[bill("payable",10,"2026-11-05","4500000")]},tomorrow:{count:1,total:"3000000",items:[bill("payable",11,"2026-11-06","3000000")]},unscheduled:empty()}};
const summary:Summary={
  sales:"72000000",sales_returns:"2000000",net_sales:"70000000",purchases:"50000000",purchase_returns:"1000000",net_purchases:"49000000",
  cash:"32030000",receivable:"24000000",payable:"7500000",cogs:"48000000",gross_profit:"22000000",stock_result:"-500000",business_profit:"15500000",
  other_income:"1000000",operating_expense:"4000000",wages:"3000000",before_cogs:"64000000",asset_disposal_result:"0",report_status:"Sebelum pajak dan penyusutan",
  cost_complete:true,profit_complete:true,missing_cost_entries:0,inventory_value:"18000000",missing_inventory:0,
  previous_sales:"65000000",previous_start:"2026-10-02",previous_end:"2026-10-31",due_next3:"7500000",due_next7:"7500000",cash_trend:[{month:"2026-11",incoming:"30000000",outgoing:"21000000",net:"9000000"}],
  asset_cost:"0",employee_advances:"0",legacy_openings:0,cash_positions:[],loans:[],stock:[{unit:"kg",quantity:"1243"}],attention:{unreceived_dos:0,weight_discrepancies:0,overdue:1,negative_stock:0}
};
export function FinancialDashboardFixture({mode="normal"}:{mode?:"normal"|"incomplete"|"error"|"loss"}) {
  const data=mode==="incomplete"?{...summary,cogs:null,gross_profit:null,business_profit:null,cost_complete:false,profit_complete:false,missing_cost_entries:2}:mode==="loss"?{...summary,gross_profit:"-2000000",business_profit:"-8500000"}:summary;
  return <div className="dashboard"><DashboardRefresh/><FinancialDashboard summary={mode==="error"?null:data} reminders={mode==="error"?null:reminders} accounts={[{value:"cash",label:"Kas kantor"}]} period={{mode:"month",date:"2026-11-05",month:"2026-11",start:"2026-11-01",end:"2026-11-30"}} today="2026-11-05" trend={summary} months={["2026-06","2026-07","2026-08","2026-09","2026-10","2026-11"]} remindersError={mode==="error"}/></div>;
}
