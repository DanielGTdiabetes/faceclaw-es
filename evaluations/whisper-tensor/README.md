# Whisper local en Pixel: banco reproducible

Herramientas del informe [`notes/informe-claude-whisper-tensor-2026-10-09.md`](../../notes/informe-claude-whisper-tensor-2026-10-09.md).
Nada de esta carpeta se compila dentro de Faceclaw. El auxiliar Android tiene otro identificador
(`com.faceclaw.whisperbench`), firma de desarrollo (clave debug local), sin permisos de micrófono ni red, y
lee únicamente modelos/corpus copiados por adb a su propia carpeta externa.

| Carpeta | Qué es |
| --- | --- |
| `corpus/` | `build_corpus.py` reconstruye el corpus (FLEURS CC-BY-4.0 + señales sintéticas). `manifest.json` versionado con hashes; el audio no se versiona. |
| `pc-reference/` | Inferencia de referencia en PC con sherpa-onnx 1.13.0 y los mismos ONNX int8. Solo precisión/sanidad; sus tiempos son de x86. |
| `bench-android/` | Auxiliar Android: decoder real de producción (mismas clases Kotlin, mismas `.so` verificadas por hash). |
| `whispercpp/` | Prototipo aislado whisper.cpp v1.9.4 CPU/Vulkan (ejecutables por adb), análisis con detección del backend efectivo. |
| `metric_vectors.json` | Vectores compartidos que fijan WER/CER/percentiles en Python y Kotlin. |
| `results/` | Resultados JSON/CSV (sin audio ni conversaciones privadas). |

## 1. Corpus

```bash
python -I evaluations/whisper-tensor/corpus/build_corpus.py --out evaluations/whisper-tensor/corpus/out
```

24 fixtures, 457,6 s: 8 frases FLEURS es_419 y 8 ca_es (dev), silencio digital, ruido blanco −60 dBFS, rosa −45 dBFS,
zumbido 50 Hz −40 dBFS y cuatro secuencias para tiempo real (es, ca, es/ca alternado y **prueba de nivel** con la
segunda frase atenuada 30 dB). La secuencia empieza en 4,5 s para cruzar los límites de 3/6 s. Dos construcciones
dan los mismos SHA-256 que `manifest.json`. FLEURS no tiene es-ES ni valenciano: el corpus es español latinoamericano
y catalán central leído; la atenuación no equivale a una persona a dos metros.

## 2. Referencia PC (opcional)

```bash
python -m venv .venv && .venv/Scripts/pip install sherpa-onnx==1.13.0 numpy
python -I evaluations/whisper-tensor/pc-reference/pc_reference.py --corpus evaluations/whisper-tensor/corpus/out \
  --models <dir con sherpa-onnx-whisper-{base,small}-es-int8> --model base,small --threads 4 --tail 0,300,500 \
  --conditioning on,off --segment-ms 6000 --out evaluations/whisper-tensor/results/pc-reference/grid-6s-auto
```

Los modelos se descargan de las URLs fijadas en `app/native/asr-model.ts`; el script rechaza cualquier hash distinto.

## 3. Auxiliar Android

Compilar (Windows o Linux, `ANDROID_HOME` y `JAVA_HOME` 17+):

```bash
./wear/gradlew -p evaluations/whisper-tensor/bench-android :app:testReleaseUnitTest :app:assembleRelease
```

La tarea `prepareSherpaJni` descarga `sherpa-onnx-v1.13.0-android.tar.bz2` (o usa `-PsherpaJniDir=`) y **falla** si las
dos `.so` no tienen el SHA-256 de las que lleva Faceclaw. APK en `app/build/outputs/apk/release/app-release.apk`
(release sin R8, `.so` sin comprimir, alineación 16 KB comprobable con `zipalign -c -P 16 -v 4`).

Solo con el teléfono libre y Faceclaw en OFF (sin wakelock `Faceclaw:ConversationG0` activo):

```bash
adb install evaluations/whisper-tensor/bench-android/app/build/outputs/apk/release/app-release.apk
B=/sdcard/Android/data/com.faceclaw.whisperbench/files
adb shell am start -S -n com.faceclaw.whisperbench/.BenchActivity --es mode info --es runId info   # crea la carpeta
adb push <modelos>/sherpa-onnx-whisper-small-es-int8 $B/models/
adb push evaluations/whisper-tensor/corpus/out/<cada archivo> $B/corpus/
```

(En Git Bash para Windows exportar `MSYS_NO_PATHCONV=1`.) Cada ejecución:
`adb shell am start -S -n com.faceclaw.whisperbench/.BenchActivity --es mode <modo> --es runId <id> ...`;
progreso en `adb logcat -s FaceclawWhisperBench` y en `$B/results/<id>/status.txt` (`running`/`done`/`error`).

| Modo | Mide | Parámetros principales |
| --- | --- | --- |
| `corpus` | Llamadas directas al decoder: verificación SHA, carga, calentamiento y p50/p95/RTF estables; WER/CER y palabras insertadas en silencio/ruido tras el filtro de producción | `models`, `threads`, `providers`, `tails`, `conditioning`, `segmentMs` (6000), `repeat`, `warmup`, `kinds` |
| `realtime` | `FaceclawLocalTranscriber` de producción alimentado a 50 ms por fragmento y ritmo real: descartes, cobertura total y de voz, latencia ventana→entrega, rechazos por causa, WER entregado, drenaje al OFF | `policies` (`ref-6-3`, `coalesce-6-3-max12`), `rounds` (orden ABBA) |
| `sustained` | Igual que realtime en bucle durante `minutes` por bloque, serie térmica/batería cada 10 s y PSS | `minutes` (≤19), `rounds` |

Comandos usados en el informe:

```bash
# Hilos (corpus)
--es mode corpus --es models whisper-base-es,whisper-small-es --es threads 1,2,4,6 --es repeat 3 --es warmup 2 --es cooldownSec 20 --es keepScreenOn true
# Mandos sin efecto de CPU sobre precisión (corpus)
--es mode corpus --es models whisper-small-es --es threads 4 --es tails 0,300 --es conditioning on,off --es providers cpu,xnnpack
# Segmentación a ritmo real
--es mode realtime --es models whisper-small-es --es threads 4 --es policies ref-6-3,coalesce-6-3-max12 --es rounds 2
# Sostenido, dos finalistas (base 1 vs 4 hilos), ABBA, 10 min cada uno
--es mode sustained --es models whisper-base-es --es threads 1,4 --es minutes 5 --es rounds 2 --es cooldownSec 120
```

Recuperar y retirar:

```bash
adb pull $B/results evaluations/whisper-tensor/results/pixel/
adb uninstall com.faceclaw.whisperbench     # borra también $B
```

`recordText` (true por defecto) guarda hipótesis solo porque el corpus es público/sintético; con cualquier otro audio usar
`--es recordText false`.

## 4. whisper.cpp (prototipo aislado)

```bash
WORK=~/faceclaw-whispercpp ./evaluations/whisper-tensor/whispercpp/build_android.sh   # Linux/WSL2
python -I evaluations/whisper-tensor/whispercpp/prepare_corpus_wav.py --corpus evaluations/whisper-tensor/corpus/out --out wavs
adb push out/android-cpu out/android-vulkan wavs ggml-small-q8_0.bin evaluations/whisper-tensor/whispercpp/run_whispercpp.sh /data/local/tmp/fc-wcpp/
adb shell sh /data/local/tmp/fc-wcpp/run_whispercpp.sh <cli> <modelo> <wavs> <salida> 4 auto 1 vulkan seg6
python -I evaluations/whisper-tensor/whispercpp/analyze.py --run <salida> --index wavs/index.json --label ... --out ...
adb shell rm -rf /data/local/tmp/fc-wcpp
```

`analyze.py` marca `valid=false` si una ejecución pedida como Vulkan no muestra en su propio registro `using Vulkan… backend`;
una caída a CPU nunca se etiqueta GPU. GGML q8_0 y ONNX int8 dinámico son cuantizaciones distintas: la comparación
no aísla el runtime.

## Desactivar o revertir

- Producción no cambia de comportamiento: `start()` sigue con base 1 hilo, small/medium 4, CPU, padding por defecto y
  `ref-6-3`. `startConfigured()` no está conectado a la UI.
- Revertir la candidata: `git revert` de los commits de la rama `claude/whisper-perf-bench-2026-10-09`.
- Retirar el auxiliar: `adb uninstall com.faceclaw.whisperbench`; whisper.cpp: `adb shell rm -rf /data/local/tmp/fc-wcpp`.
