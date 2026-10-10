# Replay previo del Gatekeeper

`pilot.jsonl`: 48 candidatos sintéticos en 23 episodios, castellano y algunos casos valencianos.
Todas las etiquetas son propuestas pendientes de revisión humana (`review: pending`), no verdad
de referencia validada. Incluye candidata/activa (`assess`/`assist`), contexto temporal, preguntas
breves, cifras/negación, continuación, residuos ASR, contenido ambiental y cambios para memoria.
No contiene conversaciones reales, audio, respuestas de Hermes ni resultados de modelos.

Validar sin inferencia, captura, red o credenciales:

```powershell
node scripts/gatekeeper-replay.cjs
node scripts/gatekeeper-replay.cjs --baseline-pass
```

El segundo comando es únicamente un control «dejar pasar todo»: no ejecuta ni representa la
línea base real de Hermes. Las latencias cero pertenecen a ese control, no a un modelo.

Para comparar predicciones obtenidas por separado:

```powershell
node scripts/gatekeeper-replay.cjs --predictions predicciones.jsonl --reference hermes-medido.jsonl
```

Predicción: `{"id":"pilot-001","action":"ignore","latencyMs":123}`. Exactamente una por candidato;
no se aceptan IDs desconocidos, duplicados o ausentes. Para WAIT se admite `finalAction: "assist"`
o `"ignore"`; `latencyMs` debe incluir espera y reevaluación. Sin decisión final, WAIT queda pendiente
y nunca se cuenta como ahorro. Un fallo con bypass se expresa como `action: "assist", bypass: true`.

Referencia opcional de assess: `{"id":"pilot-001","source":"measured","mode":"assess","verdict":"cortesia","useful":null,"memoryUpdated":false}`.
Para assist: `{"id":"pilot-002","source":"measured","mode":"assist","kind":"nada","useful":false,"memoryUpdated":false}`.
El modo debe coincidir con el candidato; assess conserva sus verdicts tema/cortesia/incierto.
Obtenerla de una ejecución independiente del flujo actual completo `assess` + `assist`; no convertir
etiquetas del piloto en supuestas respuestas de Hermes. `useful` necesita evaluación humana de la
intervención (puede ser null); `memoryUpdated` puede ser null si no se midió. `nada` puede coexistir
con `memoryUpdated: true`. El evaluador no puede comprobar la procedencia declarada de un fichero:
conservar la evidencia y configuración de cada ensayo fuera del dataset.

El informe separa assess/assist evitables, abstenciones observadas, ayudas útiles bloqueadas,
recall, WAIT pendiente, bypass, memoria y P50/P95. Sin ejemplos útiles medidos, recall útil es null.
Las latencias son las aportadas por el productor de predicciones, no una medición del evaluador.
CPU/RAM/temperatura/interferencia/cuota quedan null: requieren ensayo físico y datos del proveedor.
No interpretar `memoryRelevantBlocked` (anotación) como una actualización real perdida.

El evaluador CLI puntúa candidatos con su contexto; NO simula la evolución contrafactual
completa de episodios, memoria o temporizadores de ACTIVE. El ejecutor local del móvil ya está
implementado en `gatekeeper-benchmark.ts`, usa el mismo provider llama.cpp del Gatekeeper y exporta
`benchmark-MODELO.jsonl` y `benchmark-MODELO-report.json` en files/gatekeeper (solo datos sintéticos).
En Opciones avanzadas → Gatekeeper experimental → Prueba local sin audio, con Conversaciones OFF
y el modelo descargado/verificado. Hey Even o iniciar captura cancela la prueba.
El informe registra `stopReason`: `completed`, `priority`, `capture` o `cancelled`.
`cancelled` incluye cerrar la vista; apagar/bloquear pantalla no demuestra por sí solo prioridad.
El presupuesto 30/45 s warm/cold es de medición, no un deadline operativo aceptable. WAIT queda sin resolver en
esta primera pasada; no equivale a comparar su espera/reevaluación contra el silencio actual de 2 s.
El modelo cloud de referencia
será fijo y versionado; el local usará GGUF/plantilla/gramática y parámetros registrados.

Siguiente: revisar etiquetas, ampliar a 150–300 casos útiles, separar episodios de desarrollo y
evaluación (sin variantes del mismo episodio entre particiones), obtener referencias reales y comparar
reglas solas, Hermes actual y candidatos locales/cloud. El piloto no autoriza ACTIVE.
