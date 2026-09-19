import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedHoldingMove, marketChange } from './marketPerformance';

test('calendar-month comparison uses a prior close and preserves month ends',()=>{
  assert.equal(marketChange([{date:'2026-01-31',value:100},{date:'2026-02-28',value:110}],'1M')?.start.date,'2026-01-31');
  assert.equal(marketChange([{date:'2026-08-20',value:100},{date:'2026-09-18',value:110}],'1M'),null);
});

test('linked exposure movement is weighted, coverage-aware and date-compatible',()=>{
  const first={change:10,start:'2026-08-18',end:'2026-09-18'};
  const second={change:-5,start:'2026-08-17',end:'2026-09-17'};
  const linked=linkedHoldingMove([{weight:.4,move:first},{weight:.2,move:second},{weight:.4}],1);
  assert.ok(linked && Math.abs(linked.change-5)<1e-10 && Math.abs(linked.coverage-.6)<1e-10);
  assert.equal(linkedHoldingMove([{weight:.2,move:first},{weight:.8}],1),null);
  assert.equal(linkedHoldingMove([{weight:.5,move:first},{weight:.5,move:{...second,end:'2026-09-01'}}],1),null);
});
