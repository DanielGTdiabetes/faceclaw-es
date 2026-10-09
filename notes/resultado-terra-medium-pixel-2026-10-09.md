# Resultado Terra · Whisper medium / Pixel · 09-10-2026

## Estado de entrega

Tres cambios separados y locales, sin push, merge, instalación ni ADB:

| Área | Commit | Resultado |
| --- | --- | --- |
| A. Asistente «Hey Even» | `e5d361b` | Medium aparece como opción local, descarga reutilizable y modelo solicitado real. |
| B. Diagnóstico tras OFF | `2fd320a` | Conserva agregados locales y estado de drenaje, sin texto/audio ni reactivación. |
| C. LiteRT / NPU | `docs(evaluations)` | Prototipo aislado preflight y decisión documentada; no hay afirmación de aceleración. |

La rama local conserva tres commits sobre `7281663`; las cinco notas no rastreadas
preexistentes se conservaron sin añadirlas a ningún commit.

## A. Medium en el asistente

- `onboard-whisper-medium` está disponible en el selector persistido y en la
  lista de Voz, junto con `whisper-medium-es` en el gestor de descargas. No se
  selecciona automáticamente ni cambia `voice.provider` existente.
- El puente marca explícitamente `whisper-medium`, lo trata como local y no
  crea cliente cloud/Moonshine. `VoiceCaptureSession` lo convierte a
  `WHISPER_MEDIUM`.
- Android resuelve únicamente los archivos ya descargados bajo
  `faceclaw-voice-asr/sherpa-onnx-whisper-medium-es-int8`, verificando los
  SHA-256 del catálogo `LocalWhisperModels`. Ausencia o corrupción hace fallar
  el modelo seleccionado; no existe fallback silencioso.
- Medium solicita CPU con cuatro hilos; base y small del asistente conservan su
  comportamiento anterior. La decisión es el baseline ya usado por Conversación,
  no una medición nueva. El wakeword continúa siendo del firmware: esta ruta
  solo procesa la frase posterior y advierte de mayor espera.

## B. Diagnóstico local después de OFF

Al parar una sesión local, `SonioxConversationTranscription` toma la instantánea
nativa ya detenida. Solo conserva escalares: motor/modelo, contadores/análisis y
`worker`/`busy`/buffer reales mientras un decoder invalidado drena. El texto ya
fue borrado por `LocalTranscription.stop()` y no se retiene audio. La lectura con
OFF no acepta PCM, no inicia captura ni produce turnos; Soniox permanece con
contadores genéricos a cero. Todo se borra antes de una nueva sesión, incluido el
cambio local→cloud, para que no haya cifras antiguas.

## C. Piloto LiteRT / Tensor

El auxiliar `E:\projects\faceclaw-es-medium-npu-lab` se compiló como APK debug
de desarrollo, paquete `com.faceclaw.whispermediumlab`, sin permisos de red,
micrófono, Bluetooth o almacenamiento. No se instaló. No incluye LiteRT, pesos,
audio, corpus ni logs: muestra `PRECONDITION BLOCKED` hasta que haya un modelo
medium TFLite multilingüe comprobable y el runtime/licencia correspondientes.

La investigación pública queda en
`evaluations/whisper-medium-npu/README.md`. Google documenta Tensor G5 con LiteRT
`CompiledModel` y AOT, pero el Tensor SDK es Beta, requiere registro y un entorno
Linux; no se solicitó acceso, no se aceptaron condiciones y no se intentó una
conversión larga. La cifra 16,74× de la issue de `whisper.tflite` es una división
de Geekbench del S23 Ultra, no un benchmark Whisper/Pixel/energía. NNAPI está
deprecado desde Android 15 pero no por ello ausente; no se añadió a ONNX/sherpa,
un runtime distinto para el que no aplica `Interpreter.Options().setUseNNAPI`.

Estado: **no disponible para esta prueba**, no «no funciona». La siguiente prueba
admisible exige artefacto con licencia/hash/firma/operadores, perfil que muestre
backend y subgrafos delegados, y A/B del mismo TFLite medium/audio (CPU contra
acelerador) desglosando carga, log-Mel, encoder, decoder y total caliente. Un
resultado solo encoder/tiny no sería evidencia de transcripción medium.

## Validación realizada

- `npx tsc -p tests/tsconfig.json` y
  `node --test tests/voice-finalization.test.cjs tests/soniox-conversation.test.cjs`:
  **22/22** correctas.
- `wear\\gradlew.bat -p tests/kotlin testAndroidHostTest --offline --console=plain`:
  correcto; la advertencia iOS es esperada en Windows.
- `node scripts/kotlin-build.cjs android release`: correcto.
- `npx --no-install ns prepare android --release --env.production`: correcto.
- Android offline `assembleRelease lintVitalRelease` para `arm64-v8a`, con
  `faceclawUnsigned`: correcto. Persisten advertencias preexistentes de
  `additional_gradle.properties` ausente, `flatDir` y versión Gradle.
- Auxiliar aislado: `assembleDebug --offline` correcto. Solo avisos de Java 21
  sobre source/target 8 y XML de SDK, sin dependencia de red.

## Pixel, APK e instalación

No se hizo ADB, captura, instalación, extracción de APK, lectura de ajustes ni
prueba humana. El relevo requerido
`.tools/medium-luna-handoff-2026-10-09.json` no existía y tampoco había reserva;
la ausencia no acredita disponibilidad. Por ello no se creó APK firmada, hash,
versión nueva, comprobación de certificado, respaldo, comparación privada de
ajustes ni reversión para este incremento. S2.6.12 sigue siendo la instalación
documentada; no se debe inferir el estado actual del dispositivo.

Para continuar hace falta un relevo con `state: released` que corresponda a este
encargo y ausencia de la reserva ajena. Después: adquirir `medium-pixel-reservation`
mediante creación exclusiva, registrar propietario/fecha, comprobar identidad
`61161FDCG0013L`, OFF, captura y drenaje; validar firma/keystore sin imprimir
secretos; respaldar, comparar ajustes, instalar con `adb install -r`, comprobar
hash/firma/version y terminar OFF/drenado antes de liberar solo la reserva propia.
