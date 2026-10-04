# Activación conversacional y Hermes — aclaración 04-10-2026

**Aclaración posterior del producto final, durante la revisión S2.2:** las pantallas de las gafas permanecerán apagadas durante la escucha; no mostrarán la conversación ni su transcripción. Se encenderán para mostrar los mensajes de Hermes cuando intervenga. La vista de texto de S2.2 es un diagnóstico provisional; su retirada del flujo final y la presentación de mensajes pertenecen al siguiente diseño/implementación. S2.2 ya está validada como software ([revisión](revision-codex-s2.2-2026-10-04.md)), aún sin instalación ni envío conversacional a Hermes; la referencia inferior a S2 no implementada es histórica.

El usuario pide aclarar cuándo empieza el envío a Hermes, qué duración define una conversación y si el límite de 2 minutos se reinicia tras los silencios. Distingue expresamente un saludo de pasada («buenos días» y respuesta) de hablar o discutir sobre un tema. No considerar toda alternancia de voces suficiente para asistencia proactiva.

## Comportamiento actual comprobado

S1 transcribe tras inicio explícito. No existe envío conversacional a Hermes. S2, cuyo diseño está validado pero aún no implementado, identifica al portador y prepara intervenciones; tampoco envía a Hermes.

En `coordinator.ts`, `enabledAt` se fija al iniciar y el límite de 120000 ms se comprueba por tiempo monotónico desde ese instante. Los silencios, pausas y cesiones no reinician el presupuesto. Al agotarlo pasa a OFF y no vuelve a ON automáticamente.

La comparación local puede mostrar «conversación candidata» con dos transiciones en 20 s (`LocalParticipationTurns`). Es una etiqueta provisional sin consumidor hacia Hermes y sin análisis de contenido: no distingue un saludo de una conversación sobre un tema.

## Requisito para el siguiente diseño de Hermes

Separar sesión de escucha y episodio de conversación. Confirmar un intercambio sobre un tema, no solo voz/alternancia o tiempo transcurrido. Saludos y cortesías breves no deben abrir envío automático. Definir evidencia de continuidad y una política de intervención que pueda abstenerse sin avisos repetidos.

El silencio puede cerrar un episodio y limpiar su contexto mientras el modo de escucha sigue armado, pero eso no existe hoy ni implica permiso para reactivar captura después de OFF explícito. Los umbrales temporales de candidatura/cierre deben figurar como propuestas, no como reglas instaladas o mediciones.

No prometer conversación continua mediante reinicios de sesiones de 2 minutos: el diseño S2 borra identidad al terminar cada sesión, por lo que ese parche perdería la asociación. Un futuro modo continuo requiere definir ciclo de vida, presupuesto, conexiones, identidad y OFF explícito de forma coherente. La pregunta actual no autoriza por sí sola cambiar el límite ni instalar otro build.

Decisión vigente sobre televisión: sin filtros. Perfil, Soniox/Whisper y ajustes conservados. Hermes conversacional pendiente de diseño actualizado con Soniox y de implementación posterior.
