import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codigoEstudio, ordenarEstudios } from '../shared/estudios.js';
test('Los códigos históricos se comparan sin cambiar espacios ni guiones del catálogo', () => {
  assert.equal(codigoEstudio('AbbVie M19-044'), codigoEstudio('ABBVIEM19-044'));
  assert.notEqual(codigoEstudio('M19-044'), codigoEstudio('M19044'));
});
test('Orden de estados y códigos', () => {
  const rows = [{ codigo: 'Z', estado: 'start_up' }, { codigo: 'B', estado: 'activo' }, { codigo: 'A', estado: 'activo' }, { codigo: 'A', estado: 'pendiente_inicio' }, { codigo: 'A', estado: 'seleccionado_sin_start_up' }];
  assert.deepEqual(ordenarEstudios(rows).map(r => r.codigo + r.estado), ['Aactivo', 'Bactivo', 'Apendiente_inicio', 'Zstart_up', 'Aseleccionado_sin_start_up']);
  assert.equal(rows[0].codigo, 'Z');
});
test('Seed oficial completo sin duplicados ni modificación de históricos', () => {
  const sql = readFileSync(new URL('../supabase/migrations/007_estudios.sql', import.meta.url), 'utf8');
  const rows = [...sql.matchAll(/\('([^']+)', '(activo|pendiente_inicio|start_up|seleccionado_sin_start_up)'\)/g)];
  assert.equal(new Set(rows.map(r => r[1])).size, 51);
  assert.deepEqual(['activo', 'pendiente_inicio', 'start_up', 'seleccionado_sin_start_up'].map(s => rows.filter(r => r[2] === s).length), [26, 12, 5, 8]);
  assert.match(sql, /on conflict \(codigo\) do nothing/i);
  assert.doesNotMatch(sql, /update public.tickets|alter table public.tickets/i);
});

import { matchEstudio } from '../shared/ticket-rules.js';
test('Scanner preserves ambiguous variants and short unknown codes', () => {
  for (const known of [['VESPER 4', 'VESPER 5'], ['AROAPOC3-3003', 'AROAPOC3-3009']]) {
    const input = known[0].replace(/[0-9]$/, '6');
    assert.equal(matchEstudio(input, known).matched, false);
    assert.equal(matchEstudio(input, [...known].reverse()).value, matchEstudio(input, known).value);
  }
  assert.equal(matchEstudio('GPJB', ['GPJA']).matched, false);
  assert.equal(matchEstudio('GPJA', ['GPJA']).matched, true);
  assert.equal(matchEstudio('18F-MC-GPIJ', ['I8F-MC-GPIJ']).value, 'I8F-MC-GPIJ');
});
