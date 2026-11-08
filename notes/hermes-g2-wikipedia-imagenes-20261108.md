# Hermes G2: Wikipedia local, esquemas y dibujos — 08/11/2026

## Alcance

Cambios en el puente `faceclaw-hermes` de EVO-X2, no en la APK de Faceclaw. La app ya tenía
`glasses.show_image` y la capa `ShellImageLayer`; no se ha recompilado ni reinstalado la APK.

## Wikipedia local para cultura general

- La herramienta `enciclopedia` consulta la **Wikipedia en español**; en EVO-X2 usa la copia local
  **Kiwix** (`wikipedia_es_all_nopic_2026-10`) y la API online como respaldo.
- El puente ahora **prelee** `enciclopedia` para preguntas de cultura general: extrae la entidad y el
  aspecto (habitantes, capital, superficie, altitud, presidente, moneda, años), y responde con la frase
  relevante del artículo. No depende de que Qwen decida llamar a la herramienta.
- Si no hay artículo, el turno no inventa: se marca `noFactData`; esta ruta no consulta la web.
- Prueba real: «¿Cuántos habitantes tiene Canberra?» → **452 670 habitantes** (censo 2021), **0,53 s**,
  `apiCalls=0`, `encyclopediaPrefetch=1`. El modelo había respondido 47 000 de memoria; corregido.

## Imágenes y esquemas de texto

- El modelo decide cuándo una imagen o un esquema aporta; no hay triggers por palabra.
- Para imágenes, `glasses_show_image` admite SVG, URL, archivo o búsqueda de foto. Límites de la app:
  **528×216** (196 de alto con pie), 16 niveles de gris, fondo transparente y tinta clara.
- Para pasos y relaciones, se permite un **esquema de texto** corto con `->`, `=`, `+`, `x`; por ejemplo
  `27×14 -> 27×10=270 -> 27×4=108 -> 270+108=378`. No es decoración y no sustituye una imagen pedida.

## Caja con medidas

- Nueva herramienta `dibujar_caja(ancho, alto, fondo, unidad)`: genera un ortoedro SVG etiquetado y lo
  muestra en las gafas; no busca una foto.
- Además, si el modelo elige mostrar imagen y el turno contiene una terna como **34 × 45 × 29**, el puente
  sustituye la foto/consulta por el dibujo SVG etiquetado. Es un esquema, no está a escala.
- La prueba sin teléfono devuelve `picture: shown`, elimina el `image` de foto y deja el pie
  `34 x 45 x 29`.

## Frescura de turnos

- Se añadió un corte: si la voz tiene más de **15 s** (`vadStopToRequestMs`), el turno se descarta como
  `stale:speech-age` y no se responde.
- Motivo observado: un turno de **80 s** de antigüedad llegó a procesarse, tardó 48,6 s y quedó
  `retired:optional`; con una reconexión/reinicio podía aparecer una respuesta vieja. Ahora no se procesa.

## Verificación

- `test_tesla.py` y pruebas de banco: Canberra 452 670 en 0,53 s; caja con SVG; texto esquemático.
- Producción: `faceclaw-hermes` `ready` 18:25:23, teléfono conectado 18:25:26, `toolCount=42`.
- Copias de seguridad del puente en `/home/dani/qwen36-puente-20261108/` (no incluidas en el repo).
- El puente sigue usando Qwen3.6-35B-A3B; no se modificó la APK, la firma ni los ajustes privados.

## Pendiente

- Confirmación física de la caja y de una imagen SVG en las lentes.
- Valorar si el esquema de texto debe usarse más a menudo; ahora lo decide el modelo.
- No se copia el código del puente a este repositorio: vive en EVO-X2. Esta nota documenta el cambio y
  las rutas de reversión.
