# Encargo para Claude: medium en Pixel y asistente «ey Even»

> Encargo sustituido el 09-10-2026 por
> [Luna: mediciones CPU](prompt-luna-whisper-medium-pixel-2026-10-09.md) y
> [Terra: implementación y prototipo TFLite/NPU](prompt-terra-whisper-medium-pixel-2026-10-09.md).
> No ejecutar este prompt junto a los nuevos. La exclusión general de investigar
> TPU de este documento queda superada por el alcance concreto del prompt de Terra.

Trabaja sobre Faceclaw. El usuario delega este trabajo en Claude; Codex revisará el
resultado. Objetivo principal: estudiar y, si se demuestra una mejora, acelerar
**Whisper medium en el Pixel 10 Pro Fold/Tensor G5**, conservando su reconocimiento.
El usuario también ha señalado que medium falta en el asistente «ey Even».
Completa ese soporte como cambio separado; no confundirlo con una optimización medida.

## Lee primero y conserva el estado actual

- `C:\Users\danie\.codex\memories\faceclaw.md` y `E:\projects\faceclaw-es\AGENTS.md`.
  La cabecera de la memoria es antigua; las entradas recientes del repositorio prevalecen
  como evidencia de versión instalada, no como sustituto de comprobar el estado actual.
- Principal: `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`,
  commit publicado `72816632f7ec9dc8c510b080fa73a1ccbbf6739f` antes de este encargo.
- Banco: `E:\projects\faceclaw-es-whisper-bench`, rama publicada
  `claude/whisper-perf-bench-2026-10-09`, `342154c74a66d077e0a6961001a99094b5ddb159`.
- `notes/revision-codex-whisper-s2.6.12-2026-10-09.md` y
  `notes/whisper-s2.6.12-instalacion-2026-10-09.md` en el principal;
  README, resultados e informe del banco en su rama.
- `notes/prueba-medium-tv-2026-10-09.md`: evidencia nueva y límites.

GitHub ya contiene S2.6.11 y S2.6.12. No vuelvas a integrarlas desde la base antigua
6395abd ni instales la APK antigua del banco encima de Faceclaw. Conserva cambios
ajenos, el stash histórico y la nota de Gemini Nano ajena al encargo. No hagas reset,
clean, stash automático ni publicación de archivos privados.

S2.6.12 original/805 está instalada. Base usa 4 hilos en Conversación; small y medium
ya usaban 4. Medium NO se midió en el banco anterior: no extrapoles las conclusiones
de small. La nueva prueba del usuario con TV a 2 m fue buena en reconocimiento y lenta.
No equivale a otra persona, ni compara los modelos con la misma señal.

## Hardware y alcance autorizados

El Pixel estaba conectado por ADB y el usuario lo dejó abierto con Conversación OFF;
Codex comprobó medium + Texto y Hermes + memoria 24 h y no inició captura. Recomprueba
OFF, actividad y ausencia de wakelock propio antes de ocuparlo. No cambies el motor,
memoria, perfil, firmware, idioma, proveedor Hermes ni ajustes por rutina.

Puedes reinstalar únicamente el auxiliar `com.faceclaw.whisperbench` con su firma de
desarrollo y copiarle corpus público/modelos a SU carpeta para medir. No solicites
micrófono ni red para el auxiliar. No grabes TV ni personas, ni inicies una conversación
real. No leas contenido de transcripciones o memoria, exportes perfil o copies secretos.
Los audios reproducibles del banco son FLEURS/sintéticos; no audio privado.
No root, cambios de governors, desactivar protección térmica, ni modificaciones globales.
Retira el auxiliar y sus archivos al acabar; conserva Faceclaw y sus datos.

No hay GPU útil en BMAX. No traslades STT allí, contrates GPU ni solicites Tensor SDK
o aceptes condiciones. CPU primero. No repetir la investigación TPU ni la batería de
base/small. Las pruebas Vulkan de small fueron malas, pero no son una medición de medium.

## A. Medir medium y buscar una mejora real

Reutiliza `evaluations/whisper-tensor/bench-android`, fuentes y bibliotecas de producción.
La APK existente puede ser anterior a las métricas corregidas: recompila y registra la
revisión efectiva. Verifica hashes de modelos y .so; no uses una etiqueta del selector
como evidencia del decoder cargado. Reutiliza archivos locales si existen; no asumas que
los modelos de la app de producción se pueden extraer con run-as.

1. Obtén baseline medium actual: CPU, 4 hilos, padding por defecto, acondicionamiento
   actual, idioma automático y política ref-6-3. Separa hash/verificación, carga,
   calentamiento y decode estable; informa memoria y térmico/batería.
2. Haz primero un piloto acotado de 1/2/4/6 hilos sobre los mismos fragmentos representativos
   de español, catalán y voz atenuada, con repeticiones y calentamiento. No arranques de
   entrada una combinación enorme de proveedores/paddings/ventanas. Examina la curva,
   no presupongas que más hilos gana ni que el resultado de base aplica a medium.
3. Lleva solo los finalistas a un corpus suficiente y bloques sostenidos intercalados
   ABBA, con enfriamiento y condiciones de carga/pantalla documentadas. Compara siempre
   contra medium 4 hilos y no contra base. Separa variación de orden, temperatura y ruido.
4. Si procede por resultados del piloto, evalúa XNNPACK/padding/caché u otra intervención
   pequeña. Comprueba el backend efectivo y no confundas registro del proveedor con
   delegación de nodos. No promociones padding o búsqueda que alteren calidad sin medirla.
5. Mide ritmo real: p50/p95/máximo, latencia de entrega, descartes, cobertura decodificada
   y rechazos por causa; WER/CER es/ca, voz débil y falsas palabras en silencio/ruido.
   Una ventana de 6 s cada 3 s necesita procesar por debajo de 3 s para sostener ese ritmo.
   Para «ey Even» mide también la frase completa/carga fría y reutilización del modelo:
   su ruta finaliza una intervención, no tiene el mismo requisito de flujo continuo.

Criterio de promoción: una mejora repetible de al menos un 20 % en p95 frente a la
configuración actual, sin empeorar el texto reconocido, estabilidad ni comportamiento
térmico de forma material. Conserva también mejoras menores como resultados, pero no
las declares victoria ni cambies valores por una única tanda. Si no hay ganador, entrega
los límites medidos y deja la configuración actual. No prometas tiempo real si no cumple.
Puede ser necesario estudiar una optimización más profunda; distinguir hipótesis,
prototipos, mediciones y cambios listos para producción.

Usa el colector incremental corregido. Nunca calcules todo el ensayo con la cola de 256
ventanas. Fallos/invalidados no son cobertura correcta. Si faltan muestras, métricas
nulas con motivo. No uses el WER inválido de secuencias sostenidas en bucle.

## B. Habilitar medium en «ey Even», por separado

Codex confirmó estos puntos que faltan:

- `app/ui/dashboard-settings.ts`: union VoiceProvider, etiquetas, lista persistida y
  descripción solo incluyen base/small; incorpora `onboard-whisper-medium` como opción
  explícita, indicando mayor espera/experimental sin prometer precisión universal.
- `app/ui/dashboard/settings-menus.ts`: falta `asrModelMenuItem("whisper-medium-es")`.
- `app/native/voice-control.ts`: union VoiceProviderKind, mapeo a `whisper-medium` y
  exclusión de proveedores cloud. Elegir medium no debe abrir red ni caer en Moonshine.
- `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/VoiceCaptureSession.kt`:
  `parseModelKind` no reconoce `whisper-medium` aunque el enum ya lo contiene.
- `App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawVoiceController.kt`:
  `findAsrModelDir` devuelve null expresamente para WHISPER_MEDIUM. Conecta los archivos
  ya definidos en `LocalWhisperModels`/`app/native/asr-model.ts`, sin nueva descarga si ya
  están disponibles; verifica identidad y maneja ausencia/corrupción claramente.
- El controlador del asistente llama `recognizerConfig` sin numThreads y hereda 1;
  no conectes medium así por accidente. Usa 4 como baseline conocido de Conversación
  o el ganador validado para medium, con pruebas que acrediten la configuración real.

No selecciones medium automáticamente ni cambies voice.provider del usuario.
Mantén el reconocimiento de «ey Even» por firmware: este cambio afecta al ASR de la
frase posterior, no al detector de la palabra de activación. Mantén endpointing,
cancelación y finalización: no enviar una transcripción parcial por un timeout antiguo
mientras medium sigue trabajando. No anuncies soporte iOS no implementado.

Verifica menú/persistencia/mapeo, archivos cargados y modelo real; extender las pruebas
de finalización TS y VoiceCaptureSession para medium y asegurar que se decodifica al
final igual que Whisper. Compila Android/lintVital y prepara APK candidata sobre S2.6.12,
con nueva versión y originales intactos. El usuario ya pidió el flujo «que lo instale y
luego revisas»: tras completar las comprobaciones puedes instalar la actualización
necesaria con la firma española original, respaldo fresco de la APK actual, comparación
privada de ajustes antes/después y `adb install -r`. No desinstales Faceclaw ni borres
datos. Comprueba OFF y motores drenados antes; ante fallo de firma o ajustes, detente y
conserva la reversión. Nunca imprimas secretos. Codex revisará después la evidencia.
No selecciones medium ni cambies memoria automáticamente; motor de Conversación y
memoria son RAM y el reinicio puede restablecerlos: informa con precisión al usuario.

## C. Recuperar diagnósticos útiles tras OFF

La prueba de TV dejó Hermes/captura, pero no estadísticas Whisper accesibles en UI:
`SonioxConversationTranscription.stop()` pasa a off y `snapshot()` oculta `local.snapshot()`.
No significa que se usó Soniox ni que medium tuvo cero descartes. Corrige de forma acotada
esa exposición, manteniendo solo agregados/modelo y el drenaje actual; texto/audio deben
seguir borrándose y OFF no puede habilitar turnos ni restaurar captura. No arrastres los
datos a una sesión nueva ni muestres cifras de un motor anterior al cambiar de motor.
Prueba OFF durante decoder ocupado, lectura al drenar, inicio nuevo y local→cloud.

## Evidencia de la TV, sin contenido privado

237,841 s; 19 turnos aceptados, 2 evaluaciones y 19 ayudas; 18 respuestas nada y
1 mensaje/entrega/presentación, cero errores/caducados/cancelados. Ayuda petición→respuesta:
media 1.813 ms, máxima 4.355 ms. Captura: 4.750 paquetes, cero errores LC3/pérdidas/cola,
25 descartes de entrega PCM, hueco máximo 127 ms, capturing=false al leer. No sabemos
si las abstenciones eran correctas ni si esos descartes contenían voz. No cambies el
prompt de Hermes o memoria para «producir más frases» a partir de esto.

## Entrega para revisión

- Commits separados y rutas exactas; no mezcles benchmark, soporte del asistente y
  arreglos de diagnóstico como si todos aceleraran medium.
- Tabla baseline/finalistas, muestras/duración/orden/térmico, errores y backend efectivo;
  resultados JSON/CSV y comandos reproducibles, sin audio ni datos privados.
- Qué mejora se demostró, qué configuración propones, efecto en calidad y si sirve para
  Conversación continua, asistente por intervención o ninguno de los dos.
- Pruebas ejecutadas, fallos reales/base y limitaciones; la animación de reloj conocida
  no justifica omitir las pruebas afectadas.
- APK si completas B/C, hash/versión/firma, evidencia de instalación y reversión fresca
  si se instala; estado final auxiliar retirado y Faceclaw conservado, sin afirmar OFF
  actual si no se ha comprobado. Si no instalas, explica el bloqueo real, no pidas otra
  autorización que ya consta en este encargo.
- Informe en notes y continuidad actualizada; deja a Codex revisión y publicación final.

No pidas confirmaciones repetidas para medir con el auxiliar dentro de este alcance.
Si el móvil está ocupado, sigue con código/corpus fuera del dispositivo y comunica el
bloqueo concreto. No conviertas la falta de otra persona en una grabación automática.
