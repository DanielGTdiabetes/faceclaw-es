# Avisos de Hermes por gafas o Telegram (S2.14) — 12-10-2026

Continuación de [la parada controlada de Codex](prompt-codex-avisos-gafas-telegram-2026-10-12.md), retomada por
Claude Code con autorización del usuario. Codex parado manualmente por el usuario antes de seguir; sus 18 archivos
se revisaron en su versión final (última escritura 16:31:56, anterior a esta sesión).

**Estado: operativo, instalado, desplegado y comprobado físicamente por el usuario.**

## Qué hace

Hermes puede avisar al usuario sin pregunta previa (resultado, bloqueo o evento pertinente) con `notify_user` o
`send_message` a `faceclaw:owner`, y en cron con `deliver=faceclaw:owner`. El router del bridge decide:

- gafas G2 puestas, conectadas, sin carga, disponibles (sin preview ni bloqueo) y `assistant.allowProactive`
  activo, presencia fresca (<40 s) → overlay de 12 s en lentes; éxito solo tras el envío BLE completo del frame
  que lo contiene (`sent`);
- en cualquier otro caso, texto >240 caracteres, rechazo, timeout de 4 s o cancelación → bot personal de Telegram
  (home channel ya configurado);
- bridge caído (conexión rechazada) → el plugin manda a Telegram directamente; timeout ambiguo → error, sin
  reenvío.

No hay llamadas LLM, micrófono, memoria persistente ni vigilancia nueva. Entrega «al menos una vez» en el caso
límite: una caída tras el BLE y antes del acuse puede duplicar el aviso por Telegram.

## Cambios respecto a lo que dejó Codex

- **Plugin**: `faceclaw:owner` no se resolvía en el Hermes instalado (plugin sin `parse_target_ref_fn` → error).
  Añadidos `parse_target_ref_fn`/`validate_target_ref_fn` (solo `owner`) y `extra.bridge_port` opcional.
- **Gafas**: `shell.presentIndependentOverlay` retira en silencio un overlay previo; un aviso podía tapar una
  aportación de conversación visible. Nuevo `shell.hasIndependentOverlay()`; el aviso se rechaza (→ Telegram).
- **Bridge**: puerto del endpoint configurable con `FACECLAW_NOTIFY_PORT` (por defecto 8792, solo 127.0.0.1).
- **Comprobador** (`check_notifications_runtime.py`): reescrito como prueba de extremo a extremo en `HERMES_HOME`
  temporal (YAML con `home_channel.platform`, que era el `KeyError` pendiente).
- **Pruebas nuevas**: `tests/notification-delivery.test.cjs` (presenter real), acuse de aviso en
  `conversation-hermes-frame`, arnés de `conversation-presence` completado + caso de seguimiento de uso, y
  `BridgeWebSocketTests` (Bridge real por WebSocket con teléfono simulado).

## Pruebas

- Windows: `tsc` app y pruebas correctos; `lint.sh` correcto; `node --test tests/*.test.cjs` **1190 correctas,
  5 fallos, 1 omitida / 1196**. Los 5 fallos son exactamente los previos documentados en
  [integración 0.8.3](faceclaw-0.8.3-integration-2026-10-11.md) (2 del mock de entrada del shell, ajustes
  iOS/Android, códec iOS por permisos POSIX). Python: avisos 5/5, `test_bridge.py`, `test_conversation_bridge`.
- Jarvis, intérprete administrado y perfil temporal (Telegram interceptado en `_send_telegram`): 9/9
  comprobaciones (notify_user→gafas, →Telegram quitadas, sin móvil, home `faceclaw`, otro chat rechazado,
  texto largo, cron standalone + adaptador, token incorrecto, bridge caído). `hermes plugins validate`: correcto.
  Ediciones de config ensayadas con `hermes config set` en un home temporal.

## Instalación móvil

- Antes: Conectado / Escucha apagada, sin wakelock Faceclaw. Reserva `.tools/notifications-pixel-reservation`
  creada y retirada.
- APK `0.8.3-es.6-conversation.s2.14-notifications`, código 805, firma original
  (`57aaa887…c435`), SHA-256 **`b69cc0106db90ac6a4f340a7c2fc7f3c2ffd3e59810b8eecd0f4e2325713c342`**; ocho
  nativas idénticas a S2.13. Build con `.tools/notifications-20261012/build.ps1` (NativeScript en la ruta real de
  usuario, sin sandbox).
- `install -r` correcto; APK extraída idéntica; Conectado; ajustes privados **42 entradas, mismo SHA-256 antes y
  después** (`.tools/s2.14-export-settings.ps1`, carpeta privada `.tools/s2.14-notifications-private/`).
- **Reversión**: `dist/conversation-g0/before-install-20261012-145142.apk` (`b8f4d331…019a`, S2.13), con OFF:
  `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-install-20261012-145142.apk`.
- Con escucha OFF, el móvil consulta ahora el estado de uso cada 15 s mientras el bridge externo está conectado
  y `allowProactive` activo (3 mensajes BLE pequeños por consulta).

## Despliegue Jarvis

`deploy_jarvis.sh install|restart|rollback` (copia en `.tools/notifications-20261012/` y en
`candidate-notifications-20261012b/`). El staging antiguo `candidate-notifications-20261012/` queda obsoleto.

- Respaldo `/home/dani/faceclaw-hermes-bridge/rollback-20261012-notifications/` (`bridge.py` de producción
  `e285abf6…bb5` y `config.yaml`, con `SHA256SUMS` verificados).
- Nuevo `bridge.py` `113d4fdc…`, `notification_delivery.py`, plugin en
  `/home/dani/.hermes/plugins/faceclaw-notifications/`. Config: `plugins.enabled += faceclaw-notifications`,
  `platforms.faceclaw` (enabled, home `platform: faceclaw` / `chat_id: owner` / «Avisos personales»,
  `extra.bridge_secret_file` = privado existente del bridge). Sin credenciales nuevas; Telegram sin tocar.
- Reiniciados `faceclaw-hermes` (16:53:46) y `hermes-gateway` (16:54:08); Telegram reconectado; móvil
  reconectado; `127.0.0.1:8792` solo loopback; `/status` → gafas disponibles. El aviso `playwright-browser` es
  previo. `notify_user` y la preferencia de prompt aplican a sesiones nuevas de Hermes.
- **Reversión**: `sh /home/dani/faceclaw-hermes-bridge/candidate-notifications-20261012b/deploy_jarvis.sh rollback`.
- Modificación ajena previa observada y no tocada: `cron/scheduler_delivery.py::_mirror_to_glasses` replica
  entregas cron de Telegram a un puente G1 en `localhost:3001`.

## Prueba física (16:55–17:00, usuario)

Avisos enviados al endpoint local de Jarvis; solo al bot personal, sin escucha activada.

| # | Situación | Canal elegido | Observación del usuario |
|---|-----------|---------------|-------------------------|
| 1 | Gafas puestas | gafas | visto en las lentes |
| 2 | Recién quitadas (OFF_HEAD 16:57:32, a la vez que el envío) | Telegram (el móvil rechazó) | llegó a Telegram |
| 3 | Gafas desconectadas | Telegram (directo) | llegó a Telegram |
| 4 | Reconectadas y puestas | gafas | visto en las lentes |

Script de prueba y perfil temporal sintético de Codex eliminados de `/tmp` en Jarvis. Móvil desconectado de USB
por el usuario al final; estado final de escucha no releído por ADB (no se activó en ningún momento).

## Pendiente

- Copia de esta nota al NAS.
- Memoria/Letta: fase siguiente independiente.
- Opcional: valorar reloj monotónico para la caducidad de presencia en el móvil (ahora `Date.now`).
