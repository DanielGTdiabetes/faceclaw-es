# Validación del diseño S2 corregido — Codex, 04-10-2026

**Dictamen: diseño apto para implementación con las precisiones concretas de abajo.** No hace falta otra ronda de diseño. La implementación y su APK candidata se revisarán como una entrega distinta; todavía no existen ni se han probado.

Documento validado: `notes/revision-claude-s2-identificar-portador-2026-10-04.md`, SHA-256 `144fb083c7c37da5ec452b8942a147f315bb36867fcaf7aa66c77bd5eceb0284`. La copia aportada en `D:\Descargas` coincide exactamente. HEAD sigue en `ae55d83`.

## Resultado de la revisión

- R1 resuelto: frase completa y ordenada, tres variantes cerradas, reconstrucción por subpalabras y fronteras explícitas. Se elimina el contraejemplo de tres palabras comunes. La asociación se describe como declaración cooperativa, no como biometría.
- R2 resuelto: elección/borrado manual cancela intento, evidencia y temporizadores; comprobación de sesión/stream/intento/estado y rechazo de menús antiguos.
- R3 resuelto: tabla única, `knownOthers` fijado al asociar, etiquetas posteriores desconocidas y `speaker: null` tratado explícitamente. Se documenta la limitación si Soniox ya había dividido a una persona antes de asociar.
- R4 resuelto a nivel de contrato: tiempos/progreso validados, ventanas disjuntas, intervalos por unión, plazos monotónicos y cierre por pausa con evidencia de audio. El origen de los tiempos sigue correctamente declarado como supuesto, sin garantía ficticia.
- Los ajustes de suscripción, tupla de identificadores, menú completo, latencia de red y errores por categorías están recogidos.

Las 42 pruebas de §8 son **casos propuestos**, no pruebas ejecutadas. Su cantidad no acredita funcionamiento; verificar resultados y fronteras reales al implementar.

## Precisiones que prevalecen para la implementación

1. **Caída a Whisper:** §10.6 contradice §4.7 al decir que se borra el texto. Mantener el comportamiento S1: al caer a local se borra la identidad y el buffer de intervenciones Soniox, sin emitir nuevas intervenciones locales; el texto Soniox anterior (`fallbackText`) y la transcripción local siguen disponibles hasta OFF. Un fallo de red con reserva local operativa no equivale a un error terminal de la sesión. OFF, expiración o error terminal sí borran el texto temporal.

2. **Resumen antes de invalidar la identidad:** actualmente `ConversationCaptureCoordinator.cleanup()` llama a `release()` y después a `transcription.stop()`. `release()` llama a `resetStream()`, que en S2 cancelaría el intento con `audio-interrumpido`. Por tanto no basta con construir el resumen al principio de `SonioxConversationTranscription.stop()`: hay que conservar la identidad previa y el intento pendiente **antes** del reset de limpieza para que OFF registre `cancelado-off`. Implementar un punto explícito de captura del resumen o un motivo de finalización que se propague antes de esa invalidación, conservando el arbitraje y parada nativa actuales. Un reset por hueco o cesión real sigue siendo `audio-interrumpido`, no OFF. Probar las rutas completas del coordinador, además de la clase de identidad aislada.

3. **Mensajes con tokens y progreso:** consumir todos los tokens de un mensaje antes de evaluar una ventana con su progreso. Así una primera frase no se acepta antes de procesar otra frase/voz del mismo mensaje que hace el intento ambiguo. Probar finales y watermark suficiente en el mismo mensaje.

4. **Cobertura de turnos:** además de los casos de identidad, verificar cierres por cambio de hablante, `<end>`, `<fin>`, frontera, límite y fin de sesión; secuencias, ring de 40, baja de listeners y borrado en OFF/fallback. El número final de pruebas puede variar si se agrupan o amplían casos sin perder cobertura.

Estas precisiones son acotadas y verificables en código; no cambian la alternativa elegida ni exigen reabrir el diseño. Mantener configuración Soniox, 120 s, perfil, firma, ajustes, Whisper de reserva, ausencia de filtros TV y ningún envío a Hermes.

## Verificación de esta validación

Lectura de la revisión corregida completa y de los contratos relevantes; comparación de hashes de ambas copias; contraste con la validación inicial, `coordinator.ts` y `soniox-conversation.ts`. No se modificó la app ni se ejecutaron pruebas de una implementación inexistente. Las fuentes oficiales Soniox ya comprobadas en la validación inicial siguen referenciadas allí.
