# S2 implementado: identificación explícita del portador — informe Claude, 04-10-2026

Encargo: `notes/prompt-claude-implementar-s2-identificar-portador-2026-10-04.md`. Diseño `notes/revision-claude-s2-identificar-portador-2026-10-04.md` (validado con SHA-256 `144fb083…` y ahora corregido en §6 y §10.6) y precisiones de `notes/validacion-codex-s2-corregido-2026-10-04.md`, que prevalecen.

**Estado: código, pruebas y APK candidata firmada preparados para revisión Codex. No instalada, sin prueba física ni captura.** S1 sigue siendo lo instalado en el móvil.

> **Superado, 04-10-2026:** Codex reprodujo cinco defectos (F1–F5) en esta entrega. Corregidos en [informe de correcciones](informe-claude-s2-correcciones-codex-2026-10-04.md), candidata nueva `0.8.2-es.5-conversation.s2.1` (`3eb703c8…`). La APK `0613d273…` de este informe queda sustituida. **Corrección:** la normalización descrita abajo no correspondía al código entregado; ver la nota en «Decisiones».

- Rama `codex/conversation-detection-g0`, HEAD `ae55d83` sin commits nuevos. Todo el trabajo queda como cambios locales sin commit, junto a los que ya había (AGENTS, notas de revisión y prompts, `scripts/__pycache__/`). No se hizo reset, clean ni stash.
- Durante el trabajo aparecieron dos notas nuevas de Codex (`aclaracion-activacion-hermes-conversacion…`, `soniox-capacidades-conversacion-hermes…`) y una entrada nueva en AGENTS. Se leyeron, se conservan y no cambian el alcance de S2.

## Qué hace

- **Identificar mi voz**: el usuario dice «Soy yo quien lleva las gafas». Solo se aceptan además dos variantes cerradas, «soy yo el que…» y «soy yo la que…».
  - Ventana: cierra a los 5 s de audio enviado, con «Listo» o a los 8 s de reloj monotónico.
  - Resultado: se evalúa cuando `final_audio_proc_ms` cubre el final de la ventana más 300 ms. Plazo de 6 s.
  - Se acepta la etiqueta que contiene la frase completa y en orden, en un único tramo de tokens finales contiguos de esa etiqueta, con tiempos válidos, sin solapamiento de otras voces por encima de 300 ms (calculado por unión de intervalos) y con al menos 700 ms de unión de intervalos de la frase.
  - Cualquier otro caso se abstiene y muestra un único motivo.
- **Soy la voz N / No soy ninguna**: lista de todas las etiquetas del stream vigente, la asociada primero.
  - Cancela el intento pendiente, junto con su identificador, temporizador y evidencia.
  - Cada opción lleva `(sessionId, streamId)`. Un menú antiguo, o una etiqueta no observada en el stream, se rechazan.
- **Relación única** (§4.5):
  - `portador` para la etiqueta asociada.
  - `otro` para las etiquetas vistas con tiempos válidos antes de asociar (`knownOthers`).
  - `desconocido` para etiquetas posteriores, tokens sin etiqueta o cuando no hay asociación.
  - En el texto: `Yo:`, `N:` y `N?:`. Sin asociación, `N:` como en S1.
- **Intervenciones en RAM** (ring de 40) desde tokens finales.
  - Cierre por cambio de hablante, `<end>`, `<fin>`, frontera de captura, pausa con evidencia (hueco de audio ≥ 1500 ms o progreso que lo cubre), 600 caracteres o fin de sesión.
  - La relación se fija al cerrar y nunca se reescribe. `subscribeTurns` sin repetición al suscribirse.
- **Eventos de asociación**: `subscribeAssociation` entrega un `estado-inicial` inmediato y después los eventos `frase`, `manual`, `borrado` y `fin-sesion`. Solo llevan etiquetas.
- **Resumen tras OFF** (`lastSessionSummary`), sin texto. Incluye:
  - audio enviado y progresos;
  - backlog;
  - tiempo hasta el primer token o el primer final (reloj monotónico, incluye red y servicio);
  - contadores, incluidos los rechazos de tiempos y progreso;
  - categoría de error estable: `red`, `config`, `envio-audio`, `fin-servidor`, `servidor:<error_type documentado>` o `servidor-otro`;
  - estado de identidad previo al borrado;
  - `endedBy` desde el `stopReason` del coordinador.

  Se ve en «Métricas tras OFF».
- **Sin cambios** en la configuración Soniox, el tope de 120 s, el perfil, Kotlin, el AAR, las nativas, el firmware, Wear ni Hermes. No se envía nada a Hermes. Sin filtros de televisión.

## Precisiones de Codex resueltas

1. **Caída a Whisper** (`startLocal(true)`): la identidad termina como `motor-local` y el ring de intervenciones Soniox se vacía, sin intervenciones locales (`turnsAvailable: false`). `fallbackText` y el texto local siguen hasta OFF. La sesión sigue ON, sin error terminal.
2. **Captura antes de invalidar**: `ConversationCaptureCoordinator.cleanup()` llama a `transcription.prepareStop()` **antes** de `release()`.
   - `prepareStop()` cierra la identidad (`cancelado-off` si había intento, guardando el estado previo) y las intervenciones (`fin-sesion`), y marca `ending`.
   - El `resetStream()` de la limpieza ya no se toma como hueco. Un hueco o una cesión reales siguen dando `audio-interrumpido` y la sesión continúa.
   - El arbitraje, la revocación (`++epoch`), el `finalize` y `lease.stop()` no cambian.
   - `endedBy` se compone en `coordinator.lastSessionSummary()` con el `stopReason` vigente, así que `expire()` aparece como `expired` aunque lo fije después de la limpieza.
3. **Mensajes completos**: `handle()` recorre todos los tokens del mensaje (identidad, intervenciones, marcadores) y solo después aplica `final_audio_proc_ms` a intervenciones e identidad.
4. **Turnos**: cubiertos cierres, secuencia, ring, baja de listeners y borrado en OFF y en fallback (pruebas abajo).

## Decisiones de implementación (para revisar)

- **Ventanas disjuntas**: `windowStartMs = max(streamMs, límiteAnterior + 1)`, con `límiteAnterior` = fin de ventana anterior + 300.
- **El progreso nunca supera el audio enviado más 100 ms**. Por eso un intento solo se evalúa cuando han salido al menos 300 ms de audio tras cerrar la ventana. Con captura continua ocurre solo. Si el audio se detiene, el resultado es `sin-resultado` a los 6 s.
- **«Listo»** con menos de 2 s de audio de ventana da `audio-insuficiente`, sin evaluar.
- **Frase en dos etiquetas** → `frase-ambigua`, aunque una de las dos no cumpla el resto de requisitos (criterio conservador).
- **El turno que contiene la frase** suele cerrarse con su `<end>` antes del progreso que asocia. Queda `desconocido`, con `associationVersion` previa. El evento de asociación posterior permite recalcularlo. No se reescribe, por contrato.
- **[Corrección F5: el código entregado con este informe seguía usando `text.normalize("NFD")` y `toLowerCase()`; la tabla descrita a continuación solo existe desde la corrección s2.1.]** **Normalización sin `String.normalize` ni escapes de propiedad Unicode**: la V8 de Android no tiene ICU (`tests/unicode-class.test.cjs` lo prohíbe y detectó el primer borrador). Se usan una tabla explícita de acentos castellanos y valencianos, la eliminación de marcas combinantes U+0300–U+036F y un separador a-z/0-9.
- **Sin pantallas nuevas**:
  - Móvil: una línea de portador y el botón «Mi voz · identificar o corregir», visible solo en ON con Soniox, que abre la lista de acciones.
  - Lentes: línea de portador o frase pedida y entradas de menú; el submenú «Soy la voz…» usa `openModalMenu`. Gestos sin cambios.
  - Abrir o restaurar no inicia captura.

## Archivos

| Archivo | Cambio |
|---|---|
| `app/conversation-detection/wearer-identity.ts` (nuevo, 378 líneas) | Frase, reconstrucción por tramos y subpalabras, evaluación §4.3, máquina de estados con tupla e intento, temporizador por intento, relación, eventos y resumen |
| `app/conversation-detection/conversation-turns.ts` (nuevo, 92) | Intervenciones, ring, suscripción y borrado |
| `app/native/soniox-conversation.ts` | Tiempos y progreso validados (§4.1), `sessionId`/`streamId`, fronteras, `prepareStop`, fallback, resumen y categorías, render `Yo`/`N`/`N?`, API S2. Configuración Soniox idéntica |
| `app/conversation-detection/transcription.ts` | Tipos S2 y métodos opcionales del puerto |
| `app/conversation-detection/coordinator.ts` | `prepareStop()` antes de `release()` en `cleanup()`. Pasarelas S2 condicionadas a ON (identificar exige `escuchando`). `lastSessionSummary()` con `endedBy` |
| `app/conversation-detection/session-controls.ts` | `wearerActions` y `wearerChoices`, compartidos por móvil y lentes |
| `app/conversation-detection/conversation-ui.ts` | `wearerLine` y textos de motivo |
| `app/apps/local-conversation/local-conversation-app.ts` | Línea de portador y `wearerMenuItems` |
| `app/phone-ui/main-view-model.ts`, `main-page.xml` | Etiqueta, botón, diálogo y resumen en métricas |
| `App_Resources/Android/app.gradle`, `scripts/install-conversation-g0.ps1` | Versión `s2` y validación del helper |
| `tests/wearer-identity.test.cjs`, `tests/soniox-s2.test.cjs` (nuevos); `conversation-lenses`, `conversation-phone-ui` (casos añadidos y stubs) | Pruebas |

## Pruebas realmente ejecutadas (logs en `.tools/s2-logs/`, local)

| Grupo | Resultado |
|---|---|
| `tests/wearer-identity.test.cjs` (nuevo, identidad pura + turnos) | **18/18** |
| `tests/soniox-s2.test.cjs` (nuevo: coordinador real + Soniox real + socket y reloj simulados) | **11/11** |
| Área conversación: los dos anteriores, `soniox-conversation`, `conversation-detection`, `-lenses` (+1 S2), `-phases`, `-phone-ui` (+1 S2), `-presence`, `-ui` y `unicode-class` | **109/109** (`node-conversation.log`) |
| Suite Node completa (`tests/*.test.cjs`) | **837 pasan, 2 fallan, 1 omitida de 840** (`node-full.log`). Los 2 fallos (`iOS config codec…`, `no input buffer or history survives accept…` de local-vad) ya fallaban según el informe A3. Sus módulos no se tocan aquí |
| `tsc -p tests/tsconfig.json`, `tsc -p tsconfig.json --noEmit` | 0 errores |
| `oxlint` | 0 avisos, 0 errores (495 archivos) |
| Kotlin | No ejecutado: sin cambios Kotlin, AAR ni nativas |

Correspondencia con los casos propuestos del diseño (§8). Las pruebas agrupan varios casos. No se afirma que las 42 propuestas existieran ni pasaran antes.

- **R1** (1–11): subpalabras; contraejemplo «Soy yo quien paga la cena»; tres palabras; desordenada; fragmentos separados por otra voz, `<end>`, hueco, etiqueta nula o dos etiquetas; variantes, tildes y tilde combinante; ambigua; interlocutor primero. Los no finales nunca entran en la evidencia, porque esta solo recibe finales.
- **R2** (12–18): elección manual durante la escucha seguida de la frase tardía; borrado durante la espera seguido del progreso; menú viejo tras OFF/ON (integración); etiqueta no observada; temporizador antiguo tras un nuevo intento; frase iniciada en el intento anterior; socket viejo tras OFF/ON.
- **R3** (19–23): `knownOthers`, etiqueta posterior `desconocido`, `null`, reasignación, borrado, render `Yo:`/`N?:`.
- **R4** (24–33): tiempos `NaN`, fuera del audio enviado o ausentes; unión sin doble cuenta; límites exactos +300 y +301; inicio antes de la ventana; implausible; progreso detenido; audio insuficiente por plazo monotónico; progreso decreciente o mayor que el audio; hueco y cesión reales; socket tardío sin pausa real; pausa con evidencia.
- **Sesión y privacidad** (34–42): OFF durante un intento (`cancelado-off`, `endedBy`, parada nativa y `finalize`); `expire` y error terminal; nueva sesión; fallback; categorías de error; ausencia de texto, frase, vista previa y clave en resumen, eventos y snapshot; suscripción; restricciones del coordinador (OFF, cargando, local, suspendido); lentes con 5 etiquetas sin tope de 4 y gestos intactos; móvil.
- **Precisión 3**: frase de dos voces y progreso suficiente en el mismo mensaje → `frase-ambigua`.

## Build y APK candidata

- Webpack producción Android (`--env android --env production`). El `package.json` del runtime se guardó y restauró: hash `70f23257…` idéntico al de S1. El bundle contiene la frase y ningún `\p{`.
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a` con el JDK 21 de Microsoft y el SDK local: `lintVitalRelease` ejecutado, APK unsigned generada (`gradle.log`). `compileReleaseKotlin` al día: no hay cambios Kotlin.
- Firma con `scripts/install-conversation-g0.ps1` **sin `-Install`**, tras comprobar que existen `faceclaw-es.jks` y `store.password`. No se creó ninguna clave ni se leyó o imprimió ningún secreto.

| Archivo (`dist/conversation-g0/`) | SHA-256 |
|---|---|
| `faceclaw-0.8.2-es.5-conversation.s2.apk` (140 796 861 B) | `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207` |
| `faceclaw-0.8.2-es.5-conversation.s2-unsigned.apk` (140 736 442 B) | `00c9b7bf4d98365dc8e7f1c78bacc9237bf746f5b192d001189478a12a62be6f` |

Evidencia (`verify-apk.log`):

- `aapt`: `com.faceclaw.app`, versionCode 805, versionName `0.8.2-es.5-conversation.s2`.
- `apksigner`: verificación v2/v3 correcta, `CN=Faceclaw Espanol`, certificado SHA-256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` (el original).
- Frente a la APK S1 unsigned: **siete bibliotecas nativas idénticas**, `assets/app/package.json` idéntico, `classes.dex` y `classes2.dex` idénticos. Solo cambia `bundle.mjs` (`a9dcb32c…`).
- No se copió nada al NAS en esta entrega.

## Limitaciones pendientes de prueba humana

- **Sin ejecución en el móvil**: ni UI, ni lentes, ni Soniox real. El origen de `start_ms`/`end_ms` y `final_audio_proc_ms` frente al audio enviado sigue siendo un supuesto: Soniox no lo documenta. Las pruebas usan tiempos coherentes simulados.
- **Comprobación humana propuesta** (§9 del diseño, una sesión): interlocutor primero, frase, frase parecida dicha por otra persona, corrección manual y OFF con resumen. Anotar si aparece `tiempos-invalidos`, si aparecen etiquetas `N?:` y si `invalidTimingTokens`/`invalidProgress` quedan en cero. Es una observación, no precisión.
- **Fricción**: el tope de 120 s obliga a identificarse en cada sesión. La nota de Codex sobre activación de Hermes descarta parchearlo con reinicios.
- **`toLowerCase` sin ICU**: se usa sobre letras castellanas y latinas. El plegado de acentos no depende de ICU.
- **Sin precisión acreditada** del acierto de la frase ni de la diarización. La televisión aparece como una etiqueta más, por decisión vigente.

## Reversión

Descartar estos cambios locales (o revertir el futuro commit) devuelve S1. La APK S1 instalada (`faceclaw-0.8.2-es.5-conversation.s1.apk`) sigue en `dist/conversation-g0/`.
