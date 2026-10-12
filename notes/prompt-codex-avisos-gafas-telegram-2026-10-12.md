# Continuación: avisos de Hermes por gafas o Telegram

Continúa este trabajo desde `E:\projects\faceclaw-es`. El usuario pidió una parada controlada el 12-10-2026 porque quedaba un 7 % de uso de Codex. No hay objetivo automático ni monitor programado. Retoma únicamente cuando el usuario abra este prompt y solicite continuar.

## Objetivo autorizado

Hermes debe poder contactar con el usuario sin una pregunta previa para comunicar un resultado, bloqueo o evento pertinente. Este incremento SOLO prepara la entrega: gafas Even G2 si están puestas y disponibles; bot personal de Telegram si están quitadas, desconectadas, cargando, con presencia desconocida o sin confirmación de entrega. No aumenta por sí mismo la iniciativa ni crea nuevas tareas de vigilancia. Las respuestas normales del bot permanecen en Telegram. Respetar una petición expresa de otro canal.

La memoria/Letta viene después. El usuario permite integrarla si conviene, pero aquí se acordó cerrar primero el canal. No instalar Letta ni cambiar memoria/proveedor/modelo para resolver la entrega.

Lee `AGENTS.md`, `notes/continuidad-entre-pcs.md` y `C:\Users\danie\.codex\memories\faceclaw.md`. Hay antecedentes históricos superados: contrasta el estado vigente. No delegar salvo autorización nueva o instrucciones aplicables.

## Estado al detenerse — comprobado

- Rama `claude/faceclaw-0.8.3-conversation`. Cambios locales sin commit/push. Antes del trabajo ya había cambios ajenos en `notes/continuidad-entre-pcs.md` y el archivo no seguido `notes/faceclaw-wear-0.8.3-2026-10-11.md`; conservarlos.
- Pixel USB `61161FDCG0013L`, modelo Pixel 10 Pro Fold. Cierre por ADB: **Conectado / Escucha apagada**, visible en `.tools/notifications-20261012/stop-ui.xml`. No se inició micrófono, captura ni conversación. No se cambió APK, firmware, ajustes ni reloj. Reserva propia `.tools/notifications-pixel-reservation` eliminada y ausencia comprobada.
- El usuario conectó el móvil y confirmó que dejaba la escucha apagada para instalar/probar. Antes de una futura instalación/reinicio, comprobar nuevamente OFF, reservas y respaldos; la disponibilidad actual no se hereda.
- Jarvis SSH `dani@192.168.0.234`, bridge `/home/dani/faceclaw-hermes-bridge`, Hermes `/home/dani/.hermes/hermes-agent`. Ambos servicios **faceclaw-hermes.service y hermes-gateway.service activos**; no desplegados ni reiniciados en este trabajo.
- SHA-256 remoto de `bridge.py`, comprobado al cierre: `e285abf63f838be762c4bee221289947e04ab9a517705c0a7ec7e115961adbb5`. Copia pública inicial en `.tools/notifications-20261012/bridge-production.py`. El diff con la fuente local solo mostraba las incorporaciones de notificaciones.
- Hay staging remoto `/home/dani/faceclaw-hermes-bridge/candidate-notifications-20261012/` con módulo, plugin, tests y comprobador. **No es una candidata final ni está plenamente sincronizado con los últimos cambios locales.** No desplegar ese directorio a ciegas.
- No quedan comprobadores remotos en ejecución. Los ensayos iniciales de descubrimiento intentaron preparar dependencias de un perfil temporal; se interrumpieron y se añadió un bypass de `venv_sync.prepare_launch` SOLO al comprobador aislado. No llevar ese bypass a producción.
- Comprobación de configuración tras cargar el dotenv oficial: Telegram habilitado, token presente y home-channel presente. No se imprimieron valores. Hay nueve trabajos programados; NO modificados ni inspeccionados sus mensajes. No cambiar todos sus destinos automáticamente: algunos son locales o pueden tener destinatarios específicos.

## Implementación local preparada, incompleta

1. `app/assistant/notification-channel.ts`: capacidad `notify/1`, presencia al negociar/cambiar y cada 15 s, entrega/acuse/cancelación, filtro local, máximo 240 caracteres para lentes, IDs recientes y espera máxima 5 s. Sin texto de conversación ni llamadas LLM.
2. `app/assistant/bridge-client.ts`: integra el canal, negociación y limpieza en desconexión/stop/error. Compatible con servidores sin `notify/1`.
3. `app/g2/dashboard-controller.ts`: usa `ON_HEAD/OFF_HEAD`, conexión/carga, disponibilidad y ajuste existente `assistant.allowProactive`. Consulta presencia también fuera de conversación cuando el bridge está conectado; valor de uso en cabeza caduca a los 45 s. Captura confirmación de la notificación antes de pintar y la ejecuta solo tras `sent` del frame BLE con el mismo display y fuera de preview.
4. `app/ui/shell/notification-delivery.ts`: overlay independiente reutilizando `HermesContributionLayer`, 12 s, sin robar interacciones explícitas, confirmación ligada a la capa visible. Revisar bien ciclo de vida, cancelación y retirada.
5. `integrations/hermes/notification_delivery.py`: router sin LLM, estado ligado al socket, caducidad 40 s, espera BLE 4 s, fallback usando `send_message_tool` oficial hacia home Telegram. Endpoint HTTP **solo 127.0.0.1:8792**, Bearer con token privado existente del bridge. Idempotencia en RAM 10 min/máximo 256 IDs; no es memoria de conversaciones. No publica tokens ni texto en logs.
6. `integrations/hermes/bridge.py`: negocia `notify/1`, recibe presencia/acuse y levanta endpoint local. No cambiar `private.json` ni credenciales.
7. `integrations/hermes/notification-plugin/`: plugin general Hermes sin modificar core; canal `faceclaw:owner`, herramienta `notify_user`, adaptador, sender independiente para cron y preferencia estática en prompts de sesiones nuevas. Config de plataforma exige `extra.bridge_secret_file` con ruta absoluta del privado local. Si conexión al endpoint es rechazada, intenta Telegram; un timeout ambiguo devuelve error sin reenviar para reducir duplicados.
8. `App_Resources/Android/app.gradle`: versionName preparada `0.8.3-es.6-conversation.s2.14-notifications`, conserva versionCode 805. `scripts/install-conversation-g0.ps1`: añade esa versión a ValidateSet y al default. **Todavía no hay APK nueva compilada ni firmada.**

## Pruebas realizadas y fallos pendientes

- Typecheck de app pasó antes de los últimos ajustes menores de temporizador; repetir al retomar. Typecheck de tests con el nuevo módulo pasó. Oxlint de los cuatro archivos TS principales pasó antes de esos ajustes.
- Última ejecución dirigida: **14/14 Node** (`notification-channel`, `conversation-bridge`, `conversation-hermes-frame`). Comprueba rechazo, acuses, retirada, sockets antiguos y compatibilidad.
- **4/4 Python** aisladas pasaron en Windows con permisos para socket local: router, estado desconocido/antiguo, socket viejo, autenticación HTTP y duplicados concurrentes. Telegram simulado; **ningún aviso real enviado**.
- `integrations/hermes/check_notifications_runtime.py` prueba descubrimiento en un perfil temporal. Primero corrigió activación con `plugins.enabled: [faceclaw-notifications]` (NO basta `plugins.entries...enabled`). El último fallo es **KeyError: 'platform'** en `HomeChannel.from_dict`: el YAML sintético debe incluir `home_channel.platform: faceclaw`. El plugin ya había sido descubierto en esa ejecución. Corregir y ejecutar nuevamente; no afirmar integración real validada todavía.
- El comprobador usa `registry.get_entry`, no `get_tool`. `BasePlatformAdapter` usa `self.config` y `_running`; plugin corregido en ese punto.
- Intento de build mediante `.tools/notifications-20261012/build.ps1` falló EN PREPARE: el sandbox redirigió LOCALAPPDATA y no encontró NativeScript en `npm-cache/_npx/...`. No se llegó a Gradle ni a firma. Usar rutas comprobadas de usuario o ejecución elevada autorizada. El script deriva de `.tools/u083-build.ps1`, pero está adaptado a S2.14 y no instala.
- La suite Python que usa sockets no avanza dentro del sandbox restringido. Se interrumpió ese proceso; con permisos de socket completó en 0,162 s. No confundir ese bloqueo con fallo del router.

## Próximos pasos concretos

1. Revisar el diff y completar la integración antes de instalar. Corregir el YAML sintético y probar el plugin por descubrimiento REAL, sender, `notify_user`, adaptador y cron con un perfil temporal, secretos sintéticos y Telegram simulado. No alterar el Hermes real para hacer pasar tests.
2. Revisar posibles fallos: excepciones del presenter/send, cierre de overlay antes del acuse, timeout/cancel en ambos extremos, reanudación de socket y caducidad, desactivación del ajuste proactivo, reloj de presencia (ahora usa Date.now: valorar reloj monotónico), entrega de textos largos y ausencia de filtraciones en errores. No prometer entrega exactamente una vez: una caída tras BLE y antes del acuse puede duplicar el fallback.
3. Añadir pruebas del presenter real y del acuse en `renderShell`; las existentes de frame siguen comprobando conversación, con la captura de notificación simulada como null. Probar integración WebSocket auténtica del bridge con teléfono simulado sin sustituir la conexión real del usuario.
4. Repetir typecheck/lint y pruebas Python pertinentes del bridge/conversación. Revisar dependencias/manifest/config del plugin contra la versión INSTALADA, que es Hermes `1d6b2786e2` más modificaciones ajenas. Esos cambios ajenos están en agent/agent_runtime_helpers.py, cron/scheduler_delivery.py, gateway/platforms/api_server*.py, gateway/run_turn_runner.py y archivos no seguidos de herramientas/fast_path; no sobrescribirlos.
5. Preparar deploy reversible con hashes actuales, backups y escritura atómica. La config privada de Hermes se puede editar de forma estructurada localmente sin imprimir secretos: preservar claves existentes, añadir plugin a `plugins.enabled` y plataforma faceclaw habilitada con home `platform: faceclaw`, `chat_id: owner`, nombre y `extra.bridge_secret_file`. Validar antes de reiniciar. No crear credenciales nuevas.
6. Compilar y firmar APK con la firma ORIGINAL `.tools/signing/faceclaw-es.jks` y `store.password`; no imprimir, generar ni sustituir claves. Conservar las ocho bibliotecas nativas del build vigente si no hay cambios nativos. Respaldar APK y ajustes privados frescos, verificar OFF y usar `adb install -r`; extraer APK instalada para comparar hash y comprobar todos los ajustes/perfil.
7. Desplegar router/bridge/plugin solo tras revisión, y comprobar ambos servicios. La herramienta/preferencia nueva puede requerir sesión nueva de Hermes; no borrar conversaciones existentes ni alterar su prompt en caliente para forzarlo. Determinar qué reinicio/reload soporta esta versión y hacerlo de forma controlada.
8. Prueba física breve coordinada: gafas puestas → aviso visible; quitadas/estuche → bot; desconexión → bot; reponer gafas → gafas. No activar escucha ni hacer inferencias nuevas para probar transporte. El usuario autorizó este canal, pero no enviar mensajes a terceros ni grupos. Mandar únicamente al bot personal ya configurado. No dar la prueba por superada con solo el acuse BLE: pedir observación real.
9. Documentar resultados y reversión, actualizar continuidad/NAS cuando corresponda. No marcar el incremento como operativo hasta instalar, desplegar y observar la entrega. La memoria/Letta sigue como siguiente fase independiente.

## Comandos útiles

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc -p tests/tsconfig.json
node --test tests/notification-channel.test.cjs tests/conversation-bridge.test.cjs tests/conversation-hermes-frame.test.cjs
python -m unittest discover -v -s integrations/hermes -p test_notification_delivery.py
```

En Jarvis el intérprete administrado observado es `/home/dani/.hermes/tools/python-3.14.7+20260901-linux-x64/bin/python3`. `~/.local/bin/hermes --print-runtime-command` devuelve el comando vigente; no asumir `.venv/bin/python`. `run_bridge.py` importa `hermes_bootstrap` para activar dependencias.

La carpeta `.tools/notifications-20261012/` conserva baseline público, XML de UI, script de build y log. Está fuera de Git. No subir `.tools`, APK, privados, perfil, tokens, bases de memoria ni ajustes exportados.
