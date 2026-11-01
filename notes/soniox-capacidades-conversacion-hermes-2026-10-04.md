# Qué puede resolver Soniox para Faceclaw/Hermes — 04-10-2026

Investigación de Codex solicitada por el usuario mientras Claude implementa S2. Solo documentación; no se modifica el diseño/prompt/código en uso por Claude, ni se envían mensajes a otras conversaciones o audio a proveedores.

## Funciones documentadas que conviene reutilizar

1. **Diarización:** etiquetas por token para separar hablantes. Ya usada en S1. No equivale a conocer cuál es el portador y no se encontró un contrato STT para registrar una voz conocida o asociar un perfil local con identidad persistente. S2 sigue resolviendo una pieza necesaria.
2. **Fin semántico de intervención:** endpoint detection usa pausas, entonación, patrones del habla y contexto para distinguir un pensamiento terminado de una pausa/hesitación. Devuelve `<end>` final. Usar esta señal de Soniox como frontera principal en vez de reconstruir otro detector de fin basado únicamente en silencio. S1 lo tiene activado pero descarta el marcador; S2 ya prevé consumirlo. Un endpoint no significa fin de la conversación entre dos personas ni confirmación de un tema.
3. **Intervenciones completas:** el SDK Node ofrece `RealtimeUtteranceBuffer`, alimentado con resultados y vaciado con el endpoint. Sirve como referencia del contrato tokens-finales → intervención; no asumir que el paquete Node puede importarse directamente en NativeScript/Android. Mantener el socket OkHttp actual salvo una justificación concreta de compatibilidad.
4. **Continuidad durante silencios:** keepalive conserva conexión y contexto, incluidas etiquetas de hablante. En ausencia de audio se debe enviar al menos cada 20 s. No hace falta abrir un stream nuevo tras cada silencio.
5. **Duración:** el stream real-time admite hasta 300 minutos (5 h); después exige otro stream. Los 120 s son un límite del coordinador de Faceclaw, no una restricción Soniox. Mantener un stream vivo no implica que las etiquetas sean perfectamente estables; la documentación advierte errores y cambios temporales.

## Funciones no encontradas como API propia documentada

No se encontró un clasificador STT de saludo/cortesía frente a conversación sostenida sobre un tema, un detector de fin de episodio completo ni una identificación STT de hablantes conocidos. Esta es una conclusión limitada al índice, referencia y búsquedas oficiales consultadas, no prueba de que nunca pueda existir otra oferta.

El ejemplo oficial Soniox Voice Agent combina STT + LLM + TTS. Su procesador LLM interpreta intención, conserva el historial y decide respuestas/herramientas. Eso respalda mantener la comprensión del contenido en la lógica conversacional/Hermes, en lugar de atribuirla al parámetro endpoint detection.

El parámetro de contexto de STT ayuda a reconocimiento; no se encontró una operación que ejecute instrucciones arbitrarias como «clasifica este intercambio como saludo» desde el mismo stream STT.

## Consecuencia para la integración posterior

Soniox entrega texto, hablantes y fronteras de intervención; S2 vincula una etiqueta con el portador. La aplicación aún debe decidir cuándo empieza/termina un episodio relevante, qué contexto enviar, cuándo Hermes aporta algo y cómo mantener su canal separado del asistente normal. No proponer filtros de televisión.

No reactivar OFF ni reiniciar automáticamente cada 2 minutos como parche. El futuro modo continuo debe separar la vida del stream (identidad) de los episodios y del presupuesto de escucha. Si se usa un LLM para decidir saludo/tema, documentar que ese análisis ya recibe texto; no prometer «ningún envío a Hermes antes de confirmar» mientras se use Hermes precisamente para confirmar. Un filtro previo sin envío sería lógica de la app, con sus límites.

**Coste relevante:** keepalive/pausa conserva el contexto, pero Soniox documenta facturación por la duración completa del stream, no solo por el audio procesado. Mantener conexión indefinidamente durante silencios no es una optimización de coste. El diseño continuo debe tener un presupuesto/control explícito; no se ha cambiado ninguna configuración.

## Fuentes oficiales consultadas mediante el MCP Soniox

- [Diarización](https://soniox.com/docs/stt/concepts/speaker-diarization).
- [Endpoint detection](https://soniox.com/docs/stt/rt/endpoint-detection).
- [Keepalive y facturación](https://soniox.com/docs/stt/rt/connection-keepalive).
- [Límite de 300 minutos](https://soniox.com/docs/stt/rt/limits-and-quotas).
- [SDK: buffer de intervenciones y eventos](https://soniox.com/docs/sdk/node-SDK/stt/realtime-transcription#detecting-utterance-for-voice-agents).
- [Voice Agent: interpretación de intención mediante LLM](https://soniox.com/docs/demo-apps/soniox-voice-agent#how-it-works).

Se consultaron también índice, overview y búsquedas sobre speaker identification/enrollment, conversation topics, understanding y summarization. No se ejecutó ninguna operación Soniox de cuenta ni de transcripción.
