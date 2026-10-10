# S2.11 recuperación: ciclo de vida, red, silencio y controles (P0–P2)

Fecha: 10-10-2026. Encargo: [prompt](prompt-claude-recuperar-conversacion-2026-10-10.md) sobre el
[plan](plan-recuperacion-conversacion-asr-2026-10-10.md). Claude Code, rama `codex/conversation-detection-g0`,
HEAD `bf46b47` con los cambios locales S2.10 conservados (sin reset/stash; se trabajó encima).

## P0. Base

- 47 entradas locales S2.10 revisadas y conservadas: retirada del Gatekeeper LLM/transcriptor Pixel,
  `mechanical-gatekeeper.ts`, WebRTC VAD (`FaceclawSpeechVad.kt`, `native/vad/`), UI y pruebas.
- Línea base antes de tocar nada: 231/231 suites de conversación. Suite completa en HEAD limpio
  (worktree temporal, ya retirado): 1102/1108, **5 fallos previos ajenos** (input-events, ajustes
  del asistente iOS/Android, codec de config iOS). Los mismos 5 fallan con S2.11.
- Instalado en el Pixel según la revisión Codex: S2.10-rules/805 `35df5df6…bbf87`. No consultado de
  nuevo en esta sesión.

## P1. Qué estaba roto y qué se corrigió

| Defecto (confirmado en fuentes) | Corrección |
|---|---|
| Caída del WebSocket → `conversation.reset()` → canal disabled → `ConversationHermesRuntime.stop()` → `onStopped` apagaba la captura manual | El runtime ya no se para por el canal. Pasa a enlace `sin-red`, cancela la petición en vuelo, retira la aportación visible y descarta los turnos oídos sin red (contados como `turnsOffline`, nunca reenviados). La captura y Whisper local siguen. Se eliminó el hook `onStopped` del controller: perder Hermes (red, servidor, motor) ya no termina la escucha |
| Sin reanudación tras volver la red | Tras un `hello-ack` autenticado del **mismo destino**, con `conv/2` si la sesión es identidad-opcional, se rearma el canal. La memoria diaria solo se restaura desde el consentimiento congelado al ON y si el servidor la anuncia. El tracker se reinicia: solo contexto nuevo |
| Reanudar tras cambio de servidor/token o error de autenticación | `ConversationChannel.revoke()` (nuevo) incrementa `destination()`. Lo llaman `stop()`/`configure()` y los `ctl/error`. Una sesión armada con otro destino queda `revocado` hasta OFF, con la captura intacta |
| Callbacks de sockets antiguos | `socketGeneration` en `bridge-client.ts`: un `onTextMessage/onClosed/onFailure` de un socket sustituido se ignora |
| `coordinator.endForSilence`: cierre a los 300 000 ms sin VAD positivo | Eliminado (también `silenceSince`). El silencio ya no termina la escucha continua. El ahorro lo hace el VAD nativo, que veta ventanas antes del decode. `stopReason: "silence"` se conserva solo como valor histórico |
| Contradicción «sin límite»: la cota nativa de 24 h terminaba el worker en silencio (`status` pasaba a `inactivo` con la sesión ON) | El coordinador detecta motor local listo → `inactivo` estando ON y termina la sesión visiblemente (`expired`, «Límite técnico de 24 h…»). Los textos dicen «sin cierre por silencio (límite técnico 24 h)». No hay renovación automática |
| Textos «se detiene tras 5 min sin voz» (móvil y gafas) | Sustituidos |

## P2. Controles

- `localTranscriptionCanStart` = OFF **y** sin worker/busy nativo (antes solo `!enabled`). Los tres
  inicios y los ajustes quedan desactivados mientras el JNI drena, con el aviso «Terminando
  reconocimiento… Los botones se activan solos al terminar».
- El sondeo de UI tras OFF ya no se rinde a los 30 s: sigue cada 2 s hasta que termina el drenaje.
  Nunca arranca nada.
- Nueva etiqueta `conversationStartNotice` **en la tarjeta de inicio (visible en OFF)**: muestra el
  motivo de un inicio rechazado, el cierre en curso o el error/caducidad de la última sesión. Antes
  vivía en la tarjeta exclusiva de ON y un toque rechazado parecía no hacer nada.
- Los inicios llaman a `setManualConversationEnabled(true)` y la parada a `(false)`: ya no dependen de
  un conmutador. Detener e iniciar otro modo funciona desde la misma pantalla (prueba con 20
  alternancias).
- Estado en ON: «sin conexión con Hermes; la transcripción continúa…», «Hermes desconectado en esta
  sesión…», o «Transcripción activa · Hermes detenido (motivo)» cuando el runtime para y la captura
  sigue.
- Botón «Escuchar con Hermes sin límite de filtros» → «Escuchar con Hermes sin reducir llamadas».
  Leyenda: las tres opciones escuchan de forma continua.

## Pruebas

Nuevas o reescritas (las de comportamiento antiguo se adaptaron al contrato nuevo):

- `conversation-hermes`: 10 cortes de socket sin parar la sesión, cada reconexión envía solo contexto
  nuevo y ningún texto oído sin red; respuesta previa al corte nunca llega a lentes; OFF durante el
  corte nunca revive; destino revocado no se rearma; identidad opcional solo con `conv/2`.
- `conversation-bridge`: pérdida conserva destino; stop/ctl error lo revocan; callbacks de socket
  sustituido ignorados.
- `conversation-detection`: 20 min de silencio siguen ON y aceptan audio; pausas de prioridad y
  huecos tampoco cierran; cota nativa termina visiblemente; motor nunca listo no se confunde.
- `conversation-phone-ui`: drenaje >30 s sin congelar ni autoarrancar; aviso visible en OFF; reinicio
  y 20 alternancias desde la misma vista.

Resultados: conversación 241/241; Node completo 1089/1095 (los 5 previos ajenos + 1 omitida).
TypeScript de la app y oxlint correctos. Sin cambios Kotlin/nativos.

## Build

Receta `.tools/s2.11-build.ps1` (entorno `s2.10-env.ps1`; `ns prepare android --release --env.production`;
Gradle `--offline assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a
-x prepareFaceclawNativeLibs -x prepareFaceclawLlama`; firma con `install-conversation-g0.ps1` **sin**
`-Install`). Build y lintVital correctos.

- APK candidata `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.11-recovery.apk`,
  `0.8.2-es.5-conversation.s2.11-recovery`/805, firma original verificada por el script, SHA-256
  `28d24f8a8304dc7d8ab217e45d763db62b0311b40c6905e5c4027adc2d34517e`.
- Las 8 `.so` son byte idénticas a S2.10. El bundle contiene los textos nuevos y ya no el cierre por
  5 min.
- **Instalada 10-10-2026** con autorización del usuario: OFF previo (sin wakelock de Faceclaw), `install-conversation-g0.ps1 -Install`, APK extraída idéntica (`28d24f8a…`), proceso estable. Reversión S2.10: `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-install-20261010-124815.apk` (`35df5df6…`).
- STYLE de Jarvis autorizado pero bloqueado por el clasificador de Claude: ver `prompt-codex-desplegar-style-jarvis-2026-10-10.md`.

## Pendiente (P3–P7, no hecho en esta entrega)

- **Requiere el móvil:** prueba física de cortes (Wi-Fi↔datos, Tailscale caído/recuperado, por
  separado; no solo modo avión), pantalla apagada, PTT y estuche. Corpus consentido y banco
  VAD ON/OFF sobre el mismo PCM, `pause` desacoplado de «Voces».
- **Requiere autorización (Jarvis):** desplegar solo el `STYLE` participativo. Diff comprobado:
  `conversation.py` local y copia desplegada solo difieren en `STYLE` (más finales de línea CRLF en
  la copia de auditoría).
- No implementado: iniciar ON con Hermes caído y armarlo al conectar (hoy se rechaza con motivo
  visible); renovación de la cota nativa de 24 h; línea «No hay ayudas» por causa (P3).
- «Voces» sigue acoplado a PAUSE/REFERENCE (P3/P4).

## Prueba física S2.11, 10-10-2026 15:00–15:08 (usuario con gafas, interior, Whisper local)

Coordinada con el usuario. Modo «Escuchar con Hermes sin reducir llamadas». STYLE participativo ya
desplegado por Codex (`417dc5c9…`, comprobado por SSH de solo lectura). Observación: journal de Jarvis
(solo eventos/outcomes, sin texto) y estado de la UI por `uiautomator` (sin audio).

- **Línea base (Wi-Fi):** de 15:00:18 a 15:04:53, ~28 evaluaciones; assess `tema`/`incierto`, assist
  con varios `mensaje` (≥6) y `nada`, latencias de 0,8 a 3,4 s. Aportaciones también sin pregunta
  explícita. El usuario confirma que recibe respuestas y que la decodificación va «muy bien, un pelín
  lenta».
- **Caso A, Wi-Fi → LTE:** el usuario pasó a datos móviles (LTE con Tailscale activo, comprobado en
  `dumpsys connectivity`). **Sin ningún corte del WebSocket** en el journal y Hermes sin pausa:
  Tailscale mantuvo la conexión. No ejercita la ruta de reconexión.
- **Caso B, Tailscale OFF/ON:** cierre en el servidor a las 15:05:36. El móvil siguió con «Escucha
  activa · Hermes»/«Detener escucha», texto nuevo recibido e historial de la sesión conservado (con
  S2.10 la captura habría pasado a OFF). Reconexión automática a las 15:07:58 al restaurar Tailscale;
  en la misma sesión, `assess → tema` a las 15:08:10 y `assist → mensaje` a las 15:08:12.
- No se pudo leer la línea «sin conexión con Hermes» (fuera de la vista volcada); está pendiente
  confirmarla visualmente.
- Hipótesis del usuario: el ruido de calle o de fondo influía en la mala transcripción anterior.
  **No demostrada**: pendiente la matriz interior/exterior × red estable/cambio de red y el banco
  sobre el mismo audio (P3).
- Pendientes de esta fase: pantalla apagada, prioridad PTT, gafas en estuche, exterior.
- **LTE → Wi-Fi (15:09):** sin corte del socket; Hermes sin pausa.
- **Pantalla apagada y móvil bloqueado (desde 15:10:04):** escucha y Hermes siguen. Lado servidor:
  pantalla encendida 28 evaluaciones/7 mensajes/7 nada, p50 1,2 s (5,6 min); tras reconectar
  14/3/8, p50 1,4 s (2,1 min); pantalla apagada 17/6/5, p50 1,2 s (3,6 min). El usuario tiene la
  impresión, que él mismo califica de suposición, de que va algo más lento o se abstiene más; los
  datos del servidor no lo muestran. La latencia de decode del móvil y la entrega en lentes con la
  pantalla apagada siguen sin medir (P3).
- **Calor (15:15, el usuario nota el móvil más caliente):** cargando por USB; piel virtual
  ~33–34 °C, batería 30,6–36,7 °C según el sensor; estado térmico global 1 (leve), sin
  limitación. Una muestra de `top`: Faceclaw ~24–30 % de una CPU de 8 núcleos, casi todo en el
  **hilo principal JS/UI** (TID = PID 31366, ~30 %), no en Whisper (ráfagas). Una sola muestra, no
  concluyente. Siguiente paso (P4, antes del banco de modelos): 10–15 min **desenchufado**,
  CPU por hilo + térmica cada 30 s, comparando pantalla encendida/apagada y escucha/OFF.
