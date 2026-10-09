# Piloto aislado: Whisper medium con LiteRT / NPU · 09-10-2026

## Resultado de la precomprobación

No se ejecutó inferencia, conversión ni ADB para este piloto. Se creó el auxiliar
aislado `E:\projects\faceclaw-es-medium-npu-lab`, paquete
`com.faceclaw.whispermediumlab`, sin permisos de red, micrófono, Bluetooth ni
almacenamiento y sin dependencia de Faceclaw. Queda fuera del runtime de
producción y no contiene APK, pesos, corpus, audio, vocabulario ni logs.

La prueba concreta está **bloqueada por prerrequisitos externos**, no por un
resultado negativo de Tensor G5:

- No hay un artefacto Whisper medium multilingüe `.tflite` disponible localmente
  con procedencia/licencia/hash, firma de tensores y operadores comprobados.
- El SDK Google Tensor es Beta con registro; su documentación pide una estación
  Linux x86_64/Ubuntu 22.04. No se solicitó acceso, no se aceptaron condiciones y
  no se instaló el SDK.
- Para Tensor, LiteRT documenta `CompiledModel` con compilación AOT; no admite
  compilación JIT en dispositivo. Una APK instalada por ADB no obtiene por ello
  los AI Packs/runtimes Tensor AOT que documenta el flujo de Play.

Por tanto no es lícito presentar como viable un adaptador TFLite para medium ni
atribuir al Pixel la cifra `16,74×`. Esa cifra de la issue de `whisper.tflite`
divide puntuaciones Geekbench del S23 Ultra (QNN frente a GPU); no mide Whisper,
no es un Pixel y no mide tiempo ni energía.

## Artefactos examinados

Faceclaw usa ONNX/sherpa 1.13.0, no LiteRT. El medium actual es multilingüe,
con encoder/decoder int8 ONNX y vocabulario propios, con hashes fijados en
`app/native/asr-model.ts` y `LocalWhisperModels.kt`. Sus pesos int8 no hacen que
las activaciones, el frontend ni la ruta completa sean “INT8 integral”, ni crean
un modelo `.tflite` compatible con una NPU.

Las referencias públicas localizadas son candidatas de infraestructura, no modelos
adoptados:

- `fusigi0930/android-whisper` describe un ejemplo TFLite híbrido —pesos int8 y
  activaciones float32— y exige el vocabulario/filtros multilingüe por separado.
- `vilassn/whisper_android` ofrece proyectos Android TFLite y scripts de
  conversión, por lo que necesitaría revisar artefacto, licencia, modelo y decoder
  antes de reutilizar nada.
- LiteRT exige probar ejecución y perfil; permite fallback/ejecución parcial, que
  deben reportarse por separado. NNAPI está deprecado desde Android 15, pero ello
  no equivale a ausencia; no se ha añadido `setUseNNAPI` a ONNX/sherpa, porque no
  afectaría a ese runtime.

## Siguiente prueba admisible

Con acceso ya autorizado al SDK Tensor y un modelo medium TFLite verificable, el
auxiliar debe comparar **el mismo modelo y audio** en CPU y acelerador; registrar
carga/compilación fría, preprocesado log-Mel, encoder, decoder autoregresivo y
total caliente; y conservar perfiles que identifiquen backend y subgrafos
delegados. Un piloto tiny o solo encoder se etiqueta como infraestructura, no
como soporte/velocidad/calidad de medium. Frente a ONNX se declaran las diferencias
de pesos, cuantización, frontend y búsqueda.

Solo una mejora repetible de p95 completo de al menos 20% sobre el baseline ONNX
de Luna, sin degradación material, justificaría ampliar al corpus es/ca, voz
atenuada, silencio, repeticiones y carga térmica sostenida.

## Fuentes consultadas

- Android: NNAPI está deprecado desde Android 15 y recomienda rutas actualizables.
  <https://developer.android.com/ndk/guides/neuralnetworks/migration-guide>
- Google: LiteRT NPU / `CompiledModel`, AOT, fallback y requisitos Android.
  <https://developers.google.com/edge/litert/next/npu>
- Google: Tensor G5, SDK Beta, registro y requisito Linux.
  <https://developers.google.com/edge/litert/next/tensor-sdk>
- Issue que originó la cifra de Geekbench, no una medición Whisper/Pixel.
  <https://github.com/nyadla-sys/whisper.tflite/issues/47>
- Referencias TFLite de Whisper: <https://github.com/fusigi0930/android-whisper>
  y <https://github.com/vilassn/whisper_android>.
