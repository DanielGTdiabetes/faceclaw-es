# Investigación separada: Whisper medium / LiteRT / Pixel

## Hechos comprobados y límite de la evidencia

No se ha ejecutado inferencia, perfil de backend, delegación, conversión ni ADB
para esta investigación. La app auxiliar aislada
`E:\projects\faceclaw-es-medium-npu-lab` compiló en PC con LiteRT público
2.2.0, pero no se instaló ni se ejecutó en el Pixel. Por tanto su compilación
demuestra únicamente que el auxiliar construye; no demuestra compatibilidad del
modelo, inferencia ni uso de NPU.

La documentación de Google separa dos rutas:

- LiteRT público para Android ofrece `CompiledModel`, CPU y acelerador NPU, y
  conserva `Interpreter` para compatibilidad. Eso permite preparar un ensayo
  aislado sin registrarse en Tensor SDK.
- El requisito de alta/Beta y Linux del Tensor SDK bloquea esa ruta específica
  de SDK/AOT. No demuestra que el intérprete LiteRT/NNAPI legado requiera el
  SDK, ni que el Pixel actual no pueda ejecutar un modelo compatible.

NNAPI está deprecado desde Android 15, pero no ausente por esa razón. Si se
prueba, se informa como ruta separada y se comprueba el backend efectivo; no se
deduce de que una API no lance una excepción. La cifra `16,74×` de la issue
`whisper.tflite` es una división de puntuaciones Geekbench de un S23 Ultra
(QNN/GPU), no un benchmark Whisper, Pixel, tiempo total ni energía.

## Candidata pública para la prueba aislada

Existe una candidata que evita tratar la falta de descarga local como bloqueo
externo. No está aprobada para Faceclaw ni descargada aún:

| Campo | Valor público a verificar localmente antes de usar |
| --- | --- |
| Artefacto | [`cik009/whisper`, `whisper-medium.tflite`](https://huggingface.co/cik009/whisper/blob/08cc7cda80c788c4ae30e0d0999c3a36444b3101/whisper-medium.tflite), revisión inmutable `08cc7cda80c788c4ae30e0d0999c3a36444b3101` |
| Variante / tamaño | `medium` multilingüe, no `.en`; 774 MB |
| Hash publicado | SHA-256 `a5e9dc7c7a461c72e358615cc72e471ef9cc1175f84b90fe04657aad4bb9bfb9`; Xet `b001f74e07e749e6024e5482c0c92731b4c1ddd33f571469d5258565f6a448d3` |
| Licencia declarada | Apache-2.0 en el repositorio de la candidata |
| Vocabulario asociado | [`filters_vocab_multilingual.bin`](https://huggingface.co/cik009/whisper/tree/08cc7cda80c788c4ae30e0d0999c3a36444b3101), pendiente de hash y compatibilidad local |

Los repositorios indicados aportan contexto, no una aprobación automática:

- [`moonshine-ai/openai-whisper`](https://github.com/moonshine-ai/openai-whisper)
  está archivado; su guía nombra medium y el vocabulario multilingüe, pero no
  acredita la conversión de la candidata actual. Su artefacto tiny descrito es
  híbrido (pesos int8, activaciones float32), no “int8 integral”.
- [`nyadla-sys/whisper.tflite`](https://github.com/nyadla-sys/whisper.tflite)
  documenta Android tiny/small y tiene una issue de medium aún abierta. La issue
  NPU es una hipótesis con cifras Geekbench, no evidencia de medium completo.
- [`vilassn/whisper_android`](https://github.com/vilassn/whisper_android) es
  wiring/conversión Android MIT basado en la línea anterior; los artefactos
  públicos examinados no aportan una atestación independiente de este medium.

Falta completar localmente: descarga desde esa revisión, SHA-256 calculado,
tamaño, licencia/linaje contrastados, firmas de tensores y operadores del
FlatBuffer, y contrato completo de log-Mel, tokens especiales, vocabulario y
decoder autoregresivo. Nada de ello se sustituye por un modelo tiny, `.en` o
solo encoder.

## Ensayo preparado, todavía no ejecutado

El auxiliar contiene una ruta de *compile-only* CPU y NPU con
`com.google.ai.edge.litert:litert:2.2.0`; no descarga un runtime ni llama a
`run()`. Tras verificar la candidata se le añade el frontend y decoder completos
para que el ensayo haga, sobre el mismo audio:

1. CPU y solicitud NPU por separado, guardando carga/compilación fría,
   preprocesado, encoder, decoder y total caliente.
2. Perfil/log LiteRT que identifique backend efectivo, nodos/subgrafos
   delegados y cada fallback; “NPU solicitada” o compilación exitosa no bastan.
3. Comparación explícita con ONNX/sherpa: pesos, cuantización, frontend y
   búsqueda diferentes invalidan una equivalencia automática.

Esto se ejecuta solo tras el relevo Luna `released`, ausencia de reserva ajena y
adquisición de la reserva propia conforme al protocolo existente. No se integra
el auxiliar en producción ni se promete aceleración alguna.

## Fuentes consultadas

- [LiteRT Android y `CompiledModel`](https://developers.google.com/edge/litert/android)
- [LiteRT NPU / `CompiledModel`](https://developers.google.com/edge/litert/next/npu)
- [Tensor SDK (ruta específica Beta/AOT)](https://developers.google.com/edge/litert/next/tensor-sdk)
- [Migración Android NNAPI](https://developer.android.com/ndk/guides/neuralnetworks/migration-guide)
- [Candidata medium con tamaño, licencia y SHA-256](https://huggingface.co/cik009/whisper/blob/08cc7cda80c788c4ae30e0d0999c3a36444b3101/whisper-medium.tflite)
- [Issue NPU de referencia, no benchmark Whisper](https://github.com/nyadla-sys/whisper.tflite/issues/47)
