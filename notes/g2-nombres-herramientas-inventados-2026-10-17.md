# G2: el agente inventa nombres de herramientas del teléfono (17/10/2026)

**Síntoma.** Pregunta desde las G2 a las 19:52:40: «¿hay algún Consum cerca?». El agente de `faceclaw-hermes`
(Qwen3.6 en EVO-X2) llamó a `glasses_call` con `tool=search_nearby` sin consultar antes el catálogo. El Pixel
respondió `Unknown tool: search_nearby`. El agente cargó entonces el catálogo completo (`glasses_list_tools`,
~3 400 tokens) y respondió bien con `web_search`.

**Causa.** El nombre es inventado: no aparece en ninguna fuente. El catálogo de la app (34 herramientas en
`app/assistant/*-tools.ts`) no tiene búsqueda de lugares, y el prompt del puente habla de «nearby searches» sin
nombrar ninguna herramienta. La descripción de `glasses_call` no avisaba de que los nombres deben ser exactos.

**Corrección en el puente, instalada el 17/10 a las 20:14 (la app no cambia).**

- Descripción de `glasses_call`: nombre exacto con ejemplos. Indica que el teléfono no tiene búsqueda de lugares
  y que se use `glasses_get_location` + `web_search`.
- Si el teléfono responde «Unknown tool», el puente devuelve también `hint` y `validTools` (solo los nombres,
  pedidos al Pixel con `tools/list`). Así el modelo se recupera sin cargar los esquemas.

Detalle, test, instalación y reversión: repo `Hermes agent proactive v2`,
`preparacion-evo-x2/puente/nombres-herramientas-g2-20261017/README.md`. Reversión en EVO:
`bash ~/faceclaw-hermes-bridge/rollback-20261017-tool-names/revertir.sh`.

**Relación con la app.** Si algún día se añade a Faceclaw una herramienta de lugares cercanos (`places.search`
o similar), hay que quitar la frase «no place or nearby search» de la descripción de `glasses_call` y de
`UNKNOWN_TOOL_HINT` en `bridge.py`.

El otro fallo de ese turno, `nav.start_navigation` sin fix de GPS fresco (`waitForFix()` en
`app/apps/navigate/navigate-app.worker.ts`), se trata aparte.
