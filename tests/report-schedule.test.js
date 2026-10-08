import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyWindow, scheduledNow, nextWeeklySend, scheduleError } from '../shared/report-schedule.js';
test('Configurable weekly schedule uses Argentina dates, boundary and starting date', () => {
 const cfg = { dia: 1, hora: '23:00', fecha_inicio: '2026-10-12' };
 const now = new Date('2026-10-13T02:30:00Z');
 assert.equal(weeklyWindow(now, cfg).end, '2026-10-13T02:00:00.000Z');
 assert.equal(weeklyWindow(now, cfg).to, '2026-10-12');
 assert.equal(scheduledNow(now, cfg), true);
 assert.equal(scheduledNow(new Date('2026-10-13T03:00:00Z'), cfg), false);
 assert.equal(scheduledNow(now, {...cfg, activo: false}), false);
 assert.equal(scheduledNow(now, {...cfg, fecha_inicio: '2026-10-14'}), false);
 assert.match(nextWeeklySend(new Date('2026-10-08T15:00:00Z'), cfg), /12 de octubre a las 23:00/);
 assert.equal(scheduleError({dia: '2', hora:'09:00'}), null);
 assert.ok(scheduleError({dia: 8}));
 assert.ok(scheduleError({hora:'12:30'}));
 assert.ok(scheduleError({fecha_inicio:'2026-02-31'}));
 assert.ok(scheduleError({fecha_inicio:'2026-99-99'}));
});
