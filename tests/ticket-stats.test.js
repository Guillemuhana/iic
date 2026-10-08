import test from 'node:test';
import assert from 'node:assert/strict';
import { loadingDay, loadingBounds, buildTicketStats } from '../shared/ticket-stats.js';
test('Today counts a receipt uploaded today even when its printed date is earlier and keeps review amounts visible', () => {
 const ticket = {id:'old',created_at:'2026-10-08T19:30:33Z',fecha_comprobante:'2026-10-06',status:'cargado',total:152.34,paciente_iniciales:'AM'};
 const stats = buildTicketStats([ticket,{...ticket,id:'void',status:'anulado',total:9000},{...ticket,id:'yesterday',created_at:'2026-10-08T02:59:59Z'}], '2026-10-08','2026-10-08');
 assert.equal(stats.cantidad,1);assert.equal(stats.total,152.34);assert.equal(stats.revision,1);assert.equal(stats.revision_total,152.34);assert.equal(stats.confirmado_total,0);assert.equal(stats.pendientes_total,0);
 assert.equal(stats.por_dia[0].dia,'2026-10-08');assert.equal(stats.por_hora[0].hora,16);
 const week = buildTicketStats([ticket], '2026-10-02','2026-10-08');assert.equal(week.total,stats.total);
});
test('Argentina midnight boundaries include the entire selected loading date and preserve cents', () => {
 assert.equal(loadingDay('2026-10-09T02:59:59Z'),'2026-10-08');assert.equal(loadingDay('2026-10-09T03:00:00Z'),'2026-10-09');
 assert.deepEqual(loadingBounds('2026-10-08','2026-10-08'),{start:'2026-10-08T03:00:00.000Z',end:'2026-10-09T03:00:00.000Z'});
 assert.throws(()=>loadingBounds('2026-02-31','2026-03-01'));
 const stats=buildTicketStats([{id:'1',created_at:'2026-10-08T12:00:00Z',total:0.1},{id:'2',created_at:'2026-10-08T12:00:00Z',total:0.2}], '2026-10-08','2026-10-08');assert.equal(stats.total,0.3);
});
