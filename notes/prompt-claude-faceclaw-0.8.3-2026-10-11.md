# Integrar Faceclaw 0.8.3 sobre nuestra S2.13

## Comprobaciones de Codex — 11-10-2026

- Release oficial estable publicada hoy a las 08:07 Europe/Madrid: https://github.com/jimrandomh/faceclaw/releases/tag/0.8.3. La página web de releases devolvió inicialmente una copia antigua; la API de GitHub confirmó 0.8.3.
- Proyecto `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, HEAD `2fe492868e25d59d5152f88d9209a21b40f5b801`, árbol limpio antes de preparar esta nota. Base común con upstream: `61ede9b2a07b2a1cbf85cb333e69fdd88c829173` (0.8.2).
- Tag 0.8.3 descargado como `upstream/release-0.8.3`, commit `14d1f7f509b62e9d1975ab6029c42cc654c738df`. No se ha fusionado ni instalado.
- Pixel conectado y autorizado por ADB; paquete `com.faceclaw.app`, versión instalada `0.8.2-es.5-conversation.s2.13-hermes-only`, código 805. Solo se consultaron conexión y versión: OFF actual, recursos y firmware no se han comprobado en esta revisión.
- Delta oficial 0.8.2→0.8.3: 213 archivos, 17609 inserciones y 2106 eliminaciones. No es solo una actualización de etiquetas.
- `git merge-tree --write-tree --name-only HEAD upstream/release-0.8.3` simula 15 conflictos sin modificar checkout ni índice: siete archivos de app y ocho de tests, detallados debajo.
- **0.8.3 exige firmware Faceclaw/37** (`app/g2/firmware-compat.ts`), frente a /36 en 0.8.2. El commit de reconexión `ca2e55e` cambia protocolo y patchset conjuntamente. No bajar el requisito ni mezclar protocolo /37 con parches /36.
- Las estadísticas oficiales son opcionales y su valor por defecto es `privacy.dataCollection = none`; conservar esa elección por defecto, sin activarlas por la actualización.
- No se han tocado ajustes, perfiles, escucha, Hermes/Jarvis, reloj ni firmware. Esta nota todavía no está publicada ni copiada al NAS.

## Prompt para Claude Code

Trabaja en `E:\projects\faceclaw-es`. Quiero actualizar nuestra adaptación española de Faceclaw incorporando la release oficial estable 0.8.3, preservando todo lo implementado hasta S2.13. El móvil está conectado. Lleva la integración hasta una APK comprobada y firmada con la clave original; continúa con la instalación conservando datos cuando estén satisfechas las comprobaciones de OFF y compatibilidad descritas abajo. Si el firmware oficial /37 necesita intervención del usuario, deja la candidata y la reversión listas y explica el paso concreto pendiente.

### 1. Retomar el estado vigente

Lee `AGENTS.md`, `CLAUDE.md`, `notes/continuidad-entre-pcs.md`, las entradas más recientes de `notes/ahorro-llamadas-hermes-2026-10-10.md` y `C:\Users\danie\.codex\memories\faceclaw.md`. La memoria antigua resume G3.4: las entradas de octubre 10 en el repositorio la superan. Comprueba HEAD, origin y árbol actual; conserva cambios ajenos y cualquier stash. No restaures stashes históricos ni retrocedas a G3.4.

Estado de partida comprobado por Codex: HEAD `2fe4928`, S2.13 instalada, código 805. Conserva «Escuchar con Hermes» y «Solo transcribir», recuperación de red/Tailscale S2.11, pausa/enfriamiento adaptativo y ayuda directa, medición S2.12, Whisper/motores y perfil existente, memoria opcional, español/valenciano, ubicación/GPS, bloqueo desactivado y configuración del asistente. No reintroduzcas el modo retirado de filtros locales ni barreras antiguas de shadow. Hermes sigue siendo el proveedor actual; su configuración/modelo/esfuerzo y la conservación de cuota son relevantes. Este encargo no requiere cambiar Jarvis.

### 2. Integración oficial y conflictos

La referencia `upstream/release-0.8.3` ya existe en este checkout y corresponde a `14d1f7f509b62e9d1975ab6029c42cc654c738df`. Verifica que sigue correspondiendo al tag publicado. Parte de la rama actual en una rama de integración, preservando historia y posibilidades de reversión.

Prioriza revisar las correcciones `38da8e6` (eventos EvenHub, cola de notificaciones y presupuesto de recursos gráficos) y `ca2e55e` (configuración de modo/layout idempotente durante reconexión). Integra también las funcionalidades de la release de forma compatible con nuestra traducción y comportamiento, y documenta cualquier exclusión deliberada.

La simulación detectó conflictos en:

```
app/app.css
app/apps/weather/weather.ts
app/native/voice-control.ts
app/native/weather.ts
app/ui/dashboard-settings.ts
app/ui/dashboard/settings-menus.ts
app/ui/shell/shell.ts
tests/firmware-compat.test.cjs
tests/ios-app-host.test.cjs
tests/ios-calendar.test.cjs
tests/ios-location.test.cjs
tests/ios-qr.test.cjs
tests/menu-scroll-animation.test.cjs
tests/voice-finalization.test.cjs
tests/weather.test.cjs
```

Resuelve semánticamente; no elijas ours/theirs para archivos completos. En voz conserva nuestras correcciones y adapta el refactor oficial hacia `cloud-stt-provider.ts`; en shell conserva Conversación y el nuevo tratamiento de notificaciones; en settings conserva traducción, migraciones y preferencias. Revisa también fusiones automáticas de los componentes Kotlin de sesión y del controlador de gafas: una fusión textual limpia no demuestra compatibilidad.

La release añade onboarding en gafas, estadísticas opcionales, T3 Code y mejoras del tiempo, además de cambios iOS/Wear. Traduce los flujos que queden visibles en nuestra app y evita que el onboarding sobrescriba ajustes existentes. Mantén las estadísticas desactivadas por defecto como upstream y no actives servicios nuevos. No conectes/emparejes el reloj, que el usuario desconectó deliberadamente. Evalúa la compatibilidad con el Wear instalado si el protocolo cambia; documenta una actualización necesaria sin conectarlo por iniciativa propia.

### 3. Firmware y compilación

La release oficial necesita Faceclaw/37. Conserva el requisito real y el patchset oficial íntegro. No inventes parches propios ni flashees por ADB. No presupongas que /37 está instalado: lo documentado era /36. Identifica la secuencia oficial segura de actualización y evita dejar al usuario sin una ruta funcional de conexión/actualización. Si hace falta, el usuario debe completar el actualizador oficial y confirmar el resultado antes de la comprobación física final.

Usa la cadena Android y scripts locales que funcionaron para S2.13 como referencia; no ejecutes scripts históricos sin leerlos, porque pueden instalar versiones anteriores o desplegar Jarvis. Asigna una versión inequívoca basada en 0.8.3 que identifique la integración y conserva un versionCode compatible con la instalación actual 805 (igual o superior, nunca la numeración oficial inferior 803). Comprueba el valor efectivo en la APK.

Ejecuta TypeScript, oxlint, las pruebas de regresión de las áreas tocadas y conversación, Kotlin por los cambios de protocolo, webpack, compilación release y lintVital. Obtén una línea base de los fallos previos de Node antes de atribuirlos a la integración: S2.13 documentaba 1088 correctas, cinco fallos previos/POSIX y una omitida. Conserva cobertura útil; no borres tests nuestros para hacer pasar la suite ni rebajes comprobaciones de protocolo. Distingue limitaciones POSIX/iOS en Windows de regresiones nuevas.

### 4. Firma, datos e instalación

Antes de operaciones físicas consulta reservas actuales; el handoff histórico medium figuraba released y su reserva ya no existía al revisar Codex, pero vuelve a comprobar el estado. No uses el teléfono a la vez que otro agente. Confirma conversación OFF, workers/buffers drenados y ausencia de wakelock Faceclaw antes de consultar UI o instalar. No inicies captura automáticamente.

Comprueba que existen ambos archivos de firma originales `.tools/signing/faceclaw-es.jks` y `.tools/signing/store.password` antes de usar el firmador; no imprimas sus contenidos ni generes una clave sustituta. Respaldo privado NAS: `Dani@192.168.0.110:/volume1/home/Dani/Faceclaw/signing/`. Certificado público esperado SHA-256: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

Antes de instalar, extrae una reversión fresca de la APK actual y respalda los ajustes privados con los mecanismos existentes. Compara los 35 ajustes previos conservados; cualquier clave nueva/migración debe justificarse. El perfil se conserva en el móvil: nunca leas/exportes el vector ni copies noBackup al NAS. Usa exclusivamente `adb install -r`, sin desinstalar ni borrar datos, y verifica firma/versión/hash del artefacto y APK extraída después. Conserva Hermes, token, GPS, bloqueo y modelos. No instales la APK oficial directamente: tiene otra firma y carece de nuestras funciones.

### 5. Entrega y continuidad

Haz una comprobación mínima justificada de arranque, conexión, navegación y controles desde OFF; separa lo observado de lo pendiente. La corrección oficial no demuestra que se hayan resuelto nuestros históricos de audio, precisión ASR, calor o consumo de cuota. No repitas benchmarks ni baterías de voz por rutina. Termina OFF.

Documenta cambios oficiales incorporados, resolución de conflictos, pruebas/fallos de base, versión/firma/hashes, firmware requerido y observado, estado de instalación y reversión. Actualiza continuidad y copias privadas NAS/nota compartida según `AGENTS.md`, con permisos 700/600 y hashes comprobados; sin secretos, perfil ni audio. Publica código y notas conforme a la autorización existente, revisando antes los archivos incluidos. Si creas una PR, describe el resultado final y validación. Si queda un bloqueo real, entrega la candidata y el siguiente paso concreto, sin afirmar que está instalada o físicamente validada.
