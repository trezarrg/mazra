import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createServerClient} from '@supabase/ssr';
const exec=promisify(execFile);
assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(),'vcephhquqtppxuvypeft','Proyek tujuan berbeda');
const dir=mkdtempSync(join(tmpdir(),'ayam-concurrency-'));
const ids=Object.fromEntries(['auth','product','customer','supplier','account','order','receipt','sale','race1','race2','pay1','pay2','pay3'].map(name=>[name,randomUUID()]));
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
const supabaseUrl=env.NEXT_PUBLIC_SUPABASE_URL;const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(new URL(supabaseUrl).hostname,'vcephhquqtppxuvypeft.supabase.co');
const jar=new Map();const db=createServerClient(supabaseUrl,key,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:entries=>entries.forEach(({name,value})=>jar.set(name,value))}});
const password=randomUUID()+randomUUID();const email=`uat-${ids.auth}@example.invalid`;
let serial=0;let clean=false;let uploaded=false;const storagePath=`${ids.sale}/${randomUUID()}.png`;
async function query(sql,fail=true){
 const file=join(dir,`${serial++}.sql`);writeFileSync(file,sql);
 try {const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`supabase db query --linked --file '${file.replaceAll("'","''")}'; exit $LASTEXITCODE`],{cwd:process.cwd(),timeout:90000,maxBuffer:2*1024*1024,windowsHide:true});return {ok:true,stdout};}
 catch(error){if(fail)throw new Error(error.stderr||error.stdout||error.message);return {ok:false,message:error.stderr||error.stdout||error.message};}
}
const identity=`select set_config('request.jwt.claim.sub','${ids.auth}',true);`;
async function post(name,args){const {data,error}=await db.rpc(name,args);return {ok:!error,message:error?.message,data};}
const saleData=quantity=>({date:'2026-10-31',partner:ids.customer,items:[{product:ids.product,unit:'kg',quantity:String(quantity),price:'10'}]});
function rows(output){const start=output.indexOf('{');return JSON.parse(output.slice(start)).rows;}
const cleanup=`begin;
create temporary table cleanup_ids as
 select id::text id from public.stock_movements where product_id='${ids.product}' union
 select id::text from public.cash_movements where account_id='${ids.account}' union
 select id::text from public.operation_items where product_id='${ids.product}' union
 select unnest(array[${Object.values(ids).map(id=>`'${id}'`).join(',')}]);
delete from public.payments where source_id in ('${ids.sale}','${ids.race1}','${ids.race2}');
delete from public.operation_items where product_id='${ids.product}';
delete from public.operations where id in ('${ids.sale}','${ids.race1}','${ids.race2}');
delete from public.purchase_receipts where do_id='${ids.order}';
delete from public.purchase_dos where id='${ids.order}';
delete from public.stock_movements where product_id='${ids.product}';
delete from public.cash_movements where account_id='${ids.account}';
delete from public.stock_valuation_balances where product_id='${ids.product}';
delete from public.product_units where product_id='${ids.product}';
delete from public.products where id='${ids.product}';
delete from public.cash_accounts where id='${ids.account}';
delete from public.partners where id in ('${ids.customer}','${ids.supplier}');
delete from public.profiles where id='${ids.auth}';
delete from public.audit_events where record_id in(select id from cleanup_ids) or actor_id='${ids.auth}';
delete from auth.users where id='${ids.auth}';
commit;`;
writeFileSync(join(dir,'cleanup.sql'),cleanup);
try {
 await query(`begin;
 insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
 values('${ids.auth}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${email}',extensions.crypt('${password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','');
 insert into public.profiles(id,full_name,role) values('${ids.auth}','UAT API paralel','admin');
 ${identity}
 insert into public.partners(id,name,is_customer,is_supplier) values('${ids.customer}','UAT paralel ${ids.customer}',true,false),('${ids.supplier}','UAT paralel ${ids.supplier}',false,true);
 insert into public.products(id,name) values('${ids.product}','UAT paralel ${ids.product}');
 insert into public.product_units(product_id,unit) values('${ids.product}','kg');
 insert into public.cash_accounts(id,name,account_type) values('${ids.account}','UAT paralel ${ids.account}','cash');
 select public.create_purchase_do('${ids.order}','2026-10-31','${ids.supplier}','${ids.product}',null,null,null,'kg',10,null);
 select public.confirm_purchase_receipt('${ids.receipt}','${ids.order}','2026-10-31',null,1000,1000,null,null); commit;`);
 const {error:loginError}=await db.auth.signInWithPassword({email,password});assert.equal(loginError,null,loginError?.message);
 const sale=(id,quantity)=>post('save_operation',{p_id:id,p_kind:'sale',p_data:saleData(quantity),p_final:true});
 const retry=await Promise.all([sale(ids.sale,100),sale(ids.sale,100)]);assert.ok(retry.every(r=>r.ok),JSON.stringify(retry));
 const races=await Promise.all([sale(ids.race1,700),sale(ids.race2,700)]);
 assert.equal(races.filter(r=>r.ok).length,1,'Hanya satu penjualan 700 kg dapat diposting');assert.ok(races.find(r=>!r.ok).message.includes('tidak cukup'));
 const pay=(id,amount)=>post('post_payment',{p_id:id,p_kind:'receivable',p_source:ids.sale,p_date:'2026-10-31',p_account:ids.account,p_amount:amount,p_note:null});
 const payments=await Promise.all([pay(ids.pay1,700),pay(ids.pay2,700)]);
 assert.equal(payments.filter(r=>r.ok).length,1,'Pembayaran paralel tidak boleh melebihi sisa');assert.ok(payments.find(r=>!r.ok).message.includes('Pembayaran melebihi'));
 const duplicate=await Promise.all([pay(ids.pay3,300),pay(ids.pay3,300)]);assert.ok(duplicate.every(r=>r.ok),JSON.stringify(duplicate));
 const verification=await query(`select json_build_object('stock',(select sum(quantity) from public.stock_movements where product_id='${ids.product}'),'sales',(select count(*) from public.operations where id in ('${ids.sale}','${ids.race1}','${ids.race2}')),'payments',(select count(*) from public.payments where source_id='${ids.sale}'),'cash',(select sum(amount) from public.cash_movements where account_id='${ids.account}'),'balance',(select balance_amount from public.obligations where source_id='${ids.sale}'),'cogs',(select sum(v.cogs) from public.stock_valuation v join public.stock_movements m on m.id=v.movement_id where m.product_id='${ids.product}'),'inventory_value',(select value from public.stock_valuation_balances where product_id='${ids.product}')) result;`);
 assert.deepEqual(rows(verification.stdout)[0].result,{stock:200,sales:2,payments:2,cash:1000,balance:0,cogs:8000,inventory_value:2000});
 console.log('Lulus: retry paralel, perebutan stok, batas pembayaran paralel, dan saldo akhir.');
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const evidence=await db.storage.from('transaction-evidence').upload(storagePath,image,{contentType:'image/png'});assert.equal(evidence.error,null,evidence.error?.message);uploaded=true;
 const attachment=await db.from('document_attachments').insert({source_id:ids.sale,storage_path:storagePath,file_name:'uat.png',created_by:ids.auth});assert.equal(attachment.error,null,attachment.error?.message);
 const signed=await db.storage.from('transaction-evidence').createSignedUrl(storagePath,30);assert.equal(signed.error,null,signed.error?.message);
 const forbidden=await db.storage.from('transaction-evidence').upload(`${randomUUID()}/uat.png`,image,{contentType:'image/png'});assert.ok(forbidden.error,'Bukti tanpa dokumen sah harus ditolak');
 console.log('Lulus: unggah bukti privat, metadata, tautan sementara, dan penolakan sumber tidak sah.');
 if(process.env.AYAM_TEST_BASE_URL){
   const cookie=Array.from(jar,([name,value])=>`${name}=${value}`).join('; ');
   const paths=['/','/penjualan?period=all','/pembelian?period=all','/penerimaan?period=all','/produksi?period=all','/stok','/stok?tab=riwayat&period=all','/keuangan?period=all','/tagihan','/tagihan?status=today','/tagihan?status=tomorrow','/tagihan?status=overdue','/tagihan?status=unscheduled','/riwayat?period=all','/riwayat?tab=pembelian&period=all','/sdm','/aset','/akuntansi','/akuntansi?tab=laba','/akuntansi?tab=neraca','/akuntansi?tab=modal','/analisis','/lainnya','/data','/dokumen?status=unpaid',`/dokumen/${ids.sale}`];
   for(const path of paths){const response=await fetch(new URL(path,process.env.AYAM_TEST_BASE_URL),{headers:{cookie}});assert.equal(response.status,200,`HTTP ${path}`);const html=await response.text();assert.ok(html.includes('Lewati ke konten'),`Halaman aplikasi tidak dimuat: ${path}`);const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');assert.ok(!/Data tidak dapat dimuat|Laporan tidak dapat dimuat|Sebagian ringkasan tidak dapat dimuat|Dokumen tidak dapat dimuat|Pengingat belum dapat dimuat|Kinerja usaha belum dapat dimuat/.test(visible),`Kesalahan data pada ${path}`);}
   const retired=await fetch(new URL('/setoran',process.env.AYAM_TEST_BASE_URL),{headers:{cookie},redirect:'manual'});
   const redirected=retired.headers.get('location')||'';
   const retiredBody=await retired.text();
   assert.ok(redirected.includes('/keuangan')||/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*\/keuangan/i.test(retiredBody),'Rute setoran menuju Buku keuangan');
   const csv=await fetch(new URL('/api/ekspor?export=sale&period=all',process.env.AYAM_TEST_BASE_URL),{headers:{cookie}});assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
   console.log(`Lulus: ${paths.length} halaman HTTP dengan sesi admin dan ekspor CSV.`);
 }
} finally {
 try {
   if(uploaded){await query(`delete from public.document_attachments where source_id='${ids.sale}';`);const removed=await db.storage.from('transaction-evidence').remove([storagePath]);assert.equal(removed.error,null,removed.error?.message);}
   await query(cleanup);clean=true;console.log('Fixture, akun Auth, bukti, dan audit pengujian paralel dibersihkan.');
 }
 catch(error){console.error(`Pembersihan gagal. Jalankan ${join(dir,'cleanup.sql')}`);throw error;}
 finally {if(clean){for(const name of readdirSync(dir))unlinkSync(join(dir,name));rmdirSync(dir);}}
}
