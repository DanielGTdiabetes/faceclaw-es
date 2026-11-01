# Encargo a Claude: implementar S2 — identificación explícita por sesión

Implementa S2 en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, partiendo del estado actual sin descartar cambios locales. Lee `AGENTS.md`, `notes/continuidad-entre-pcs.md`, el diseño corregido `notes/revision-claude-s2-identificar-portador-2026-10-04.md` y la aprobación `notes/validacion-codex-s2-corregido-2026-10-04.md`. Esta última fija las precisiones que prevalecen sobre contradicciones menores del diseño. HEAD revisado `ae55d83`.

## Implementación

Identificación por frase completa o selección manual válida, compartida entre móvil y lentes. Estados y relación con el portador por sesión/stream, temporizadores monotónicos, invalidación de resultados tardíos y menús antiguos, reconstrucción de subpalabras, validación de tiempos/progreso y tratamiento explícito de etiquetas desconocidas. Añade los eventos/intervenciones en RAM y el resumen agregado después de OFF. Nada de texto, audio, vectores o claves en resumen/eventos de asociación.

Resuelve en la propia implementación las cuatro precisiones de Codex:

- Al caer a Whisper conserva la continuidad del texto S1 hasta OFF y elimina identidad/intervenciones Soniox. No conviertas un fallback operativo en error terminal.
- Captura el estado de identidad y el intento pendiente antes de que `release()`/`resetStream()` de la limpieza los invalide. OFF/expiración/error terminal guardan `cancelado-off` si había intento; hueco o cesión conservan `audio-interrumpido`. Mantén el arbitraje, la revocación de entregas y la parada de captura existentes.
- Procesa todos los tokens de cada mensaje antes de evaluar la ventana con su progreso.
- Cubre el ciclo completo de turnos, sus límites, listeners y borrado, además de los casos de identidad.

Mantén la configuración Soniox aceptada, el tope 120 s, Whisper como reserva y el perfil existente. Sin nuevo registro, filtros de televisión, cambios Kotlin/AAR/nativas/firmware/Wear, ni conexión/envío de conversaciones a Hermes. Usa el MCP oficial Soniox para aclaraciones del contrato si son necesarias.

Haz la interfaz sencilla: mostrar frase y estado durante identificación, «Yo» para la etiqueta asociada y acceso a corrección/cancelación manual. Abrir/restaurar pantallas no inicia captura. Ningún intento debe bloquear la transcripción ni repetir avisos. Conserva los gestos actuales en lentes.

## Verificación y APK candidata

Implementa y ejecuta las pruebas relevantes propuestas por el diseño, más las precisiones de esta aprobación, usando el harness de socket/reloj y las rutas del coordinador. No afirmar que las 42 propuestas ya pasaban: documenta las que realmente ejecutas y cualquier fallo. Ejecuta TypeScript, lint y las comprobaciones apropiadas del proyecto para los archivos afectados; después prepare/webpack, build Android y lintVital para la APK candidata. No regenerar Kotlin/AAR si no cambian.

Prepara una APK candidata `0.8.2-es.5-conversation.s2`, código 805, con la firma española original. Antes de usar los scripts de firma verifica que existen tanto `.tools/signing/faceclaw-es.jks` como `store.password`; nunca crear una sustituta. Verifica certificado original, paquete, versión y hashes; conserva bibliotecas nativas y configuración runtime. No leer/imprimir secretos. No instales la candidata ni inicies una prueba física en este encargo: entrega el código y artefacto concretos para revisión de Codex.

## Entrega

Guarda el informe en `notes/informe-claude-s2-identificar-portador-2026-10-04.md`, con archivos modificados, decisiones, pruebas realmente ejecutadas, ruta/hash de APK candidata, evidencia de firma y limitaciones pendientes de prueba humana. Corrige en el diseño §10.6 para distinguir fallback y cierre terminal, y documenta la captura del resumen antes de invalidación.

Actualiza AGENTS/continuidad distinguiendo S2 preparada de S1 instalada. Conserva las notas de revisión y otros cambios locales; no reset/clean, instalación o envío automático a otra conversación. La entrega no necesita un commit o publicación para ser revisable: indica HEAD y el estado de cambios final. El usuario pasará la entrega a Codex para validar antes de la actualización del móvil.
