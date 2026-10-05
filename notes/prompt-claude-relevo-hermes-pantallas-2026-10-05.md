# Relevo a Claude: mensajes Hermes no visibles en las gafas

El usuario pide que Claude tome el relevo porque Codex está al límite de uso. Quiere resolver por qué no ve las aportaciones Hermes en las gafas, continuar con la misma forma de trabajo y publicar el avance en GitHub y continuidad. Este prompt está preparado para entregarlo a Claude; Codex no lo envió automáticamente ni inició otra tarea.

## Empieza aquí

Trabaja en `D:\Proyectos\Faceclaw_spanish`, Windows/PowerShell, rama `codex/conversation-detection-g0`. Lee `AGENTS.md` y estos archivos en este orden:

1. `notes/continuidad-s2.6-manual-context-2026-10-05.md`: continuidad principal, con estados históricos debajo de las actualizaciones recientes.
2. Este prompt y `notes/hermes-preguntas-participacion-2026-10-05.md`: criterio desplegado, reversión y revisión de encendido.
3. `notes/diagnostico-hermes-sin-aportaciones-2026-10-05.md`: primera prueba anterior al cambio de criterio. No confundirla con la prueba nueva descrita aquí.

No empieces por reinstalar, reconstruir o repetir auditorías/ensayos antiguos. Conserva el checkout y todos los cambios locales. La versión instalada es S2.6.1 y el puente ya está actualizado.

## Evidencia nueva decisiva, posterior al cambio de criterio

Usuario: «no se ve mensajes en la pantalla, está conectado el móvil». ADB confirma Pixel `61161FDCG0013L`, proceso Faceclaw25335, Conectado y OFF. Se abrieron Opciones → Métricas tras OFF, sin iniciar otra sesión.

Última sesión, epoch21:

- Soniox:134500ms enviados,35turnos,906tokens finales,2etiquetas,0errores/fallbacks/invalidez temporal. Backlog340ms; primer token718ms/primer final6266ms.
- Hermes: `identidad-opcional`,35turnos aceptados/0ignorados,4candidatas,4clasificaciones/18asistencias,22solicitudes.3temas/1incierto, **8mensajes y8entregas al controlador**,2`nada`,8cancelaciones,0errores/rechazos/invalidaciones/caducidades. `delivered` cuenta el paso a `host.onOutput`, no ACK del frame ni visibilidad óptica.
- OFF: sin lease/timer/buffer/motores pendientes, nativo `capturing:false`.0pérdidas/errores de decodificación,27descartes PCM de entrega. No atribuir estos descartes a la presentación sin demostrarlo.
- Usuario no vio los mensajes físicamente. La ausencia ya no se explica por falta de respuesta Hermes: investigar presentación/serialización/transmisión/encendido.

Dumps/registro privados excluidos de Git: `.tools/hermes-after-prompt-state.xml`, `...-options.xml`, `...-metrics.xml`, `...-process.log`. No publicarlos ni extraer conversaciones/credenciales. La app quedó en OFF con el diálogo de métricas abierto; verificar el estado al retomar, no asumir que el móvil siga conectado/desbloqueado.

## Fallo de serialización encontrado por Codex justo antes del relevo

`app/ui/shell/conversation-hermes-layer.ts`, `HermesContributionLayer.paint()`, crea una imagen640×480 y hace `image.fillRect(0,0,width,height,1)` para ocultar el contenido inferior. Eso vuelve no nulos todos los píxeles de la superficie, incluso fuera de la banda del texto.

`app/ui/layers.ts`, `paintLayer()`, devuelve esta capa como un único plano. `app/graphics/shell-scene.ts`, `encodeShellScene()`, recorta por píxeles no nulos y rechaza recursos cuyo tamaño `5 + ceil(width/2)*height` supera65536. El fondo completo necesita153605bytes. **Reproducción local con GrayImage y codificador reales: `Shell surface 7 exceeds 64 KiB (640×480)`**.

Comando ejecutado correctamente, sin móvil ni proveedor:

```powershell
node -e 'const g=require("./.test-build/app/graphics/image.js");const s=require("./.test-build/app/graphics/shell-scene.js");const image=new g.GrayImage(g.G2_LENS_WIDTH,g.G2_LENS_HEIGHT,0);image.fillRect(0,0,image.width,image.height,1);try{s.encodeShellScene([{image,x:0,y:0,shellKey:7}]);process.exitCode=1;console.log("UNEXPECTED_PASS")}catch(e){console.log(e.message)}'
```

Esta sonda usa una imagen equivalente al fondo de la capa; falta añadir regresión con la **capa real**, pintura y codificador reales. No afirmar todavía que es la única causa física, pero es un defecto concreto que impide serializar esa superficie y encaja con los8mensajes aceptados/no visibles.

Las pruebas `tests/conversation-hermes-ui.test.cjs` sustituyen `graphics/shell-scene.encodeShellScene` por una función que devuelve un array vacío. Por eso pasan sin detectar el límite. Consulta `tests/menu-display-list.test.cjs` y `tests/app-layout.test.cjs` para patrones de pruebas con imágenes/serialización reales.

Los ceros de errores obtenidos de logcat **no descartan este fallo**: `DashboardController.appendLog()` solo hace console.log si `VERBOSE_CONTROLLER_LOG` está activo. `requestShellRender()` captura el error y llama a appendLog, que puede quedar silencioso. No usar «cero líneas shell render failed» como evidencia de que renderizó correctamente.

## Trabajo que debe completar Claude

1. Reproducir con la capa/pipeline reales; corregir la presentación para respetar los recursos64KiB sin ocultar el error quitando el límite. Preservar opacidad/privacidad: únicamente Hermes visible, sin dejar traslucir la conversación, ventanas o transcripción. Usar un patrón de recursos/planos adecuado al compositor existente; no asumir que borrar el fondo opaco o solo reducir el texto resuelve el requisito.
2. Añadir regresión significativa de pintura → codificador real, incluyendo tamaño real640×480, posición de la banda y límites. Conservar retiro del mensaje, prioridad de chat/PTT/teclado/gestos y oscuridad mientras escucha. No generar tests que solo repitan una constante del arreglo.
3. Revisar el paso wake/unblank/transmisión si sigue fallando tras serializar. Hay llamadas implementadas; esto no acredita óptica real. Considerar un diagnóstico agregado de presentación si se necesita distinguir mensaje aceptado, presentación rechazada, serialización y entrega. Nunca registrar textos ni identidades/credenciales.
4. Ejecutar pruebas afectadas y TS/lint, después preparar APK nueva solo porque hay una corrección de app. Mantener firma original, package/code805, datos/34ajustes/perfil. No reconstruir bibliotecas nativas si no han cambiado. Entregar candidata y evidencia; instalación necesaria solo con respaldo fresco y OFF comprobado, `adb install -r`, nunca desinstalar/borrar datos. La autorización general cubre corrección y actualización necesaria, pero coordina presencia del usuario antes de cualquier captura/observación óptica.
5. Para validar físicamente, una única comprobación coordinada y finalOFF; no repetir por rutina ni afirmar éxito basándose en espejo del móvil/tests/`delivered`. Si el usuario ya tiene otra sesión fallida, leerla antes de iniciar una nueva. No frase de identificación, selector de voz ni reenrolamiento.
6. Actualizar continuidad y publicar código/pruebas/notas en GitHub, manteniendo artefactos y privados fuera de Git. Documentar qué se implementó, compiló, instaló y observó realmente como estados separados.

## Estado instalado y puente, conservar

Móvil: S2.6.1 `0.8.2-es.5-conversation.s2.6.1-manual-context`/805, APK instalada exactaSHA256 `923c4c081d77292d319299beb453b29933bcf6bf37755a71837fa74cc3e3c88f`, certificadoSHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.34ajustes/perfil conservados en instalación anterior. No reenrolar, flashear firmware o tocar Wear/reloj por defecto.

Puente Tailscale `dani@100.65.212.74`, puerto8791:

- `bridge.py` **be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d**, intacto.
- `conversation.py` activo **a095e84eddb6040ba14a81805068b37ade85bec80b11e9eee35fae694263ad50**, cambio solo `STYLE` ya desplegado.
- Candidata separada `/home/dani/faceclaw-hermes-bridge/conversation-candidate-participation-20261005/`,700/600.
- Reversión `/home/dani/faceclaw-hermes-bridge/rollback-20261005-participation/conversation.py`, módulo previo **0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078**,700/600.
- Ambos servicios activos/habilitados y sin aviso `conversation unavailable` comprobados tras el ajuste. Solo se reinició `faceclaw-hermes.service`, gateway/configuración privada/modelo/token intactos.
- No ejecutar de nuevo `deploy-hermes-conv2.py`: sus hashes base son anteriores. Helper del ajuste: `scripts/deploy-hermes-participation.py`, exige hashes e incluye reversión.

El usuario desea responder preguntas cuando se pueda desde contexto/conocimiento fiable, sin invocación «Hermes», y observaciones breves/ingeniosas/irónicas/sarcásticas pertinentes. No inventar información actual ni ejecutar acciones; sin herramientas/historial/memoria en conv.20min máximos/>5min sin voz, es/ca automático, identidad opcional,12turnos/6000caracteres, candidata15s/episodio30s,80solicitudes/5s/2s, timeout5s conservados.8cancelaciones no equivalen a8timeouts.

## Forma de trabajar y herramientas

- Actuar dentro de lo autorizado; no pedir de nuevo decisiones aceptadas. Avisar antes de necesitar el móvil, mantener actualizaciones breves y explicar cualquier bloqueo real.
- Separar evidencia observada de hipótesis y software de física. No repetir revisiones/builds/despliegues/suites completas por rutina. Ejecutar comprobaciones pertinentes y continuar hasta completar la corrección.
- `rg`/`rg --files` primero para búsquedas. PowerShell nativo, rutas absolutas y operaciones de archivos verificadas; no mezclar shells para borrar/mover ni usar reset/clean contra cambios locales.
- ADB: `.tools/android-sdk/platform-tools/adb.exe -s 61161FDCG0013L`. En sandbox fallaba creando `\.android`; la ejecución con la autorización de acceso al dispositivo funcionó. No iniciar ON automáticamente para investigar.
- Node disponible en PATH, dependencias npm y `.test-build` existentes. Python: `C:/Users/Usuario/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. No instalar herramientas/SDK/NDK por rutina.
- Solo Tailscale desde este PC: Hermes100.65.212.74 y NAS100.64.237.87; no probar LAN. SSH/sftp con `.tools/jarvis-known-hosts`; credenciales únicamente por autenticación interactiva, jamás en código/notas/logs públicos. Este prompt no contiene ninguna contraseña. No solicitar al usuario reenviar secretos si ya hay un mecanismo válido de autenticación disponible.
- Últimas comprobaciones:19/19 Python del módulo tras prompt, AST soloSTYLE, helper simulado aplicación/idempotencia/reversión/recuperación correctas.3pruebas UI de wake/prioridad pasaron **con codificador simulado**, por tanto no aprueban el defecto64KiB.

## Accesos al BMAX y al NAS si Claude no los tiene configurados

BMAX y Jarvis son el mismo equipo; no buscar otro servidor para Hermes. Datos de red documentados:

| Equipo | Tailscale (usar desde el trabajo) | LAN (solo estando en casa) | Usuario SSH/SFTP |
| --- | --- | --- | --- |
| BMAX / Jarvis / Hermes | `100.65.212.74` | `192.168.0.234` | `dani` (minúsculas) |
| NAS Synology | `100.64.237.87` | `192.168.0.110` | `Dani` (D mayúscula) |

SSH/SFTP usa puerto22. El puerto8791 del BMAX es el puente Faceclaw, no SSH. En este PC debe haber Tailscale conectado a la red del usuario. No iniciar otra cuenta/tailnet, cambiar ACL, reiniciar servicios o modificar tokens para arreglar un acceso de red. Si el entorno de Claude es nube sin acceso a esa tailnet o al checkout, comunicar esa limitación y pasar el trabajo al entorno local adecuado.

Huellas públicas ya comprobadas de las claves de host:

- BMAX ED25519: `SHA256:yf9wMocPcBcYxs/5GTk7xmD38+Mgq5xjZUqbhv+hLxs`.
- NAS ECDSA: `SHA256:8qYeU665LPTKuyfh/YR4p/SfMicnqV0Ru8RAE47Sc/Q`.

Archivos de host en este checkout: `.tools/jarvis-known-hosts`, `.tools/nas-known-hosts`. Si faltan en otro PC, puedes crear **únicamente el archivo ausente** con estas claves públicas conocidas, sin desactivar la verificación de host ni sobrescribir una discrepancia:

```powershell
New-Item -ItemType Directory -Force .tools | Out-Null
if (-not (Test-Path -LiteralPath .tools/jarvis-known-hosts)) {
  '100.65.212.74 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILbEGHlMz/JMWOvzWGJXxmPmKzeclmPgjus7FKouwx2r' | Set-Content -LiteralPath .tools/jarvis-known-hosts -Encoding ascii
}
if (-not (Test-Path -LiteralPath .tools/nas-known-hosts)) {
  '100.64.237.87 ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBAHu8Yn7HJxL3XADNmlH4Pm1iKkfAhem7YyxhaX1rAixGs0drwRvp/rVxBFlLVv28x4Mi2FX+d4nNueuErk3OWQ=' | Set-Content -LiteralPath .tools/nas-known-hosts -Encoding ascii
}
ssh-keygen -lf .tools/jarvis-known-hosts
ssh-keygen -lf .tools/nas-known-hosts
```

Conexiones desde la raíz del proyecto, sin depender de alias en `~/.ssh/config`:

```powershell
ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.tools/jarvis-known-hosts -o ConnectTimeout=8 dani@100.65.212.74
ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.tools/nas-known-hosts -o ConnectTimeout=8 Dani@100.64.237.87
sftp -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.tools/jarvis-known-hosts dani@100.65.212.74
sftp -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.tools/nas-known-hosts Dani@100.64.237.87
```

La autenticación por clave con `BatchMode=yes` **no funcionó en este PC para BMAX**; Codex usó contraseña introducida interactivamente y SSH/SFTP funcionaron. Un rechazo `Permission denied (publickey,password)` con BatchMode no prueba que el servidor esté caído. Usar una terminal interactiva para el prompt de contraseña o una clave ya autorizada. La contraseña se facilitó durante esta conversación, pero **no se copia a este archivo público ni a GitHub**; si Claude no dispone de un canal de autenticación válido, pedir al usuario introducirla por el mecanismo interactivo. No probar la contraseña del BMAX en el NAS ni asumir que son iguales. AccesoNAS documentado anteriormente, no revalidado por Codex durante este relevo.

Rutas útiles en BMAX:

- Puente: `/home/dani/faceclaw-hermes-bridge/`.
- Hermes/entorno Python: `/home/dani/.hermes/hermes-agent/.venv/bin/python`.
- Servicio de usuario: `/home/dani/.config/systemd/user/faceclaw-hermes.service` y drop-ins en `faceclaw-hermes.service.d/`.
- Configuración privada: `/home/dani/faceclaw-hermes-bridge/private.json`,600, **no leer/imprimir/copiar por rutina**.
- Estado de solo lectura: `systemctl --user is-active faceclaw-hermes.service hermes-gateway.service` y `systemctl --user is-enabled faceclaw-hermes.service hermes-gateway.service`. Son unidades de usuario: conservar `--user`.

Rutas útilesNAS:

- Raíz Faceclaw: `/volume1/home/Dani/Faceclaw/`.
- Firma original: `/volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks` y `store.password`,700/600. Recuperar solo si hace falta para la candidata; en este PC ya hay `.tools/signing/`. No generar firma nueva ni publicar/mostrar contraseñas.
- APK vigente/reversión: `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-s2.6.1-manual-context/`.
- Respaldo ajustes: `/volume1/home/Dani/Faceclaw/connection-backups/2026-10-05-s2.6/`, privado.
- Nota Obsidian: `/volume1/Docker/obsidian/vault/Proyectos/Faceclaw.md`.
- Para transferencias usar SFTP/SCP con el mismo archivo de host y autenticación; si NAS no ofrece el subsistemaSFTP, `scp -O` permite el protocoloSCP antiguo. Conservar permisos y verificar hashes tras cada copia necesaria.

## GitHub y continuidad entre PCs

Remoto `origin`: `https://github.com/DanielGTdiabetes/faceclaw-es.git`; `upstream` es el proyecto original, **no publicar allí**. Rama vigente `codex/conversation-detection-g0`. Último HEAD local observado **44ff5b5**, `Unify manual conversation controls on phone and glasses`. Inspecciona HEAD/remoto actual antes de actuar; no resetear ni sobrescribir avance concurrente.

Cambios pendientes de publicación al relevar: `.gitattributes`, `AGENTS.md`, `integrations/hermes/README.md`, `integrations/hermes/conversation.py`, `notes/continuidad-s2.6-manual-context-2026-10-05.md`; nuevos `notes/diagnostico-hermes-sin-aportaciones-2026-10-05.md`, `notes/hermes-preguntas-participacion-2026-10-05.md`, este prompt y `scripts/deploy-hermes-participation.py`. Comprueba `git status` real, porque esta lista puede evolucionar. Las fuentes Python del puente y helpers de despliegue requieren bytesLF; `.gitattributes` lo fija, los hashes son de bytes exactos.

Tras la corrección: revisar diff y `git diff --check`, añadir **solo rutas públicas explícitas**, commit descriptivo y push a `origin codex/conversation-detection-g0`; comprobar HEAD remoto para confirmar publicación. No `git add .` ciego. No es necesario crear PR o fusionar otras ramas para continuidad salvo instrucción del usuario.

Excluir siempre APK/AAR/ZIP de distribución, firma/contraseñas, ajustesXML, perfiles, conversación/audio, dumps/logs privados y `.tools`. Código/pruebas/notas/helpers públicos sí van a Git. La modificación del prompt desplegada debe publicarse junto con las notas para que otro PC no recupere un criterio anterior.

Actualizar **`notes/continuidad-s2.6-manual-context-2026-10-05.md`** como entrada principal y enlazar la evidencia nueva desde el principio de `AGENTS.md`. Preservar registros históricos, marcándolos superados; no editar sus resultados como si hubieran ocurrido con la versión nueva. Registrar hashes/versiones, pruebas realmente ejecutadas, estado instalación/puente, observación física, OFF final, commit/push verificados y pendientes.

NAS: `/volume1/home/Dani/Faceclaw/`, por `Dani@100.64.237.87`. Las APK/reversiones exactas anteriores están en `apk-builds/0.8.2-conversation-s2.6.1-manual-context/`, respaldo privado de ajustes en `connection-backups/2026-10-05-s2.6/`. Guardar nuevos artefactos en carpeta propia700/archivos600 y verificar hashes remotos sin mostrar privados. Para actualizar notas/Obsidian (`/volume1/Docker/obsidian/vault/Proyectos/Faceclaw.md`), leer estado vigente y conservar respaldo antes de reemplazar; no ejecutar helpers históricos con hashes/rutas antiguas. No afirmar copiaNAS o publicaciónGitHub hasta verificarlas. En estos últimos diagnósticos y ajuste de prompt aún no hubo commit/push ni espejoNAS nuevos.
