# Navegación desde Hermes sin fix GPS reciente (S2.15.5), 17-10-2026

**Estado: cerrado.** S2.15.5 instalada a las 20:23 con autorización del usuario, y validada a las 20:28 desde las
G2 en interior: la navegación arranca en 1,2–3,2 s, con el primer fix por red en menos de 0,2 s.

## Síntoma

17-10-2026, 19:53. El agente de las G2 (Hermes en EVO-X2) encontró un Consum cercano con una búsqueda web y llamó dos
veces a `nav.start_navigation` por `glasses_call`. Las dos fallaron a los ~11 s con
«Couldn't get a GPS fix yet; try again in a moment.». En el mismo intervalo, `location.get_current` respondió en
344 ms.

## Causa, confirmada en el Pixel

- `app/apps/navigate/navigate-app.worker.ts`, `waitForFix()`: solo acepta un fix del tracker propio con menos de
  `FIX_MAX_AGE_MS` (60 s) y espera como mucho `FIRST_FIX_TIMEOUT_MS` (10 s, dentro del presupuesto de 14 s de
  `start_route`).
- `FaceclawLocationTracker.kt` se suscribía **solo a `GPS_PROVIDER`** (a la red únicamente si el GPS está apagado).
  Además, solo siembra con la caché del sistema si tiene menos de 60 s. En interior, o con el GPS frío, no llega
  ningún fix en 10 s.
- `location.get_current` (`FaceclawLocationProvider.kt`, ubicación precisa S2.15.1) pide fused, GPS y red a la vez.
- Tras el primer error, `stopTrackingIfIdle()` para el tracker y el segundo intento vuelve a empezar en frío.

Evidencia (20:10, solo lectura). El logcat `main` ya no llegaba a las 19:53, pero `adb shell dumpsys location` sí
lo registra:

- 19:52:23 `location.get_current`: registra fused + gps + network; **network entrega en 1,4 s**.
- 19:53:28 → 19:53:38 y 19:53:41 → 19:53:51 (las dos `nav.start_navigation`): Faceclaw registra **solo `gps`**
  (`@+1s HIGH_ACCURACY`), 10,1 s cada vez, y se retira sin entrega. Agregado gps de `com.faceclaw.app`:
  `locations = 0`.

## Corrección (menor riesgo)

Solo `FaceclawLocationTracker.kt`:

- Cuando el proveedor principal es GPS y la red está activa, el tracker abre **además** una suscripción a
  `NETWORK_PROVIDER` con un listener propio (`warmupListener`), **solo hasta el primer fix GPS en vivo**. Al llegar ese
  fix (la semilla de caché no cuenta), retira la suscripción de red y todo sigue como antes.
- Los fixes de red son fixes en vivo con hora actual, no la caché del sistema. La protección contra el «Arrived»
  falso del commit `6051be0` (`FIX_MAX_AGE_MS`, `MAX_SEED_AGE_MS`) queda intacta. El worker de JS no cambia.
- Perder la red durante el calentamiento no es error (el GPS sigue). `stop()` y los errores de arranque también
  retiran la suscripción de red.
- Efecto esperado: en interior, la ruta arranca en 1–3 s con la posición Wi-Fi/celdas (precisión típica 15–50 m). Al
  salir, el GPS toma el relevo. Riesgo residual: si el destino está a menos de 35 m (`ARRIVAL_THRESHOLD_M`) de un fix
  de red impreciso, podría marcar la llegada antes de tiempo. A esa distancia el usuario ya está prácticamente allí.
- Descartado: llamar a `getCurrentLocation` desde el worker (su listener se invoca en el Looper principal, no en el
  hilo del worker) y alargar la espera (los presupuestos de 14 s de `start_route` y 25 s de `nav.start_navigation`
  no dan para un arranque en frío del GPS en interior, que puede no llegar nunca).

## Base: la S2.15.4 instalada, sin perder funciones

El Pixel tenía **`0.8.3-es.6-conversation.s2.15.4-conversation-tools`** (`base.apk` `f59153e3…27c8`). Es la APK
compilada a las 14:43 en el worktree `E:\projects\faceclaw-es-even-conv` (rama `claude/even-conversation` @
`4834ca5` **más cambios sin commit** de la ubicación precisa S2.15.1). Ese worktree no se ha modificado.

- Worktree propio **`E:\projects\faceclaw-es-navgps`**, rama **`claude/nav-gps-warmup`** desde `4834ca5`. Se copiaron
  los cambios sin commit de la ubicación precisa (`FaceclawLocationProvider.kt`, `FaceclawLocationTracker.kt`,
  `system-tools.ts`, `assistant-location.test.cjs`, `native/kotlin/shared/.../location/`,
  `LocationLookupCoreTest.kt`). `App_Resources`, `app`, `tests`, `native/kotlin`, `scripts` y la configuración de
  build quedan idénticos a `even-conv` salvo los fines de línea. Encima va el parche del tracker y la versión
  `s2.15.5-nav-gps-warmup` (`app.gradle`, `ValidateSet` del script de firma).
- `node_modules` usa uniones a los de la carpeta principal, como en `even-conv`, y `@faceclaw/kotlin` apunta al
  plugin propio. `faceclaw-shared.aar` está copiado de `even-conv` (mismo SHA-256 `62f0f680…f1cd`). `.tools/signing`
  es una unión a la firma original.
- Sin commit: la rama lleva cambios de otra sesión (ubicación precisa) que también están sin commit en su origen.

Una primera APK S2.15 compilada sobre la S2.14 (checkout principal, `156c5018…8738`) **no debe instalarse**: quitaría
Parakeet, voces locales, herramientas del teléfono y la ubicación precisa. Sus cambios de código se retiraron del
checkout principal.

## Pruebas y comparación

- Node en el worktree: **1225 pruebas, 1224 correctas, 0 fallos, 1 omitida**.
- Build `.tools/nav-gps-20261017/build.ps1` del worktree (copia del de S2.15.4: prepare, nativas de la carpeta
  principal, Gradle offline, lintVital y firma). `BUILD SUCCESSFUL`, 20:14–20:16.
- APK `dist/conversation-g0/faceclaw-0.8.3-es.6-conversation.s2.15.5-nav-gps-warmup.apk` (worktree), versión
  `0.8.3-es.6-conversation.s2.15.5-nav-gps-warmup`/805, SHA-256
  **`4a58c49eb6886222cc58b43a245bb06746424112be9ab9eacf430318e33c83cc`**, firma original.
- Frente a la S2.15.4 hay las mismas 630 entradas, y difieren 10:
  - firma y manifiesto (versión);
  - perfiles dexopt y metadatos de NativeScript;
  - `classes.dex`: con `dexdump` normalizado, **solo cambian `FaceclawLocationTracker` y su `Companion`** (números de
    línea), y aparece `FaceclawLocationTracker$warmupListener$1`;
  - `bundle.mjs`: solo cambia `main-page.xml`, donde el alias genérico `phone-ui` apunta a otro CSS. Es el orden no
    determinista del cargador XML de NativeScript, que ya variaba antes (S2.14 → `conversation-panel.css`,
    S2.15.2–S2.15.4 → `remote-controls.css`, ambas funcionando). Los registros específicos de los dos componentes
    son idénticos.

## Instalación (20:23) y reversión

- Antes: Pixel `61161FDCG0013L` conectado y desbloqueado, Escucha apagada (usuario); ningún wakelock de Faceclaw
  activo. Ajustes privados con `.tools/nav-gps-export-settings.ps1` (carpeta privada `.tools/nav-gps-private/` del
  worktree): **46 entradas, mismo SHA-256 antes y después** (`e7755566…c5d6`).
- `scripts/install-conversation-g0.ps1 -Install`: respaldo de la APK instalada extraída con firma comprobada,
  `install -r` sin desinstalar, `Success`, actividad abierta y estable 5 s. `base.apk` instalada = `4a58c49e…83cc`;
  primera instalación conservada (`2026-10-02 09:39:05`). Logcat de la app sin errores.
- **Reversión** a S2.15.4 (`f59153e3…27c8`):
  `adb -s 61161FDCG0013L install -r E:\projects\faceclaw-es-navgps\dist\conversation-g0\before-install-20261017-182339.apk`.

## Prueba física desde las G2 (20:28–20:29, interior): cerrada

El usuario pidió desde las G2 navegar a un sitio cercano en interior. Fuentes: `dumpsys location` del Pixel, journal
de `faceclaw-hermes` en EVO-X2 y logcat (todo en solo lectura).

| Hora | Llamada (puente) | Resultado | Ubicación (Pixel) |
|---|---|---|---|
| 20:28:53 | `nav.start_navigation` | error en 2,7 s: «No places found matching "Supermercado Consum Av. de França 67, Vila-real"» | gps + **network**; red entrega a los **36 ms** |
| 20:28:56 | `nav.start_navigation` | **ok en 1,2 s** | gps + network; red entrega a los **120 ms** |
| 20:29:17 | `nav.stop_navigation` (agente) | ok | tracker parado |
| 20:29:22 | `nav.start_navigation` | **ok en 3,2 s** | gps + network; red entrega a los **85 ms** |
| 20:29:42 | — | las gafas vuelven al lanzador (Navigate cerrada) | tracker parado |

- Antes del cambio, las dos llamadas de las 19:53 agotaban los 10 s sin ninguna posición. Ahora el primer fix llega
  en menos de 0,2 s y la navegación arranca. Con la ruta activa, la brújula de las gafas está encendida (logcat
  `FaceclawCompass`, 20:28:59), y eso solo ocurre en navegación o mapa.
- En interior no llegó ningún fix GPS durante la prueba, así que la red siguió alimentando la guía todo el tiempo,
  como estaba previsto.
- Aparte, y no relacionado: la primera búsqueda falló porque el agente pasó a Mapbox una dirección larga con el
  nombre del comercio delante. Reintentó con otra consulta y funcionó.
