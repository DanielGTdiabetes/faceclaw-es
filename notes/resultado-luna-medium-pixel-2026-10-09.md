# Banco Whisper medium en Pixel · 09-10-2026

Encargo de Luna (medir CPU/medium en el Pixel sin tocar producción), iniciado por Codex/Luna y completado por
Claude. Todas las cifras proceden del **corpus público/sintético** (FLEURS CC-BY-4.0 y señales generadas); ningún
dato procede de sesiones, transcripciones ni audio de Faceclaw.

## Resultado

- **No hay configuración ganadora.** Medium en CPU no sostiene la política de producción `ref-6-3` (una ventana
  de 6 s cada 3 s necesita < 3 s por decodificación): p95 ≈ 14,8–15,2 s con 4 hilos, ~70 % de ventanas
  descartadas y ~56–58 % del audio decodificado.
- 1 hilo ganaba en el piloto de corpus, pero **no** en tiempo real (empate) y es **peor** en sostenido
  (p95 +25 %, cobertura −12 puntos). Se conserva 4 hilos, la configuración ya instalada.
- Estabilidad: 0 errores de decoder, drenaje tras OFF ≤ 0,7 s, térmico 1 en todas las corridas (headroom ≥ 0,77,
  batería ≤ 39,3 °C, cargando).
- La lentitud observada con la TV es coherente con estas cifras: medium transcribe bien lo que decodifica, pero
  en flujo continuo pierde la mayor parte de las ventanas.

## Condiciones

- Pixel 10 Pro Fold, Tensor G5, Android 17/API 37, serial `61161FDCG0013L`; Faceclaw
  `0.8.2-es.5-conversation.s2.6.12-whisper-performance`, código 805, sin cambios durante todo el banco.
- Antes de instalar el auxiliar se confirmó OFF en la UI y por diagnóstico agregado (`enabled=false`,
  `worker=false`, `busy=false`, `inputBufferedBytes=0`, sin drenaje, 0 entradas de audio activas, 0 clientes de
  grabación, sin wakelock `Faceclaw:ConversationG0` activo). Antes de cada corrida se repitió la comprobación
  agregada (wakelock activo, actividad de grabación, estado de llamada). No se leyó transcripción ni se inició
  captura.
- Auxiliar separado `com.faceclaw.whisperbench`, sin permisos de micrófono ni red, APK SHA-256
  `98843e64ef34b46b9864e7372572689221fbef72c429db17e2c863fd3b7980a`, rama `claude/whisper-perf-bench-2026-10-09`,
  commit `342154c74a66`. sherpa-onnx 1.13.0 y ONNX Runtime idénticos por SHA-256 a los de Faceclaw S2.6.12.
- Pesos `sherpa-onnx-whisper-medium-es-int8` verificados (946.072.270 bytes); el runner revalida los hashes.
- Teléfono cargando (USB) al 100 %, pantalla encendida por el auxiliar. CPU, idioma auto, conditioning on,
  padding por defecto en todas las corridas.

## 1. Piloto de hilos (corpus, 3 fixtures)

3 repeticiones + 1 calentamiento; 27 decodificaciones por grupo.

| Hilos | Verif. ms | Carga ms | Calent. ms | p50 ms | p95 ms | Máx. ms | RTF |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 597 | 3929 | 5925 | 8492 | 11335 | 11366 | 1.455 |
| 2 | 986 | 4369 | 5522 | 8547 | 13552 | 13827 | 1.614 |
| 4 | 1401 | 6218 | 5512 | 11114 | 15021 | 15649 | 1.849 |
| 6 | 1780 | 9066 | 6219 | 12642 | 17843 | 21566 | 2.374 |

WER/CER idéntico en los cuatro grupos (es `0.1111 / 0.0233`; ca `0.0526 / 0.0744`). Resultados en `medium-pilot/`.

## 2. Baseline de corpus completo

`medium-baseline-corpus`: 4 hilos, 24 fixtures, repeat 3, warmup 2, 18:46–19:33.

| Decodificaciones | Audio | p50 ms | p95 ms | Máx. ms | RTF | WER/CER es | WER/CER ca |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 258 | 1372,4 s | 10392 | 17313 | 19389 | 1.950 | 0.141 / 0.085 | 0.206 / 0.114 |

- Verificación 1511 ms, carga 5895 ms, calentamiento 4311/4357 ms, PSS tras carga 1,09 GB.
- Térmico 1 antes y después; batería 38,5 → 39,3 °C.
- Rechazos: 210 `NONE`, 48 `LANGUAGE`. Silencio y los tres ruidos: 0 palabras entregadas tras el filtro de
  producción (33 antes del filtro). El primer fragmento de cada stream también se rechazó por idioma.
- WER/CER se calcula sobre fragmentos de 6 s de cada frase (segmentMs 6000), por eso supera al del piloto.
- **Límite:** el usuario recibió una llamada y desconectó el USB hacia 19:01–19:06, en mitad del run (la
  actividad del auxiliar dejó de estar visible 19:05:16–19:05:34). El CSV no tiene marca de tiempo por
  decodificación, así que esos minutos no pueden aislarse. Dispersión máxima entre repeticiones del mismo
  fragmento ×1,36; medianas por repetición 10,3 / 10,5 / 10,4 s: no se observa una perturbación grande, pero no
  se puede excluir.
- **Defecto del auxiliar:** `run.json` guarda las hipótesis con doble codificación UTF-8 (`aÃ±os`). Las métricas
  se calculan en el dispositivo sobre el texto correcto (es-fleurs-00 cuenta 1 error, coherente con
  «Cep/martelli»). Corregir el volcado JSON del auxiliar antes de reutilizar las hipótesis.

## 3. Realtime ABBA 4 ↔ 1 hilos

`medium-realtime-abba`: `FaceclawLocalTranscriber` de producción a ritmo real, fragmentos de 50 ms, `ref-6-3`,
4 streams públicos (238,8 s), orden 4-1-1-4, enfriamiento 120 s, 19:34–20:03, sin llamadas.

| Hilos | Ventanas | Descartadas | Cobertura decodificada | p50 (mediana) | p95 (mediana) | Máx. | Latencia media (mediana) | Entregas | Errores | WER (mediana) | Drenaje OFF máx. |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 164 | 115 (70,1 %) | 55,9 % | 8780 ms | 14804 ms | 15951 ms | 10389 ms | 41 | 0 | 0.546 | 695 ms |
| 1 | 164 | 118 (72,0 %) | 52,6 % | 9303 ms | 14741 ms | 16297 ms | 10583 ms | 36 | 0 | 0.578 | 596 ms |

- El WER de estas pasadas es válido (cada stream se reproduce una vez con referencia completa), pero mide sobre
  todo la pérdida por descartes, no la calidad del modelo.
- Cobertura = audio en ventanas decodificadas sin error; no significa palabras reconocidas.

## 4. Sostenido ABBA 4 ↔ 1 hilos

`medium-sustained-abba`: igual que realtime en bucle, 5 min por bloque, orden 4-1-1-4, enfriamiento 120 s,
20:04–20:33, sin llamadas. Registro de tiempos completo en los cuatro bloques (`timingsComplete=true`).

| Ronda | Hilos | Ventanas | Descartadas | Cobertura | Voz cubierta | p50 ms | p95 ms | Máx. ms | Latencia media ms | Entregas | Errores | Drenaje OFF ms |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 4 | 101 | 72 (71,3 %) | 56,9 % | 57,3 % | 8159 | 15073 | 16384 | 9459 | 26 | 0 | 630 |
| 1 | 1 | 101 | 78 (77,2 %) | 45,1 % | 47,6 % | 11174 | 18763 | 20468 | 11987 | 22 | 0 | 565 |
| 2 | 1 | 101 | 78 (77,2 %) | 45,1 % | 46,2 % | 11263 | 19594 | 21070 | 12307 | 21 | 0 | 560 |
| 3 | 4 | 101 | 71 (70,3 %) | 57,8 % | 58,2 % | 7469 | 15221 | 16726 | 9221 | 27 | 0 | 666 |

- Serie térmica cada 10 s (124 muestras): estado 1 constante, headroom mínimo 0,767, batería máx. 38,7 °C.
- **WER/CER del sostenido no es válido** (el bucle corta frases en puntos arbitrarios); no se informa.
- Ordenación ABBA estable: los dos bloques de cada configuración coinciden, por lo que la diferencia 4 vs 1 no es
  deriva térmica ni de orden.

## Criterio de promoción

Revisión Codex, 10-10-2026: el agregado bruto `nonSpeechWordsDelivered` del modo corpus también sumaba
las secuencias `stream` con voz (425 en el baseline; 62 en el piloto). No mide falsas palabras en no-voz.
El resumidor se corrigió para derivar ese recuento solo de fixtures `silence`/`noise`: baseline 0; piloto sin
fixtures no-voz = dato no disponible. JSON originales conservados; no cambian tiempos, WER es/ca de las
frases, cobertura ni la decisión sobre hilos. Corregir el contador del runner antes de generar nuevas tandas.

≥ 20 % menos p95 repetible sin degradación. 1 hilo: −25 % p95 en el piloto de corpus, 0 % en realtime y +25 % en
sostenido → no se promociona. Ninguna configuración CPU alcanza < 3 s. Para conversación real a dos metros,
medium en CPU de Tensor G5 con `ref-6-3` no es viable en flujo continuo; las vías que quedan son ventanas más
largas/coalescencia (más latencia), un modelo menor, o aceleración (NPU/GPU) aún no demostrada.

## Archivos

`evaluations/whisper-tensor/results/pixel-medium-2026-10-09/`: `medium-pilot/`, `medium-baseline-corpus/`,
`medium-realtime-abba/`, `medium-sustained-abba/` (`run.json`, CSV, `status.txt=done`). Resumen tabular:
`python -I evaluations/whisper-tensor/summarize_pixel.py <carpeta>`.

## Cierre

Auxiliar desinstalado y reserva liberada al final; ver el relevo
`E:\projects\faceclaw-es\.tools\medium-luna-handoff-2026-10-09.json` (estado `released`).
