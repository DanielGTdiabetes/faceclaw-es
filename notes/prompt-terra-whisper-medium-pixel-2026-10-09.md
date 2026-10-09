# Encargo para Terra: soporte de medium y prototipo TFLite/NPU

Trabaja con razonamiento medio, por etapas. El usuario ha delegado este trabajo;
Codex revisará los cambios. Luna mide medium CPU en otro checkout. Tu tarea es
**habilitar medium en «ey Even», conservar diagnósticos tras OFF y comprobar con
un prototipo aislado si TFLite/LiteRT puede acelerar medium en el Pixel**.
No delegues más agentes ni mezcles estas tres cosas como una sola mejora medida.

## Punto de partida

- Consulta `C:\Users\danie\.codex\memories\faceclaw.md`, los `AGENTS.md` aplicables
  y `notes/continuidad-entre-pcs.md`. La cabecera de memoria está desactualizada;
  usa la evidencia reciente del repositorio y comprueba el estado real.
- Tu checkout es `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`.
  Referencia inicial publicada: `72816632f7ec9dc8c510b080fa73a1ccbbf6739f`.
  Comprueba HEAD y cambios locales antes de editar. Conserva todo lo ajeno,
  especialmente la nota de Gemini Nano, prompts/notas nuevos y el stash histórico.
- Lee `notes/revision-codex-whisper-s2.6.12-2026-10-09.md`,
  `notes/whisper-s2.6.12-instalacion-2026-10-09.md` y
  `notes/prueba-medium-tv-2026-10-09.md`.

S2.6.12 original/805 está instalada, sobre S2.6.11 y memoria diaria. No integres
de nuevo desde la base antigua del banco ni instales su APK sobre Faceclaw.
Conversación usa CPU/4 hilos para base, small y medium; el asistente tiene otra
ruta. La TV a dos metros funcionó bien subjetivamente con medium, pero lento.
No hay validación con otra persona. Hermes aceptó 19 turnos, devolvió 18 `nada`
y un mensaje presentado: no sabemos si esas abstenciones eran correctas.
No cambies Hermes, su proveedor, memoria o participación para aumentar mensajes.

## Coordinación: prepara código mientras Luna mide

No edites `E:\projects\faceclaw-es-whisper-bench`: es de Luna. Puedes leerlo.
No uses ADB, instales ni ejecutes inferencia en el Pixel mientras Luna trabaja.
Primero completa código, pruebas de PC y preparación del prototipo.

El relevo estará en
`E:\projects\faceclaw-es\.tools\medium-luna-handoff-2026-10-09.json`.
Léelo cuando necesites el dispositivo. Solo permite pasar a tu fase de Pixel si
`state` es `released`, la entrega corresponde a este encargo y ya no existe la
reserva `E:\projects\faceclaw-es\.tools\medium-pixel-reservation`.
No supongas que ausencia de archivo, silencio o tiempo transcurrido equivale a
dispositivo libre. No esperes activamente ni repitas consultas continuamente.
Si aún no hay relevo, avanza fuera del Pixel y entrega el bloqueo concreto si
ya no queda trabajo independiente.

Antes de tu primer ADB, adquiere ese mismo directorio de reserva con creación
que falle si existe (PowerShell `New-Item -ItemType Directory -ErrorAction Stop`,
sin `-Force`) y registra propietario/fecha. No borres una reserva ajena.
Recomprueba identidad del Pixel, OFF, captura y motores drenados. Última observación:
serial `61161FDCG0013L`, ADB en
`C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
Conserva la reserva durante pruebas e instalación; retira solo tu reserva al finalizar.

## A. Medium en el asistente «ey Even»

Codex encontró estos puntos; compruébalos contra las fuentes actuales:

1. `app/ui/dashboard-settings.ts`: faltan proveedor `onboard-whisper-medium`,
   etiquetas/lista persistida y descripción correspondiente.
2. `app/ui/dashboard/settings-menus.ts`: falta la opción del modelo
   `asrModelMenuItem("whisper-medium-es")`.
3. `app/native/voice-control.ts`: ampliar `VoiceProviderKind`, mapear a
   `whisper-medium` y excluirlo correctamente de clientes cloud.
4. `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/VoiceCaptureSession.kt`:
   `parseModelKind` no reconoce medium, aunque `WHISPER_MEDIUM` existe en el enum.
5. `App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawVoiceController.kt`:
   `findAsrModelDir` devuelve null para medium. Conecta los archivos y verificaciones
   del catálogo `LocalWhisperModels.kt` y `app/native/asr-model.ts`. Reutiliza el
   modelo ya descargado; maneja ausencia/corrupción sin fallback silencioso.
6. El asistente llama a `recognizerConfig` sin `numThreads` y hereda 1 hilo.
   Para medium usa 4 como baseline o un ganador demostrado por Luna; comprueba
   la configuración efectiva y el comportamiento de caché/reutilización.
   Conserva base/small salvo evidencia y alcance explícitos para cambiarlos.

Elegir medium debe cargar medium local, sin abrir red ni caer en Moonshine.
No lo selecciones automáticamente ni modifiques `voice.provider` del usuario.
Describe de forma breve la mayor espera. El wakeword sigue siendo del firmware:
este cambio transcribe la frase posterior, no mejora su detector.
Conserva endpointing, cancelación, prioridad de audio y finalización de Whisper.
Evita que un timeout envíe una parcial o libere un decoder aún ocupado. No anuncies
soporte iOS sin implementación. No rediseñes el pipeline para añadir la opción.

## B. Métricas locales después de OFF

En `app/native/soniox-conversation.ts`, `stop()` pasa a off y `snapshot()` deja
de exponer `local.snapshot()`, devolviendo contadores genéricos Soniox a cero.
Eso ocultó las estadísticas de medium en la prueba del usuario. No prueba que
Soniox fuera el motor usado ni que Whisper tuviera cero descartes.

Conserva solo agregados y la identidad del motor de la última sesión local,
incluyendo el estado real de drenaje. Elimina texto/audio como hasta ahora.
La lectura posterior a OFF no inicia captura, entrega turnos ni reactiva nada.
Evita cifras antiguas tras inicio nuevo, cambio de motor o transición local→cloud.
Comprueba si la capa Kotlin ya retiene estadísticas antes de duplicar almacenamiento.

## C. Prototipo aislado de TFLite/LiteRT/NNAPI/NPU

Esta vía NO fue medida en el banco anterior. La app actual usa ONNX/sherpa:
`Interpreter.Options().setUseNNAPI(true)` no se puede añadir a esa inicialización.
Hace falta un modelo compatible y otro adaptador/runtime. Investígalo con una
prueba concreta; no lo descartes solo porque NNAPI esté deprecado.

Fuentes iniciales, que debes verificar y fijar por versión/commit cuando proceda:

- https://github.com/nyadla-sys/whisper.tflite/issues/47
  La cifra 16,74× procede de puntuaciones Geekbench del Samsung S23 Ultra:
  Qualcomm QNN 37498 frente a GPU 2240. No es Whisper en Pixel ni una medida de
  tiempo/energía. No la uses como expectativa de mejora.
- https://github.com/fusigi0930/android-whisper
- https://github.com/vilassn/whisper_android
- https://developer.android.com/ndk/guides/neuralnetworks/migration-guide
  NNAPI está deprecado desde Android 15; deprecado no equivale a ausente.
- https://developers.google.com/edge/litert/next/npu
- https://developers.google.com/edge/litert/next/tensor-sdk
  La documentación consultada anuncia Tensor SDK Beta con registro y Google
  Tensor AOT mediante CompiledModel, sin JIT. Comprueba disponibilidad actual.

Haz el prototipo fuera del runtime de producción, en
`E:\projects\faceclaw-es-medium-npu-lab` (comprueba antes si existe y conserva lo
ajeno). Fuentes/instrucciones públicas revisables pueden entregarse en
`evaluations/whisper-medium-npu/` del principal; pesos, builds y dependencias no.
Usa un auxiliar propio `com.faceclaw.whispermediumlab`, firma de desarrollo,
sin micrófono ni red y modelos/corpus público copiados a su propia carpeta.
No reutilices ni modifiques el auxiliar de Luna.

Secuencia acotada:

1. Comprueba modelo multilingüe medium disponible, procedencia/licencia/hashes,
   cuantización real, entradas/salidas y operadores. INT8 de pesos con activaciones
   float no es INT8 integral ni garantiza compatibilidad NPU. No confundir medium
   multilingüe con medium.en. No conviertas/modeles durante horas sin comprobar
   primero que existe una ruta de ejecución viable en este Tensor G5.
2. Inspecciona la firma del modelo: PCM 16 kHz mono, frontend Log-Mel, padding y
   formas/tipos reales. No presupongas que toda exportación recibe directamente
   `(1,80,3000)` o devuelve tokens completos. Implementa vocabulario multilingüe,
   tokens especiales y decoder autoregresivo según el artefacto concreto.
3. Haz una prueba mínima de compatibilidad/delegación. Tiny puede servir para
   verificar infraestructura, pero no demuestra soporte, velocidad ni precisión
   de medium. Una prueba encoder-only debe etiquetarse así.
4. Si es viable, compara medium TFLite CPU frente a aceleración disponible usando
   exactamente el mismo modelo y audio. Compara aparte con ONNX medium de Luna,
   declarando diferencias de pesos/cuantización/frontend/búsqueda. Registra
   carga/compilación fría, preprocesado, encoder, decoder y tiempo total caliente.
5. Demuestra dispositivo/backend efectivo y nodos/subgrafos delegados mediante
   perfil/logs filtrados. Separa ejecución parcial, fallback CPU e incompatibilidad.
   Crear un delegado o ver que no falla no acredita ejecución NPU.
6. Solo si el piloto medium mejora, amplía al corpus es/ca/voz atenuada/silencio,
   repeticiones y sostenido térmico. Usa el criterio de Luna: ≥20 % menos p95
   repetible frente al baseline ONNX, sin degradación material. Una mejora de
   encoder no se presenta como mejora equivalente de transcripción completa.

No solicites acceso a SDK, aceptes condiciones ni contrates servicios por cuenta
del usuario. Si faltan compiler/driver/modelo/acceso, documenta el requisito exacto
y completa A/B. Distingue «no disponible para esta prueba» de «no funciona».
No migres la app a TFLite por un piloto: entrega el prototipo y recomendación para
revisión, con CPU fallback explícito cuando corresponda. No STT en BMAX ni GPU remota.

## Validación, instalación y entrega

Para A, amplía pruebas de menú/persistencia/mapeo y finalización TS
(`tests/voice-finalization.test.cjs`) y Kotlin (`VoiceCaptureSessionTest`) a medium;
comprueba el modelo/configuración realmente solicitados, no solo la etiqueta.
Para B, prueba OFF con decoder ocupado, lectura tras drenaje, sesión nueva y
local→cloud, sin retención de texto ni entrega posterior al cierre.
Ejecuta typecheck/lint y las pruebas afectadas; compila Android y lintVitalRelease.
No repitas suites completas sin motivo. El fallo conocido de animación temporal
no justifica omitir las pruebas afectadas: registra cualquier fallo y su evidencia.

El usuario ya autorizó «que lo instale y luego revisas». Tras verificaciones y
liberación del Pixel por Luna, puedes instalar la actualización necesaria A/B,
con versión nueva sobre S2.6.12, firma española original, respaldo fresco de la
APK instalada, comparación privada de ajustes antes/después y `adb install -r`.
Reutiliza el instalador corregido; comprueba que existen keystore y contraseña
antes del firmador, que podría generar otra clave si faltan. No imprimas secretos.
Certificado esperado SHA-256:
`57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
No desinstales Faceclaw ni borres sus datos. Si firma o comprobaciones fallan,
conserva la reversión y comunica el bloqueo. No necesitas otra autorización para
este flujo. No instales el prototipo NPU como backend de producción.

No cambies las selecciones del usuario: motor de Conversación/memoria son RAM
y pueden restablecerse al actualizar; informa de lo observado. No inicies una
conversación real, captures micrófono/TV o leas transcripciones/perfil/memoria.
No cambies firmware, governors ni protección térmica. Retira el auxiliar NPU y
sus archivos al acabar. Comprueba OFF/drenaje final y libera tu reserva.

Entrega commits separados para A, B y prototipo/documentación. Añade solo tus
archivos explícitos, sin reset/clean/stash ajeno ni push/merge; Codex revisará y
publicará. No versionar APK, pesos, audio, claves, ajustes privados o logs crudos.
Actualiza continuidad con hechos comprobados, sin reescribir estados históricos.
Informe: `notes/resultado-terra-medium-pixel-2026-10-09.md`, con rutas/commits,
pruebas, limitaciones, decisión sobre hilos basada en Luna, resultados de NPU,
APK/hash/versión/firma, instalación/reversión y estado final real del dispositivo.
Si alguna parte queda bloqueada, entrega el resto terminado y el motivo concreto.
