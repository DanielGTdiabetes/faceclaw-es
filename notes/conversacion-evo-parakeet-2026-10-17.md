# Conversación con Parakeet del EVO-X2 (S2.15.2) — 17/10/2026

Trabajo de Claude Code en la rama `claude/even-conversation` (worktree `E:\projects\faceclaw-es-even-conv`),
creada desde `fa5380f` con los cambios sin commit de S2.15.1 (ubicación precisa, instalada) copiados tal cual.
La carpeta principal y el worktree `faceclaw-es-location` no se han tocado.

## Problema

El usuario creía que Conversación ya usaba Parakeet. Comprobado por SSH en even: en la sesión de las 09:42–09:47
Hermes recibió 23 turnos de Conversación y `even-asr-parakeet` no transcribió ningún segmento (último a las 09:14,
de Hey Even). El proveedor `even` solo estaba implementado en Hey Even/PTT; Conversación seguía con Whisper en el
móvil.

## Cambio

Conversación conserva en el móvil la captura, las ventanas cortadas en pausas, el acondicionado de nivel y la
atribución de voces (perfil propio + `voz-N` de la sesión). Solo cambia quién transcribe cada ventana:

- Kotlin `EvoRemoteTranscriptDecoder` (implementa `LocalTranscriptDecoder`): cada ventana abre un WebSocket corto
  a la pasarela de even (misma URL y clave que Hey Even), envía `session.update`, el PCM16 y `commit`, espera
  `...transcription.completed` (10 s máx.) y cierra. Así la sesión única de la pasarela solo se ocupa mientras se
  decodifica una ventana y Hey Even puede usarla entre medias. Un 503 (pasarela ocupada) se reintenta una vez a
  los 400 ms; cualquier otro fallo cuenta como error de esa ventana, sin reserva local ni audio retenido.
  Parakeet no informa idioma: el texto se etiqueta como español para los filtros de la sesión.
- `FaceclawLocalTranscriber.startRemote(language, url, key, maxMs, speakers)`: mismo `LocalTranscriptSession`,
  política PAUSE con voces o REFERENCE sin ellas.
- TypeScript: motor nuevo `evo-parakeet` («Parakeet · EVO-X2 · voces opcionales») en el selector del móvil y de
  las gafas, **por defecto** (la elección sigue siendo solo RAM). Listo si `voice.evenAsrUrl`/`voice.evenAsrKey`
  son válidos; si no, el inicio se rechaza con «Configura la dirección y la clave del EVO-X2 en Ajustes > Voz».
  Sin descargas para este motor. Los turnos llevan `engine: "evo-parakeet"` y pasan los mismos filtros locales
  hacia Hermes.
- Versión `0.8.3-es.6-conversation.s2.15.2-evo-conversation`, código 805; añadida al `ValidateSet` del script de firma.

## Pruebas

- Node `tests/*.test.cjs`: **1223, 1222 correctas, 0 fallos, 1 omitida** (prueba nueva: el motor EVO usa el
  extremo de Hey Even, mantiene las voces del móvil y nunca carga Whisper). `tsc` de app y pruebas, oxlint correctos.
- El decodificador remoto vive en `App_Resources` (solo Android): lo valida la compilación release, no las
  pruebas Kotlin de host. Falta la prueba física con voz real.

## APK

- `dist/conversation-g0/faceclaw-0.8.3-es.6-conversation.s2.15.2-evo-conversation.apk` (worktree), SHA-256
  **`237f07176aa38405d3a1658dd0b80729cf7ef4886dd18e1df87ae89f1ca6a705`**; código 805; firmada con la identidad
  original por `scripts/install-conversation-g0.ps1`. Release + `lintVitalRelease` correctos; dex con
  `EvoRemoteTranscriptDecoder`; `assets/app/package.json` presente.
- Build: `.tools/evo-conversation-20261017/build.ps1` (copia del de S2.15.1 con rutas de este worktree;
  `node_modules` enlazados a la carpeta principal salvo `@faceclaw/kotlin` → `native/kotlin/plugin` de este
  worktree; firma por enlace a `.tools/signing` de la principal).

## Instalación — 17/10/2026, 10:00

El usuario conectó el Pixel por USB para esta instalación («pixel conectado»); sin actividad de Conversación en
el puente durante los 5 minutos previos.

- Antes: Pixel `61161FDCG0013L`, S2.15.1 `0.8.3-es.6-conversation.s2.15.1-precise-location`.
- Reversión: `dist/conversation-g0/before-install-evo-conversation-20261017.apk` del worktree, extraída del móvil,
  SHA-256 `58951574…2a37` (= S2.15.1). Volver con
  `adb -s 61161FDCG0013L install -r <worktree>/dist/conversation-g0/before-install-evo-conversation-20261017.apk`.
- `adb install -r` correcto, sin desinstalar; `base.apk` instalada = `237f0717…a6a705`; primera instalación
  conservada (`2026-10-02 09:39:05`). La app abre y sigue viva; logcat sin errores fatales.
- Ajustes privados (`.tools/evo-conversation-export-settings.ps1`, carpeta privada `.tools/evo-conversation-private/`):
  **46 entradas, mismo SHA-256 antes y después**; `voice.evenAsrUrl` presente.

## Pendiente

Prueba física: Conversación ON con Parakeet (por defecto tras la actualización) y otra persona hablando.
Comprobar en even `journalctl --user -u even-asr-parakeet` (segmentos durante la conversación) y en el móvil que
los turnos llegan con `voz-N`/`portador`. Medir latencia por ventana y si Hey Even recibe algún 503 durante
Conversación.

## S2.15.3: las voces locales nunca se activaban (fallo desde S2.9) — 17/10/2026

Prueba de las 10:02: 28 ventanas fijas de 6 s (`ref-6-3`), sin voces. Con el registro del puente (10:10) se
confirmó que la voz de la otra persona sí llega a Parakeet («sí, ahora sí», usuario), pero todos los turnos van
como `? · desconocido`.

Causa: S2.9 (`48dc31a`) añadió la atribución de voces en `LocalTranscription.start(language, profileAssociation, …)`,
pero `SonioxConversationTranscription.startLocal` (el envoltorio que usa la app) seguía llamando
`this.local.start(this.language, false, this.maxMs)`. Por eso Conversación manual nunca pidió voces, con Whisper
ni con Parakeet, aunque «Voces: distinguir» estuviera activado.

Corrección: el envoltorio guarda `profileAssociation` del inicio (`localSpeakers`) y lo pasa al motor local,
también en la vuelta a local tras un fallo de Soniox. Las voces siguen exigiendo «Voces» activado y el modelo
`speaker-embedding` descargado; sin él las ventanas siguen siendo fijas y anónimas.
Prueba de regresión en `tests/soniox-conversation.test.cjs`. Node 1224: 1223 correctas, 0 fallos, 1 omitida;
`tsc` y oxlint correctos. Versión `0.8.3-es.6-conversation.s2.15.3-evo-voices`.

Cómo comprobarlo en even: con voces activas, `even-asr-parakeet` registra segmentos de duración variable
(política `pause-2-12`, 2–12 s) en lugar de `audio_s=6.00` fijos, y `~/faceclaw-conversaciones/` muestra `voz-N`
o `portador` en vez de `?`.

## S2.15.3 instalada y probada — 17/10/2026, 10:15–10:29

Usuario autorizó «instalar S2.15.3 con install -r» (Pixel por USB, Conversación apagada). APK
`26d0b337c8af7a34179cb7ba2a4fcc695a3d48d22a12ce6ca56521142c1a0e61`, instalada = artefacto, primera instalación
conservada; bundle con `this.local.start(this.language,this.localSpeakers,this.maxMs)`. Ajustes: 46 entradas;
solo cambian las 4 claves `compass.declination.*` (caché que la app recalcula con la ubicación al abrir).
Reversión a S2.15.2: `dist/conversation-g0/faceclaw-0.8.3-es.6-conversation.s2.15.2-evo-conversation.apk`.

Resultado (10:28–10:29): ventanas de 2,0–5,7 s (`pause-2-12`), inferencia 0,02–0,06 s, y turnos con voz:
`voz-1 · otro` «¿El coche dónde lo tienes, Marta?», `voz-4 · otro` (dos frases de la misma persona), etc.
Hermes responde con contexto. Pendiente:
- Con dos personas aparecen hasta `voz-5`: el agrupamiento separa de más.
- Nadie sale como `portador`: no hay perfil de voz propio guardado en el móvil.
- Ventanas cortas o con ruido siguen como `?` y Parakeet inventa alguna frase en inglés («Oh yeah»).

## S2.15.4: herramientas del móvil en Conversación — 17/10/2026, 14:46

`bridge-client.ts`: `isTurnActive` también es verdadero con la Conversación activada, para que el agente único
(puente en modo `full`) pueda usar la ubicación y demás herramientas del móvil en escucha continua. Prueba en
`tests/conversation-bridge.test.cjs`. Node 1225: 1224 correctas, 0 fallos, 1 omitida; `tsc` y oxlint correctos.
APK `f59153e39e9cdfcc38d82c73fca9204457c62a4c18eba6582fb4533e596227c8`, instalada con `install -r` autorizado;
46 ajustes idénticos. Reversión a S2.15.3: `dist/conversation-g0/faceclaw-0.8.3-es.6-conversation.s2.15.3-evo-voices.apk`.
