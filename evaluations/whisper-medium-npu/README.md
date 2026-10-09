# Investigación separada: Whisper medium / LiteRT / Pixel

## Resultado (09-10-2026)

**No hay aceleración NPU ni GPU demostrada para Whisper medium en el Pixel 10 Pro Fold (Tensor G5).** La
candidata pública TFLite medium funciona completa en CPU, en el PC y en el Pixel, pero tanto el delegado NNAPI
(`google-edgetpu`) como el delegado GPU rechazan el grafo. Nada de esto cambia producción: Faceclaw sigue usando
ONNX/sherpa-onnx en CPU.

| Prueba (mismo modelo, misma entrada log-Mel de `es-fleurs-00`, 5,52 s de voz) | Resultado |
| --- | --- |
| Pixel, CPU XNNPACK, 4 hilos | Init 2,48 s; 1.ª inferencia 4,24 s; caliente **4,06 s** (3 ejecuciones, σ 6 ms); texto correcto |
| Pixel, CPU XNNPACK, 1 hilo | Init 2,43 s; caliente **8,28 s**; mismos tokens |
| Pixel, NNAPI `google-edgetpu`, fp32 y fp16 | **Falla al aplicar el delegado**: «only supports static-sized tensors… tensor#3814 is a dynamic-sized tensor» |
| Pixel, NNAPI `google-edgetpu` con `nnapi_allow_dynamic_dimensions` | El driver solo aceptaría **3 de 2814 nodos** (grafo principal) y 1 de 2715 (grafo `.en`); después `ANEURALNETWORKS_BAD_DATA` y se restaura el plan original |
| Pixel, GPU delegate | **Falla al aplicar el delegado** por el mismo tensor dinámico |
| PC (WSL2 x86, 4 hilos, LiteRT 2.3.0), 16 frases públicas | WER/CER es `0.045 / 0.021`, ca `0.041 / 0.015`; caliente p50 1,96 s, máx. 2,39 s (referencia funcional, no dato del Pixel) |

Perfil por operador en el Pixel (CPU, 4 hilos, 4,08 s): el bucle del decoder autoregresivo (`WHILE`, 18 tokens
con los especiales) cuesta 1,05 s (25,8 %, ≈ 70 ms/token); el resto, ≈ 3,0 s, es sobre todo el encoder, que
procesa siempre 30 s de log-Mel aunque la frase dure 5,5 s. El log-Mel se calculó en el PC y no está medido
en el Pixel.

Comparación con ONNX/sherpa (banco de Luna, misma frase `es-fleurs-00`, CPU 4 hilos): 4,35–4,52 s frente a
4,06 s en TFLite, unos 7–10 % menos, lejos del 20 % exigido para promocionar. **No es una comparación limpia**:
pesos convertidos por distinta vía (TFLite híbrido int8 frente a ONNX int8 de sherpa), búsqueda greedy dentro del
grafo frente al decoder de sherpa, filtros/condicionamiento de producción ausentes en TFLite y medición de una
sola frase. La memoria también difiere: `benchmark_model` informa de unos 3,9 GB de huella (las tablas int8 se
expanden para XNNPACK) frente a unos 1,1 GB de PSS con ONNX.

## Qué es el artefacto (inspección local)

- Descarga de la revisión inmutable `08cc7cda80c788c4ae30e0d0999c3a36444b3101`; SHA-256 calculado
  `a5e9dc7c7a461c72e358615cc72e471ef9cc1175f84b90fe04657aad4bb9bfb9` (773.800.608 bytes), igual al LFS publicado.
  Vocabulario `filters_vocab_multilingual.bin` SHA-256
  `dd148e98af17d3777c5aa25de30f4202e935bc5351ca7bccf5a3117e05466605`, igual al publicado. Licencia declarada
  Apache-2.0; el README del repositorio tiene 31 bytes y no documenta la conversión (linaje no verificable).
- FlatBuffer v3 «MLIR Converted», 30 subgrafos. Firmas `serving_default` (multilingüe) y `serving_en_`: entrada
  `input_features` float32 `[1, 80, 3000]` (log-Mel de 30 s), salida `sequences` int32 `[1, 449]`.
- Encoder + decoder completos en un solo grafo, con búsqueda greedy dentro de un bucle `WHILE` (caché KV
  `[1, 16, 447, 64]`). Detección de idioma dentro del grafo: la salida de `es-fleurs-00` empieza por
  `50258 50262 50359 50364` (`<|startoftranscript|><|es|><|transcribe|>` y marca de tiempo 0,00), y la
  firma no tiene entrada para forzar idioma ni tarea sin reconvertir.
- Cuantización híbrida: 1157 tensores constantes int8 (pesos) con activaciones float32.
- Vocabulario en formato `tflt` de whisper.tflite: 80×201 filtros Mel + 50.257 tokens UTF-8; frontend
  Whisper estándar (Hann 400/160, log10, clamp −8, `(x+4)/4`).
- Detalle en [`tflite-cik009/results/model-inspect.json`](tflite-cik009/results/model-inspect.json).

## Por qué falla la delegación

El grafo contiene tensores de tamaño dinámico (el bucle autoregresivo y su caché), y TFLite no aplica un delegado
que solo admite formas estáticas. Aun permitiendo dimensiones dinámicas, el driver NNAPI del Tensor G5 solo
reclama 3 nodos y falla en la configuración de operandos. Las operaciones dominantes (FULLY_CONNECTED híbrido
int8/float, BATCH_MATMUL float, GELU) tampoco son las que un acelerador cuantizado suele aceptar.

Nota: el driver evaluó los 2814 nodos del grafo principal, que incluye el encoder entero, y solo reclamó 3; por
tanto, con este artefacto (pesos int8 híbridos, activaciones float) tampoco el encoder estático se delega. El
encoder no es puramente convolucional (2 convoluciones + bloques transformer con LayerNorm, GELU y
BATCH_MATMUL). La separación encoder/decoder ya existe en producción (sherpa-onnx carga `encoder.onnx` y
`decoder.onnx`); lo que falta es un runtime que ejecute el encoder en la NPU.

Una vía NPU realista necesitaría **otro artefacto**: encoder y paso del decoder exportados por separado, con
formas estáticas y cuantización completa (o fp16) y, para la NPU de Tensor, probablemente la ruta Google Tensor
SDK/AOT, que requiere acceso que no se ha solicitado. La ruta `CompiledModel` NPU de LiteRT 2.x en el laboratorio
`E:\projects\faceclaw-es-medium-npu-lab` **no se ejecutó**; con este artefacto no hay razón para esperar otro
resultado. No se ha probado ningún modelo tiny/small/encoder-only como sustituto.

## Sonda: un bloque de encoder estático (09-10-2026, 20:51–20:57)

Para comprobar la propuesta «encoder en NPU, decoder en CPU» sin convertir el modelo entero, se generó un bloque
transformer con la forma de Whisper medium (d 1024, 16 cabezas, FFN 4096, 1500 posiciones, LayerNorm, GELU) y
el stem convolucional (2×Conv1D + GELU, entrada `[1, 3000, 80]`), con **pesos aleatorios y formas estáticas**, en
float32, fp16 e int8 completo ([`make_encoder_block.py`](encoder-block-probe/make_encoder_block.py), TF 2.21).
Mismo `benchmark_model`, 10 ejecuciones + 2 de calentamiento, entradas aleatorias. Mide solo aceptación y
velocidad de ese conjunto de operadores; no es Whisper ni tiene significado de precisión.

| Modelo | CPU XNNPACK 4 hilos | GPU delegate | NNAPI `google-edgetpu` |
| --- | ---: | ---: | --- |
| Bloque fp32 | 275 ms | 208 ms (41/41 nodos) | **0 nodos** («the model graph will not be executed by the delegate»); 2,63 s en el intérprete de referencia |
| Bloque fp16 | 284 ms | 192 ms (50/50) | **0 nodos**; 2,66 s |
| Bloque int8 completo | 398 ms (35/45 en XNNPACK) | 265 ms (45/45) | **Falla**: `ANEURALNETWORKS_BAD_DATA` al añadir una operación |
| Stem fp32 | 63 ms | 58 ms | 0 nodos; 143 ms |
| Stem fp16 | 63 ms | 65 ms | 0 nodos; 244 ms |
| Stem int8 completo | 15 ms (6/8) | 123 ms | Reclama 2/8 nodos y falla la compilación (`MISSED_DEADLINE_TRANSIENT`) |

Conclusiones:

- **La NPU (EdgeTPU vía NNAPI) no acepta un bloque de encoder Whisper ni siquiera con formas estáticas**, ni en
  float ni en int8 completo. La separación encoder/decoder no basta para usar la NPU por NNAPI en este Pixel. Queda
  solo la ruta Google Tensor SDK/AOT, que requiere un acceso que no se ha solicitado.
- **La GPU sí acepta el bloque estático entero** y es ~25–30 % más rápida que la CPU con el mismo bloque en float.
  Pero 24 bloques × ~0,19–0,21 s ≈ 4,6–5 s de encoder en GPU, **más lento** que el encoder real híbrido int8 en
  CPU medido arriba (≈ 3,0 s dentro de los 4,06 s). Es una extrapolación con pesos sintéticos, no una medición del
  encoder real; indica que la GPU no promete la mejora del 20 %.
- Registros completos en [`encoder-block-probe/results-pixel-20261009/`](encoder-block-probe/results-pixel-20261009/).

## Lectura útil para Faceclaw

El coste del encoder sobre 30 s fijos domina tanto en TFLite como en ONNX. Para ventanas de 6 s, un encoder que
procese solo el audio real (p. ej. contexto de audio reducido, como `audio_ctx` de whisper.cpp) podría reducir
ese coste, pero eso **no está medido** aquí y puede degradar la precisión. Es la siguiente hipótesis, no un
resultado.

## Reproducción

```bash
# PC: inspección y referencia (venv con `tflite numpy` / `ai-edge-litert numpy`)
python -I tflite-cik009/scripts/inspect_tflite.py whisper-medium.tflite > model-inspect.json
python -I tflite-cik009/scripts/run_tflite_reference.py --model whisper-medium.tflite \
  --vocab filters_vocab_multilingual.bin --corpus <corpus público>/out --out result.json --threads 4
# Pixel: benchmark_model oficial (TF nightly android_aarch64, SHA-256
# 5d45116eb86e3a23ea03318e93bfc8efb4dd0149d4692c127e7b0343faba1374, MD5 verificado contra el bucket)
adb push whisper-medium.tflite android_aarch64_benchmark_model es-fleurs-00.mel.f32 \
  tflite-cik009/scripts/run_benchmark_model.sh /data/local/tmp/fc-tflite-medium/
adb shell sh /data/local/tmp/fc-tflite-medium/run_benchmark_model.sh
python -I tflite-cik009/scripts/decode_tokens.py --vocab filters_vocab_multilingual.bin out/*.tokens.bin
adb shell rm -rf /data/local/tmp/fc-tflite-medium
```

El log-Mel de entrada se genera con `log_mel()` de `run_tflite_reference.py` a partir del fixture público
`es-fleurs-00` (SHA-256 del `.f32`: `f0efa714b7b56835222e13cad8299860b3634feb9248d9fd3792fb7b6fb09fc7`). Los
registros completos están en [`tflite-cik009/results/`](tflite-cik009/results/) (salida de `benchmark_model` como `*.log.txt`). Modelo, log-Mel y binarios no
se publican. En el Pixel no se instaló ninguna app para esta prueba, y los archivos temporales se borraron.

## Contexto que sigue vigente

- La documentación de Google separa LiteRT público (`CompiledModel`, CPU/GPU/NPU) de la ruta Tensor SDK Beta/AOT,
  que requiere alta; no se ha solicitado ni aceptado nada en nombre del usuario.
- NNAPI está deprecado desde Android 15, pero en este Pixel está presente: `benchmark_model` lista
  `google-edgetpu` y `nnapi-reference`. Lo comprobado es que este grafo no se delega, no que NNAPI falte.
- La cifra `16,74×` de la issue de `whisper.tflite` divide puntuaciones Geekbench de un S23 Ultra (QNN/GPU);
  no es un benchmark de Whisper, de Pixel, de tiempo total ni de energía.
- [`moonshine-ai/openai-whisper`](https://github.com/moonshine-ai/openai-whisper) (archivado) nombra medium y el
  vocabulario multilingüe; [`nyadla-sys/whisper.tflite`](https://github.com/nyadla-sys/whisper.tflite) documenta
  tiny/small; [`vilassn/whisper_android`](https://github.com/vilassn/whisper_android) es wiring Android MIT.
  Ninguno atestigua independientemente esta conversión medium.

## Fuentes consultadas

- [LiteRT Android y `CompiledModel`](https://developers.google.com/edge/litert/android)
- [LiteRT NPU / `CompiledModel`](https://developers.google.com/edge/litert/next/npu)
- [Tensor SDK (ruta específica Beta/AOT)](https://developers.google.com/edge/litert/next/tensor-sdk)
- [Migración Android NNAPI](https://developer.android.com/ndk/guides/neuralnetworks/migration-guide)
- [Candidata medium (revisión fijada)](https://huggingface.co/cik009/whisper/tree/08cc7cda80c788c4ae30e0d0999c3a36444b3101)
- [Herramienta oficial `benchmark_model`](https://www.tensorflow.org/lite/performance/measurement)
- [Issue NPU de referencia, no benchmark Whisper](https://github.com/nyadla-sys/whisper.tflite/issues/47)
