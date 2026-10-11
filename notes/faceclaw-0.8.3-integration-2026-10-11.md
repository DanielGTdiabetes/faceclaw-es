# Faceclaw 0.8.3 + S2.13 — integración del 11-10-2026 (Claude Code)

Encargo: [prompt preparado por Codex](prompt-claude-faceclaw-0.8.3-2026-10-11.md). Base oficial
[Faceclaw 0.8.3](https://github.com/jimrandomh/faceclaw/releases/tag/0.8.3), tag `14d1f7f509b62e9d1975ab6029c42cc654c738df`
(comprobado con `git ls-remote` contra el repositorio oficial), fusionada sobre S2.13 (`2fe4928`).

**Estado: instalada en el Pixel, pendiente de que el usuario actualice el firmware a /37.** APK
`0.8.3-es.6-conversation.s2.13`/805, firma original, instalada con `adb install -r` sin desinstalar ni borrar datos;
APK extraída idéntica al artefacto. Los 35 ajustes son idénticos antes y después. La app, al arrancar, leyó el
firmware real: **L/R 2.3.0.24, `Faceclaw/36`**, y suspendió la reconexión con el aviso «Atención necesaria … requires
revision 37» y el botón «Instalar firmware modificado» (no pulsado por el agente). **No hay comprobación física de
conexión, navegación ni controles con la 0.8.3**: requieren el firmware /37.

## Firmware

- **No se ha modificado nada del firmware**, por instrucción expresa del usuario («es peligroso; se utilizará el del
  repositorio original»). `app/g2/firmware/` y `app/g2/firmware-compat.ts` son byte a byte los de la 0.8.3
  (`git diff --quiet upstream/release-0.8.3` sobre ambos, comprobado en la fusión y en el commit).
- La 0.8.3 exige **`Faceclaw/37`**; las gafas tenían `/36` según la documentación (no leído en esta sesión salvo lo
  indicado en «Estado»). No se ha flasheado nada por ADB ni por ningún otro medio desde el agente.
- Compatibilidad: `hasCompatibleFirmware` acepta la revisión requerida **o superior**. Por tanto:
  - App 0.8.3 + gafas /36 → la app detiene la reconexión y muestra el aviso de firmware incompatible con el botón
    **«Instalar firmware modificado»** (actualizador oficial incluido en la app, `phone-ui/onboarding-flash-page`).
  - App S2.13 (requiere /36) + gafas /37 → compatible (37 ≥ 36). La reversión de la APK sigue siendo válida tanto
    antes como después de actualizar el firmware.
- Secuencia oficial segura para el usuario (no la ejecuta el agente):
  1. Con la 0.8.3-es.6 instalada, abrir Faceclaw con las gafas cerca y con batería suficiente (o en el estuche).
  2. Al conectar aparece el aviso de revisión 36 frente a 37. Pulsar **«Instalar firmware modificado»**.
  3. La propia app desconecta la sesión principal y abre el actualizador. No cerrar la app ni alejar el móvil hasta
     que termine; las gafas se reinician.
  4. Al reconectar, la app debe quedar conectada sin el aviso. Confirmar el resultado antes de la comprobación física
     final.
  - Si el actualizador falla, la app actual conserva la ruta de reintento; la reversión a S2.13 (`install -r`) también
    funciona con /36.

## Cambios oficiales incorporados

- Reconexión: `38da8e6` (eventos EvenHub `FOREGROUND_EXIT` ya no rehacen el layout; cola de notificaciones de una en
  una; presupuesto de recursos gráficos) y `ca2e55e` (modo/layout idempotentes durante la reconexión, protocolo y
  patchset /37 conjuntos). Kotlin compartido fusionado sin solapes con nuestro cambio `wearStateReportRequested`.
- Onboarding en gafas (bienvenida, tamaño de texto, estadísticas, distribución, profundidad, modo de pantalla).
- Estadísticas opcionales: valor por defecto **`privacy.dataCollection = none`**; con `none` no se guarda ni se envía
  nada (`applyLevel`/`uploadIfDue` descartan y no conectan). No se ha activado.
- Ajuste unificado «Modo de pantalla» (banda a cinco alturas / altura completa / pantalla completa) con migración
  de solo lectura desde `display.mode` y `display.verticalPosition` (y los de Navegar/Terminal): la clave nueva no se
  escribe hasta que el usuario cambie el modo.
- Tiempo: iconos de estado, caché persistente y refresco horario para barra de estado y tarjeta del sistema
  (ambos indicadores desactivados por defecto).
- T3 Code (cliente, inactivo hasta emparejar un ordenador), extensiones EvenHub (fuentes, iconos, touch-start),
  iconos de notificaciones ANCS (iOS), voz en la nube en iOS, cambios de Wear (ver abajo).

## Resolución de conflictos

Quince conflictos simulados por Codex, resueltos uno a uno sin elegir ours/theirs para archivos completos:

| Archivo | Resolución |
|---|---|
| `app/app.css` | Se importan los dos CSS (`conversation-panel` nuestro y `pairing` oficial). |
| `app/native/voice-control.ts` | Refactor oficial a `cloud-stt-provider.ts`; Whisper base/small/medium siguen siendo locales porque no figuran entre los proveedores en la nube. |
| `app/ui/shell/shell.ts` | Se conservan la capa independiente de Hermes (Conversación) y la nueva cola de notificaciones; al cerrar una notificación (`stack.remove`) el render barre las capas Hermes retiradas, como antes. |
| `app/ui/dashboard-settings.ts` | Ajuste de layout unificado oficial con etiquetas en español; proveedores Whisper y su valor por defecto `onboard-whisper` conservados (iOS usa la lista oficial). |
| `app/ui/dashboard/settings-menus.ts` | Nueva sección «Privacidad» traducida; «Acerca de» conservado; rama iOS con nuestras etiquetas de sección. |
| `app/native/weather.ts`, `app/apps/weather/weather.ts` | Se conserva Open-Meteo con °C, km/h y textos españoles; se añaden icono por condición (códigos WMO e `is_day`), caché (versión 2, sin coordenadas, distinta de la v1 Fahrenheit de upstream) y programador horario. |
| `tests/firmware-compat`, `ios-calendar`, `ios-qr`, `menu-scroll-animation` | Upstream solo borró pruebas «espurias»; conservamos nuestras versiones (siguen pasando). |
| `tests/ios-app-host.test.cjs` | Se conservan nuestras dos pruebas borradas por upstream, con mocks nuevos (`weather`, `glasses-presence`, `onboarding-progress`). |
| `tests/ios-location`, `voice-finalization`, `weather` | Mezcla: nuestros datos Open-Meteo con los temporizadores nuevos; pruebas oficiales del tiempo portadas a Open-Meteo/°C. |

Fusiones automáticas revisadas: sesión Kotlin (`GlassesSessionCore`/`Controls`: contadores, `FOREGROUND_EXIT`) sin
tocar nuestra lógica de estado de uso; `dashboard-controller` (tiempo, onboarding) compila y pasa pruebas.

## Adaptaciones propias

- **El onboarding no sobrescribe ajustes**: se abre una vez tras la actualización, pero tamaño de texto, posición del
  selector de apps y modo de pantalla parten del valor actual y solo se guardan si el usuario los cambia (upstream
  preseleccionaba «Abajo» y 16 px y los guardaba al pulsar). Las estadísticas no escriben la clave si el valor no
  cambia. Pruebas oficiales del onboarding adaptadas a este comportamiento.
- Traducción de onboarding, modo de pantalla, privacidad/estadísticas, posición del selector, profundidad y ajustes
  del tiempo.
- Exclusión deliberada: la interfaz de **T3 Code** queda en inglés (herramienta técnica, inactiva hasta emparejar un
  servidor externo). El mensaje de firmware incompatible también queda en inglés porque vive en
  `firmware-compat.ts`, que se mantiene idéntico al oficial.

## Reloj (Wear)

La 0.8.3 retira del protocolo el comando `display-mode` y el campo `displayMode` del estado; el resto no cambia.
Este agente no ha conectado ni actualizado el reloj. Durante esta sesión Codex instaló en el Pixel Watch 4 el Wear
oficial 0.8.3 con firma original (versión `0.8.3`, código 4): ver [su informe](faceclaw-wear-0.8.3-2026-10-11.md).
Ese Wear corresponde al mismo protocolo que el móvil 0.8.3; el enlace funcional reloj–móvil no se ha ensayado. Con el
Wear anterior (`0.8.2-es.1`) solo dejaría de funcionar su control de modo de pantalla («Unhandled command»).

## Pruebas

Línea base tomada **antes** de fusionar, sobre S2.13 en este Windows: 1088 correctas, 5 fallos, 1 omitida / 1094
(igual que lo documentado para S2.13).

Tras la integración (`d55f353`):

- `npm test` (tsc de pruebas + `node --test`): **1181 correctas, 5 fallos, 1 omitida / 1187**. Los 5 fallos son
  exactamente los previos, con el mismo mensaje: dos de entrada del shell (`this.sweepRetiredOverlays is not a
  function` en el mock), los ajustes del asistente iOS/Android y el códec de configuración iOS (permisos POSIX `0600`
  en Windows). Ningún fallo nuevo.
- Fallos aparecidos durante la integración y corregidos: mocks nuevos (`cloud-stt-provider`, `weather`,
  `glasses-presence`, `onboarding-progress`); etiquetas españolas del modo de pantalla; la prueba oficial del shim
  EvenHub fallaba solo en checkout CRLF de Windows (ahora normaliza a LF); comparación de arrays entre contextos vm.
- TypeScript app y pruebas: correctos. oxlint: 556 archivos, 158 reglas, 0 diagnósticos.
- Kotlin host (`wear\gradlew -p tests/kotlin testAndroidHostTest --offline`): **308 correctas, 0 fallos**.
- Webpack/`ns prepare android --release --env.production`, Gradle offline `assembleRelease lintVitalRelease`:
  correctos (`.tools/u083-build.ps1`, derivado de S2.13; log `.tools/u083/build.log`).

## Versión, firma y artefactos

- Versión **`0.8.3-es.6-conversation.s2.13`**, `versionCode` **805** (igual que S2.13: la reversión sigue siendo un
  `install -r`; nunca la numeración oficial 803). Comprobado con `aapt dump badging` en la APK firmada.
- Firmada: `dist/conversation-g0/faceclaw-0.8.3-es.6-conversation.s2.13.apk`, SHA-256
  **`b8f4d331b3b38d812884fadbb0ab48f602cd9d5b1d796291e62afb8c4e17019a`**. Firma v2+v3, un firmante, certificado
  `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` (original); zipalign 16 KB correcto.
- Sin firma: `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk`, SHA-256
  `ecf1ac686eab25fc9af901419b2fba00743182a93f26ad0d5a6e77a76fe2a0ba`.
- Las **8 `.so` son byte idénticas** a la APK S2.13; `package.json` presente. El bundle contiene el requisito
  `Faceclaw/37`, «Escuchar con Hermes», Whisper medium y las traducciones nuevas.

## Ajustes, instalación y reversión

Autorización del usuario en chat («vía libre») tras confirmar que Codex había terminado con el reloj y que la otra
sesión local no usaba el teléfono. Reserva propia `.tools/u083-pixel-reservation` creada antes del primer ADB y
retirada al terminar; el relevo histórico medium estaba `released` y sin reserva. Serial explícito
`61161FDCG0013L` en todas las órdenes (los relojes también estaban en ADB).

- Antes: S2.13/805 instalada; desconectado de las gafas; Conversación «Escucha apagada»; diagnóstico
  `enabled=false`, workers `false`, `busy=false`, `inputBufferedBytes=0`, `capturing=false`; ningún wakelock
  Faceclaw activo (solo historial). Perfil «guardado» visible; vector no leído ni exportado.
- Ajustes: respaldo privado (ACL usuario/SYSTEM) en `.tools/u083-private/`, **35 entradas**, mismos nombres de clave
  que el respaldo posterior de S2.13 (solo `notifications.sources` con otro valor, cambio de uso del usuario).
  Tras instalar: **35 entradas, mismo SHA-256, sin claves nuevas, eliminadas ni cambiadas**. Claves que pueden
  aparecer después, justificadas: `onboarding.glassesFinishedVersion` (al completar el onboarding de gafas) y
  `weather.cache` (tras una consulta del tiempo correcta; sin coordenadas). `display.layout` y
  `privacy.dataCollection` solo se escriben si el usuario cambia esos valores. Nada copiado al NAS ni a Git.
- Instalación: `scripts/install-conversation-g0.ps1 -Install -Serial 61161FDCG0013L` → `Success`, actividad abierta
  y proceso estable 5 s. APK extraída `.tools/u083-installed.apk` = `b8f4d331…019a`.
- **Reversión fresca** (APK S2.13 extraída antes de instalar, firma original comprobada por el script):
  `dist/conversation-g0/before-install-20261011-125557.apk`, SHA-256
  **`976aab3fda58364f7a027a084b26b49cb13b35e20b8c263009e95ce345a3922b`** (idéntica a la S2.13 documentada).
  Solo con OFF: `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-install-20261011-125557.apk`.
  Funciona con firmware /36 y también con /37.
- Logcat tras arrancar: único error de la app, el esperado `incompatible firmware … ext="Faceclaw/36" (need
  Faceclaw/37); suspending reconnect`. Cierre: Desconectado, sin wakelock Faceclaw, Conversación apagada.

## Tras actualizar el firmware — 11-10-2026, 15:15

El usuario informa de que ha completado la actualización con el actualizador de la app. Comprobado por ADB (reserva
propia creada y retirada): `0.8.3-es.6-conversation.s2.13` en el mismo proceso, app **Conectado** y sin el aviso de
firmware. Como la app suspende la reconexión ante una revisión inferior a 37, esto implica `Faceclaw/37` o superior;
el logcat ya no conservaba la línea `firmware: … ext=` (buffer desde 15:14), así que la revisión exacta no se ha leído.
Conversación «Escucha apagada», ningún wakelock activo.

Ajustes: **los 35 originales idénticos**; 3 claves nuevas, todas justificadas: `onboarding.glassesFinishedVersion`
(onboarding completado), `display.uiDepth` (la página de profundidad guarda al deslizar, es decir, elección del
usuario) y `weather.cache` (consulta del tiempo, sin coordenadas). Respaldo previo conservado como
`.tools/u083-private/after-install-settings.xml`.

No observado por el agente: el contenido de las lentes, la navegación ni los controles físicos.

## Pendiente

1. ~~Actualizar el firmware~~: hecho por el usuario (ver sección anterior).
2. Tras /37: comprobación mínima desde OFF (conexión, navegación, controles, menú de dos inicios) y observar el
   onboarding «Primeros pasos» una vez; tocar seguido no debe cambiar ajustes. Volver a comparar ajustes.
3. Opcional: el reloj lo estaba actualizando Codex por WiFi durante esta sesión; no se ha tocado ni comprobado.
4. La corrección oficial de reconexión no demuestra resolver nuestros históricos de audio, precisión ASR, calor o
   consumo de cuota; no se han repetido benchmarks ni baterías de voz. Jarvis/Hermes no se han consultado ni
   modificado.
