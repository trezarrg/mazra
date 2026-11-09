import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedWeight,estimatedCount,pairedRatio,editMeasurement,measurementPolicy,changeMeasurementReference} from '../src/lib/measurement.ts';

const product={count_unit:'ekor',kg_per_count:'2',allow_estimates:true,product_variants:[{id:'small',kg_per_count:'1.2'},{id:'large',kg_per_count:'2.5'}]};
const blank={unit:'kg',quantity:'',weight:'',count:'',variant:'small'};
test('konversi desimal memakai rasio ukuran dan pembulatan yang konsisten',()=>{
  assert.equal(estimatedWeight('3','1.2'),'3.600');
  assert.equal(estimatedWeight('3','2.5'),'7.500');
  assert.equal(estimatedWeight('25','2.083333'),'52.083');
  assert.equal(estimatedCount('50','2'),'25');
  assert.equal(estimatedCount('0.1','2'),'');
  assert.equal(pairedRatio('50','24'),'2.083333');
  assert.equal(estimatedWeight('1.5','2'),'');
  assert.equal(estimatedWeight('3','NaN'),'');
});
test('jumlah aktual dapat mengusulkan kg tanpa dianggap hasil timbang',()=>{
  const item=editMeasurement(blank,'count','3',product);
  assert.equal(item.quantity,'3.600');
  assert.equal(item.weight_source,'estimated');
  assert.equal(item.count_source,'counted');
  assert.equal(item.estimate_confirmed,'');
  const confirmed={...item,estimate_confirmed:'true'};
  assert.equal(editMeasurement(confirmed,'count','4',product).estimate_confirmed,'');
  const actual=editMeasurement(confirmed,'weight','3.4',product);
  assert.equal(actual.count,'3');
  assert.equal(actual.weight_source,'measured');
  assert.equal(actual.count_source,'counted');
  assert.equal(actual.measurement_ratio,'1.133333');
});
test('pasangan aktual tidak saling ditimpa dan pengosongan tidak membuat nol',()=>{
  const item={...blank,quantity:'50',count:'24',weight_source:'measured',count_source:'counted'};
  assert.equal(editMeasurement(item,'weight','48',product).count,'24');
  assert.equal(editMeasurement(item,'count','23',product).quantity,'50');
  const estimated=editMeasurement(blank,'weight','12',product);
  assert.equal(estimated.count,'10');
  assert.equal(editMeasurement(estimated,'weight','',product).count,'');
  assert.equal(editMeasurement(estimated,'count','',product).count_source,'');
});
test('referensi terpilih mengalahkan rasio ukuran dan tidak mencampur varian',()=>{
  const configured={...product,references:[{id:'receipt',variant_id:'small',count_unit:'ekor',measured_ratio:'1.5'}]};
  assert.equal(measurementPolicy(configured,'small','receipt').ratio,'1.5');
  assert.equal(measurementPolicy(configured,'large','receipt').ratio,'2.5');
  const item=editMeasurement(blank,'count','3',configured);
  const next=changeMeasurementReference(item,'receipt',configured);
  assert.equal(next.quantity,'4.500');
  assert.equal(next.ratio_source,'reference');
  assert.equal(item.quantity,'3.600');
});
test('produk tanpa rasio atau melarang estimasi tidak membuat ukuran palsu',()=>{
  assert.equal(editMeasurement(blank,'count','3',{count_unit:'ekor'}).quantity,'');
  assert.equal(editMeasurement(blank,'count','3',{...product,allow_estimates:false}).quantity,'');
  assert.equal(editMeasurement({...blank,unit:'ekor'},'count','3',{kg_per_count:'2'}).count_unit,'ekor');
  assert.equal(estimatedWeight('999999999','999.999999'),'999999998000.000');
});

test('perubahan ukuran tanpa rasio mengosongkan pasangan estimasi dan menjaga sumber supplier',()=>{
 const product={count_unit:'ekor',product_variants:[{id:'small',kg_per_count:'1.2'},{id:'large',kg_per_count:'2.5'}]};
 const item={unit:'kg',quantity:'12',weight:'',count:'10',variant:'small',count_source:'supplier',weight_source:'estimated',measurement_ratio:'1.2',estimate_confirmed:'true'};
 const large=changeMeasurementReference({...item,variant:'large'},'',product);
 assert.equal(large.quantity,'25.000');assert.equal(large.count_source,'supplier');assert.equal(large.estimate_confirmed,'');
 const mixed=changeMeasurementReference({...item,variant:''},'',product);
 assert.equal(mixed.quantity,'');assert.equal(mixed.count,'10');assert.equal(mixed.count_source,'supplier');
 const countEstimate=changeMeasurementReference({...item,quantity:'25',weight_source:'supplier',count_source:'estimated',variant:'large'},'',product);
 assert.equal(countEstimate.weight_source,'supplier');assert.equal(countEstimate.count,'10');
});
