# S2.6.12 Whisper: métricas corregidas, base a 4 hilos, instalada · 09-10-2026

Autor: Claude Code, encargo con autorización explícita del usuario para corregir, integrar e instalar con la firma
original, conservando datos; revisión de Codex posterior. Sin push, sin mensajes a otros chats, sin Hermes/NAS.

## Estado instalado

- Pixel `61161FDCG0013L`: `com.faceclaw.app`, `0.8.2-es.5-conversation.s2.6.12-whisper-performance`, código 805.
  `adb install -r` → `Success` a las 17:13:39; `firstInstallTime` 2026-10-02 sin cambios (sin desinstalar).
- APK firmada `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.12-whisper-performance.apk`,
  SHA-256 `2cd955b1896ffebc61b8d108c9458e8956ff5f4b309fb0846e789e0d825cd6c4`. La `base.apk` extraída del teléfono
  después de instalar tiene el mismo hash. Firma v2/v3, un firmante, certificado
  `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`; `zipalign -c -P 16 4` correcto.
- Sin firmar: `…-whisper-performance-unsigned.apk`, `26e0ed7fa928e4dfc89036f1cb75ef81e4d3c04cf9452ba0de1964972e752453`.
- **Reversión fresca**: `dist/conversation-g0/before-update-s2.6.12-whisper-performance.apk`, SHA-256
  `ed471aa3479fe7a979021b193e5b3d25f6759602332dd2f3de30826b37f1e2dd` = S2.6.11 exacta, extraída del Pixel justo antes,
  firma original verificada (copia idéntica `before-install-20261009-151307.apk`).

## Comprobaciones antes y después

- Antes: S2.6.11 instalada; UI «Conectado», «Motor: Whisper small (local)», «Hermes en conversación: OFF · iniciar»,
  «Memoria del día: 24 h», «Mi perfil: guardado en este móvil». `Wake Locks: size=0` y `RecordActivityMonitor` vacío
  (sin grabación), comprobado otra vez inmediatamente antes de `install -r`.
- Ajustes: exportación privada `FaceclawSettingsPortReceiver` con `.tools/s2.6.12-export-settings.ps1`; 35 entradas
  antes y después, **idénticas** (el archivo exportado tiene el mismo SHA-256). Respaldos en
  `.tools/s2.6.12-whisper-private/` (ACL usuario/SYSTEM). No se imprimió ni publicó su contenido; no se leyó ni exportó
  el perfil; sin audio.
- Después: sin wakelocks de Faceclaw (los dos que aparecieron después eran de otra app) y sin grabación.
  Abrir/restaurar no inició captura. UI «Conectado» y Conversación OFF.
- **Motor y memoria del día son selecciones solo en RAM** (`session-controls.ts`: Soniox y memoria desactivada por
  defecto), así que cualquier actualización las restablece al reiniciar el proceso. El agente no las cambió. Una lectura
  posterior de la UI, sin tocar la pantalla, mostró de nuevo «Motor: Whisper small (local)» y «Memoria del día: 24 h»
  con OFF: el usuario las volvió a seleccionar. En la primera lectura tras instalar estaba abierto el diálogo
  «Continuidad durante el día».
- No se activó el micrófono ni se hizo ningún ensayo. No se reinstaló el auxiliar ni se repitieron mediciones.

## Qué contiene

Base: `6395abd` + cambios locales vigentes de S2.6.11 (memoria diaria, UI, puente, ajustes), sin tocarlos. Encima, el
delta Whisper corregido de la rama `claude/whisper-perf-bench-2026-10-09` en `E:\projects\faceclaw-es-whisper-bench`,
**commit `a85b04a`** (sobre `c4bb5bf`). Los seis archivos del delta estaban sin modificar en este checkout; se copiaron
íntegros y su contenido coincide con `a85b04a`:

- `App_Resources/Android/src/main/java/com/faceclaw/app/{AndroidSpeechEngines,FaceclawLocalTranscriber,LocalWhisperModels}.kt`
- `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/{LocalTranscriptSession,LocalWhisperRunConfig}.kt`
- `tests/kotlin/src/commonTest/kotlin/com/faceclaw/app/LocalWhisperPerformanceTest.kt`

Además: `versionName` en `App_Resources/Android/app.gradle` y la versión nueva en el `ValidateSet` de
`scripts/install-conversation-g0.ps1`. Ningún cambio TypeScript: `assets/app/bundle.mjs` es idéntico al de S2.6.11.
El banco, resultados e informe quedan solo en la rama aislada.

Cambio de producción respecto a S2.6.11:

- `whisper-base-es` pasa de 1 a 4 hilos. Small y medium siguen en 4. CPU, padding por defecto y política `ref-6-3`.
- Coalescencia, XNNPACK y padding experimental existen solo en `startConfigured()`, que ninguna parte de la app llama.
- Métricas nuevas en el diagnóstico del motor local (ver abajo). No cambian filtros de idioma, acondicionamiento,
  modelos ni captura.

## Semántica de las métricas corregidas

- `attemptedAudioMs`: unión del tiempo PCM de las ventanas entregadas al decoder, sea cual sea el resultado.
- `coveredAudioMs`: unión de las ventanas cuyo decoder **volvió sin excepción mientras su generación seguía vigente**.
  Una ventana fallida o invalidada no suma nada; una ventana correcta posterior suma solo su propio tramo. Es audio
  procesado, no texto aceptado ni entregado: un rechazo por idioma cuenta como cubierto y no entrega nada.
- Invalidado: OFF, `resetStream` o plazo antes de que el decoder vuelva. Cuenta en `invalidatedDecodes`, nunca en
  cobertura, y no contamina la generación nueva (el reloj de captura sigue; la ventana nueva solo cubre su tramo). Si
  el OFF llega después de que el decoder haya vuelto, la ventana queda cubierta, pero su texto se descarta
  (`invalidatedDecodes`).
- `decodeTimings()`: anillo fijo de 256 intentos `[inicioMs, finMs, decodeMs, resultado]` (0 correcto, 1 fallo,
  2 invalidado) con `total` y `first`; `first > 0` indica que el anillo ya no cubre toda la ejecución. La RAM de
  producción sigue acotada.
- Banco: recoge el anillo cada 30 s y lo une por índice. Si falta un intento, `timingsComplete=false`, p50/p95 y voz
  cubierta son nulos y `timingsInvalidReason` lo explica en JSON, CSV y SUMMARY. Percentiles solo sobre intentos
  correctos de toda la ejecución.

## Pruebas

| Qué | Resultado |
| --- | --- |
| `tests/kotlin` completo, checkout principal integrado | 287 ejecutadas, 286 correctas; falla solo `PreviewAnimationListenerTest.mirrorIsNotifiedOfEachRedrawThroughTheSettledFrame`, el fallo de reloj ya documentado por Codex en la base |
| Esa prueba aislada | correcta |
| `LocalAsr*`, `LocalTranscript*`, `LocalWhisperPerformanceTest`, animación | 57/57 |
| `LocalWhisperPerformanceTest` | 14/14; nuevas: fallo total, éxito posterior que cubre/no cubre el hueco, OFF/reset durante JNI sin contaminación, rechazo por idioma ≠ fallo, 257 ventanas con anillo acotado, `first=1` y recogida incremental de las 257 |
| Banco `:app:testReleaseUnitTest` (rama aislada) | 6/6; nuevas: 19 min recogidos completos, instantánea final sola → métricas nulas con motivo (la cola sola daría 67,37 %), hueco entre sondeos, fallos/invalidados fuera de cobertura y percentiles |
| `test_summarize_pixel.py` | 4/4: JSON históricos intactos, 1,309 no aparece, cobertura antigua etiquetada, JSON nuevo incompleto retenido |
| Vectores métricos Python | 15/15 |
| Reproducciones de Codex (`WhisperReviewEvidenceTest`) contra el código corregido | 2/2 **ya no se cumplen**: `coveredAudioMs` ahora es 0 con decoder fallido; la segunda falla por el formato nuevo de 4 campos (que el anillo sigue en 256 lo afirma la prueba propia) |

Comandos (JDK 21 Microsoft, SDK local):

```powershell
$env:ANDROID_HOME='C:\Users\danie\AppData\Local\Android\Sdk'; $env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
.\wear\gradlew.bat -p tests/kotlin testAndroidHostTest --offline --console=plain
node scripts/kotlin-build.cjs android release
node $env:LOCALAPPDATA\npm-cache\_npx\b2797a435dfaa8e3\node_modules\nativescript\bin\ns prepare android --release --env.production
cd platforms/android; .\gradlew.bat --offline assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a -x prepareFaceclawNativeLibs -x prepareFaceclawLlama
```

## Build y artefactos

- AAR compartido reconstruido: `3b81912b…` (S2.6.11, copia en la carpeta privada) → `9f3a2aa169d47b238d1f148262a00963ce967085b2677fe8d3701e6d5c3449ee`.
  Solo cambia `classes.jar`: clases `LocalTranscript*`, `LocalWhisperPerformance`, `LocalTranscriptWindowPolicy`; además
  `LocalParticipationSession` se recompila porque llama a constructores con parámetros nuevos con valor por defecto.
- Webpack producción correcto; `assets/app/package.json` del runtime idéntico (`70f23257…`).
- Gradle offline `assembleRelease lintVitalRelease` con salida 0; nativas no reconstruidas.
- Frente a S2.6.11 cambian solo `AndroidManifest.xml` (solo `versionName`, comprobado con `aapt dump badging`),
  `classes.dex`, `assets/dexopt/*` y `assets/metadata/*` (metadatos NativeScript generados de las clases). Esperado.
- Siete `.so` idénticas por SHA-256 a S2.6.11: `libNativeScript` `4676d2d6…`, `libfaceclaw_lc3` `27e46145…`,
  `libfaceclaw_llama` `0fd9e303…`, `liblanguage_id_l2c_jni` `4479b044…`, `libonnxruntime` `4d2318b3…`,
  `libsherpa-onnx-jni` `290a2c18…`, `libtranslate_jni` `35b3d036…`. Validación en
  `.tools/s2.6.12-whisper-private/apk-validation.json`.

## Reversión

Solo si se decide volver atrás y con Conversación OFF, sin desinstalar:

```powershell
& 'C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe' -s 61161FDCG0013L install -r E:\projects\faceclaw-es\dist\conversation-g0\before-update-s2.6.12-whisper-performance.apk
```

Después, comparar ajustes con `.tools/s2.6.12-export-settings.ps1 -Stage after` (compara contra el `before` guardado).
Fuentes: los seis archivos vuelven a `git show 6395abd:<ruta>` (los tres nuevos se borran) y `versionName` a
`s2.6.11-daily-context`. Hermes, memoria diaria y NAS no se tocaron y no necesitan reversión.

## Límites

- `install-conversation-g0.ps1 -Install` se detuvo en Windows PowerShell 5.1 al copiar la APK instalada (stderr de
  `adb pull` tratado como error con `Stop`), **antes de instalar**. El respaldo se había copiado completo; la
  verificación de firma, la comprobación de OFF y `adb install -r` se hicieron a mano con los mismos pasos. Conviene
  corregir el script como en los scripts de ajustes (`$ErrorActionPreference='Continue'` alrededor del `pull`).
- Sin copia al NAS en este encargo.
- No hay medición nueva: la mejora de base procede de los bloques ya verificados por Codex (dos bloques de 5 min por
  configuración). Base a 4 hilos no cambia small, el modelo del usuario, ni resuelve la voz lejana. La validación con
  personas a 1/2 m queda para un ensayo coordinado aparte.
