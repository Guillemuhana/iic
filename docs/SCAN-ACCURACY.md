# Precisión del escáner

Revisión: 8 de octubre de 2026.

El criterio principal es el importe exacto, incluyendo centavos. Una lectura que
requiere revisión es preferible a un importe incorrecto presentado como seguro.
La coincidencia de dos respuestas del mismo modelo no demuestra que sean correctas.

## Implementación actual

- Detección local de papel claro, encuadre completo y estabilidad durante 1,5 segundos.
  Es una heurística: necesita contraste con el fondo, puede rechazar documentos
  superpuestos y no corrige perspectiva. El botón manual sigue disponible.
- Se envían el original y una versión con contraste, conservando las coordenadas.
- El importe se verifica sin informar al verificador el resultado anterior.
- Las relecturas ampliadas comparan ambas transcripciones literales y el tipo de campo.
  El resultado a la derecha de `=` se conserva; un ticket adjunto no reemplaza el
  importe del recibo. Si las lecturas discrepan, no se completa el total.
- En revisión, se puede seleccionar solo la línea del importe para repetir la lectura.
  La foto completa permanece disponible y las zonas de privacidad no se modifican.
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
