# Whisper small con hablantes, escucha sin límite y ajustes de Gatekeeper · S2.9 · 10-10-2026

Implantación del [plan](plan-whisper-hablantes-gatekeeper-2026-10-10.md) sobre `2076c14`
(rama `codex/conversation-detection-g0`). El usuario retira las restricciones de privacidad sobre
voces ajenas en este contexto, pide quitar el tope de 20 min de la escucha continua y aporta la
revisión de Codex del Gatekeeper (69 peticiones, 0 evitadas, 68 bypass, 5 timeouts, una
clasificación de 7,7 s con LFM2.5 1,2B).

## Cambios

### F1 · Calidad de Whisper small
- Nueva política de ventanas `pause-2-12` (`LocalTranscriptWindowPolicy.PAUSE`): cierra en una pausa
  de 400 ms (VAD sin voz **y** nivel < -52 dBFS) a partir de 2 s; tope 12 s con 1 s de solape
  deduplicado; mientras no hay voz solo guarda 0,5 s de pre-roll y no decodifica ventanas en
  silencio. "Voz" = VAD activo **o** nivel ≥ -52 dBFS, para no perder voz débil que el VAD no ve.
  Si el decodificador está ocupado, la ventana sigue creciendo hasta 12 s en vez de descartarse.
- Filtro de bucles de Whisper (`isRepetitiveWhisperText`): una palabra 5+ veces seguidas, un n-grama
  de 2–6 palabras 3+ veces seguidas, o 12+ palabras con < 35 % distintas. Sustituye al ratio de
  compresión de OpenAI (sin zlib en Kotlin común). Conserva "no, no, no" y "sí, sí, sí".
- `REFERENCE` (6/3 s) sigue siendo la política sin hablantes; las pruebas de políticas de salto fijo
  se limitan a REFERENCE/COALESCE.

### F2 · Hablantes en Whisper local
- `LocalSpeakerTracker` (Kotlin común): huella por ventana con el modelo de voz verificado
  (`speaker-embedding.onnx`, mismo hash que el perfil propio). ≥ 0,80 con el perfil → `portador`;
  0,60–0,80 → sin atribuir; resto → voz de sesión `voz-N` (unión ≥ 0,70, centroide con peso
  máximo 20, hasta 6 voces). Sin perfil, las voces se agrupan con relación `desconocido`. Menos de
  1 s de voz → sin atribuir. Las huellas ajenas viven en RAM durante la sesión y se borran al
  parar; nada se guarda ni se envía (Hermes recibe solo la etiqueta textual).
- `FaceclawLocalTranscriber.startWithSpeakers` usa `PAUSE` + atribución; la huella usa el audio sin
  acondicionar. Si falta el modelo de voz, el texto sigue llegando anónimo.
- TS: `LocalTranscription` usa hablantes en la conversación manual cuando el ajuste "Voces" lo permite
  y el modelo de voz está descargado. `LocalConversationTurns` acepta solo etiquetas `portador` o
  `voz-N`; `isLocalWindowTurn` sustituye a la exigencia de turno anónimo en tracker, canal y runtime.
- Ajuste RAM en el móvil (Conversación → Ajustes → Memoria y voz → "Voces"): distinguir voces
  (activado por defecto) e ignorar una sola voz ajena (desactivado por defecto).

### F3 · Gatekeeper
- Prompt con `speaker` además de `relation`, y criterios: pregunta de otra voz al portador o
  intercambio entre voces → favorece assist; `wait` solo si la misma voz va a continuar.
- Filtro determinista opcional `isSingleForeignVoice`: 3+ turnos de una misma voz etiquetada que no es
  el portador (TV, radio) no se evalúan; una nueva revisión con otra voz se evalúa de nuevo.
  Contador `singleVoice` en diagnósticos. Funciona con Gatekeeper ON u OFF.
- **Latencia (informe de Codex):** el proveedor llama.cpp se ejecutaba con **1 hilo**. Pasa a 3 hilos
  y el prompt del clasificador a los **6** últimos turnos (antes 12). Es la causa más probable de los
  7,7 s; **no está medido todavía** en el Pixel.

### Escucha continua sin límite
- La conversación manual (Texto y Hermes / Solo texto / Gatekeeper) ya no se cierra por tiempo:
  `sessionLimitMs` y `remainingMs` son `null`. Las sesiones diagnósticas y el registro de perfil
  conservan 2 min. Se mantiene el cierre tras más de 5 min sin voz.
- Los trabajadores nativos y el wakelock de captura reciben un límite de seguridad de 24 h
  (`NATIVE_SESSION_SAFETY_MS`) para que un fallo nunca deje un wakelock indefinido; OFF lo libera antes.

### F0 · Medida
- `scripts/asr-score.cjs`: WER (acentos cuentan como error) y atribución por solape temporal
  (cobertura, exactitud, precisión/recall del portador) por configuración, a partir de JSONL de
  referencia humana e hipótesis. Sin audio ni modelos.
- `scripts/gatekeeper-replay.cjs`: campos opcionales `speaker`/`relation` por turno y
  `fragmentSpeaker`/`fragmentRelation`; modo `--single-voice-rule`. Fixture sintético
  `tests/fixtures/gatekeeper/speakers.jsonl` (12 casos, revisión pendiente): la regla evita 2/10
  assess (TV y radio) sin bloquear ningún assist anotado.

## Verificación
- Kotlin: 301 pruebas; nuevas en `LocalSpeakerAttributionTest` (ventanas por pausa, silencio, voz
  débil, solape en el tope, decodificador ocupado, bucles, tracker, sesión etiquetada, sin modelo).
  `PreviewAnimationListenerTest` falló una vez por tiempos y pasa al repetirlo (ajeno).
- Node: 1108 pruebas, 1102 pasan; los 5 fallos son previos y ajenos (input-events, ios-app-host),
  igual que antes de empezar. 7 pruebas nuevas en `conversation-local-speakers.test.cjs` y 4 en
  `asr-score.test.cjs`. TypeScript y oxlint correctos.
- Build: AAR Kotlin, webpack producción (package.json de assets restaurado, hash igual) y Gradle
  `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a --offline` correctos.

## Instalación
- APK `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.9-speakers.apk`, SHA256
  `35beeffc23454811b55c18b3067595ab9e92f985fe409fed6cd7106bc3f30577`, firma original, 805.
- Instalada con `scripts/install-conversation-g0.ps1 -Install` (autorización del usuario): versión
  `0.8.2-es.5-conversation.s2.9-speakers` en el Pixel, actividad y proceso estables. Reversión S2.8
  (`1fcd56ce…b35f`) en `dist/conversation-g0/before-install-20261010-060145.apk`.
- Sin sesión de conversación, benchmark ni observación en gafas todavía.

## Pendiente
- Medir en el Pixel: latencia del Gatekeeper con 3 hilos y 6 turnos (benchmark local sin audio),
  calidad de `pause-2-12` frente a `ref-6-3` y atribución con clips reales (F0, `asr-score.cjs`).
- Calibrar umbrales de voz (0,80/0,60/0,70) con audio de las G2.
- Investigar el corte de la escucha al entrar el móvil en reposo: Faceclaw está exento de Doze
  (lista blanca, bucket 5) y la captura tiene wakelock; hace falta un log en vivo del momento.
- F4 (A/B/C ya existe como `voz-N`; falta medir si compensa), F5 (dirección) y modelo bilingüe:
  sin empezar.
