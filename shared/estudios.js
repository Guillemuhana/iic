export const ESTADOS_ESTUDIO = {
  activo: 'Activos',
  pendiente_inicio: 'Pendientes de inicio',
  start_up: 'En start up',
  seleccionado_sin_start_up: 'Seleccionados sin start up',
};
export const codigoEstudio = value => String(value || '').toUpperCase().replace(/\s/g, '');
export function ordenarEstudios(rows) {
  const estados = Object.keys(ESTADOS_ESTUDIO);
  return [...rows].sort((a, b) => estados.indexOf(a.estado) - estados.indexOf(b.estado)
    || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}
