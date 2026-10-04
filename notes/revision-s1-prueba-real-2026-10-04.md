# S1: revisión del móvil y prueba real — 04-10-2026

Estado comprobado por Codex mediante ADB: Pixel 10 Pro Fold, paquete `com.faceclaw.app`, versión `0.8.2-es.5-conversation.s1`, código 805. Faceclaw muestra Conectado y Conversación OFF; el perfil existente figura guardado. Soniox seleccionado y clave presente según la etiqueta de Opciones, sin leerla. La aceptación y funcionamiento de Soniox los confirma el usuario por el reconocimiento observado.

El usuario realizó una conversación entre dos personas con la televisión encendida e informa que la televisión se reconoció como una tercera voz. Ante la pregunta sobre transcripción de las dos personas y retraso, confirma: «sí, es aceptable». La prueba de S1 queda satisfactoria según su valoración; no hay latencia cronometrada ni demostración de precisión general o identificación del portador.

Decisión explícita del usuario: la televisión será un caso puntual y no hace falta filtrarla. Mantener el comportamiento actual; no añadir filtros ni exigir una prueba de rechazo de televisión para avanzar.

## Métricas de la sesión terminada

- Época posterior 6; 1038 tramas de 50 ms: 51,9 s de PCM recibido.
- Hueco máximo observado 85 ms; cero muestras saturadas y cero cesiones a otra actividad.
- Nativo: 1039 paquetes, cero errores de decodificación, pérdidas, duplicados, paquetes malformados, obsoletos o descartes de cola. Un `pcmDeliveryDrop`; no atribuirlo a Soniox ni a un fallo de texto sin más evidencia.
- OFF: concesión y temporizador retirados, buffers vacíos, motores de texto sin trabajador/inferencia activos.
- El diagnóstico nativo conserva `capturing:true` porque se toma antes de detener la concesión en `ConversationCoordinator.release()`; es una instantánea histórica, no una lectura actual de captura.

## Límite de los diagnósticos Soniox

`SonioxConversationTranscription.stop()` llama a `reset()`, que borra texto y contadores. Los ceros de Soniox tras OFF no significan que no funcionara. No se recuperaron texto, audio ni registros de tokens; no hay medición del tiempo hasta primer texto o de atribución de hablantes.

Siguiente trabajo propuesto: conservar únicamente las métricas agregadas de la última sesión tras OFF, borrando el texto como ahora; asociar explícitamente al portador con una etiqueta de la sesión antes de conectar proactividad Hermes. No asumir que hablante 1 sea siempre el portador. Sin filtros de televisión, conforme a la decisión del usuario.

Esta revisión no inició captura ni cambió ajustes, código de aplicación, APK, perfil, firmware, Wear o Hermes. Se consultaron Opciones y métricas; el móvil se devuelve a la pantalla principal OFF.
