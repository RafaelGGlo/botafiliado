import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityCsv, filterActivity } from './filters.js';
test('CSV quotes delimiters, line breaks and neutralizes formulas',()=>{
 const csv=activityCsv([{at:0,title:'=HYPERLINK("x");\nnext',dealId:'id',price:12,type:'sent',group:1}]);
 assert.ok(csv.includes('"\'=HYPERLINK(""x"");\nnext"'));assert.ok(csv.includes('1970-01-01T00:00:00.000Z'));
});
test('today follows Sao Paulo midnight and filtering preserves source',()=>{
 const events=[{at:Date.parse('2026-10-15T02:59:00Z'),type:'sent'},{at:Date.parse('2026-10-15T03:00:00Z'),type:'sent'}];
 assert.deepEqual(filterActivity(events,{period:'today'},{now:Date.parse('2026-10-15T12:00:00Z')}),[events[1]]);assert.equal(events.length,2);
});
