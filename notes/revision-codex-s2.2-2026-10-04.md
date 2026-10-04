# Revisión Codex de S2.2 — 04-10-2026

**Resultado: candidata S2.2 validada como software, apta para una instalación conservadora de la APK exacta. Sin hallazgos bloqueantes en esta revisión.** F3 adicional queda resuelto, y las regresiones de F1/F2/F4/F5 siguen pasando. Esto no acredita todavía identificación/tiempos Soniox en dispositivo ni el comportamiento del producto final con Hermes.

Revisión sobre HEAD `ae55d83`, rama `codex/conversation-detection-g0`, con todos los cambios locales conservados. Se contrastó el [informe de Claude](informe-claude-s2.2-frontera-2026-10-04.md) con código, pruebas y APK. Codex no cambió la app, recompiló Android, instaló, capturó, hizo prueba física ni commit. S1 sigue siendo la última versión instalada documentada; no se consultó el teléfono. S2/S2.1 y el worktree reconstruido se conservan.

## F3 completado

- El turno pendiente conserva las palabras y sus tiempos reales. Las subpalabras contiguas sin separador se agrupan; el reparto no corta una palabra ni inventa tiempos.
- `boundary()` registra primero la frontera y reparte tanto el turno abierto como los cerrados retenidos. Una palabra que cruza queda sola; los tramos conservan el orden.
- El motor informa al constructor de turnos de `sentMs` al abrir y después de cada envío. Un cierre con tiempos posteriores al audio enviado se retiene; se libera al cubrir el final, al repartir por un nuevo corte o al terminar la sesión. Todos los cierres pasan por esta regla, sin reescribir turnos emitidos.
- Los turnos retenidos guardan relación/versión del momento del cierre. `prepareStop()` sigue cerrando y vaciando los pendientes antes de borrar identidad, y `clear()` descarta pendientes en fallback/limpieza.
- Las dos sondas integradas de Codex pasan **sin modificar el script anterior**: `antes`/`después` separados, y `antes`/`cruza` con la palabra que cruza sola; ambos con cero tiempos inválidos y tiempos originales.

Límites aceptados y documentados: una subpalabra recibida después del cierre empieza un turno nuevo; el límite de longitud cierra al empezar la palabra siguiente y puede exceder 600 caracteres en una palabra. La retención exige hasta 100 ms adicionales de **audio enviado**, no garantiza 100 ms de reloj si la captura está suspendida. En ese caso sigue pendiente hasta un corte o el fin de sesión. La sesión conserva su tope actual de 120 s.

## Verificación independiente

- `tsc -p tests/tsconfig.json`: correcto.
- Área conversación: **152/152**, incluidas las 12 regresiones nuevas y todas las regresiones previas. Log propio `.tools/codex-s2.2-review/conversation.log`.
- `tsc -p tsconfig.json --noEmit` y `oxlint`: salida 0 de ambos.
- `.tools/codex-s2.1-review/boundary-probe.cjs`: salida 0; nueva salida guardada en `.tools/codex-s2.2-review/boundary-probe.log`, sin alterar la evidencia previa.
- Bundle de la APK firmada extraído y módulo puro `ConversationTurns` ejecutado mediante AST, sin app/Android/red. Sonda del reparto original y comprobaciones adicionales de retención por endpoint, reparto, conservación de relación/versión/seq y borrado de pendientes: correctas. Script/log propios `.tools/codex-s2.2-review/bundle-probe.cjs` / `bundle-probe.log`.
- No se repitió suite completa, Kotlin ni build Android: no cambian los módulos de los dos fallos previos ni las nativas. La ejecución 11/12 fallos contra S2.1 sigue siendo evidencia de Claude, no una nueva ejecución independiente de Codex. Los logs release/lintVital de Claude se inspeccionaron; no se atribuyen a Codex.

## APK exacta

| Elemento | Resultado verificado |
| --- | --- |
| Paquete / versión / código (`aapt`) | `com.faceclaw.app` / `0.8.2-es.5-conversation.s2.2` / 805 |
| APK firmada SHA-256 | `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa` |
| APK unsigned SHA-256 | `f86043dab452cbd48d3f8f72da62000a13021e08e5eee98f75dff426a3eaa2ba` |
| Certificado original (`apksigner`, v2/v3 correctas) | `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` |
| Bundle empaquetado SHA-256 | `7cae006abc74eb72f4d46b1ea10afa16c762da9f2637020aabde68093fe539e2` |

Comparación independiente de las 565 entradas ZIP sin metadata de firma: frente a S1 unsigned solo cambian `AndroidManifest.xml` y `assets/app/bundle.mjs`. Las siete `.so`, ambos dex, recursos, runtime/vendor y `package.json` son idénticos. Firmada/unsigned coinciden entrada a entrada; bundle generado y empaquetado coinciden por hash. Script/log propios `.tools/codex-s2.2-review/apk-check.ps1` / `apk-check.log`.

Hashes de las candidatas antiguas firmadas y unsigned S2/S2.1 comprobados idénticos a la revisión anterior. No se sobrescribieron los bundles/logs de Codex S2.1.

## Requisito del producto final confirmado durante esta revisión

El usuario precisa que, cuando la app esté terminada, **las pantallas de las gafas estarán apagadas durante la escucha y no mostrarán la conversación ni su transcripción**. Mostrarán los mensajes de Hermes cuando intervenga. Registrar este comportamiento en el siguiente diseño e implementación; la vista de conversación actual es un diagnóstico provisional.

Esta aprobación S2.2 valida la identificación por sesión y los turnos; aún no implementa ese comportamiento final ni conecta las conversaciones a Hermes. Se conservan la decisión de dejar la TV como está, Soniox/Whisper, perfil, tope de 120 s, privacidad y OFF explícito. Sin firmware ni Wear. Precisión humana y origen común de los tiempos Soniox continúan pendientes de observación en dispositivo.

Siguiente encargo preparado: [instalar la APK exacta sin ensayo](prompt-claude-instalar-s2.2-2026-10-04.md). No enviado ni ejecutado en esta revisión. La prueba breve de identificación se prepara después de la instalación y comprobación OFF, en su encargo específico; no se inicia captura automáticamente.
