# Revisión independiente con GPT-6 Astra — interlocutor, 04-10-2026

Modelo solicitado: GPT-6 Astra, razonamiento alto (`high`). Revisa el problema antes del siguiente incremento de Claude. Este encargo está preparado; no se ha ejecutado una revisión con Astra ni enviado a otra conversación.

Trabaja en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. Consulta AGENTS.md, `C:\Users\danie\.codex\memories\faceclaw.md` y el estado real de Git; conserva todos los cambios locales. El último cierre documental previo es `279dd34`.

## Objetivo y evidencia

El producto debe detectar una conversación del portador con una o varias personas, transcribir las voces en castellano y más adelante alimentar un canal aislado de Hermes para respuestas/ideas breves en lentes. Ahora el portador se transcribe mucho mejor; del interlocutor apenas aparecen palabras y el usuario informa cero palabras en el último intento. La prueba por fases fue poco intuitiva y no produjo atribución fiable. No convertir el desarrollo en otra ronda de pantallas diagnósticas difíciles.

Lee:
- `notes/diagnostico-codex-c1-interlocutor-2026-10-04.md`: observaciones, contadores y límites de atribución.
- `notes/analisis-codex-referencias-g2-2026-10-04.md`: fuentes con versiones; upstream0.8.2/Microphones/Diarizer/Store ya integrados y Whisper multilingüe ya usado en Conversación local.
- `notes/revision-codex-c1-2026-10-04.md` e informes Claude de C1/instalación para separar revisión de software de funcionamiento físico.
- `notes/prompt-claude-captacion-interlocutor-2026-10-04.md`: propuesta de Codex que debes evaluar críticamente, no dar por aprobada.

La sesión disponible tenía 90,3s PCM, 4 segmentos/10,2s decodificados, 2 entregas y 2 rechazos por idioma; se ejecutó en `auto`, no demuestra el comportamiento forzado. «Otra persona» tiene 0chunks. Hubo 12pcmDeliveryDrops. OFF y drenaje comprobados después. El código revisado no usa el perfil propio como gate del ASR; eso no demuestra que la señal del interlocutor sea suficiente. La hipótesis VAD/segmentación sigue sin demostrar como causa física.

## Revisión solicitada

Sigue el recorrido real desde configuración de captura/firmware y PCM hasta VAD, buffer, decoder y publicación. Revisa canales, supresión/dirección/ganancia y diferencias respecto a otras rutas existentes solo donde el código lo sustente. Comprueba que no hemos descartado un filtro, un estado retenido o una configuración por leer únicamente el último módulo. Separa captación, detección de actividad, transcripción e identificación de hablantes.

Busca una explicación alternativa a la hipótesis de Codex. Evalúa especialmente el aprendizaje del ruido, apertura/cierre y voz lejana, mínimos de segmento, nivel que recibe Whisper, selección efectiva `es` y pérdidas de entrega. No asignes a la otra persona tramas o resultados cuya identidad se desconoce. No atribuyas causalidad a un contador agregado por coincidencia.

Decide si el control local sin gate VAD propuesto tiene poder diagnóstico y es el cambio más pequeño, o si hay una corrección anterior mejor respaldada. No recomendar cambiar de ASR, añadir modelos o fusionar módulos ya presentes sin justificar el fallo que resolvería. Si falta evidencia acústica para decidir, dilo y define el mínimo necesario; no inventes una causa para cumplir el encargo.

## Entrega concreta

Escribe `notes/revision-astra-interlocutor-2026-10-04.md` con:
1. Conclusión priorizada: defecto demostrado, hipótesis mejor sustentada o información insuficiente.
2. Evidencia con archivos/líneas y explicación del recorrido, distinguiendo hechos y supuestos.
3. Corrección o experimento mínimo propuesto, con resultado que distinguiría las hipótesis y criterio de éxito del interlocutor.
4. Un encargo preciso para Claude, listo para implementar y revisar, que corrija o sustituya la propuesta actual si procede.

Puedes ejecutar comprobaciones de código/pruebas focalizadas existentes si aportan evidencia. Esta revisión no requiere otra auditoría general ni cambios del producto, build o APK. No consultes el móvil ni inicies ensayo. Conserva firma/perfil/33ajustes/GPS/firmware y prioridad Hey Even/PTT. No reenroles, leas/exportes vectores, importes perfiles, guardes audio/texto, conectes la conversación a Hermes/proveedores ni despliegues servicios. Mantén el reparto: Astra revisa; Claude implementa/build; Codex revisa la entrega. Una conclusión de software no certifica reconocimiento físico.
