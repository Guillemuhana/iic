-- Solo lectura. Ejecutar luego de 007_estudios.sql desde SQL Editor.
-- Compara usando la misma normalizacion que tickets_privacy_guard.
-- Revisar antes de proponer una migracion: no actualiza comprobantes.
with historicos as (
  select estudio, count(*) as comprobantes
  from public.tickets
  group by estudio
)
select h.estudio as codigo_historico, h.comprobantes,
       array_agg(e.codigo order by e.codigo) filter (where e.id is not null) as candidatos,
       case when count(e.id) = 0 then 'sin coincidencia'
            when count(e.id) = 1 then 'coincidencia por mayusculas y espacios'
            else 'ambiguo: revisar manualmente' end as resultado
from historicos h
left join public.estudios e
  on upper(regexp_replace(coalesce(h.estudio, ''), '\s', '', 'g'))
   = upper(regexp_replace(e.codigo, '\s', '', 'g'))
group by h.estudio, h.comprobantes
order by h.comprobantes desc, h.estudio;
-- Propuesta posterior: agregar tickets.estudio_id nullable con FK a estudios,
-- completar solo coincidencias unicas aprobadas y conservar tickets.estudio
-- como texto historico. Resolver faltantes y ambiguos manualmente.
-- No hacer fuzzy matching automatico para cambiar datos historicos.
