# Precisión del escáner

Revisión: 8 de octubre de 2026.

El criterio principal es el importe exacto, incluyendo centavos. Una lectura que
requiere revisión es preferible a un importe incorrecto presentado como seguro.
La coincidencia de dos respuestas del mismo modelo no demuestra que sean correctas.

## Implementación actual

- Detección local de papel claro, encuadre completo y estabilidad durante 1,5 segundos.
  Es una heurística: necesita contraste con el fondo, puede rechazar documentos
  superpuestos y no corrige perspectiva. El botón manual sigue disponible.
- La lectura general usa el original. El contraste se reserva para verificar el
  importe; enviar ambas imágenes en la lectura general agotó el cupo gratuito
  en la prueba real, sin resolver el error manuscrito.
- El importe se verifica sin informar al verificador el resultado anterior.
- Las relecturas ampliadas comparan ambas transcripciones literales y el tipo de campo.
  El resultado a la derecha de `=` se conserva; un ticket adjunto no reemplaza el
  importe del recibo. Si las lecturas discrepan, no se completa el total.
- Se respeta `Retry-After` una vez si la espera entra en el tiempo disponible de
  la función. Si el cupo sigue agotado, se informa la espera y no se adivina el importe.
- En revisión, se puede seleccionar solo la línea del importe para repetir la lectura.
  La foto completa permanece disponible y las zonas de privacidad no se modifican.
  Los resultados de ese recorte son sugerencias para revisión, no sobrescriben
  automáticamente el importe: dos respuestas del mismo motor pueden fallar igual.
- Guardar exige confirmar el importe con la foto. Las fotos originales no se guardan
  en Storage; se envían a Groq para lectura y se guardan versiones tapadas.

## Motores investigados

| Motor | Qué ofrece | Qué falta comprobar |
| --- | --- | --- |
| Groq / Qwen 3.8 27B | Visión, JSON y hasta tres imágenes por solicitud | Precisión en manuscritos reales y límites del plan |
| Google Document AI Enterprise OCR | OCR, orientación, posiciones y evaluación de calidad | Comparación con los recibos del instituto; requiere proyecto y facturación |
| Mistral OCR | OCR de documentos e imágenes con salida estructural | Comparación de manuscritos y disponibilidad del cupo gratuito |

Documentación oficial:
- https://console.groq.com/docs/vision
- https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr
- https://docs.mistral.ai/studio/document-processing/basic_ocr
- https://cloud.google.com/products/document-ai/pricing
- https://docs.mistral.ai/inference/pricing

Los precios y cupos cambian. No se activó ningún proveedor adicional ni facturación.
No se ha demostrado que un proveedor alternativo sea mejor para estos recibos.
El usuario eligió continuar con Groq gratis. No activar motores adicionales sin
una nueva instrucción. El recorte ampliado queda visible junto a los candidatos
para facilitar la revisión de cada cifra.

## Mejora posterior con Groq gratuito

Se agregó Tesseract.js local para reconocer exclusivamente la etiqueta impresa
`Recibí la suma de` y sus coordenadas, no para completar cifras manuscritas.
Prueba las orientaciones 0/90/270/180, con un límite de 20 segundos y fallback
al lector previo si no ubica la etiqueta. Descarga modelos gratuitos; la imagen
se procesa en el dispositivo y el texto local no se guarda ni se envía.

El recorte del campo se amplía a 1800 píxeles con margen blanco. Groq transcribe
cada dígito en una lista, además del monto y su expresión literal. Cualquier
`?`, ambigüedad o discrepancia entre la lista de dígitos y el monto exige revisión.
Se usa modo instruct (`reasoning_effort=none`) y se ajustan las esperas a la cuota.

Prueba real con la foto original girada y sin recorte manual: el OCR local encontró
la línea y la orientó; la extracción general propuso **163984**, las lecturas por
dígitos ampliadas coincidieron en **163934** y corrigieron el total a **163934**.
Esto es un acierto en un documento, no una tasa de precisión demostrada. Se mantiene
la confirmación humana y falta medir más fotos y cámaras reales.

También se probó la preparación exacta en Chrome: orientación **270°**, región
**[75,331,985,403]**, y lectura final de Groq **163934**. El reconocimiento local
solo efectuó descargas GET de recursos, sin transmitir la imagen.

Para repetir la prueba contra la app publicada, con orientación/localización:
`node scripts/benchmark-scan.mjs 'ruta-al-recibo.jpg' 163934 0 locate`.

La validación final se hizo desde la interfaz publicada en Chrome: elegir la foto
original, pulsar `Escanear esta foto` y esperar la revisión. Resultado **163934**,
región local **[75,331,985,403]**, candidato inicial **163984** corregido por las
lecturas ampliadas. No hubo escrituras a tickets ni Storage. Una variante de
preparación de la herramienta Node pidió revisión; por eso la prueba de interfaz
es la referencia para el recorrido de usuario y no se afirma robustez para todas
las compresiones o documentos.

`scripts/benchmark-browser.mjs` reproduce esa prueba. Requiere Chrome y Playwright
como herramienta temporal, la contraseña por variable de entorno y bloquea
escrituras durante la comprobación. No pulsa Guardar.

Documentación de OCR local: https://github.com/naptha/tesseract.js/blob/master/docs/api.md

## Medición reproducible

`scripts/benchmark-scan.mjs` recibe una foto, el importe correcto conocido y una
rotación opcional. Usa una sesión temporal de una cuenta autorizada, cierra la sesión
al terminar y llama únicamente a lectura: no inserta tickets ni sube fotos a Storage.
La contraseña se pasa mediante `IIC_SCAN_PASSWORD`, nunca se incluye en archivos.
El resultado solo contiene importes, estado, duración y modelo, sin nombres ni firmas.

```powershell
node scripts/benchmark-scan.mjs 'ruta-al-recibo.jpg' 163934 270
# Recorte x,y,ancho,alto en píxeles, después de girar:
node scripts/benchmark-scan.mjs 'ruta-al-recibo.jpg' 163934 270 '180,290,1100,110'
```

Para comparar proveedores, reunir al menos 30 documentos variados con valores
correctos revisados: manuscritos distintos, fotos giradas, sombras, tickets térmicos,
transferencias y comprobantes superpuestos. Medir importe exacto, importe incorrecto,
revisión requerida, campos faltantes, demora y costo. No usar el importe conocido
como pista en los prompts y no ajustar reglas a una sola foto.

## Resultado de referencia antes de estos cambios

El recibo facilitado, girado a posición legible, tiene total **163934**.
En la prueba real anterior a esta revisión, Groq propuso **163984** y la comprobación
no pudo leer el importe. Resultado presentado: `null`, revisión requerida (5,8 s).
Las pruebas unitarias usan respuestas simuladas y no prueban precisión OCR real.

## Resultado real después de probar las alternativas de imagen

- Original + contraste en lectura general: candidato **163984**; comprobación
  bloqueada por cuota (429), importe presentado `null`.
- Recorte de la línea, en color y en gris: **163984** en ambas respuestas, incorrecto.
  La coincidencia dio un falso positivo. Por ese resultado se cambió la relectura
  de recortes para exigir ingreso/revisión humana, sin completar el total.
- No se ha demostrado precisión suficiente para automatizar importes manuscritos
  con este motor. El siguiente paso es comparar otro motor con un lote real,
  usando el mismo benchmark y sin informar respuestas conocidas al modelo.
