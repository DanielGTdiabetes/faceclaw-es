# Informe Claude — implementación C1, 04-10-2026

Encargo `notes/prompt-claude-implementar-c1-2026-10-04.md`, con las precisiones de `notes/revision-codex-contratos-c1-2026-10-04.md` y la especificación §12 de `notes/diseno-claude-conversacion-proactiva-hermes-2026-10-04.md`. **C1 implementado y APK preparada, pendiente de revisión Codex. No instalado ni ensayado.**

## Base y commits

- Rama `codex/conversation-detection-g0`. Base `a0b1233` (aceptación Codex), árbol limpio al empezar, 1 commit Codex por delante de origin que se publica junto con estos. Sin reset, clean ni reescritura.
- `0858d09` — código, pruebas y versión `0.8.2-es.5-conversation.c1` (código 805).
- Commit documental posterior con este informe, `AGENTS.md` y `notes/continuidad-entre-pcs.md`.

C1 es diagnóstico. No es el modo proactivo ni otra auditoría. No cambia modelos, umbrales, segmentación, tope de 120 s, prioridad del asistente ni flujo habitual. Sin reintento ASR. No envía nada a Hermes.

## Cambios por archivo y símbolo

| Archivo | Cambio |
| --- | --- |
| `native/kotlin/shared/.../LocalTranscriptSession.kt` | `LocalTranscriptLanguage` (`AUTO`/`ES`), `LocalDecodedText.forced`, `normalizeForcedLanguage`, `localDecodedText`, `localTextRejection` con rama forzada, `LocalTranscriptPhases`. `LocalTranscriptBuffer.accept(pcm, state, phase = 0)` con fase por muestra, incluidos los 200 ms previos (`prePhases`), segmento de una fase o `mixta`, contadores por fase y `mixedAudioMsByPhase`. `LocalTranscriptSession.start(language)`, `setPhase`, `Job`/`Result` con fase, `LocalTranscriptPhaseStats` por fase, `discardPendingResult()` como salida única, `phases` en `diagnostics()` |
| `App_Resources/.../FaceclawLocalTranscriber.kt` | `loadDecoder(language)` recibe el idioma del inicio aceptado, `recognizerConfig(..., "es" o "")`, `localDecodedText(...)`, `start(language: String)`, `setPhase` |
| `app/conversation-detection/local-vad.ts` | `VadFrame`, `VadObserver`, `setObserver`. Eventos `open`/`abort` y `candidateInterrupted()` en `resetStream`. `onsetThreshold` con la fórmula de inicio. Decisión intacta |
| `app/conversation-detection/phase-diagnostics.ts` (nuevo) | `DIAGNOSTIC_PHASES`, `PhaseDiagnostics`, franjas relativas y dBFS, `MAX_PHASE_MARKS = 32`, `binIndex` |
| `app/conversation-detection/coordinator.ts` | `SessionOptions`, `setEnabled(..., options)`, `markPhase`, `languageMode` y `phases` en `DetectorSnapshot`, `countGap` (un hueco cuenta una vez), cesiones por fase, `phases.stop()` en `cleanup` |
| `app/conversation-detection/transcription.ts`, `app/native/local-transcription.ts` | `TextLanguage`, `start(language)`, `setPhase?`, tipos `TranscriptPhaseAnalysis` |
| `app/conversation-detection/session-controls.ts` | Selectores RAM `conversationTextLanguage`/`setConversationTextLanguage` y `conversationDiagnosticsSelected`/`setConversationDiagnosticsSelected`, solo en OFF. `conversationSessionOptions()` |
| `app/conversation-detection/conversation-ui.ts`, `app/apps/local-conversation/local-conversation-app.ts` | `textLanguageLabel`: «castellano (forzado)» o el texto anterior «es/valencià» |
| `app/g2/dashboard-controller.ts` | `setConversationCaptureEnabled(..., options = conversationSessionOptions())`: todas las entradas (móvil, lentes, «Solo transcripción») usan los selectores |
| `app/phone-ui/main-view-model.ts`, `main-page.xml` | Botones «Idioma del texto» y «Diagnóstico por fases» (solo OFF), fila de marcas visible solo en sesión con diagnóstico, aviso «Drenando… cifras todavía no finales» en «Métricas tras OFF» |
| `App_Resources/Android/app.gradle`, `scripts/install-conversation-g0.ps1` | Versión `c1` y validación del helper |

### Cómo se cumplen las precisiones de Codex

1. **Descartes:** todo `Result` pendiente que no se entrega pasa por `discardPendingResult()`: sobrescritura de la ranura, `resetStream`, `stop`, deadline en `nextJob`, `finally` del worker. `publish` cuenta el descarte si el `post` encuentra el resultado pero la sesión ya no vale o no hay listener. Cada resultado se cuenta una vez, en su fase. Sin cola, la ranura única no cambia.
2. **Idioma inmutable:** `start(language)` escribe `languageMode` solo tras pasar la comprobación de `worker` y entrega el valor al hilo como parámetro. `loadDecoder(language)` no lee ningún campo mutable.
3. **Castellano forzado:** `""`/`"es"` → `es` forzado. Cualquier otro valor explícito, incluido `ca`, suma `forcedMismatch` y rechazo `LANGUAGE`, sin texto. `auto` conserva el filtro es/ca anterior.
4. **Reloj y muestras:** `wallMs` e `inputMs` se guardan por separado y la UI no los resta ni los llama pérdidas.
5. **Frontera real:** la variante integrada de N3 usa chunks de 50 ms. El orden marca/PCM se comprobó en el código real: `voice-control.onExperimentalPcm` entrega la copia TS (VAD) y después el array nativo en el mismo callback del hilo principal (`BoundedPcmDelivery` con `host.dispatcher`), así que una marca de UI siempre cae entre dos chunks para VAD y ASR.

## Pruebas

| Grupo | Resultado | Log (local, `.tools/c1-logs/`) |
| --- | --- | --- |
| Kotlin `LocalTranscriptPhaseTest` (nuevo): K1, K2 + variante bloqueada/`dropped`, K3, K4, K5 (reset, stop, sin listener), K5 deadline en `nextJob`, K6 con `ca`, normalización y filtro, inicio rechazado durante carga, fase inválida y privacidad, contadores del buffer | **12/12** | `kotlin-c1.log` |
| Kotlin `LocalTranscriptSessionTest` existente | **12/12** | idem |
| Kotlin `LocalParticipationSessionTest` (regresión del buffer compartido) | **10/10** | idem |
| Node `conversation-phases.test.cjs` (nuevo): N1, VAD idéntico con/sin observador, N2, N3 por tramas (80/40), N3 integrado (50/50 con abort y con hueco), N4, saturación/reloj/OFF/límite de marcas, franjas | **8/8** | `node-tests-c1.log` |
| Node del área (detección, lentes, móvil, presencia, UI, host iOS) | **82/82** en total | idem |
| TypeScript app y pruebas, oxlint | 0 errores, 0 avisos | `tsc-app.log`, `oxlint.log` |

Ajustes de fixtures, sin cambiar semántica: firma `loadDecoder(language)` en las 6 dobles de `LocalTranscriptSessionTest`; las dos expectativas de inicio desde lentes incluyen ahora las opciones por defecto `{ language: 'auto', diagnostics: false }`; los stubs de `conversation-phone-ui` y `conversation-presence` exponen los nuevos selectores con sus valores por defecto. Detalle de fixture: K1 espera 550 ms enviados porque el chunk `sin actividad` que cierra el segmento también entra en él (comportamiento existente del buffer). Durante la escritura se detectó un bucle en mi harness Node (devolvía un objeto `session` nuevo en cada `environment()`); se corrigió el harness, no el código.

No se repitieron las suites completas (782 Node / 240 Kotlin) ni baterías físicas.

## AAR, build y APK

- AAR: `node scripts/kotlin-build.cjs android` (JDK 21 de Microsoft, SDK local), `faceclaw-shared.aar` `5f52822c…` → `8f8413db…`. Contiene `LocalTranscriptLanguage`, `LocalTranscriptPhases`, `LocalTranscriptSession$LocalTranscriptPhaseStats`. El AAR no lleva `.so`.
- `FaceclawLocalTranscriber.kt` copiado de `App_Resources` a `platforms/android` (era el único archivo distinto), equivalente a la copia de recursos de `prepare`.
- Webpack producción Android con el `package.json` del runtime guardado y restaurado (hash igual).
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`: salida 0, `compileReleaseKotlin` y `lintVitalRelease` ejecutados. El dex contiene las clases nuevas.
- Firma con `scripts/install-conversation-g0.ps1` **sin `-Install`**, tras comprobar que existen `faceclaw-es.jks` y `store.password`. No se generó clave ni se mostró ningún secreto.

| Archivo (`dist/conversation-g0/`) | SHA256 |
| --- | --- |
| `faceclaw-0.8.2-es.5-conversation.c1.apk` | `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6` |
| `faceclaw-0.8.2-es.5-conversation.c1-unsigned.apk` | `1a82c75149bc7ffea49721a2c326e50e340bd8255b47acdb7488f14595480429` |
| `faceclaw-0.8.2-c1-source-0858d09.zip` (`git archive`) | `ec0db6816b0b47ac37ef2d09793d46faec8171fccb13726e2c8d509f988f5b7a` |

- `aapt`: `com.faceclaw.app`, versionCode 805, versionName `0.8.2-es.5-conversation.c1`.
- `apksigner`: certificado SHA-256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` (CN=Faceclaw Espanol).
- **Siete bibliotecas nativas idénticas** a la APK G3.4.2 unsigned (`721bbc14…`, igual que la del NAS): `libfaceclaw_lc3`, `libfaceclaw_llama`, `liblanguage_id_l2c_jni`, `libNativeScript`, `libonnxruntime`, `libsherpa-onnx-jni`, `libtranslate_jni`. `assets/app/package.json` idéntico, `bundle.mjs` distinto.

## Preferencias (por inspección, sin instalación)

Los selectores son variables de módulo en RAM (`session-controls.ts`). No se añadió ninguna clave de ajustes ni lectura/escritura de preferencias. Los 33 ajustes no se han comparado antes/después porque no hubo instalación.

## NAS

`/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-c1/`: APK firmada, unsigned y fuente, **SHA256 iguales a los locales**, carpeta 700 y archivos 600. Notas (informe, `AGENTS.md`, continuidad) copiadas a `/volume1/home/Dani/Faceclaw/` conservando la versión anterior con sufijo `.before-c1-20261004`.

## Reversión

- Código: revertir `0858d09` y regenerar el AAR.
- Si se instalara más adelante: G3.4.2 firmada (`990a10f1…` según su informe, archivo presente en el NAS; su hash no se recalculó en esta entrega) con `adb install -r`, firma original y datos conservados.
- Con `auto` y diagnóstico OFF el comportamiento visible es el actual, salvo los dos botones nuevos y contadores agregados.

## Límites

- **Solo pruebas de software.** No se ha medido ninguna mejora del interlocutor ni el valor real de `result.lang` con idioma forzado en el dispositivo. Eso queda para el ensayo de §13, que se acota con el usuario y no se lanza automáticamente.
- La UI móvil nueva no se ha visto en pantalla. Sin consultas al móvil, captura, ensayo ni servicios de Jarvis. Perfil sin leer, exportar ni reenrolar.
- Hermes habitual, GPS, bloqueo, firmware /36 y Wear desconectado sin tocar.
- G3.4.2 sigue siendo el último estado instalado documentado y su revisión completa sigue pendiente. C1 no la aprueba. Precisión, participación, autonomía e incidentes históricos (492 ms/siete descartes, UI 1046 ms/21 drops) siguen abiertos.
