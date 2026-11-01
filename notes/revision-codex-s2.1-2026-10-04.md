# Revisión Codex de la candidata S2.1 — 04-10-2026

**Resultado: F1, F2, F4 y F5 resueltos; F3 requiere un ajuste adicional antes de aprobar la candidata para instalación.** La separación de finales que llegan después de registrar una frontera funciona. Queda un caso reproducido con tokens ya incorporados al turno abierto cuando se registra el corte. No se ha modificado la app, recompilado Android, instalado, capturado ni hecho commit. S1 sigue siendo la última instalada documentada; no se ha consultado el teléfono.

Revisión sobre HEAD `ae55d83`, rama `codex/conversation-detection-g0`, conservando los cambios locales. Entrega contrastada: [informe Claude](informe-claude-s2-correcciones-codex-2026-10-04.md). Las entradas previas de cinco defectos y «pendiente de revisión» quedan superadas por este resultado para la candidata S2.1 exacta.

## F3 adicional · P2 · La frontera nueva no se aplica a los tokens ya en el turno abierto

`app/conversation-detection/conversation-turns.ts:110`: `boundary(atMs)` cierra el turno **antes** de registrar la frontera. El turno solo conserva texto y extremos agregados, sin los tokens necesarios para volver a repartirlo. `segmentOf()` protege las recepciones posteriores, pero no lo que ya estaba abierto.

La ruta real acepta tiempos hasta `sentMs + 100` en `SonioxConversationTranscription.validTiming()`. Por tanto, una frontera nueva en `sentMs` puede quedar dentro de un token ya aceptado o antes de su inicio. No hace falta invalidar el protocolo ni saltarse el validador para reproducirlo.

Reproducción integrada (coordinador y motor reales, socket/reloj simulados, sin dispositivo):

1. Enviar 1000 ms de PCM simulado.
2. Recibir dos finales de voz 2, sin endpoint: `antes` 500–690 ms y ` después` 1010–1090 ms. Ambos pasan el validador vigente: contador `invalidTimingTokens = 0`.
3. Ejecutar `resetStream()`: la frontera es 1000 ms.
4. Sale **un turno** `antes después`, 500–1090 ms, `timing: valido`, `closedBy: frontera`. Une tokens a ambos lados del corte.

Segundo caso: sustituir el último token por ` cruza`, 900–1050 ms. Sale `antes cruza`, 500–1050 ms. El token que cruza no queda solo como exige la política de S2.1.

Esto no afirma que Soniox haya producido esos tiempos en el móvil. Es un defecto del contrato de software con valores que la implementación acepta expresamente como válidos por tolerancia de redondeo. La afirmación «las intervenciones nunca abarcan los dos lados de un corte» aún no se cumple.

Evidencia local:

- `.tools/codex-s2.1-review/boundary-probe.cjs` y `boundary-probe.log`: los dos casos integrados; aserciones del resultado **correcto**, actualmente fallan.
- `.tools/codex-s2.1-review/bundle-probe.cjs` y `bundle-probe.log`: extracción mediante AST y ejecución del módulo puro `ConversationTurns` del bundle de la APK firmada exacta. También produce `antes después`, 500–1090 ms, al registrar la frontera en 1000. La aserción correcta falla. No se ejecuta la app ni se usa Android/red.

Corregir el tratamiento de tokens ya pendientes y de la tolerancia temporal, con una política conservadora que no invente tiempos, parta palabras ni reescriba turnos ya emitidos. Añadir regresiones por la ruta integrada para estos dos casos; revisar también el cierre por endpoint/pausa/límite antes de registrar una frontera cuando hay un token cuyo tiempo supera el audio enviado. No basta con más pruebas donde la frontera precede a todos los finales.

## Correcciones verificadas

- **F1:** `tick()` comprueba los plazos en las rutas de recepción/acciones/OFF. Progreso tardío no asocia; la ventana de escucha no se alarga con audio tardío; el plazo de resultado arranca en el límite de 8 s cuando el temporizador se retrasa. Las regresiones de frontera exacta y justo antes del plazo pasan.
- **F2:** los menús capturan sesión, stream, secuencia de intento y versión. Las acciones retenidas de A no actúan sobre B ni entre OFF/ON; la elección manual vigente sigue cancelando. Precisión: el código valida la versión para «Identificar»; «Listo/Cancelar» validan stream e intento, y una reasignación manual ya invalida ese intento. No se ha encontrado una acción de menú vigente que eluda esa protección.
- **F3:** los finales recibidos después del corte se separan por sus tiempos; varias fronteras, `<fin>` retrasado y tokens que cruzan una frontera ya registrada quedan cubiertos. Permanece únicamente el caso adicional anterior.
- **F4:** turno cerrado antes de terminar identidad; relación/versiones y orden de evento comprobados para OFF y expiración. Intento realmente pendiente sigue `cancelado-off`. La modificación del test antiguo de expiración es coherente: aquel intento con solo 500 ms ya terminaba por `audio-insuficiente` a los 8 s.
- **F5:** plegado explícito presente en fuente y bundle, sin normalización ICU para la frase. Pasan las pruebas con `normalize` no-op, ausente o que lanza, y los controles de frase completa/exacta.

Para la política de tiempos inválidos de F3 se consultó el MCP oficial: [seguimiento de progreso](https://soniox.com/docs/stt/rt/real-time-transcription#audio-progress-tracking) describe `final_audio_proc_ms` como audio ya procesado en finales, y explica que su ejemplo de 4800 corresponde al audio finalizado hasta 4,8 s. Esto respalda su uso como frontera de progreso; no valida en dispositivo el origen común de tiempos de tokens y contador enviado.

## Verificación independiente

- `tsc -p tests/tsconfig.json`: correcto; **140/140** del área conversación, incluidas las 31 regresiones de Claude. Log: `.tools/codex-s2.1-review/conversation.log`.
- `tsc -p tsconfig.json --noEmit` y `oxlint`: ambos salida 0; logs propios `typecheck.log` y `lint.log`.
- Las dos sondas adicionales de F3 fallan con el resultado incorrecto detallado; no forman parte de las 140 pruebas de Claude.
- Fallo previo de `local-vad snapshots` reproducido. Prueba/módulo idénticos a HEAD. El test iOS correcto (`tests/ios-config-scripts.test.cjs`, módulo `scripts/ios_config.py`, ambos idénticos a HEAD) vuelve a fallar al lanzar `python3` con `EPERM`: no se revalida su lógica.
- No se repitió la suite completa de 871 ni el build Android/Kotlin. Se inspeccionaron los logs de Claude: 868 pasan/2 fallan/1 omitida y tareas de release/lintVital; no presentar esa suite como completamente correcta ni como ejecución independiente de Codex.
- No se ejecutó la comparación 26/31 contra el S2 reconstruido; ese resultado sigue siendo de Claude. El worktree `.tools/s2fix/orig` se conserva, no se retira ni altera.

## APK exacta contrastada

| Elemento | Resultado verificado |
| --- | --- |
| Paquete / versión / código (`aapt`) | `com.faceclaw.app` / `0.8.2-es.5-conversation.s2.1` / 805 |
| APK firmada SHA-256 | `3eb703c8908dd5d40933a836f9f155ec2df86a0112c7e5aca6d99dbfd8f69932` |
| APK unsigned SHA-256 | `af31ba2a0df07b157ef0f7b8a4b663f08fc8b254ca8cbb65abe73e3960d94e96` |
| Certificado original (`apksigner`, v2/v3 correctas) | `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` |
| Bundle empaquetado SHA-256 | `2ae25a746396a2a9d040ca57e421c3a38ed895fa11017e72dbae016fd284d5c4` |
| APK S2 anterior conservada SHA-256 | `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207` |

Comparación de **todas las entradas ZIP**, excluyendo metadata de firma: frente a S1 unsigned solo cambian `assets/app/bundle.mjs` y `AndroidManifest.xml`. Las siete `.so`, dex, recursos, runtime/vendor y `package.json` son idénticos. Las entradas de la candidata firmada y unsigned coinciden. El bundle generado en `platforms` coincide por hash con el empaquetado. Script/log propios: `.tools/codex-s2.1-review/apk-check.ps1` / `apk-check.log`.

La frase, tabla de plegado, referencias de acciones y argumento temporal de `boundary` están presentes. La normalización antigua de S2 está ausente. Quedan cuatro llamadas `.normalize(` fuera de este plegado; las tres cadenas Unicode son de calculadora, nombres de micrófonos y teleprompter, y la cuarta es un callback genérico de ajustes. No se cambian esas áreas ni se afirma que las cuatro llamadas tengan idéntica finalidad.

Siguiente paso: [encargo acotado de F3](prompt-claude-corregir-frontera-s2.1-2026-10-04.md), nueva candidata firmada y revisión. Alcance conservado: TV como está, Soniox/Whisper/perfil, 120 s absolutos, sin conversaciones a Hermes, firmware ni Wear. Precisión humana y escala temporal Soniox en dispositivo siguen pendientes.
