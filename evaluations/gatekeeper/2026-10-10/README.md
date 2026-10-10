# Replays físicos de Gatekeeper — Pixel 10 Pro Fold

S2.7 corregida `5d6525de…a7b3`, llama.cpp b10333, CPU/1 hilo/background,
contexto4096/batch32, greedy/GBNF estricto, sin reutilización de KV entre llamadas.
48 candidatos de `tests/fixtures/gatekeeper/pilot.jsonl` (SHA-256
`0e84205445bdb8bce41f6ed52475adb93448745a6622794dc4fc0b0aa8c3148f`).
Todos sintéticos, etiquetas pendientes de revisión humana; no hay referencias reales de Hermes.
Conversaciones OFF; no micrófono, Whisper concurrente ni llamadas al proveedor durante el replay.
El proceso había ejecutado antes Whisper base: PSS es de toda la app, no memoria exclusiva del filtro.

| Configuración | Qwen3 0.6B Q8 | LFM2.5 1.2B Q4_K_M |
| --- | ---: | ---: |
| Completadas / fallos de formato | 48 / 0 | 48 / 0 |
| P50 / P95, ms | 3002 / 3172 | 4645 / 7940 |
| Primera llamada, ms | 3678 | 5165 |
| IGNORE / ASSIST / WAIT | 43 / 5 / 0 | 1 / 47 / 0 |
| Recall frente a ASSIST provisional | 4/36 (11,1%) | 35/36 (97,2%) |
| PSS máximo de proceso, KiB | 2137159 | 1879535 |
| CPU total proceso durante llamadas, ms | 142958 | 263308 |
| Máxima temperatura batería, °C | 33,1 | 35,3 |
| Máximo thermal status Android | 0 | 0 |

No válido para ACTIVE en esta configuración: suprime incluso preguntas claras del piloto
y excede el deadline operativo provisional1,5s. Tampoco demuestra ahorro ni recall de ayuda útil:
faltan referencia Hermes, anotaciones humanas, medición conjunta con Whisper y prueba de prioridad.
No aumentar el deadline ni relajar seguridad para hacer pasar este resultado. El modelo, prompt y
cuantización se evalúan como una configuración concreta; esto no descarta cualquier uso del modelo.

La primera latencia incluye carga y ejecución, sin desglosarlas; las restantes son warm.
`*-report.json` contiene recursos reales y predicciones; `*-evaluation.json` conserva el evaluador
offline, cuyos recursos son null por diseño (no ingiere telemetría). Los porcentajes son frente a
etiquetas provisionales, nunca exactitud validada ni ahorro de cuota.

LFM completó en la revisión 3 `5f0b6a5c…6d83`, con `stopReason: completed`.
Su única exclusión (`pilot-044`) tiene etiqueta provisional ASSIST; deja pasar los nueve IGNORE
provisionales. No aporta reducción útil demostrada y las 47 llamadas warm superan 1500 ms.
Tampoco es apto para ACTIVE en esta configuración. No confundir recall provisional alto con
recall de intervenciones útiles medidas de Hermes, que sigue siendo null.

La primera ejecución LFM terminó a 26/48 y queda conservada como `*-interrupted*`.
Usuario solo apagó/bloqueó pantalla, sin interacción con el asistente; no se registraba motivo,
así que no acredita prioridad de Hey Even ni demuestra la causa. La repetición mantuvo pantalla
encendida por USB; después se restauró `stay_on_while_plugged_in=0` y se liberó la reserva propia.
No usar esta ejecución con pantalla encendida como prueba de autonomía o funcionamiento bloqueado.

`configuration.json` registra parámetros, hashes del dataset, fuentes y APK. Pesos LFM:
SHA-256 `b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5`.
LFM se midió tras reiniciar la app y seleccionar base sin captura: diferencias de PSS entre modelos
no representan una comparación aislada de sus pesos. Recursos de proceso, sin atribución causal.
