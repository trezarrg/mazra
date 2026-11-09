import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Browser fixture: tidak login, tidak menghubungi Supabase, dan tidak mengirim pesan.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'artifacts', 'purchase-document');
const temporary = await mkdtemp(join(tmpdir(), 'ayam-doc-check-'));
const fixture = {
  id: '4455749a-c720-406b-ae20-0a464f4f0bcd', number: 'PB-000023-4455749A', doNumber: 23,
  orderDate: '2026-11-05', receiptDate: '2026-11-05',
  business: { name: 'Usaha Ayam Potong Contoh', address: 'Alamat usaha sesuai profil bisnis', phone: null },
  supplier: { name: 'Supplier Contoh', address: null, phone: null }, product: 'Ayam hidup', origin: 'Kandang supplier',
  originWeight: '100.000', actualWeight: '99.000', billingQuantity: '99.000', priceMethod: 'kg',
  unitPrice: '30000.00', total: '2970000.00', credited: '0.00', paid: '2970000.00', balance: '0.00',
  dueDate: null, note: 'Pembelian sesuai berat yang disepakati dengan supplier.',
  payments: [{ id: '6ab0e128-0000-4000-8000-000000000001', date: '2026-11-05', account: 'Kas kantor', amount: '2970000.00', note: null, kind: 'payment' }],
};
let browser, socket, server;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
let sequence = 0;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  const diagnostic = await evaluate(`({text:document.body.innerText.slice(0,1000),errors:window.fixtureErrors})`);
  throw new Error(`Kondisi browser belum terpenuhi: ${expression}\n${JSON.stringify(diagnostic)}`);
}
async function click(text) {
  await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled && b.getClientRects().length>0)`);
  const point = await evaluate(`(() => {const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)} && b.getClientRects().length>0); if(!b || b.disabled) throw new Error('Tombol tidak siap'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function clickSelector(selector) {
  const point = await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(selector)}); if(!b) throw new Error('Kontrol tidak ditemukan'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function screenshot(name, viewportOnly = false) {
  if (viewportOnly) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(output, name), Buffer.from(data, 'base64'));
    return;
  }
  const { cssContentSize: size } = await send('Page.getLayoutMetrics');
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
  await writeFile(join(output, name), Buffer.from(data, 'base64'));
}
try {
  await mkdir(output, { recursive: true });
  const imageStub = join(temporary, 'image.tsx');
  await writeFile(imageStub, `import React from 'react'; export default function Image({unoptimized,priority,...props}) { return <img {...props}/>; }`);
  const linkStub = join(temporary, 'link.tsx');
  await writeFile(linkStub, `import React from 'react'; export default function Link(props) { return <a {...props}/>; }`);
  const actionStub = join(temporary, 'actions.ts');
  await writeFile(actionStub, `export async function saveOperation(form) { window.postedFixture=Object.fromEntries(form.entries()); if(form.get("kind")==="sheet-feedback"){window.feedbackSubmissions=(window.feedbackSubmissions||0)+1; await new Promise(resolve=>setTimeout(resolve,80));window.sheetFeedbackNavigation(window.sheetFeedbackOutcome||"error");} } export async function changeTransaction(form) {window.changedFixture=Object.fromEntries(form.entries());} export async function payBill(form) {window.paidFixture=Object.fromEntries(form.entries());} export async function setBillDue(form) {window.dueFixture=Object.fromEntries(form.entries());} export async function saveStockCost(form) {window.costFixture=Object.fromEntries(form.entries());} export async function recordDelivery(form) {} export async function reverseDocument(form) { window.cancelledFixture=Object.fromEntries(form.entries()); } export async function recordMeasurement(form) { window.measuredFixture=Object.fromEntries(form.entries()); }`);
  const navigationStub = join(temporary, 'navigation.ts');
  await writeFile(navigationStub, `const router={replace:path=>{window.routeFixture=path;history.replaceState(null,"",path)},refresh:()=>{window.refreshFixture=(window.refreshFixture||0)+1}};export const useRouter=()=>router; export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);`);
  const cryptoStub = join(temporary, 'crypto.ts');
  await writeFile(cryptoStub, `export const randomUUID=()=>crypto.randomUUID();`);
  const entry = join(temporary, 'entry.tsx');
  await writeFile(entry, `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PurchaseDocumentView} from ${JSON.stringify(join(root, 'src/components/purchase-document-view.tsx'))}; import {PurchaseReturnForm} from ${JSON.stringify(join(root, 'src/components/purchase-return-form.tsx'))}; import {PurchaseDocumentManagement} from ${JSON.stringify(join(root, 'src/components/purchase-document-management.tsx'))}; import {ReceivingQueue} from ${JSON.stringify(join(root, 'src/app/penerimaan/queue-list.tsx'))}; import {OperationForm} from ${JSON.stringify(join(root, 'src/components/operation-form.tsx'))}; import {ProcessingForm} from ${JSON.stringify(join(root, 'src/components/processing-form.tsx'))}; import {Sheet} from ${JSON.stringify(join(root, 'src/components/sheet.tsx'))}; import {SheetFeedbackFixture} from ${JSON.stringify(join(root, 'scripts/fixtures/sheet-feedback.tsx'))}; import {FinancialDashboardFixture} from ${JSON.stringify(join(root, 'scripts/fixtures/financial-dashboard.tsx'))}; import {StockMeasurementsFixture} from ${JSON.stringify(join(root, 'scripts/fixtures/stock-measurements.tsx'))}; import {SaleDocumentFixture} from ${JSON.stringify(join(root, 'scripts/fixtures/sale-document.tsx'))}; import {FormValidation} from ${JSON.stringify(join(root, 'src/components/form-validation.tsx'))}; const validationHost=document.createElement('div');document.body.append(validationHost);createRoot(validationHost).render(<FormValidation/>); const root=createRoot(document.getElementById('root')); const data=${JSON.stringify(fixture)}; window.setDocumentData=patch=>{Object.assign(data,patch); root.render(<div className="purchase-document"><PurchaseDocumentView key={JSON.stringify(data)} data={{...data}}/><PurchaseDocumentManagement source={data.id} today="2026-11-05" payments={data.payments.filter(p=>p.kind==='payment').map(p=>({id:p.id,payment_date:p.date,amount:p.amount,account_name:p.account,note:p.note,reversed_by:null}))} returns={[]} remainingWeight="99" remainingAmount={data.total} balance={data.balance} price={data.unitPrice} method={data.priceMethod} accounts={[{value:'cash',label:'Kas kantor'}]}/></div>)}; window.showReturnForm=()=>root.render(<PurchaseReturnForm id="fixture-return" source="fixture-receipt" today="2026-11-05" remainingWeight="99" remainingAmount="2970000.00" balance="0.00" price="30000.00" method="kg" accounts={[{value:'cash',label:'Kas kantor'}]} returnTo="/fixture"/>); window.showReceivingQueue=empty=>root.render(<div className="list-card"><ReceivingQueue today="2026-11-05" tasks={empty?[]:[{id:'11111111-1111-4111-8111-111111111111',document_no:31,purchase_date:'2026-11-05',supplier_name:'Supplier Contoh',product_name:'Ayam hidup',origin:'Kandang A',estimated_weight:'200.000'},{id:'22222222-2222-4222-8222-222222222222',document_no:32,purchase_date:'2026-11-04',supplier_name:'Supplier Kedua',product_name:'Ayam hidup',origin:null,estimated_weight:null}]}/></div>); window.showProcessing=()=>root.render(<Sheet title="Catat hasil potong" trigger="Catat hasil potong"><ProcessingForm id="fixture-processing" today="2026-11-05" choices={[{key:'live:',product:'live',variant:'',label:'Ayam hidup',balance:'100'},{key:'carcass:',product:'carcass',variant:'',label:'Karkas',balance:'30'},{key:'fillet:',product:'fillet',variant:'',label:'Dada fillet',balance:'5'}]} returnTo="/stok?tab=potong"/></Sheet>); window.showCountSale=initial=>root.render(<Sheet key={initial?"resume":"new"} wide title="Penjualan baru" trigger="Tambah"><OperationForm id={initial?"fixture-resumed-sale":"fixture-count-sale"} initial={initial} kind="sale" today="2026-11-05" returnTo="/penjualan" options={{products:[{id:'live',name:'Ayam hidup',product_units:[{unit:'kg'},{unit:'ekor'}],product_variants:[{id:'large',name:'Ukuran besar',active:true}]}],partners:[{value:'customer',label:'Pelanggan contoh'}],accounts:[{value:'cash',label:'Kas kantor'}],drivers:[{value:'driver',label:'Sopir contoh'}]}}/></Sheet>); window.showCountReturn=()=>root.render(<OperationForm id="fixture-count-return" kind="sale_return" today="2026-11-05" returnTo="/penjualan" initial={{source:'original-sale'}} sourceItems={[{value:'sale-line',label:'Ayam hidup - 10 ekor / 20 kg',unit:'ekor'}]} options={{products:[],partners:[],accounts:[]}}/>); window.showSheetFeedback=()=>{window.feedbackVersion=0;window.feedbackSubmissions=0;window.sheetFeedbackOutcome='error';history.replaceState(null,'','/produksi?period=all');root.render(<SheetFeedbackFixture version={0}/>);};window.sheetFeedbackNavigation=outcome=>{window.feedbackVersion++;history.replaceState(null,'','/produksi?period=all&'+(outcome==='error'?'error='+encodeURIComponent('Stok Dada tidak cukup.'):'ok=1')+'&r='+window.feedbackVersion);root.render(<SheetFeedbackFixture version={window.feedbackVersion} initialOpen={outcome==='success'}/>);};window.remountSheetFeedback=()=>root.render(<SheetFeedbackFixture key="remounted" version={99} initialOpen/>); window.showFinancialDashboard=mode=>{history.replaceState(null,"","/?period=month&month=2026-11");root.render(<FinancialDashboardFixture mode={mode}/>)}; window.showStockMeasurements=mode=>root.render(<StockMeasurementsFixture key={mode} mode={mode}/>); window.showSaleDocument=cancelled=>root.render(<SaleDocumentFixture cancelled={cancelled}/>); window.setDocumentData({});`);
  const result = await build({
    configFile: false, root, logLevel: 'silent',
    resolve: { alias: { 'next/image': imageStub, 'next/link': linkStub, 'next/navigation': navigationStub, 'node:crypto': cryptoStub, '@/app/operasi/actions': actionStub, '@': join(root, 'src'), 'react-dom': join(root, 'node_modules/react-dom'), react: join(root, 'node_modules/react') } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(''), 'process.env.NEXT_PUBLIC_BUSINESS_NAME': JSON.stringify('Usaha Ayam Potong Contoh'), 'process.env.NEXT_PUBLIC_BUSINESS_LOGO': JSON.stringify('/Logo.png') },
    oxc: { jsx: { runtime: 'automatic' } },
    build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: () => 'preview.js' } },
  });
  const builtFiles = Array.isArray(result) ? result.flatMap(bundle => bundle.output) : result.output;
  const chunks = new Map(builtFiles.map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]));
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['globals.css', 'redesign.css', 'document.css', 'motion.css'].map(file => `<link rel="stylesheet" href="/${file}">`).join('')}<style>.app-main{margin-left:0!important} .page-content{padding:28px 20px} @media print{.page-content{padding:0}}</style></head><body><div class="app-layout"><div class="app-main"><main class="page-content"><div id="root"></div></main></div></div><script type="module" src="/preview.js"></script></body></html>`;
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname.slice(1);
      if (!path) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
      else if (chunks.has(path)) { res.setHeader('Content-Type', 'text/javascript'); res.end(chunks.get(path)); }
      else if (['globals.css', 'redesign.css', 'document.css', 'motion.css'].includes(path)) { res.setHeader('Content-Type', 'text/css'); res.end(await readFile(join(root, 'src/app', path))); }
      else if (path === 'Logo.png') { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(join(root, 'public/Logo.png'))); }
      else { res.statusCode = 404; res.end(); }
    } catch { res.statusCode = 500; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let executable;
  for (const candidate of [process.env.AYAM_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(candidate); executable = candidate; break; } catch {}
  }
  assert.ok(executable, 'Chrome/Edge tidak ditemukan; set AYAM_BROWSER_PATH.');
  const profile = join(temporary, 'profile');
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let debuggingPort;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { debuggingPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(debuggingPort, 'Browser tidak membuka port pemeriksaan.');
  const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), call = pending.get(message.id);
    if (!call) return;
    clearTimeout(call.timeout); pending.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
  });
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fixtureErrors=[];addEventListener('error',event=>window.fixtureErrors.push(String(event.error?.stack || event.message)));` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  if (!process.env.AYAM_DOCUMENT_ONLY) {
  await waitFor(`document.querySelector('.document-share-buttons') && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Salin gambar').disabled`);
  assert.equal(await evaluate(`document.querySelector('.purchase-paper').textContent.includes('Lunas')`), true);
  assert.equal(await evaluate(`document.querySelector('.document-export-surface').textContent.includes('Kelola transaksi')`), false);
  await screenshot('desktop.png');
  await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{window.copyActivation=navigator.userActivation.isActive; const blob=await items[0].getType('image/png'); const image=await createImageBitmap(blob); window.copiedSize={width:image.width,height:image.height}; image.close(); window.copiedData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}}});`);
  await click('Salin gambar');
  await waitFor('Boolean(window.copiedData)');
  assert.equal(await evaluate('window.copyActivation'), true);
  assert.equal((await evaluate('window.copiedSize')).width, 1588);
  const png = await evaluate('window.copiedData');
  await writeFile(join(output, 'shared.png'), Buffer.from(png.split(',')[1], 'base64'));
  await evaluate(`HTMLAnchorElement.prototype.click=function(){window.fixtureDownload={name:this.download,attached:this.isConnected,blob:this.href.startsWith('blob:')};};`);
  await waitFor(`!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Unduh PNG').disabled`);
  await click('Unduh PNG');
  assert.deepEqual(await evaluate('window.fixtureDownload'), { name: `${fixture.number}.png`, attached: true, blob: true });
  await evaluate(`Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true}); Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared={activation:navigator.userActivation.isActive,count:data.files.length,type:data.files[0].type,name:data.files[0].name,hasUrl:'url' in data};}});`);
  await waitFor(`!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Bagikan gambar').disabled`);
  await click('Bagikan gambar');
  await waitFor('Boolean(window.shared)');
  assert.deepEqual(await evaluate('window.shared'), { activation: true, count: 1, type: 'image/png', name: `${fixture.number}.png`, hasUrl: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(150);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Dokumen meluap pada layar HP.');
  await screenshot('mobile.png');
  await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}); Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});`);
  await click('Salin gambar');
  await waitFor(`document.querySelector('.document-share-feedback')?.textContent.includes('belum mendukung salin gambar')`);
  await click('Bagikan gambar');
  await waitFor(`document.querySelector('.document-share-feedback')?.textContent.includes('belum mendukung berbagi gambar langsung')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.document-share-toolbar')).display`), 'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.document-export-surface')).display`), 'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.document-management')).display`), 'none');
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  await writeFile(join(output, 'purchase.pdf'), Buffer.from(pdf.data, 'base64'));
  assert.equal((Buffer.from(pdf.data, 'base64').toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 1);
  await send('Emulation.setEmulatedMedia', { media: 'screen' });
  await evaluate(`document.querySelector('.document-management').open=true; window.scrollTo(0,0);`);
  await screenshot('management.png');
  await click('Batalkan');
  await waitFor(`Boolean(document.querySelector('dialog[open]'))`);
  assert.ok(await evaluate(`document.querySelector('dialog[open] .transaction-impact').textContent.includes('Rp2.970.000')`));
  assert.equal(await evaluate(`document.querySelector('dialog[open] form').checkValidity()`), false);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: 3, y: 3 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: 3, y: 3 });
  assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`), true, 'Klik di luar tidak boleh menutup dialog.');
  await delay(350);
  await screenshot('cancel-payment.png', true);
  await evaluate(`document.querySelector('dialog[open] textarea').focus()`);
  await send('Input.insertText', { text: 'Salah memilih akun pembayaran' });
  await evaluate(`document.querySelector('dialog[open] form').requestSubmit()`);
  assert.equal(await evaluate('Boolean(window.cancelledFixture)'), false, 'Pembatalan tanpa konfirmasi tidak boleh dikirim.');
  await evaluate(`document.querySelector('dialog[open] input[type="checkbox"]').click()`);
  await click('Konfirmasi pembatalan pembayaran');
  await waitFor('Boolean(window.cancelledFixture)');
  assert.equal(await evaluate('window.cancelledFixture.source'), fixture.payments[0].id);
  assert.equal(await evaluate('window.cancelledFixture.kind'), 'payment');
  await evaluate(`document.querySelector('dialog[open] button[aria-label="Tutup"]').click()`);
  await evaluate(`window.setDocumentData({priceMethod:'borongan',billingQuantity:null,unitPrice:'10000000.00',total:'5000000.00',paid:'5000000.00'});`);
  await waitFor(`document.querySelector('.paper-items')?.textContent.includes('Nilai borongan')`);
  assert.equal(await evaluate(`document.querySelector('.paper-items').textContent.includes('10.000.000')`), false, 'Tagihan borongan parsial tidak boleh memakai total harga DO sebagai harga penerimaan.');
  await evaluate(`window.setDocumentData({priceMethod:'kg',billingQuantity:'99.000',unitPrice:'30000.00',total:'2970000.00',paid:'1000000.00',balance:'1970000.00',dueDate:'2026-11-08',payments:[{id:'installment-1',date:'2026-11-05',account:'Kas kantor',amount:'300000.00',note:null,kind:'payment'},{id:'installment-2',date:'2026-11-06',account:'Bank usaha',amount:'700000.00',note:null,kind:'payment'}]});`);
  await waitFor(`document.querySelector('.paper-status')?.textContent==='Dibayar sebagian'`);
  assert.ok(await evaluate(`document.querySelector('.paper-meta').textContent.includes('8 November 2026')`));
  const installments = await evaluate(`Array.from(document.querySelectorAll('.purchase-document-stage:not(.document-export-surface) .paper-payments tbody tr')).map(row=>row.textContent)`);
  assert.equal(installments.length, 2);
  assert.ok(installments[0].includes('5 November 2026') && installments[0].includes('Kas kantor') && installments[0].includes('300.000'));
  assert.ok(installments[1].includes('6 November 2026') && installments[1].includes('Bank usaha') && installments[1].includes('700.000'));
  assert.equal(await evaluate(`document.querySelectorAll('.document-export-surface .paper-payments tbody tr').length`), 2);
  await evaluate(`window.setDocumentData({paid:'2670000.00',balance:'0.00',credited:'300000.00',payments:[${JSON.stringify(fixture.payments[0])},{id:'refund-fixture',date:'2026-11-05',account:'Kas kantor',amount:'300000.00',kind:'refund',note:null}]});`);
  await waitFor(`document.querySelector('.paper-status')?.textContent==='Lunas'`);
  assert.ok(await evaluate(`document.querySelector('.paper-payments').textContent.includes('Dana kembali dari supplier')`));
  assert.ok(await evaluate(`document.querySelector('.paper-totals').textContent.includes('2.670.000')`));
  await evaluate(`window.setDocumentData({paid:'0.00',balance:'0.00',credited:'2970000.00'});`);
  await waitFor(`document.querySelector('.paper-status')?.textContent==='Selesai melalui retur'`);
  await evaluate('window.showReturnForm()');
  await waitFor(`Boolean(document.querySelector('input[name="_quantity"]'))`);
  await evaluate(`document.querySelector('input[name="_quantity"]').previousElementSibling.focus()`);
  await send('Input.insertText', { text: '1,' });
  await send('Input.insertText', { text: '25' });
  await waitFor(`document.querySelector('input[name="_quantity"]').value==='1.25'`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('input[name="data"]').value).amount`), '37500.00');
  assert.ok(await evaluate(`document.querySelector('.transaction-impact').textContent.includes('37.500')`));
  assert.equal(await evaluate('document.querySelector("form").checkValidity()'), false, 'Retur terbayar memerlukan akun dan persetujuan pengguna.');
  assert.equal(await evaluate('Boolean(window.postedFixture)'), false);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.showReceivingQueue(false)');
  await waitFor(`document.querySelectorAll('.list-card > button').length===2`);
  assert.equal(await evaluate(`document.querySelector('.list-card').textContent.includes('Rp')`), false, 'Antrean petugas tidak menampilkan harga.');
  await delay(450);
  await screenshot('receiving-queue.png');
  await clickSelector('.list-card > button');
  await waitFor(`Boolean(document.querySelector('dialog[open] input[name="do_id"]'))`);
  await delay(400);
  assert.equal(await evaluate(`(() => {const r=document.querySelector('dialog[open]').getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight && r.width<=innerWidth;})()`), true, 'Form timbang harus berada dalam layar HP.');
  assert.equal(await evaluate(`document.querySelector('dialog[open] input[name="do_id"]').value`), '11111111-1111-4111-8111-111111111111');
  assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Pilih DO')`), false);
  await evaluate(`document.querySelector('dialog[open] input[name="origin_weight"]').previousElementSibling.focus()`);
  await send('Input.insertText', { text: '200' });
  await evaluate(`document.querySelector('dialog[open] input[name="_receipt_weight"]').previousElementSibling.focus()`);
  await send('Input.insertText', { text: '195,25' });
  await waitFor(`document.querySelector('dialog[open] input[name="actual_weight"]').value==='195.25'`);
  await evaluate(`document.querySelector('dialog[open] textarea[name="note"]').focus()`);
  await send('Input.insertText', { text: 'Timbang di gudang' });
  await delay(350);
  await screenshot('receiving-form.png', true);
  await click('Kirim hasil timbang');
  await waitFor('Boolean(window.measuredFixture)');
  assert.equal(await evaluate('window.measuredFixture.do_id'), '11111111-1111-4111-8111-111111111111');
  assert.equal(await evaluate('window.measuredFixture.date'), '2026-11-05');
  assert.equal(await evaluate('window.measuredFixture.origin_weight'), '200');
  assert.equal(await evaluate('window.measuredFixture.actual_weight'), '195.25');
  assert.equal(await evaluate('window.measuredFixture.note'), 'Timbang di gudang');
  await evaluate('window.showReceivingQueue(true)');
  await waitFor(`document.querySelector('.empty-state')?.textContent.includes('Tidak ada DO yang perlu ditimbang')`);
  await evaluate('window.showProcessing()');
  await click('Catat hasil potong');
  await waitFor(`Boolean(document.querySelector('dialog[open] input[name="_weight"]'))`);
  await delay(400);
  assert.equal(await evaluate(`document.querySelector('select[name="_source"]').value`),'live:');
  assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Stok tersedia 100 kg')`),true);
  assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Pilih DO')`),false);
  assert.equal(await evaluate(`document.querySelector('dialog[open]').textContent.includes('Jenis item')`),false);
  await evaluate(`document.querySelector('input[name="_weight"]').previousElementSibling.focus()`);
  await send('Input.insertText',{text:'50'});
  await evaluate(`document.querySelector('input[name="_input_count"]').previousElementSibling.focus()`);
  await send('Input.insertText',{text:'25'});
  await click('Pilih hasil');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await evaluate(`document.querySelector('input[name="_quantity_0"]').previousElementSibling.focus()`);
  await send('Input.insertText',{text:'30'});
  await click('Tambah hasil');
  await click('Pilih hasil');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(3)');
  await evaluate(`document.querySelectorAll('.processing-result-row')[1].querySelector('input[type="text"]').focus()`);
  await send('Input.insertText',{text:'5,25'});
  await waitFor(`document.querySelector('dialog[open] .calculation').textContent.includes('35,25')`);
  await click('Tambah hasil');
  await waitFor(`document.querySelectorAll('.processing-result-row').length===3`);
  await clickSelector('button[aria-label="Hapus hasil 3"]');
  await waitFor(`document.querySelectorAll('.processing-result-row').length===2`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('input[name="data"]').value).items[2].quantity`),'5.25','Menghapus baris lain mempertahankan hasil yang ada.');
  assert.equal(await evaluate(`document.querySelector('dialog[open] .calculation').textContent.includes('14,75')`),true);
  assert.equal(await evaluate(`document.querySelector('dialog[open]').scrollWidth<=document.querySelector('dialog[open]').clientWidth`),true,'Form potong tidak melebar keluar layar HP');
  await evaluate(`document.querySelector('.processing-results').scrollIntoView({block:'center'})`);
  await screenshot('processing-form.png',true);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true });
  await delay(150);
  assert.equal(await evaluate(`(()=>Array.from(document.querySelectorAll('.processing-result-row')).every(row=>{const fields=[row.querySelector('.dropdown-trigger'),row.querySelector('.processing-result-weight input[type="text"]')];return row.scrollWidth<=row.clientWidth && row.getBoundingClientRect().height<=60 && fields.every(el=>el.getBoundingClientRect().width>=70)}))()`),true,'Kolom hasil tetap ringkas pada layar kecil.');
  await screenshot('processing-form-small.png',true);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('button[aria-label="Hapus hasil 2"]').scrollIntoView({block:'center'})`);
  assert.equal(await evaluate(`(()=>{const b=document.querySelector('button[aria-label="Hapus hasil 2"]');return b.getBoundingClientRect().width<=32 && b.closest('.processing-result-row').getBoundingClientRect().height<=60;})()`),true,'Produk dan berat berada dalam baris ringkas.');
  assert.equal(await evaluate(`document.querySelector('input[name="_pieces_0_count"]')===null`),true,'Jumlah opsional disembunyikan pada awal.');
  await click('Tambah ekor/pcs');
  await evaluate(`document.querySelector('input[name="_pieces_0_count"]').previousElementSibling.focus()`);
  await send('Input.insertText',{text:'12'});
  await waitFor(`document.querySelector('input[name="_pieces_0_count"]').value==='12'`);
  await click('Sembunyikan ekor/pcs');
  assert.equal(await evaluate(`document.querySelector('input[name="_pieces_0_count"]')===null`),true);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('input[name="data"]').value).items[1].count`),'12','Jumlah tetap tersimpan saat disembunyikan.');
  await click('Simpan hasil potong');
  await waitFor(`window.postedFixture?.kind==='production'`);
  const production=JSON.parse(await evaluate('window.postedFixture.data'));
  assert.deepEqual(production.items.map(i=>[i.product,i.unit,i.direction,i.quantity]),[['live','kg','out','50'],['carcass','kg','in','30'],['fillet','kg','in','5.25']]);
  assert.equal(production.items[0].count,'25');
  assert.equal(production.items[1].count,'12');
  await evaluate('window.showCountSale()');
  await waitFor(`Boolean(document.querySelector('select[name="_partner"]'))`);
  await click('Tambah');
  await delay(400);
  assert.equal(await evaluate(`document.querySelector('input[name="_paid"]').value`),'0','Pembayaran awal default Rp0.');
  assert.equal(await evaluate(`document.querySelector('select[name="_account"]')===null`),true,'Rp0 tidak memerlukan akun.');
  assert.equal(await evaluate(`document.querySelector('select[name="_assigned"]')===null && !document.querySelector('dialog[open]').textContent.toLowerCase().includes('penagih')`),true,'Penugasan penagih dihapus.');
  await click('Pilih pelanggan');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await click('Pilih produk');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  assert.equal(await evaluate(`document.querySelector('select[name="_unit_0"]').value`),'kg','Satuan awal penjualan memakai kg.');
  await click('Tanpa varian');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await clickSelector('select[name="_unit_0"] + button');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await waitFor(`Boolean(document.querySelector('input[name="_sale_0_weight"]'))`);
  assert.equal(await evaluate(`document.querySelector('input[name="_sale_0_weight"]').previousElementSibling.required`),true,'Penjualan per ekor wajib berat kg');
  for(const [name,value] of [['_quantity_0','10'],['_price_0','40000'],['_sale_0_weight','20']]) {
    await evaluate(`document.querySelector('input[name="${name}"]').previousElementSibling.focus()`);
    await send('Input.insertText',{text:value});
  }
  await waitFor(`Boolean(document.querySelector('input[name="_due"]'))`);
  await clickSelector('input[name="_due"] + button');
  await clickSelector('[data-date="2026-11-12"]');
  await click('Tambah item');
  await waitFor(`document.querySelectorAll('.sale-item').length===2`);
  await clickSelector('button[aria-label="Hapus item 2"]');
  await waitFor(`document.querySelectorAll('.sale-item').length===1`);
  await evaluate(`document.querySelector('.sale-items').scrollIntoView({block:'center'})`);
  await screenshot('sale-form-mobile.png',true);
  assert.equal(await evaluate(`document.querySelector('dialog[open]').scrollWidth<=document.querySelector('dialog[open]').clientWidth`),true,'Item penjualan muat pada layar ponsel.');
  await evaluate(`document.querySelector('input[name="_paid"]').previousElementSibling.focus();document.querySelector('input[name="_paid"]').previousElementSibling.select()`);
  await send('Input.insertText',{text:'10000'});
  await waitFor(`Boolean(document.querySelector('select[name="_account"]'))`);
  assert.equal(await evaluate(`document.querySelector('select[name="_account"]').required`),true,'Pembayaran positif wajib akun penerimaan.');
  await click('Pilih akun penerimaan');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await delay(120);
  await evaluate(`document.querySelector('input[name="_paid"]').previousElementSibling.focus();document.querySelector('input[name="_paid"]').previousElementSibling.select()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await waitFor(`document.querySelector('input[name="_paid"]').value===''`);
  await send('Input.insertText',{text:'0'});
  await waitFor(`document.querySelector('select[name="_account"]')===null`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
  await delay(200);
  await evaluate(`document.querySelector('.sale-items').scrollIntoView({block:'center'})`);
  await screenshot('sale-form-desktop.png',true);
  assert.equal(await evaluate(`(()=>{const sheet=document.querySelector('dialog[open]'), row=document.querySelector('.sale-item');return sheet.getBoundingClientRect().width<=860 && row.scrollWidth<=row.clientWidth})()`),true,'Tabel penjualan muat dalam popup laptop.');
  await click('Terbitkan penjualan');
  await waitFor(`window.postedFixture?.id==='fixture-count-sale'`);
  const saleItem=JSON.parse(await evaluate('window.postedFixture.data')).items[0];
  assert.deepEqual([saleItem.unit,saleItem.quantity,saleItem.weight,saleItem.price],['ekor','10','20','40000']);
  const saleData=JSON.parse(await evaluate('window.postedFixture.data'));
  assert.equal(saleData.paid,'0');
  assert.equal(saleData.account,'');
  assert.equal(saleData.due,'2026-11-12');
  assert.equal(Object.hasOwn(saleData,'assigned'),false);
  assert.equal(saleData.items[0].variant,'large');
  await evaluate('window.showCountSale(JSON.parse(window.postedFixture.data))');
  await click('Tambah');
  await waitFor(`document.querySelector('input[name="id"]').value==='fixture-resumed-sale'`);
  assert.equal(await evaluate(`document.querySelector('input[name="_quantity_0"]').value`),'10');
  assert.equal(await evaluate(`document.querySelector('select[name="_unit_0"]').value`),'ekor');
  assert.equal(await evaluate(`document.querySelector('select[name="_variant_0"]').value`),'large');
  assert.equal(await evaluate(`document.querySelector('input[name="_due"]').value`),'2026-11-12');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.showCountReturn()');
  await waitFor(`Boolean(document.querySelector('select[name="_source_0"]'))`);
  await click('Pilih item asal');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await waitFor(`Boolean(document.querySelector('input[name="_item_0_weight"]'))`);
  assert.equal(await evaluate(`document.querySelector('input[name="_item_0_weight"]').previousElementSibling.required`),true,'Retur per ekor wajib berat kg');
  assert.ok(await evaluate(`document.body.textContent.includes('Jumlah (ekor)')`));
  await screenshot('sale-return-weight.png',true);
  await evaluate('window.showProcessing()');
  await click('Catat hasil potong');
  await waitFor(`Boolean(document.querySelector('dialog[open] select[name="_product_0"]'))`);
  await click('Pilih hasil');
  await clickSelector('.dropdown-search-inline');
  await send('Input.insertText', { text: 'FiLLeT' });
  await waitFor(`document.querySelectorAll('.dropdown-menu [role="option"]').length===1`);
  await delay(250);
  await screenshot('dropdown-search.png', true);
  assert.equal(await evaluate(`document.querySelector('.dropdown-menu [role="option"]').textContent`), 'Dada fillet');
  assert.equal(await evaluate(`document.querySelector('select[name="_product_0"]').value`), '', 'Mengetik tidak mengubah pilihan sebelum dipilih.');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await waitFor(`document.querySelector('select[name="_product_0"]').value==='fillet:'`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('input[name="data"]').value).items[1].product`), 'fillet');
  await click('Dada fillet');
  assert.equal(await evaluate(`document.querySelector('.dropdown-search-inline').value`), '', 'Pencarian dikosongkan saat dibuka lagi.');
  await clickSelector('.dropdown-search-inline');
  await send('Input.insertText', { text: 'tidak-ada' });
  await waitFor(`document.querySelector('.dropdown-empty')?.textContent.includes('tidak ditemukan')`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(`!document.querySelector('.dropdown-menu')`);
  assert.equal(await evaluate(`document.querySelector('select[name="_product_0"]').value`), 'fillet:', 'Escape mempertahankan pilihan.');
  assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`), true, 'Escape menutup dropdown tanpa menutup formulir.');
  await clickSelector('.date-trigger');
  await clickSelector('.calendar-selects .dropdown:nth-child(2) .dropdown-trigger');
  await evaluate(`document.querySelector('.dropdown-menu').scrollTop=99999`);
  await delay(100);
  assert.equal(await evaluate(`(()=>{const field=document.querySelector('.dropdown-search-inline'), box=field.previousElementSibling.getBoundingClientRect(), r=field.getBoundingClientRect();return r.top>=box.top-1 && r.bottom<=box.bottom+1 && !document.querySelector('.dropdown-menu input')})()`), true, 'Pencarian berada di dropdown yang sama dan tidak menambah kotak di daftar.');
  await clickSelector('.dropdown-search-inline');
  await send('Input.insertText', { text: '2030' });
  await waitFor(`document.querySelectorAll('.dropdown-menu [role="option"]').length===1`);
  await delay(200);
  await screenshot('dropdown-calendar-search.png', true);
  assert.ok(await evaluate(`document.querySelector('.dropdown-search-inline').getBoundingClientRect().width >= 38`), 'Pencarian tahun cukup lebar untuk mengetik.');
  assert.equal(await evaluate(`document.querySelector('.dropdown-menu [role="option"]').textContent`), '2030');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await waitFor(`document.querySelector('.calendar-selects .dropdown:nth-child(2) .dropdown-trigger').textContent.includes('2030')`);
  assert.equal(await evaluate(`document.querySelector('input[name="_date"]').value`), '2026-11-05', 'Mengganti tampilan tahun kalender belum memilih tanggal.');
  await click('Hari ini');
  await clickSelector('select[name="_source"] + button');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', text: 'k', windowsVirtualKeyCode: 75 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 });
  await waitFor(`document.querySelector('.dropdown-search-inline')?.value==='k' && document.activeElement===document.querySelector('.dropdown-search-inline')`);
  assert.equal(await evaluate(`document.querySelector('.dropdown-menu [role="option"]').textContent`), 'Karkas');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await waitFor(`document.querySelector('select[name="_source"]').value==='carcass:'`);
  assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  await evaluate('window.showSheetFeedback()');
  await click('Buka uji');
  await waitFor(`Boolean(document.querySelector('dialog[open] input[name="fixture_name"]'))`);
  await click('Simpan uji');
  await waitFor(`document.activeElement?.getAttribute('name')==='fixture_name'`);
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').dataset.invalid`),'true','Isian kosong ditandai merah.');
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').classList.contains('field-attention')`),true,'Isian pertama berdenyut lembut.');
  assert.equal(await evaluate('window.feedbackSubmissions'),0,'Validasi menghentikan pengiriman form kosong.');
  await delay(450);
  await screenshot('sheet-required-field.png',true);
  await send('Input.insertText',{text:'Transaksi contoh'});
  await click('Simpan uji');
  await waitFor(`document.activeElement===document.querySelector('select[name="fixture_product"] + button')`);
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').hasAttribute('data-invalid')`),false,'Penanda hilang setelah isian benar.');
  await click('Pilih produk');
  await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
  await click('Simpan uji');
  await waitFor(`document.activeElement===document.querySelector('input[name="fixture_quantity"]').previousElementSibling`);
  await send('Input.insertText',{text:'12,5'});
  await evaluate(`document.querySelector('textarea[name="fixture_note"]').focus()`);
  await send('Input.insertText',{text:'Catatan tetap tersimpan'});
  await clickSelector('input[name="fixture_confirm"]');
  await click('Simpan uji');
  await waitFor(`document.querySelector('.sheet-feedback')?.textContent==='Stok Dada tidak cukup.'`);
  assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`),true,'Kegagalan tidak menutup popup.');
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').value`),'Transaksi contoh');
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_quantity"]').value`),'12.5');
  assert.equal(await evaluate(`document.querySelector('select[name="fixture_product"]').value`),'dada');
  assert.equal(await evaluate(`document.querySelector('textarea[name="fixture_note"]').value`),'Catatan tetap tersimpan');
  assert.equal(await evaluate(`document.querySelector('input[name="id"]').value`),'feedback-0','Respons server tidak mengganti form aktif dengan props baru.');
  await evaluate(`document.querySelector('form').reset()`);
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_quantity"]').value`),'12.5','Reset otomatis tidak menghapus angka saat gagal.');
  assert.equal(await evaluate(`JSON.parse(document.querySelector('input[name="data"]').value).quantity`),'12.5');
  assert.equal(await evaluate(`window.postedFixture._form_origin`),'/produksi?period=all');
  await delay(400);
  await screenshot('sheet-save-error.png',true);
  await click('Simpan uji');
  await waitFor('window.feedbackVersion===2');
  await waitFor(`document.activeElement===document.querySelector('.sheet-feedback')`);
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').value`),'Transaksi contoh','Error berulang mempertahankan isian.');
  await delay(400);
  await evaluate(`window.sheetFeedbackOutcome='success'`);
  await click('Simpan uji');
  await waitFor(`!document.querySelector('dialog[open]')`);
  assert.equal(await evaluate('document.body.style.overflow'),'','Layar dapat digulir setelah berhasil.');
  await evaluate('window.remountSheetFeedback()');
  await delay(150);
  assert.equal(await evaluate(`Boolean(document.querySelector('dialog[open]'))`),false,'initialOpen tidak membuka ulang popup pada URL sukses.');
  await click('Buka uji');
  await waitFor(`Boolean(document.querySelector('dialog[open]'))`);
  assert.equal(await evaluate(`document.querySelector('input[name="fixture_name"]').value`),'','Pembukaan baru memakai form baru.');
  assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  await evaluate('window.showFinancialDashboard()');
  await waitFor("document.querySelectorAll('.position-card').length===3");
  await delay(500);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.reminder-panel > .panel-heading h2')).map(n=>n.textContent)"),['Harus ditagih','Harus dibayar']);
  assert.equal(await evaluate("document.querySelector('.reminder-today .reminder-group-heading strong').textContent"),'Rp17.500.000','Total seluruh invoice melampaui lima baris.');
  assert.equal(await evaluate("document.querySelector('.reminder-today').querySelectorAll('.reminder-row').length"),5);
  assert.ok(await evaluate("document.querySelector('.reminder-more').href.includes('status=today')"));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await delay(120);
  await waitFor("document.querySelector('.position-card .kpi-amount').textContent.includes('24.000.000')");
  assert.equal(await evaluate("document.querySelectorAll('.reminder-panel')[0].getBoundingClientRect().top===document.querySelectorAll('.reminder-panel')[1].getBoundingClientRect().top"),true,'Pengingat berdampingan di laptop.');
  await screenshot('financial-dashboard-desktop.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(120);
  assert.ok(await evaluate("document.querySelectorAll('.reminder-panel')[1].getBoundingClientRect().top>document.querySelectorAll('.reminder-panel')[0].getBoundingClientRect().bottom"),'Pengingat tersusun di ponsel.');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Dashboard tidak melebar di ponsel.');
  await screenshot('financial-dashboard-mobile.png');
  await clickSelector('.reminder-today .reminder-row');
  await waitFor("Boolean(document.querySelector('dialog[open]'))");
  const beforeRefresh=await evaluate('window.refreshFixture||0');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(60);
  assert.equal(await evaluate('window.refreshFixture||0'),beforeRefresh,'Pembaruan tidak mengganggu popup.');
  await clickSelector('dialog[open] details summary');
  await waitFor("Boolean(document.querySelector('dialog[open] input[name=amount]'))");
  await click('Isi sisa');
  await waitFor("document.querySelector('dialog[open] input[type=hidden][name=amount]').value==='2500000'");
  assert.equal(await evaluate("document.querySelector('dialog[open] input[type=hidden][name=amount]').value"),'2500000');
  await screenshot('dashboard-payment.png',true);
  await clickSelector('dialog[open] [aria-label="Tutup"]');
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor('window.refreshFixture>'+beforeRefresh);
  await clickSelector('.reminder-today .reminder-row');
  await clickSelector('dialog[open] details:last-child summary');
  await clickSelector('dialog[open] .date-trigger');
  await click('Hari ini');
  await click('Simpan jatuh tempo');
  await waitFor('Boolean(window.dueFixture)');
  assert.equal(await evaluate('window.dueFixture.due'),'2026-11-05','Jatuh tempo dikirim ISO.');
  assert.equal(await evaluate('window.dueFixture.kind'),'receivable');
  await clickSelector('dialog[open] [aria-label="Tutup"]');
  await evaluate("window.showFinancialDashboard('incomplete')");
  await waitFor("document.querySelector('.performance-kpis').textContent.includes('Belum lengkap')");
  assert.equal(await evaluate("document.querySelectorAll('.performance-kpis .cost-incomplete').length"),2,'Laba tanpa modal tidak ditampilkan Rp0.');
  await evaluate("document.querySelector('.dashboard-profit-details').open=true");
  assert.ok(await evaluate("document.querySelector('.profit-breakdown').textContent.includes('Modal untuk sebagian transaksi belum lengkap')"));
  await screenshot('dashboard-incomplete.png');
  await evaluate("window.showFinancialDashboard('loss')");
  await waitFor("document.querySelectorAll('.performance-kpis .amount-negative').length===2");
  await evaluate("window.showFinancialDashboard('error')");
  await waitFor("document.querySelector('.reminder-panel').textContent.includes('Pengingat belum dapat dimuat')");
  assert.equal(await evaluate("document.querySelectorAll('.reminder-empty').length"),0,'Gagal memuat tidak dianggap tidak ada tagihan.');
  assert.deepEqual(await evaluate('window.fixtureErrors'), []);
  console.log('Lulus: dashboard ponsel/laptop, prioritas tagih/bayar, batas daftar, pembayaran dan tempo, profit belum lengkap/rugi, serta pembaruan saat popup tertutup.');
  console.log('Lulus: dokumen dan ekspor, pembatalan/retur, antrean timbang, pilihan DO langsung, berat desimal, formulir kosong, serta hasil potong kg dengan ekor opsional.');

  }

  await waitFor("typeof window.showStockMeasurements === 'function'");
  async function fillMeasurement(name,value) {
    await evaluate("document.querySelector('input[name=\""+name+"\"]').previousElementSibling.focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});
    await send('Input.insertText',{text:value});
  }
  if(process.env.AYAM_DOCUMENT_ONLY !== 'sale') {
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await evaluate("window.showStockMeasurements('loss')");
    await waitFor("Boolean(document.querySelector('input[name=\"_item_0_count\"]'))");
    await fillMeasurement('_item_0_count','3');
    await waitFor("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].quantity==='3.600'");
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].weight_source"),'estimated');
    assert.equal(await evaluate("document.querySelector('form').checkValidity()"),false,'Perkiraan perlu konfirmasi.');
    await clickSelector('.measurement-confirm input');
    assert.equal(await evaluate("document.querySelector('form').checkValidity()"),true);
    await screenshot('measurement-loss-mobile.png');
    await clickSelector('.measurement-fields .dropdown-trigger');
    await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
    await waitFor("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].quantity==='4.500'");
    assert.equal(await evaluate("document.querySelector('form').checkValidity()"),false,'Perubahan referensi meminta konfirmasi ulang.');
    await fillMeasurement('_quantity_0','4,2');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].count"),'3');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].weight_source"),'measured');
    await click('Catat kehilangan');
    await waitFor("window.postedFixture?.id==='fixture-measured-loss'");
    await evaluate("window.showStockMeasurements('receipt')");
    await waitFor("Boolean(document.querySelector('input[name=\"measurement\"]'))");
    assert.equal(await evaluate("document.querySelector('input[name=\"actual_weight\"]').value"),'1000');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"measurement\"]').value).weight_source"),'supplier');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"measurement\"]').value).count"),'');
    await fillMeasurement('_receipt_count','500');
    assert.equal(await evaluate("document.querySelector('input[name=\"actual_weight\"]').value"),'1000','Jumlah tidak menimpa angka supplier.');
    await screenshot('measurement-receipt-mobile.png');
    await evaluate("window.showStockMeasurements('processing')");
    await waitFor("Boolean(document.querySelector('input[name=\"_input_count\"]'))");
    await fillMeasurement('_input_count','20');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].quantity"),'24.000');
    await click('Pilih hasil');
    await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
    await fillMeasurement('_quantity_0','20');
    await waitFor("Boolean(document.querySelector('input[name=\"_pieces_0_count\"]'))");
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[1].count"),'18');
    await fillMeasurement('_pieces_0_count','20');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[1].quantity"),'20');
    await screenshot('measurement-processing-mobile.png');
    await evaluate("window.showStockMeasurements('sale')");
    await waitFor("Boolean(document.querySelector('select[name=\"_product_0\"]'))");
    await click('Pilih produk');await clickSelector('.dropdown-menu [role="option"]:nth-child(2)');
    await click('Tanpa varian');await clickSelector('.dropdown-menu [role="option"]:nth-child(3)');
    await fillMeasurement('_quantity_0','50');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].count"),'20','Ukuran besar memakai 2,5 kg/ekor.');
    await fillMeasurement('_sale_0_count','19');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"data\"]').value).items[0].quantity"),'50');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await screenshot('measurement-sale-mobile.png');
    await evaluate("window.showStockMeasurements('delivery')");
    await waitFor("Boolean(document.querySelector('input[name=\"_qty_line\"]'))");
    await fillMeasurement('_qty_line','7');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"items\"]').value)[0].count"),'5');
    assert.equal(await evaluate("JSON.parse(document.querySelector('input[name=\"items\"]').value)[0].count_source"),'estimated');
    await screenshot('measurement-delivery-mobile.png');
    assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
    console.log('Lulus: kg/jumlah, ukuran kecil/besar, referensi stok, konfirmasi perkiraan, koreksi aktual, penerimaan supplier, hasil potong dan pengiriman pada browser.');
  }
  if(process.env.AYAM_DOCUMENT_ONLY !== 'measurements') {

  await waitFor("typeof window.showSaleDocument === 'function'");
  await evaluate('window.showSaleDocument(false)');
  await waitFor("document.querySelector('.sale-paper') && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Salin gambar').disabled");
  const paperText=()=>evaluate("document.querySelector('.sale-paper').innerText");
  assert.match(await paperText(),/INV-000042/);
  assert.match(await paperText(),/441\.212,5/);
  assert.match(await paperText(),/Diskon/);
  assert.match(await paperText(),/Pengurangan retur/);
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:1100,deviceScaleFactor:1,mobile:false});
  await screenshot('sale-invoice-desktop.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot('sale-invoice-mobile.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  await clickSelector('.sale-document-options .dropdown-trigger');
  await clickSelector('[role="option"]:nth-child(2)');
  await waitFor("Boolean(document.querySelector('.delivery-items'))");
  assert.match(await paperText(),/SJ-000042/);
  assert.ok(!(await paperText()).includes('Rp'));
  assert.ok(!(await paperText()).includes('441.212'));
  assert.equal(await evaluate("document.querySelectorAll('.purchase-document-stage:not(.document-export-surface) .delivery-signatures > div').length"),2);
  await screenshot('sale-delivery-mobile.png');
  await clickSelector('.sale-document-options .dropdown-trigger');
  await clickSelector('[role="option"]:nth-child(3)');
  await waitFor("document.querySelector('.thermal-paper') && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Salin gambar').disabled");
  assert.match(await paperText(),/STR-000042/);
  assert.equal(await evaluate("(()=>{const p=document.querySelector('.thermal-paper');return p.scrollWidth<=Math.ceil(p.getBoundingClientRect().width)})()"),true);
  await screenshot('sale-thermal-mobile.png');
  await evaluate("window.print=()=>{window.printRules=Array.from(document.head.querySelectorAll('style')).map(s=>s.textContent).join(' ')}");
  await click('Cetak / PDF');
  assert.match(await evaluate('window.printRules'),/size: 58mm \d+mm/);
  await send('Emulation.setEmulatedMedia',{media:'print'});
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.sale-document-options')).display"),'none');
  assert.ok(await evaluate("document.querySelector('.thermal-paper').getBoundingClientRect().width<=48/25.4*96+1"),'Isi struk dibatasi 48 mm di dalam kertas 58 mm.');
  const thermalPdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  const thermalBytes=Buffer.from(thermalPdf.data,'base64');
  await writeFile(join(output,'sale-thermal-58mm.pdf'),thermalBytes);
  const mediaBox=thermalBytes.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  assert.ok(mediaBox,'Ukuran kertas tersedia dalam PDF.');
  assert.ok(Math.abs(Number(mediaBox[1])-58/25.4*72)<2,'PDF thermal memiliki lebar 58 mm.');
  assert.equal((thermalBytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'Struk pendek tidak terpotong menjadi beberapa halaman.');
  await evaluate("window.dispatchEvent(new Event('afterprint'))");
  await send('Emulation.setEmulatedMedia',{media:'screen'});
  await evaluate('window.showSaleDocument(true)');
  await waitFor("document.querySelector('.sale-paper').textContent.includes('Dibatalkan')");
  assert.deepEqual(await evaluate('window.fixtureErrors'),[]);
  console.log('Lulus: invoice penjualan, SJ tanpa harga, pilihan format, struk PDF 58 mm satu halaman, pembatalan, ekspor dan lebar ponsel.');

  }
  console.log(`Pratinjau: ${output}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  browser?.kill();
  for (const call of pending.values()) clearTimeout(call.timeout);
  server?.close();
  await delay(500);
  const safeRoot = resolve(temporary);
  if (safeRoot.startsWith(resolve(tmpdir()) + sep) && basename(safeRoot).startsWith('ayam-doc-check-')) await rm(safeRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
