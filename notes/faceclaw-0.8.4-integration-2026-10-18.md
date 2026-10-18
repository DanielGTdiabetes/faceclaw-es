# Faceclaw 0.8.4 + S2.15.5 — integración del 18-10-2026 (Claude Code)

Base oficial [Faceclaw 0.8.4](https://github.com/jimrandomh/faceclaw/releases/tag/0.8.4), tag
`7e448ef25afdd433be02dbde6885a8f5a0e72c92` (comprobado con `git ls-remote` contra el repositorio oficial y
descargado como `upstream/release-0.8.4`). Rama **`claude/faceclaw-0.8.4-integration`**, creada desde
`claude/faceclaw-0.8.3-conversation` (`180ebf2`, igual a `origin`).

**Estado: compilada; sin instalar.** La instalación en el Pixel queda pendiente de la autorización del usuario.

## Firmware y reloj

- **No se ha modificado el firmware**, por instrucción del usuario: se mantiene el que publica upstream.
  `app/g2/firmware/` y `app/g2/firmware-compat.ts` son idénticos byte a byte a los de la 0.8.4
  (`git diff --quiet upstream/release-0.8.4`). La 0.8.4 no cambia el firmware respecto a la 0.8.3: sigue
  exigiendo `Faceclaw/37`.
- La 0.8.4 no toca `wear/`. El reloj se actualizó aparte a Wear 0.8.4, con el mismo código que la 0.8.3
  ([nota](faceclaw-wear-0.8.4-2026-10-18.md)). Aquí no se ha tocado.

## Qué entra

1. **Upstream 0.8.4** (`f40cd84`), 48 commits: barra de apps en varias filas, opciones de la tarjeta del
   sistema y de música del Glanceboard, brújula con indicador de calibración, widgets de la barra
   seleccionables, popups de notificación que se cierran al descartarlas en el móvil (y retardo para no
   mostrar las espurias), «Despertar en la última app» (desactivado por defecto), detector experimental de
   **bolo olvidado** en Nightscout (desactivado por defecto), proveedor de voz **Servidor Whisper** propio,
   backend de asistente **Agente Hermes (API directa)**, arreglos de Microphones, EvenHub y renderizadores
   webview aislados.
2. **`claude/nav-gps-warmup`** (`7b5f023`), 7 commits que no estaban en la base: proveedor de voz EVO-X2
   (NeMo-Speech por Tailscale) con vuelta a Whisper del móvil, Parakeet, voces locales y herramientas del
   teléfono (S2.15.2–S2.15.4). La build instalada salía de esa rama, no de la base.
3. **S2.15.5** (`611ee50`), arreglo del GPS al navegar en interiores
   ([nota](navegacion-gps-interior-2026-10-17.md)). Estaba instalada y validada, pero **solo existía sin
   commitear** en el worktree `E:\projects\faceclaw-es-navgps`. Se aplicó tal cual y ese worktree no se
   tocó.
4. **Traducciones** (`710cf34`) de los ajustes y avisos nuevos.

## Conflictos y decisiones

| Archivo | Decisión |
|---|---|
| `app/native/voice-control.ts` | Se conservan nuestro árbitro de audio, la reserva experimental del raw y los dueños con nombre. De upstream se añaden `isRawCaptureLive()`, `holdsCapture()` y `whisper-server`; se elimina su `rawOwners`, duplicado de nuestro `normalRawOwners`. |
| `app/apps/microphones/mic-session.ts` | Se toma la reescritura de captura de upstream (dueño `microphones`, `bringUpCapture`), manteniendo nuestra prioridad de audio al iniciar y parar. |
| `app/apps/microphones/mic-models.ts` | Se juntan nuestro estado `error` de descarga y la retención de listeners de upstream, con su fallo al arrancar (que ahora también marca `error`). |
| `app/ui/shell/shell.ts`, `app/g2/dashboard-controller.ts` | Conviven nuestra superposición independiente de Hermes (contribuciones y avisos) con las notificaciones por clave y el retardo de popups de upstream. |
| `app/native/cloud-stt-provider.ts` | Conviven los dos proveedores propios: `whisper-server` (HTTP, configurado por URL, mayor espera final) y `even` (EVO-X2, WebSocket con clave y vuelta local). La tabla une `configured/missing` con `unusable/localFallback`. |
| `app/native/reconnecting-stt.ts`, `voice-control.ios.ts` | Se respeta la espera final del proveedor y se informa del fallo de un `finish()` rechazado. |
| Ajustes (`dashboard-settings.ts`, `settings-menus.ts`) | Etiquetas en español y menús «Desarrollador» y «Voz» con las opciones nuevas: modo de conexión del anillo, guardar audio de Transcribir y servidor Whisper. |
| Tiempo, iOS, panel del reloj | Texto en español; se toma la estructura de upstream («●● activar»). |
| `tests/weather.test.cjs` | Sigue el nuevo valor por defecto de upstream: tiempo en la tarjeta del sistema activado, solo con la tarjeta en uso. |
| `tests/ios-app-host.test.cjs` | Se conserva nuestra prueba iOS, borrada por upstream, con mocks para sus nuevas importaciones. |

El puente propio Faceclaw-Hermes (`assistantBackend` de bridge, puerto 8791) **no cambia**. El «Agente
Hermes (API directa)» de upstream es otra opción de modelo, que solo se usa si se elige.

## Cambios de comportamiento a tener en cuenta

- **«Guardar audio de Transcribir»** viene **activado** por defecto en upstream: graba un WAV por sesión de
  Transcribir en Descargas (unos 2 MB/min). No se ha cambiado. Desactivarlo en Ajustes > Voz si no se quiere.
- Tiempo en la tarjeta del sistema: activado por defecto, pero solo consulta si la tarjeta está en un tablero
  activo.
- Bolo olvidado y «Despertar en la última app»: desactivados por defecto.

## Comprobaciones

- `tsc --noEmit`: sin errores. oxlint (`lint.sh`): sin diagnósticos.
- `npm test`: **1311 pruebas, 1310 correctas, 0 fallos**. Antes de la fusión con nav-gps-warmup, la base
  tenía 5 fallos (mocks de iOS y Python), que esa rama ya corregía.
- Kotlin host (`wear\gradlew -p tests/kotlin testAndroidHostTest --offline`): **329 correctas, 0 fallos**,
  incluida `LocationLookupCoreTest`.
- `ns prepare android --release --env.production` y Gradle offline `assembleRelease lintVitalRelease`:
  correctos.

## Versión, firma y artefactos

- Versión **`0.8.4-es.7-conversation.s2.16-u084`**, `versionCode` **805** (comprobado con
  `aapt dump badging`). La reversión a la build instalada (`0.8.3-es.6-conversation.s2.15.5-nav-gps-warmup`,
  también 805) sigue siendo un `install -r`.
- Firmada: `dist/conversation-g0/faceclaw-0.8.4-es.7-conversation.s2.16-u084.apk`, SHA-256
  **`92447fff7cae1de4a37b66c3e737432629dbca98e9b6284501659d0e0a7d5aa7`**. Certificado
  `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` (el original).
- Sin firmar: `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk`, SHA-256
  `87d1a95200c06b6096acb19e01a5fe4c9ffd2cddeefe0a08be32b85f7796b1bb`.
- El bundle contiene las traducciones nuevas, «Escuchar con Hermes», el proveedor EVO-X2 y el plazo de 12 s de
  `location.get_current` (S2.15.5). `classes.dex` incluye `LocationLookupCore`.
- Script: `.tools/u084-build.ps1`, derivado de `u083-build.ps1`. Log: `.tools/u084/build.log`.

## Instalación y reversión

Pendiente de la autorización del usuario. Procedimiento previsto: exportar ajustes antes, instalar con
`scripts/install-conversation-g0.ps1 -Install -Serial 61161FDCG0013L` (copia previa de la APK instalada, solo
`install -r`, sin desinstalar ni borrar datos), comparar ajustes después y comprobar la conexión con las G2.
El Pixel Watch también está en adb: usar siempre `-s 61161FDCG0013L`.
