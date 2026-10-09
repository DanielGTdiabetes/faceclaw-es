# Whisper local en Pixel 10 Pro Fold: rendimiento, segmentación, whisper.cpp y TPU · 09-10-2026

Autor: Claude Code, para revisión de Codex. Checkout aislado `E:\projects\faceclaw-es-whisper-bench`, rama
`claude/whisper-perf-bench-2026-10-09`, base `6395abd`. **Nada integrado, desplegado, publicado ni enviado con push.**
Faceclaw, sus ajustes, su perfil, Hermes, firmware y servicios no se han modificado. No se usó el micrófono.
Mediciones en el Pixel autorizadas por el usuario en esta sesión («El otro hilo ya terminó…»), con el auxiliar
`com.faceclaw.whisperbench`, que se retira al terminar (sección 9).

## Resumen

- **El modelo small, el que usa el usuario, no llega a tiempo en el Pixel con la política actual 6 s/3 s.** Con su
  configuración de producción (4 hilos, CPU), el p50 por ventana de 6 s es ≈2,9 s y el p95 ≈5,2 s. Ningún número de
  hilos baja de 3 s: con 2 hilos el p95 es 4,7 s y con 6 hilos 6,6 s, peor. A ritmo real se descarta el **33,5 %** de
  las ventanas (55 de 164).
- **Esos descartes no dejaron huecos temporales en este corpus.** El solape de 3 s hace que la ventana vecina cubra lo
  descartado: en las 16 reproducciones, las ventanas enviadas a inferencia cubrieron el 100 % del tiempo de voz de los
  clips. Eso es cobertura temporal, **no 100 % de palabras reconocidas ni de texto entregado**: esas ventanas pueden
  contener errores, rechazos de idioma y deduplicación. Con la semántica de entonces la cobertura contaba también intentos
  fallidos; estos ensayos no registraron ese dato (corregido después, ver «Actualización»). No se extrapola a voces
  reales a 2 m. El síntoma «no aparece la otra persona a 2 m» no se explica solo por la carga.
- **El reconocimiento sí pierde texto.**
  - **Filtro de idioma:** en 6 s el detector automático clasifica como pt/ru/ro/en/it ventanas de español o catalán.
    Con small, el filtro de idioma descartó 11 de las 45 ventanas del corpus: 3 de voz y 8 de silencio o ruido.
  - **Ventana de 6 s:** en PC, las frases completas tienen bastantes menos errores que troceadas en segmentos
    consecutivos de 6 s sin solape (español 10 % frente a 15 %, catalán 25 % frente a 39 %). No es una comparación
    directa con la política de producción 6/3 ni una mejora validada en el Pixel: es una pista para otro experimento.
  - **Voz débil:** la frase atenuada 30 dB tiene un 62 % de palabras erróneas, frente a un 25 % de la misma voz sin
    atenuar; el acondicionamiento actual apenas cambia esto (66 % sin él).
- **Rendimiento:**
  - Base con 4 hilos mejora el p95 frente a 1 hilo un 37 % en la primera pasada de corpus y un 16 % en la segunda;
    en ritmo real sostenido, un 51,85 % y un 40,35 % (5.4).
  - Ni XNNPACK, ni padding reducido, ni más hilos aceleran small un 20 %.
  - **whisper.cpp con Vulkan arranca en la GPU PowerVR del Tensor G5, pero la sonda fue muy lenta** (una ventana, dos
    ejecuciones: 72,1 s de procesado). No se compara con el mismo clip en CPU ni se extrapola un factor al corpus.
  - whisper.cpp en CPU tuvo menos errores en catalán (21 % frente a 39 %) y fue más lento. **No es una comparación
    aislada del runtime**: otra cuantización (q8_0), búsqueda, contexto fijo de 30 s y sin los filtros de
    estructura/alucinación de Faceclaw. Es una pista, no una conclusión.
- **TPU:** Tensor SDK es una beta con registro; Whisper no figura en su catálogo y no hay acceso a las herramientas.
  Bloqueado, sin números inventados.
- **Recomendación:**
  - Conservar la producción tal cual, salvo **promover base a 4 hilos** (aplicado tras la revisión de Codex): dos
    bloques de 5 min por configuración, orden 1/4/4/1 separados por enfriamientos, p95 1.726/831/828/1.388 ms
    (−51,85 % y −40,35 % emparejados) con hipótesis completas idénticas. Acredita latencia en esas condiciones, no
    autonomía ni estabilidad de una hora. Small, el modelo del usuario, sigue igual y este cambio no resuelve la voz
    lejana.
  - La política coalescente queda experimental: elimina descartes, pero no mejora la precisión y añade 1 s de latencia.
  - La siguiente palanca es el **reconocimiento**: restringir idioma, ventanas más largas sin coste de descarte y
    decodificación con mejor búsqueda. No hace falta más CPU, GPU ni TPU.

## 1. Punto de partida y procedencia

- `git worktree add -b claude/whisper-perf-bench-2026-10-09 E:\projects\faceclaw-es-whisper-bench 6395abd`. El checkout del
  otro hilo (`E:\projects\faceclaw-es`) solo se leyó: ni reset, stash, clean, pull, cambio de rama ni escritura. (El
  worktree añade su registro en el `.git` compartido; se elimina con `git worktree remove`.)
- Cambios locales sin commit del otro checkout (AGENTS.md, app.gradle `s2.6.11-daily-context`, canal/UI de conversación,
  puente Hermes, memoria diaria…): **no se ha incorporado ninguno**. Los cuatro archivos Whisper relevantes
  (`FaceclawLocalTranscriber.kt`, `AndroidSpeechEngines.kt`, `LocalTranscriptSession.kt`, `LocalAsrConditioner.kt`) eran
  idénticos a HEAD en ese checkout (`cmp`): la candidata parte del mismo código Whisper que la S2.6.10 instalada, y su
  APK conserva `versionName …s2.6.10-model-selector` de HEAD.
- Leídos: `C:\Users\danie\.codex\memories\faceclaw.md`, `AGENTS.md` (incluidas sus entradas locales del 09-10),
  `notes/selector-modelos-conversacion-2026-10-08.md`, `notes/auditoria-conversaciones-continuas-2026-10-09.md` (sección O)
  y `notes/whisper-aceleracion-pixel-tensor-2026-10-09.md` (sin commit, del otro hilo).
- Hechos del encargo comprobados en las fuentes:
  - Base usa 1 hilo; small y medium, 4.
  - SHA-256 antes de JNI y selección explícita, sin sustitución de modelo.
  - Proveedor por defecto `cpu` en `OfflineModelConfig`; sherpa-onnx 1.13.0.
  - Ventanas de 6 s con salto de 3 s, un trabajo en vuelo y descarte si el decoder está ocupado.
  - `LocalAsrConditioner` ya existe y actúa sobre la copia para ASR.
- Hallazgos de fuente adicionales:
  - **Relleno por ventana:** en sherpa-onnx v1.13.0 (`offline-recognizer-whisper-impl.h`), cada ventana recibe 1.000
    frames de relleno (10 s; parámetro `tail_paddings`) con tope de 3.000 frames. El encoder de sherpa ve 6 s + 10 s.
    whisper.cpp procesa siempre 30 s.
  - **XNNPACK:** la `libonnxruntime.so` que ya lleva Faceclaw incluye el proveedor XNNPACK, y sherpa acepta
    `provider="xnnpack"`; si no puede usarlo, cae a CPU sin avisar salvo en el log.
  - **NNAPI:** está ligado al nivel de compilación de la biblioteca y obsoleto desde Android 15; no se ha usado.

## 2. Código (commits propios sobre `6395abd`)

| Commit | Contenido |
| --- | --- |
| `c1388be` | Configuración explícita, política coalescente experimental, cobertura/latencia/tiempos (núcleo + Android + 9 pruebas) |
| `f3edc5d` | Corpus reproducible, referencia PC, auxiliar Android, scripts whisper.cpp |
| `51db71a` | Marca «dirty» del auxiliar ignora resultados sin seguimiento |
| `3f2e534` | Auxiliar como servicio en primer plano con wakelock parcial (la primera ejecución quedó congelada al bloquearse el teléfono) |
| (último) | Informe, resultados, README y resumidor |

### Producción: comportamiento por defecto idéntico

- `LocalWhisperRunConfig.kt` (común):
  - `LocalWhisperPerformance`: hilos 1/2/4/6, proveedor `cpu`/`xnnpack` y `tailPaddingFrames` (0 = valor de sherpa,
    o 100–1000).
  - `defaultFor()` devuelve los valores actuales; `validated()` rechaza cualquier otro valor en vez de recortarlo en
    silencio. QNN, NNAPI y «gpu/tpu» se rechazan.
  - `LocalTranscriptWindowPolicy` con dos políticas: `ref-6-3` (exactamente la actual) y `coalesce-6-3-max12`.
- `LocalTranscriptBuffer`:
  - La ventana sigue a la política. Con `ref-6-3`, mismo algoritmo y memoria: las 42 pruebas previas pasan sin cambios.
  - Contadores nuevos: `windowPolicy`, `deferredWindows`, `coalescedWindows` y `maxWindowMs`.
- `LocalTranscriptSession`:
  - La política se captura en `start()`; una inválida se rechaza sin tocar estado.
  - Cobertura `coveredAudioMs` frente a `windowedAudioMs`, latencia del cierre de ventana a la entrega y `runtime`
    del decoder.
  - `decodeTimings()`: anillo fijo de 256 entradas, solo escalares, fuera de `diagnostics()` para no engordar el
    sondeo de la UI.
  - Deduplicación: una ventana es «adyacente» si empieza dentro de la ventana entregada anterior. Equivale a la regla
    anterior en `ref-6-3` (cubierto por las pruebas previas).
- `LocalWhisperModels.kt` (Android): catálogo, hashes y carga extraídos de `FaceclawLocalTranscriber` para que el banco
  ejecute exactamente el mismo código. `AndroidSpeechEngines.recognizerConfig` añade proveedor y padding con valores por
  defecto que reproducen la configuración previa: `cpu` explícito era ya el valor por defecto, y el padding solo se fija
  si es mayor que 0.
- `FaceclawLocalTranscriber`:
  - `start(language, modelId, maxMs)`, la firma que usa TypeScript, conserva valores por defecto, CPU, padding de
    sherpa y `ref-6-3`.
  - `startConfigured(…)` sirve para banco y diagnóstico y **no está conectado a la UI**.
  - Modelo, rendimiento y política se capturan juntos, y un arranque con trabajador vivo sigue rechazándose: un cambio
    durante la sesión no altera el decoder activo.
- **Sin cambios:** TypeScript, captura, LC3, BLE, VAD, perfil, identificación, ruta Pixel/Soniox, filtros de idioma y de
  alucinación, selector de motor y prioridades.

### Política experimental `coalesce-6-3-max12` (fase 2)

Es el cambio más pequeño sobre lo medido. Con el decoder libre produce exactamente las mismas ventanas 6 s/3 s
(probado). Si una ventana de 6 s se cierra con el decoder ocupado, el **mismo buffer acotado** sigue creciendo y se
entrega en cuanto el decoder queda libre, hasta 12 s; si a los 12 s sigue ocupado, se descarta como en la referencia.
No añade cola, ni inferencias concurrentes, ni puerta VAD/energía.

| Situación | `ref-6-3` | `coalesce-6-3-max12` |
| --- | --- | --- |
| Decoder libre | 6 s cada 3 s | Idéntico |
| Cierre con decoder ocupado | Descarta (`dropped`) | Retiene y crece (`deferredWindows`) |
| Ocupado al llegar a 12 s | – | Descarta (`dropped`) |
| OFF / reset / cambio de prioridad | Borra el buffer; el resultado en vuelo se invalida por generación | Igual; el audio retenido se borra y cuenta como interrumpido |
| Resultado tardío o sin oyente | Descartado y contado | Igual |
| Memoria | Buffer fijo de 8 s | Buffer fijo de 12 s por sesión (384 KB) |
| Latencia | Decode tras cierre | Mayor con carga (medido: +1 s de media) |

Para desactivarla no hay que hacer nada: no es la política por defecto y ninguna ruta de la app la elige.

## 3. Pruebas ejecutadas

| Tipo | Qué | Resultado |
| --- | --- | --- |
| Kotlin (JVM host), afectadas | `LocalTranscriptPhaseTest` 12, `LocalTranscriptSessionTest` 12, `LocalTranscriptWindowsTest` 10, `LocalAsrConditionerTest` 8, **`LocalWhisperPerformanceTest` 9 nuevas** | 51/51 |
| Kotlin, suite completa | `./wear/gradlew -p tests/kotlin testAndroidHostTest` | 281/282. Falla `PreviewAnimationListenerTest` (animación de gráficos con tiempo real, código no tocado); pasa 2/2 aislada; reproducible en ambas ejecuciones completas. Se recomienda a Codex comprobarla contra HEAD. |
| Nuevas, qué cubren | Grid de hilos/proveedores/padding; políticas inválidas; coalescente igual a la referencia con decoder libre; crecimiento acotado sin perder audio y descarte en el techo; voz baja tras fuerte sin puerta en ambas políticas; decoder más lento que el salto: la referencia pierde 3 s y la coalescente cubre; anillo de tiempos sin texto; dedup tras ventana coalescida y no a través de reset; OFF y reset durante JNI con audio retenido; `start()` de producción sigue en `ref-6-3` | No compilan contra HEAD (API nueva); las de comportamiento coalescente fallarían con la segmentación previa |
| Auxiliar (JVM) | `BenchMetricsTest` 2: vectores compartidos con Python y cobertura/ritmo | 2/2; Python 15/15 vectores |
| Build auxiliar | `:app:assembleRelease`; `.so` con SHA-256 iguales a producción (`4d2318b3…`, `290a2c18…`); `zipalign -c -P 16` OK; LOAD 0x4000; firma debug | APK `be06865a…` |
| Build producción candidata | `nativescript@9.1.2 prepare android --release --env.production` (`NS_SKIP_ENV_CHECK=1`, `--gradle-path`; el CLI local exige el paquete emulator) + `gradlew assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -x prepareFaceclawNativeLibs -x prepareFaceclawLlama`; AAR compartido reconstruido desde la rama; `.so` copiadas de la última extracción (7/7 hashes iguales a los de S2.6.10) | Webpack, Gradle y lintVital correctos. **Sin firmar**, no instalada: `dist/whisper-candidate/faceclaw-whisper-candidate-unsigned.apk` `860ad86b…`, 805, zipalign 16 KB OK |
| TypeScript / oxlint | No ejecutados: no hay cambios TS (webpack de producción compiló el bundle) | – |

Cuatro tipos de evidencia distintos: **simulación** (pruebas Kotlin con decoder falso), **inferencia real en PC**
(sherpa/whisper.cpp x86), **build Android** e **inferencia medida en el Pixel**. Cada tabla dice de cuál se trata.

## 4. Corpus

`evaluations/whisper-tensor/corpus/build_corpus.py`. El `manifest.json` versionado incluye origen, licencia, hashes,
frecuencia, duración, idioma y referencia; dos construcciones dan hashes idénticos.

- **Voz:** FLEURS dev (CC-BY-4.0), 8 frases es_419 y 8 ca_es, de 5,5 a 17 s, todas distintas.
  **Limitación:** FLEURS no tiene es-ES ni valenciano, y son lecturas a distancia normal.
- **Sintéticos (CC0):** silencio digital, ruido blanco −60 dBFS, ruido rosa −45 dBFS y zumbido de 50 Hz −40 dBFS,
  10 s cada uno.
- **Secuencias para ritmo real** (empiezan en 4,5 s para cruzar los límites de 3 y 6 s; pausas de 0,4–1,2 s; ruido de
  fondo −65 dBFS):
  - `stream-es`: 70 s.
  - `stream-ca`: 80 s.
  - `stream-mixed-es-ca`: 54 s.
  - `stream-level-es`: 35 s. **Prueba de nivel**: la segunda frase está atenuada 30 dB. **No equivale a una persona a
    dos metros**: no hay reverberación, cambio espectral ni voz cercana que compita.
- **Total:** 457,6 s. No contiene audio del teléfono ni conversaciones privadas. El audio no se versiona; hipótesis de
  texto solo de este corpus público.

## 5. Resultados

Criterio de promoción aplicado: mejora de al menos un **20 %** en p95, o reducción útil de descartes, sin regresión
material en precisión, cobertura, temperatura o cierre.

Tamaño de la muestra: **ocho frases por idioma, 177 palabras normalizadas de referencia en español y 170 en catalán**
(la versión anterior decía «~400 por idioma»: era incorrecto). Las ventanas además cambian según el tiempo de cada
ejecución. Como criterio **heurístico** de lectura, diferencias de WER menores de ~0,05 en español y ~0,10 en catalán
o en las secuencias no se tratan como diferencias; no hay análisis estadístico que las convierta en significación
demostrada. Ejemplo de variabilidad: la misma política dio 0,57 y 0,80 en `stream-ca` en dos rondas.

### 5.1 Referencia en PC (x86, sherpa-onnx 1.13.0 de PyPI, mismos ONNX; **no es rendimiento del Pixel**)

`results/pc-reference/`. Ventanas de 6 s salvo donde se indica; idioma automático salvo en «forzado es».

| Caso | WER es | WER ca | Comentario |
| --- | ---: | ---: | --- |
| base, acond. on / off | 0,237 / 0,175 | 0,523 / 0,559 | Acondicionar perjudica algo la voz limpia en español |
| small, acond. on / off | 0,152 / 0,141 | 0,394 / 0,382 | Igual, con menos diferencia |
| small, padding 300 / 500 (acond. on) | 0,158 / 0,152 | 0,423 / 0,423 | Sin ganancia; −7 % de tiempo en x86 |
| small, frase completa sin trocear | **0,102** | **0,253** | Frente a trozos consecutivos de 6 s sin solape (no la política 6/3): pista, no validación |
| small, forzado es | 0,152 | 0,629 | Forzar español destruye el catalán: descartado |
| small, 1/2/4/6 hilos | idéntico | idéntico | Los hilos no cambian el texto en x86 |
| Prueba de nivel, frase atenuada (small, acond. on / off) | 20/32 = 0,62 / 21/32 = 0,66 | – | La frase fuerte: 8/32 = 0,25. El acondicionamiento ayuda poco; muestra pequeña |
| whisper.cpp small q8_0 en x86, 6 s | 0,130 | 0,212 | Mejor en catalán; otra cuantización, búsqueda y contexto, sin filtros de estructura: no aísla el runtime |

### 5.2 Pixel: inferencia real del decoder (modo corpus)

`results/pixel/corpus-threads-2/`: Pixel 10 Pro Fold, Tensor G5, Android 17 (SDK 37), parche 2026-09-05, commit
`3f2e534`, servicio en primer plano y pantalla encendida. 45 ventanas de 6 s × 3 repeticiones y 2 calentamientos por
caso; batería de 33 a 40 °C, estado térmico 0→1; enchufado por USB.

| Modelo | Hilos | Verif. ms | Carga ms | p50 ms | p95 ms | máx ms | RTF | WER es | WER ca |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 1 (prod.) | 175 | 579 | 791 | 1.532 | 1.704 | 0,170 | 0,249 | 0,559 |
| base | 2 | 138 | 656 | 648 | 1.527 | 1.622 | 0,152 | 0,249 | 0,559 |
| base | **4** | 164 | 916 | 624 | **1.280** | 1.495 | 0,141 | 0,249 | 0,559 |
| base | 6 | 223 | 1.197 | 649 | 1.502 | 1.541 | 0,145 | 0,237 | 0,559 |
| small | 1 | 725 | 2.981 | 3.411 | 5.070 | 6.034 | 0,677 | 0,158 | 0,394 |
| small | 2 | 483 | 2.843 | 2.858 | 4.747 | 5.217 | 0,600 | 0,158 | 0,394 |
| small | **4 (prod.)** | 349 | 2.544 | 2.896 | **5.194** | 6.559 | 0,616 | 0,158 | 0,394 |
| small | 6 | 470 | 3.601 | 3.848 | 6.553 | 7.857 | 0,806 | 0,158 | 0,394 |

**Primera pasada** (`results/pixel/corpus-threads-1-frozen-partial/`), pantalla encendida y teléfono más frío:

| Modelo | Hilos | p95 ms |
| --- | ---: | ---: |
| base | 1 | 1.402 |
| base | 2 | 1.035 |
| base | 4 | **878** |
| base | 6 | 1.304 |
| small | 1 | 4.615 |

Esa pasada quedó congelada por Android al bloquearse el teléfono; el caso small con 2 hilos quedó incompleto y se
descartó. **La variación entre pasadas es grande** (base 4 hilos: 878 frente a 1.280 ms), así que el orden y la
temperatura importan.

Otros resultados:

- 0 palabras entregadas en silencio y ruido en todos los casos: el filtro de idioma quita las inserciones.
- Filtro de idioma: descarta 16 de 45 ventanas con base y 11 con small (`LANGUAGE`).
- PSS ≈ 270 MB con base y ≈ 490 MB con small; VmHWM de 0,58 y 1,08 GB.

**Mandos de small con 4 hilos** (`results/pixel/corpus-knobs-small/`, 1 repetición):

| Variante | p95 ms |
| --- | ---: |
| cpu (referencia) | 4.492 |
| cpu, padding 300 | 4.888 |
| xnnpack, padding por defecto | 5.142 |
| xnnpack, padding 300 | 5.093 |
| cpu sin acondicionamiento | 5.101 |

XNNPACK quedó «registrado, sin caída a CPU en el log»; la asignación de nodos no está verificada. **Ninguna variante
mejora un 20 %.** Sin acondicionamiento: WER ca 0,359 frente a 0,394 y CER ca 0,155 frente a 0,201. Coincide con el PC,
pero está dentro del margen.

### 5.3 Pixel: reproducción a ritmo real a través de `FaceclawLocalTranscriber` de producción

`results/pixel/realtime-small-t4/`. Configuración: small, 4 hilos, orden ABBA (ref, coal., coal., ref), 50 ms por
fragmento, 6 s de ruido −65 dBFS al final de cada secuencia y 30 s de enfriamiento. Pantalla encendida, batería 38,8–39,3 °C,
estado térmico 1.

| | `ref-6-3` (producción) | `coalesce-6-3-max12` |
| --- | ---: | ---: |
| Ventanas cerradas / descartadas | 164 / **55 (33,5 %)** | 124 / **0** |
| Decodificaciones | 109 | 124 |
| Tiempo de voz cubierto por ventanas enviadas a inferencia (mínimo de 8 reproducciones; no son palabras reconocidas) | **100 %** | **100 %** |
| p95 de decode (peor secuencia) | 5.480 ms | 6.573 ms |
| Latencia media / máxima de cierre a entrega | 3.052 / 4.969 ms | 4.101 / 6.579 ms |
| Entregas | 89 | 97 |
| Rechazos por idioma | 20 | 15 |
| WER `stream-es` (rondas) | 0,310 / 0,212 | 0,159 / 0,195 |
| WER `stream-ca` | 0,515 / 0,433 | 0,799 / 0,567 |
| WER `stream-level-es` | 0,391 / 0,391 | 0,453 / 0,656 |
| WER `stream-mixed-es-ca` | 0,340 / 0,410 | 0,690 / 0,520 |
| Drenaje al OFF (máximo) | 395 ms | 409 ms |
| Fragmentos alimentados con retraso de más de 25 ms | 0 | 0 |

**Interpretación:**

- Los descartes de la referencia no dejaron huecos temporales gracias al solape (cobertura temporal, no texto).
- La coalescente los elimina, pero es más lenta y no gana precisión: empeora en catalán y en la secuencia mixta. Una
  hipótesis no probada es que ventanas largas mezclan pausas y frases en otro idioma.
- Más decodificaciones implica más trabajo total.
- **No cumple el criterio de promoción.**

### 5.4 Pixel: sostenido (protocolo)

`results/pixel/sustained-base-t1-t4/`: base, `ref-6-3`, **dos bloques de 5 min por configuración** en orden ABBA (1, 4,
4, 1 hilos), separados por 2 min de enfriamiento; no son 10 min ininterrumpidos por variante. Pantalla encendida, USB
conectado, serie cada 10 s (`timeseries.csv`).

| Bloque | Hilos | Ventanas | Descartes | p50 ms | p95 ms | máx ms | Lat. media/máx ms | Entregas | Rechazo idioma | Térmico | Batería °C | PSS MB | Drenaje OFF |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | ---: |
| 0 | 1 | 101 | 0 | 1.002 | 1.726 | 2.167 | 1.105/2.178 | 83 | 12 | 1 constante | 38,4→37,2 | 463 | 106 ms |
| 1 | 4 | 101 | 0 | 533 | **831** | 937 | 590/950 | 83 | 12 | 1 constante | 37,2→37,2 | 469 | 117 ms |
| 2 | 4 | 101 | 0 | 537 | **828** | 900 | 593/913 | 83 | 12 | 1 constante | 37,2→37,0 | 465 | 134 ms |
| 3 | 1 | 101 | 0 | 893 | 1.388 | 1.475 | 973/1.493 | 83 | 12 | 1 constante | 37,0→36,6 | 465 | 135 ms |

- Base con 4 hilos reduce el p95 un **51,85 % y 40,35 %** (pares emparejados 1.726→831 y 1.388→828 ms) y la latencia
  de entrega a la mitad, con hipótesis completas idénticas en los cuatro bloques (no solo el mismo número de entregas) y
  sin descartes con ninguno de los dos valores. Acredita la mejora de latencia en esas condiciones, no autonomía ni
  estabilidad de una hora. `timingsComplete=true` en los cuatro bloques (101 ventanas, menos de 256).
- No se observó estrangulamiento: margen térmico 0,77–0,81, estado 1 y batería estable, aunque el teléfono ya venía
  templado de las pruebas anteriores.
- **Consumo no medido:** USB conectado y la corriente instantánea oscila entre −36 y +703 mA de media por bloque según
  la carga. No se atribuye energía por inferencia ni autonomía.
- El WER del modo sostenido **no es válido**: el bucle corta secuencias y la referencia unida no corresponde. El
  código del banco lo deja nulo; el JSON histórico conserva el valor calculado entonces como evidencia, y
  `summarize_pixel.py` lo muestra como «n/v» (con nota) en `SUMMARY.md`. No usarlo para comparar precisión.
- **small no se midió en sostenido:** pendiente. Con su p95 de ≈5 s no habría cambio de configuración que promover.

### 5.5 whisper.cpp (prototipo aislado, fase 3)

v1.9.4 `927cfce`, NDK r27c, Vulkan-Headers v1.4.321, SPIRV-Headers vulkan-sdk-1.4.321.0. Ejecutables estáticos arm64
(LOAD 0x4000) por adb en `/data/local/tmp/fc-wcpp`, ya borrado. Modelo `ggml-small-q8_0.bin` (HF ggerganov/whisper.cpp
`5359861c`, SHA-256 `49c8fb02…`). **q8_0 de GGML frente a ONNX int8 dinámico: la comparación no aísla el runtime.**
`analyze.py` invalida cualquier ejecución pedida como Vulkan sin `using Vulkan… backend` en su propio log.

| Variante (Pixel, 4 hilos, idioma automático, ventanas de 6 s) | Backend efectivo | Encoder p50 | Procesado p50 / p95 | WER es | WER ca |
| --- | --- | ---: | ---: | ---: | ---: |
| CPU, 45 ventanas | cpu | 7.608 ms | 11.592 / 33.230 ms | 0,124 | 0,206 |
| Vulkan, sonda de 1 ventana × 2 (+1 prueba previa) | **Vulkan0: PowerVR D-Series DXT-48-1536 MC1** (`int dot: 0`, `matrix cores: none`) | 58.502 ms (≈30 s por pasada) | 72.143 ms | – | 1/19 |
| sherpa small 4 hilos (5.2, mismo corpus) | cpu | – | 2.896 / 5.194 ms | 0,158 | 0,394 |

- **Vulkan:** el backend arranca en el Pixel (verificado en su log), pero solo se midió una sonda pequeña (una ventana,
  dos ejecuciones) con un procesado de 72,1 s. No es la misma comparación que la fila CPU (mediana de 45 ventanas) y no
  se extrapola ningún factor al corpus. Su lentitud absoluta justifica no priorizar esta configuración.
- **whisper.cpp en CPU:** no es viable en tiempo real (fijo de 30 s, doble pasada de encoder para detectar idioma,
  beam search). Tuvo menos errores en catalán, pero **no es una comparación aislada del runtime**: cuantización,
  búsqueda y contexto difieren, y `analyze.py` reaplica el filtro de idioma pero no los de estructura/alucinación.
  Merece aislar por qué antes de cualquier conclusión.
- **Pendiente:** las variantes greedy con `-ac` reducido no se midieron.

## 6. TPU con Tensor SDK / LiteRT (fase 4): viabilidad

Fuentes oficiales releídas el 09-10-2026: [Tensor SDK](https://developers.google.com/edge/litert/next/tensor-sdk)
(act. 2026-09-08), [LiteRT NPU](https://developers.google.com/edge/litert/next/npu) (2026-08-26),
[Model Garden](https://developers.google.com/edge/tensor-sdk/model-garden) (2026-09-02),
[blog beta](https://developers.googleblog.com/google-tensor-sdk-beta-with-litert/) (19-05-2026) y
[NNAPI](https://developer.android.com/ndk/guides/neuralnetworks) (2026-10-01).

- **Estado:** beta con alta («Sign up for access»). Soporta Tensor G5/G6; el Pixel 10 Pro Fold está en la lista del
  blog. Términos de licencia/distribución en `ai.google.dev/edge/litert/next/tensor_ml_terms`. **No se ha solicitado
  acceso ni aceptado términos.**
- **Entorno exigido:** Linux x86_64 con Ubuntu 22.04, Bazel 7.4.1, ≥16 GB de RAM (64 recomendados), SDK 34 y NDK 28.
  Aquí hay Windows con WSL2 Ubuntu 24.04: no coincide exactamente; habría que preparar Ubuntu 22.04.
- **Flujo:** compilación AOT a partir de `.tflite` o PyTorch (LiteRT Torch); **la JIT en el dispositivo aún no está
  soportada en Tensor**.
  - Despliegue oficial: Play AI Pack para el modelo y Play Feature Delivery para el runtime. No se documenta la
    instalación por adb de la biblioteca de dispatch de Tensor fuera de Play: sin verificar.
- **Catálogo:** Model Garden lista en voz deepspeech, emformer RNN-T y wav2vec2. **Whisper no aparece**; no puede
  presentarse como validado.
- **Compatibilidad del modelo actual:** nuestro Whisper es ONNX int8 de sherpa: encoder y decoder separados, decoder
  autorregresivo con caché KV y longitud de entrada dinámica (6 s + padding). Habría que:
  - convertir a TFLite/LiteRT, idealmente desde los pesos PyTorch y no desde el ONNX int8;
  - fijar formas (p. ej. encoder de 3.000 frames, que cuesta como 30 s);
  - recuantizar para la TPU, sin saber qué operadores ni qué cuantización acepta: la documentación pública no publica
    la lista de operadores de Tensor.
- **Fallback silencioso:** LiteRT ofrece delegación parcial y caída automática a CPU/GPU. Para no etiquetar CPU como
  TPU haría falta perfilado del runtime.
- **Ahorro posible estimado, no medido:** con sherpa, el encoder es una parte del tiempo y el decoder autorregresivo
  otra. Medir el reparto exigiría instrumentar ORT o comparar contra el benchmark de encoder de whisper.cpp. En
  whisper.cpp CPU, el encoder es ≈65 % del total, pero sobre 30 s fijos. Aunque la TPU redujera el encoder a casi 0,
  el decoder y la detección de idioma seguirían en CPU. **No hay base para extrapolar un factor.**
- **NNAPI y QNN:** NNAPI obsoleto desde Android 15 y protegido por el nivel de compilación de la `.so`. QNN es de
  Qualcomm y no aplica a Tensor. Ambos se rechazan en `validated()`.
- **Bloqueo exacto:** acceso beta y herramientas, no disponibles.
- **Siguiente paso:** con autorización del usuario, que él solicite el acceso al Tensor SDK. Después, en Ubuntu 22.04,
  convertir solo el encoder de whisper-small a TFLite con forma fija y compilarlo AOT para Tensor_G5. Comparar sus
  salidas con el encoder ONNX de CPU (error relativo de los embeddings) antes de medir rendimiento, y verificar la
  ejecución en TPU por perfilado, no por ausencia de errores.

## 7. Estado por vía

| Vía | Implementado | Compilado | Medido en Pixel | Pendiente |
| --- | --- | --- | --- | --- |
| CPU: hilos 1/2/4/6 | Sí (`startConfigured`, banco) | Sí | Sí (2 pasadas corpus) | Más pasadas con orden alternado y teléfono frío |
| CPU: XNNPACK / padding / acondicionamiento | Sí | Sí | Sí (corpus small t4) | Verificar asignación de nodos XNNPACK, si interesara |
| Segmentación `ref-6-3` / `coalesce-6-3-max12` | Sí + 9 pruebas | Sí | Sí (ritmo real ABBA) | Sostenido de la coalescente; dedup y mezcla de idiomas en ventanas largas |
| Sostenido por bloques | Sí (modo `sustained`) | Sí | Sí: base 1 frente a 4 hilos, dos bloques de 5 min cada uno, ABBA | small sostenido |
| whisper.cpp CPU | Prototipo aislado | Sí (Android + x86) | Sí (45 ventanas) | Greedy / `-ac` / medium; origen de la mejora en catalán |
| whisper.cpp Vulkan | Prototipo aislado | Sí | Sí (sonda; backend verificado) | Nada útil con este driver |
| TPU Tensor SDK | No (bloqueado) | No | No | Acceso beta, entorno Ubuntu 22.04, conversión del encoder |
| APK de producción candidata | Sí | Sí, sin firmar (sin S2.6.11) | Nunca instalada; sustituida por S2.6.12 integrada | Ver «Actualización» |

## 8. Recomendación

**Incorporar ahora** (tras revisión):

- Los cambios de instrumentación y configuración del núcleo: defaults intactos, cobertura, latencia y anillo de tiempos.
  Las métricas tras OFF de la app ganarían cobertura y latencia sin coste apreciable.
- El banco y el corpus, como herramienta.

**Promovido tras la revisión de Codex:** base con 4 hilos en lugar de 1. El p95 mejora un 37 % y un 16 % en las dos
pasadas de corpus con el mismo texto, y en ritmo real (5.4) un 51,85 % y un 40,35 % en dos bloques de 5 min por
configuración, con hipótesis idénticas. Solo afecta a quien elija base; el usuario usa small, que sigue en 4 hilos, y
este cambio no resuelve por sí solo su reconocimiento lejano. `defaultFor("whisper-base-es") = 4 hilos`.

**Mantener experimental:**

- `coalesce-6-3-max12`: no conectada a la UI; elimina descartes, pero no mejora la precisión y añade latencia.
- `startConfigured` con xnnpack o padding reducido.

**Descartar:**

- 6 hilos.
- XNNPACK para estos ONNX int8.
- Padding reducido.
- whisper.cpp con Vulkan en este Pixel.
- Forzar español para catalán.
- NNAPI/QNN.
- TPU mientras no haya acceso y Whisper validado.

**Qué falta para decidir el problema real (voz a 2 m):**

1. Un ensayo físico coordinado que guarde solo métricas, con dos personas, a 1 y 2 m, por turnos. Ahora sí existen
   `coveredAudioMs`, `rejectedLanguage`, la latencia y las ventanas descartadas para separar señal, reconocimiento,
   filtro y entrega.
2. Con el banco, probar cambios de **reconocimiento**, no de cómputo:
   - restringir la detección de idioma a {es, ca} (requiere decodificar la probabilidad de idioma o dos pasadas
     forzadas: diseño pendiente);
   - ventanas más largas solo cuando el decoder está libre;
   - entender la ventaja de whisper.cpp en catalán (beam search, detección o pesos).
3. Repetir la prueba de nivel con grabaciones reales consentidas a 2 m, que el corpus sintético no sustituye.

**Revertir cada pieza:**

- `git revert` del commit correspondiente.
- La política coalescente y `startConfigured` no requieren reversión para quedar inactivos.
- Auxiliar: `adb uninstall com.faceclaw.whisperbench`.
- whisper.cpp: `adb shell rm -rf /data/local/tmp/fc-wcpp`, ya hecho.

## 9. Para Codex

- **Checkout:** `E:\projects\faceclaw-es-whisper-bench`. **Rama:** `claude/whisper-perf-bench-2026-10-09` (local, sin push).
  **Base:** `6395abd`.
- **Revisar el delta:** `git -C E:\projects\faceclaw-es-whisper-bench diff 6395abd..claude/whisper-perf-bench-2026-10-09`.
  - Producción: solo `native/kotlin/shared/.../audio/{LocalTranscriptSession,LocalWhisperRunConfig}.kt` y
    `App_Resources/.../{FaceclawLocalTranscriber,LocalWhisperModels,AndroidSpeechEngines}.kt`.
  - Pruebas: `tests/kotlin/.../LocalWhisperPerformanceTest.kt`.
  - Herramientas, resultados e informe: `evaluations/whisper-tensor/**` y este archivo.
  - Sin cambios TS, sin memoria diaria, puente Hermes ni Gradle de la app.
- **Repetir pruebas:** `./wear/gradlew -p tests/kotlin testAndroidHostTest --tests 'com.faceclaw.app.LocalTranscript*' --tests
  'com.faceclaw.app.LocalWhisperPerformanceTest'` (43 + 8 del acondicionador).
- **Comprobar en la suite completa:** `PreviewAnimationListenerTest` falla con la suite completa y pasa aislada. Conviene
  confirmar que también falla en `6395abd`; la prueba no toca código cambiado.
- **Artefactos, ninguno instalado ni versionado:**
  - APK de producción candidata **sin firmar**: `dist/whisper-candidate/faceclaw-whisper-candidate-unsigned.apk`,
    SHA-256 `860ad86b57132d260aa113ef9b6dd668c8f237ab321db133095926639c66752c`, 805, `…s2.6.10-model-selector`.
    No contiene la memoria diaria/S2.6.11 del otro checkout.
  - Auxiliar con firma debug (identificador `com.faceclaw.whisperbench`):
    `evaluations/whisper-tensor/bench-android/app/build/outputs/apk/release/app-release.apk`. La APK con la que se
    midió era `be06865a…` (commit `3f2e534`); la actual es `4268203e…`, igual salvo el WER del modo sostenido.
  - whisper.cpp en WSL `~/faceclaw-whispercpp/out/` (hashes en `binaries.txt` y en 5.5).
- **Estado del Pixel al terminar:**
  - Auxiliar desinstalado; su carpeta y `/data/local/tmp/fc-wcpp` borradas.
  - Faceclaw sin tocar: `0.8.2-es.5-conversation.s2.6.11-daily-context`/805, `lastUpdateTime 13:05`, anterior a la primera
    instalación del auxiliar a las 13:49.
  - OFF verificado antes por ausencia de wakelock `Faceclaw:ConversationG0` activo y sin grabación; ningún wakelock
    Faceclaw activo al final.
  - **Corrección a la nota de partida:** el Pixel ya no está en S2.6.10, sino en S2.6.11, instalada por el otro hilo.
- **Resultados:** `evaluations/whisper-tensor/results/`, con `pixel/SUMMARY.md` (tablas generadas por
  `summarize_pixel.py`), `pixel/*/run.json` y los CSV, `pc-reference/`, `whispercpp-pixel/`.
- **Decisiones para Codex:**
  1. Integrar el núcleo y la instrumentación.
  2. Promover base a 4 hilos (una línea).
  3. Dejar `coalesce` y `startConfigured` sin conectar.
  4. Priorizar el reconocimiento (idioma, ventana, búsqueda) para la voz a 2 m.
  5. Retirar con `git worktree remove` cuando ya no se necesite.
