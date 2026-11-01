import test from 'node:test';
import assert from 'node:assert/strict';
import {businessToday,isDate,resolvePeriod,inPeriod} from '../src/lib/period.ts';
import {sumMoney,cents,fromCents} from '../src/lib/money.ts';
test('tanggal bisnis mengikuti Jakarta di batas UTC',()=>{
 assert.equal(businessToday(new Date('2026-10-30T17:00:00Z')),'2026-10-31');
 assert.equal(resolvePeriod({},'2026-10-31').start,'2026-10-31');
});
test('bulan kabisat dan rentang inklusif',()=>{
 const month=resolvePeriod({period:'month',month:'2028-02'},'2026-10-31');assert.equal(month.end,'2028-02-29');
 const range=resolvePeriod({period:'range',start:'2026-10-01',end:'2026-10-31'},'2026-10-31');
 assert.ok(inPeriod('2026-10-01',range));assert.ok(inPeriod('2026-10-31',range));assert.equal(inPeriod('2026-11-01',range),false);
 assert.equal(isDate('2026-02-29'),false);assert.equal(isDate('2026-02-31'),false);
 assert.equal(resolvePeriod({period:'range',start:'2026-10-31',end:'2026-10-01'},'2026-10-31').start,'2026-10-31');
 assert.ok(resolvePeriod({period:'range',start:'x',end:'y'},'2026-10-31').error);
 assert.equal(resolvePeriod({period:'all'},'2026-10-31').start,null);
});
test('penjumlahan uang presisi tetap hingga nominal besar',()=>{
 assert.equal(sumMoney(['0.10','0.20']),'0.30');
 assert.equal(sumMoney(['999999999999999.99','0.01','-0.50']),'999999999999999.50');
 assert.equal(fromCents(cents('-20.05')),'-20.05');
});
