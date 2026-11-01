# S2 corregido tras la revisión Codex (F1–F5) — informe Claude, 04-10-2026

Encargo: `notes/prompt-claude-corregir-implementacion-s2-2026-10-04.md`. Revisión: `notes/revision-codex-implementacion-s2-2026-10-04.md`.

**Estado: F1–F5 corregidos, regresiones nuevas que exigen el comportamiento correcto, APK candidata nueva `0.8.2-es.5-conversation.s2.1` firmada para revisión. No instalada, sin captura, prueba física ni commit.** S1 sigue siendo lo instalado. La candidata `0613d273…` (`s2`) queda sustituida, no borrada.

- Rama `codex/conversation-detection-g0`, HEAD `ae55d83`, sin commits. Se conservan todos los cambios locales previos. Sin reset, clean ni stash.
- Alcance S2 intacto: sin Hermes, filtros de TV, cambio del tope de 120 s, perfil, Kotlin/AAR/nativas, firmware ni Wear. Configuración Soniox, `finalize` y endpoint sin cambios. Ningún socket nuevo.

## Correcciones

### F1 · Caducidad independiente del temporizador (`wearer-identity.ts`)

- `tick()` aplica todos los límites alcanzados por el reloj monotónico o `streamMs`. Es idempotente y lo llaman ahora todas las rutas de entrada: temporizador, `audio()`, `observeFinal()`, `observeMarker()`, `progress()`, `identify/finish/cancel/assign/interrupt`, `actionRef()`, `snapshot()` y `end()`.
- `progress()` comprueba el plazo de 6 s **antes** de evaluar. Una respuesta tardía deja `sin-resultado` y ninguna asociación, aunque el temporizador no haya corrido. Los tokens que llegan tras el plazo no entran en la evidencia.
- Límite de escucha de 8 s:
  - Un temporizador retrasado cierra la ventana en `openedAt + 8 s` y el plazo de 6 s empieza ahí, no en el momento tardío de la comprobación.
  - `audio()` comprueba el reloj con el `streamMs` anterior antes de sumarlo: el PCM recibido tras el límite no alarga la ventana.
  - `windowEndMs` nunca supera `windowStartMs + 5000`.
  - «Listo» después de los 8 s devuelve `false`: la ventana ya estaba cerrada.
- OFF/expiración: `end()` aplica primero el reloj. Un intento cuyo límite pasó hace tiempo queda con su resultado real (`audio-insuficiente` o `sin-resultado`), no `cancelado-off`.
- Se mantienen el progreso real (antes del plazo se acepta) y las ventanas disjuntas.

### F2 · Acciones antiguas (`session-controls.ts`, `wearer-identity.ts`, motor, coordinador, puerto)

- Nuevo `WearerActionRef = { sessionId, streamId, attemptSeq, version }`, capturado con `wearerActionRef()` cuando se construye el menú. `wearerActions()` lo pasa a cada acción.
- Validación al ejecutar:
  - **Identificar**: misma sesión y stream, **mismo `attemptSeq`** (ningún intento posterior) y **misma versión** de asociación, sin intento activo.
  - **Listo**: misma sesión y stream, `attemptSeq` = id del intento vivo, fase de escucha.
  - **Cancelar**: misma sesión y stream y mismo intento, en cualquiera de sus fases. Nunca un intento posterior.
- Las llamadas directas sin referencia (API, pruebas antiguas) se comportan como antes.
- Elección manual: sin cambios. Valida sesión y stream y sigue cancelando cualquier intento pendiente de la sesión vigente.

### F3 · Fronteras ante finales retrasados (`conversation-turns.ts`, `soniox-conversation.ts`)

- `resetStream()` registra `boundary(streamMs)` (audio enviado en el corte) y cierra el turno abierto como antes. OFF no registra frontera.
- Cada token final se coloca por **sus propios tiempos**, no por orden de llegada:
  - Token válido: segmento = número de fronteras `≤ startMs`. Terminar justo en la frontera cuenta como antes. Empezar justo en ella cuenta como después.
  - Token válido con una frontera **estrictamente dentro**: forma un turno propio con sus tiempos y su texto. No se parte ni se reparte entre lados.
  - Token con tiempos inválidos: se coloca en el último segmento solo cuando `final_audio_proc_ms` ha alcanzado la última frontera. La documentación oficial define `final_audio_proc_ms` como el «audio processed into final tokens», así que ya no pueden llegar finales anteriores. Antes de eso no se une a nada abierto ni se le une nada.
  - Dos tokens comparten turno solo si están en el mismo segmento numérico. Sin fronteras, todo queda en el segmento 0 y el comportamiento no cambia.
- No se usa `<fin>` para separar ni para asentar. Según la documentación, `finalize` finaliza el audio hasta ese punto y `<fin>` indica que terminó, pero eso no ordena los finales posteriores (Codex: «un `<fin>` posterior no garantiza la separación»).
- No se inventan tiempos ni palabras.

### F4 · Relación del último turno al OFF (`soniox-conversation.ts`)

- `prepareStop()` cierra primero el turno (`turnLog.finish()`), con la asociación aún disponible, y después termina la identidad (`identity.end("cancelado-off")`). Ambos van antes de `release()/resetStream()`, como antes.
- Orden observable: turno `fin-sesion` con `portador`/versión vigente → evento de asociación `fin-sesion`.
- Un intento pendiente sigue resumido como `cancelado-off`, con el estado previo.
- No cambia el caso aceptado: la frase cuyo turno cierra antes de confirmar la identidad sigue `desconocido` con la versión anterior.

### F5 · Plegado real sin ICU (`wearer-identity.ts`)

- `normalizeForPhrase()` ya no usa `normalize`, `toLowerCase`, ICU ni escapes de propiedad Unicode:
  - tabla explícita de letras precompuestas en ambas cajas (`áàâäãå`, `éèêë`, `íìîï`, `óòôöõ`, `úùûü`, `ñ`, `ç`, `ýÿ`), escrita en el código como escapes `\u00XX`, sin regex;
  - las marcas combinantes U+0300–U+036F se descartan comparando la unidad de código;
  - `A–Z` se pasa a minúscula sumando 0x20;
  - todo lo demás (puntuación, guiones, otros alfabetos, emoji, espacios) se convierte en separador.
- La coincidencia sigue siendo exacta, de frase completa, sobre las mismas tres variantes cerradas. Sin aproximación.
- **Corrección del informe anterior**: el §«Decisiones» de `informe-claude-s2-identificar-portador-2026-10-04.md` describía una tabla que el código entregado no tenía (usaba `text.normalize("NFD")` y `toLowerCase`). Ese informe queda anotado y este describe el código actual.

## Regresiones

Archivo nuevo `tests/soniox-s2-fixes.test.cjs`, con **31 casos**. Incluye las seis sondas de Codex (marcadas «Codex probe») con las aserciones invertidas: exigen el resultado corregido.

- **F1** (7): progreso tras el plazo sin temporizador; tokens tras el plazo; progreso justo antes del plazo (control); el límite de 8 s por reloj con PCM tardío (`frase-fuera-de-ventana`); «Listo» tardío y plazo contado desde el límite; `snapshot()`/OFF sin temporizador y ventanas disjuntas; integración coordinador + Soniox con `skip()` del reloj sin callbacks.
- **F2** (7): «Listo» de A sobre B; «Cancelar» de A (escucha y espera) sobre B; «Cancelar» del mismo intento tras cerrar la ventana (control); «Identificar» tras otro intento y tras un cambio de asociación; las tres acciones tras OFF/ON con el mismo número de intento; elección manual vigente que cancela B (control) y elección antigua tras OFF/ON; validación campo a campo de la referencia.
- **F3** (7): sonda Codex (500–690 / 1100–1290 con corte en 1000 → dos turnos); turno ya abierto; varias fronteras y frontera repetida; `<fin>` retrasado; token que cruza el corte y bordes exactos; tiempos inválidos sin asentar y asentados; integración con tiempos inválidos y sin reset.
- **F4** (4): sonda Codex (`portador`, versión 1, orden turno → `fin-sesion`); OFF con intento pendiente (`otro`, `cancelado-off`, `endedBy`); expiración; frase cerrada antes de confirmarse (control del caso aceptado).
- **F5** (6): composición, descomposición, mayúsculas, puntuación, subpalabras y variante «la que», con `normalize` en tres modos: no-op (V8 sin i18n), ausente y que lanza error; tabla de plegado; exactitud (sin parecidas, parciales ni palabras unidas); guarda de fuente sin `.normalize(`, `\p{`, `.toLowerCase(` ni `Intl.`.

El fixture de integración pasa de `tests/soniox-s2.test.cjs` al módulo compartido `tests/soniox-s2-stack.cjs`, sin cambios salvo `skip(ms)`. Así las regresiones ya no cortan el texto de otro test. `soniox-s2.test.cjs` lo importa.

**Las regresiones fallan sobre el código previo.** Sobre el S2 previo reconstruido, 26 de los 31 casos fallan. Los 5 que pasan son los controles de comportamiento que no debía cambiar.
- Árbol `.tools/s2fix/orig`: worktree desacoplado en `ae55d83` con los ficheros sin seguimiento originales (copia byte a byte) y mis ediciones revertidas por `.tools/s2fix/reconstruct-orig.cjs`, que exige coincidencia única en cada reversión.
- El mismo árbol da 109/109 en el área previa, como la revisión Codex.

Ajustes en pruebas existentes:

- `soniox-s2.test.cjs`, expiración: el caso usaba `wait(120 s)` con un intento de 500 ms abierto desde el principio y esperaba `cancelado-off`. Con F1 ese intento terminó a los 8 s por el reloj (`audio-insuficiente`), y la prueba lo exige ahora explícitamente. Se añade un caso con el intento todavía dentro de sus 8 s al expirar, que sigue dando `cancelado-off`.
- `conversation-lenses` y `conversation-phone-ui`: los dobles del detector exponen `wearerActionRef()`.

## Verificación ejecutada (logs en `.tools/s2.1-logs/`)

| Comprobación | Resultado |
|---|---|
| `tsc -p tests/tsconfig.json` | 0 errores |
| Regresiones nuevas `soniox-s2-fixes` | **31/31** |
| Área conversación: las 10 suites de la revisión + `soniox-s2-fixes` | **140/140** (109 previas + 31) — `node-conversation.log` |
| Suite Node completa `tests/*.test.cjs` | **868 pasan, 2 fallan, 1 omitida de 871** — `node-full.log`. Los 2 fallos son los previos de A3: `iOS config codec…` (lanzar `python3` en Windows) y `local-vad … snapshots are detached scalars`. Sus módulos y pruebas no tienen cambios respecto a HEAD |
| `tsc -p tsconfig.json --noEmit` | 0 errores |
| `oxlint` (495 archivos) | 0 avisos, 0 errores. Un primer aviso por `[...string]` en la tabla se corrigió con `split("")` (solo BMP) |
| Kotlin | No ejecutado: sin cambios Kotlin, AAR ni nativas |

## APK candidata nueva

- Versión `0.8.2-es.5-conversation.s2.1`, código 805, paquete `com.faceclaw.app`. Cambian solo el sufijo en `App_Resources/Android/app.gradle` y la validación/default de `scripts/install-conversation-g0.ps1`, que sigue aceptando `s2`.
- Webpack producción Android. `assets/app/package.json` del runtime guardado y restaurado: `70f23257…`, igual que S1/S2.
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a` con JDK 21 Microsoft: salida 0, `lintVitalRelease` ejecutado, `compileReleaseKotlin` UP-TO-DATE.
- Firma con el helper seguro sin `-Install`. Antes se comprobó que existen `faceclaw-es.jks` y `store.password`. No se generó ninguna clave ni se leyó o imprimió ningún secreto.

| Archivo (`dist/conversation-g0/`) | Bytes | SHA-256 |
|---|---|---|
| `faceclaw-0.8.2-es.5-conversation.s2.1.apk` | 140 796 861 | `3eb703c8908dd5d40933a836f9f155ec2df86a0112c7e5aca6d99dbfd8f69932` |
| `faceclaw-0.8.2-es.5-conversation.s2.1-unsigned.apk` | 140 737 126 | `af31ba2a0df07b157ef0f7b8a4b663f08fc8b254ca8cbb65abe73e3960d94e96` |
| Candidata anterior `…s2.apk`, **sustituida, conservada sin cambios** | 140 796 861 | `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207` |
| Anterior `…s2-unsigned.apk`, conservada | 140 736 442 | `00c9b7bf4d98365dc8e7f1c78bacc9237bf746f5b192d001189478a12a62be6f` |

Evidencia en `verify-apk.log`:

- `aapt`: `com.faceclaw.app`, 805, `0.8.2-es.5-conversation.s2.1`.
- `apksigner`: v2/v3 correctas, `CN=Faceclaw Espanol`, certificado `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Frente a S1 unsigned (y a la S2 anterior): **siete `.so` idénticas**, `classes.dex`, `classes2.dex`, `resources.arsc`, `runtime.mjs`, `vendor.mjs` y `package.json` idénticos.
- Cambian `bundle.mjs` (`2ae25a746396a2a9d040ca57e421c3a38ed895fa11017e72dbae016fd284d5c4`) y `AndroidManifest.xml` (por `versionName`).
- `bundle-check.log` sobre el bundle empaquetado:
  - frase presente;
  - plegado `normalize("NFD")…toLowerCase()` de S2 **ausente**;
  - tabla de plegado, `wearerActionRef` y `boundary(…sentMs)` presentes;
  - 0 escapes `\p{`.
- Quedan 4 `normalize(` en el bundle: calculadora (`normalizeSpoken`), nombres de micrófonos (`nameKey`), teleprompter (`normalizeWord`) y ajustes. Son anteriores a S2, no pertenecen a la identificación del portador y no se tocan. Observación para Codex: comparten la misma limitación sin ICU.
- No se copió nada al NAS.

## Copias y artefactos locales

- Antes de editar: `.tools/backup-pre-s2fix-20261004/untracked/`, copia byte a byte de los ficheros sin seguimiento.
  - El diff de los ficheros con seguimiento generado con PowerShell salió con pérdida de caracteres no ASCII. Queda renombrado `tracked-LOSSY-…-no-usar.diff`: **no usar**.
  - La referencia fiel del estado previo es el worktree `.tools/s2fix/orig`. Retirarlo cuando no haga falta con `git worktree remove --force .tools/s2fix/orig`.
- Las sondas de Codex `.tools/codex-s2-review/` no se han modificado. `reproduce.cjs` cortaba el fixture del texto de `soniox-s2.test.cjs`. Como el fixture está ahora en `tests/soniox-s2-stack.cjs`, ese corte ya no lo encuentra. Sus seis casos están en `soniox-s2-fixes` con la aserción corregida. Para reproducir el defecto original, ejecutar la suite nueva en `.tools/s2fix/orig`.
- Scripts auxiliares de esta tarea: `.tools/s2fix/`. Ninguno contacta dispositivos ni proveedores.

## Limitaciones

- Sin ejecución en el móvil ni en las lentes, sin Soniox real. El origen de `start_ms`/`end_ms` y `final_audio_proc_ms` frente al audio enviado sigue sin verificar en dispositivo. F3 supone que los tiempos de token y `streamMs` comparten origen, como ya hacía la ventana de identidad.
- F3 es conservador. Un token inválido antes de asentar la frontera queda en un turno propio. Un token que cruza el corte queda solo. Ambos pueden fragmentar una intervención real, nunca unir los dos lados.
- Sin precisión acreditada de frase ni diarización. Prueba humana pendiente, como en S2.
- `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md` se ha tenido en cuenta solo como contexto. No se implementan escucha continua ni clasificación de saludos o temas.

## Para la revisión Codex

1. Revisar el diff de los seis módulos citados y de las pruebas.
2. Ejecutar `tsc -p tests/tsconfig.json` y las 11 suites del área (140).
3. Opcional: la suite nueva en `.tools/s2fix/orig` (26 fallos esperados).
4. Verificar la APK `3eb703c8…` (firma, componentes y bundle).

No instalar hasta su validación.
