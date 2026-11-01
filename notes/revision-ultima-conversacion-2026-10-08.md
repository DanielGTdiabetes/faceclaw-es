# Última conversación S2.6.8 — revisión del 08-10-2026

El usuario comunica que solo vio una frase de Hermes y encontró la conversación en OFF. Autoriza revisar el móvil conectado. Se inspeccionan las métricas conservadas en RAM y el journal numérico de Jarvis, sin iniciar otra sesión ni leer textos de conversación. Circuito Codex–Claude comprobado desactivado (`enabled:false`); diagnóstico directo.

## Cierre automático comprobado

S2.6.8 / código 805, PID móvil 30528. El diagnóstico muestra `stopReason:expired`, `endedBy:expired`, límite 1.200.000 ms y «OFF · Tiempo agotado (20 min)». El cierre fue por el máximo de 20 minutos, no por cinco minutos sin voz ni por un error. Escucha efectiva agregada 1.198.115 ms (19 min 58,1 s); audio enviado a Soniox 1.192.500 ms (19 min 52,5 s). No se conserva una hora exacta de ON/OFF en estos agregados.

## Una frase y abstenciones reales

- 361 turnos Soniox, dos etiquetas de hablante, 6.780 tokens finales, cero errores y cero fallback Soniox. Las etiquetas no acreditan identidad personal; estado final de identidad `sin-identificar`, modalidad Hermes `identidad-opcional`.
- 80 solicitudes Hermes: cinco evaluaciones de tema y 75 de asistencia. Resultados recibidos: dos `tema`, un `cortesia`, un `incierto`, 74 `nada` y un `mensaje`; una solicitud cancelada. Cero fallos, errores de canal, JSON inválidos, caducidades o rechazos.
- El journal coincide exactamente. Única frase generada a **10:16:58 CEST**; entrega al controller 1, `nativeSent:1`, presentación 1, retirada 1 y cero fallos de render. El usuario informa de haber visto una frase; los contadores por sí solos no demuestran observación óptica.
- Principal: 79 respuestas medidas, media 1.249 ms, máximo 2.942 ms. Cero uso del respaldo. La cancelación corresponde a la segunda evaluación, a **10:15:19**, retirada en 641 ms (`stale`, sin llamada API completada), no a un fallo general ni al cierre final. No se conserva en estos contadores el evento concreto que la retiró.
- La memoria pasa de 0 a 1 tras la frase y permanece en 1: no estaba llena. Los registros no contienen el razonamiento semántico de las abstenciones; no permiten decidir si todas fueron acertadas ni atribuirlas causalmente al nuevo prompt.

## Límite agotado antes del OFF

La solicitud **80** termina a **10:24:38 CEST**. Después no hay nuevas evaluaciones en el journal inspeccionado hasta la revisión (~11:00). La primera terminó a 10:15:11; por tanto, las 80 se consumieron en unos nueve minutos y medio, mientras la sesión conservó su máximo de 20 minutos.

El controller inicia manual con `conversationHermes.begin(80, ...)`. El runtime restringe `maxRequests` a 80 y sus rutas `tick()`/`request()` dejan de solicitar cuando `requests >= maxRequests`. El límite incluye evaluaciones de tema, abstenciones y la solicitud cancelada; **no es un límite de 80 frases**. Alcanzarlo no apaga la captura ni cambia el motivo de cierre: sigue escuchando, pero Hermes ya no vuelve a evaluar hasta otro ON.

Conclusión: antes de agotar el límite, casi todo el silencio registrado son abstenciones válidas; después, el silencio se explica por el límite de consultas, sin nuevas decisiones del modelo. La experiencia incluye un tramo de escucha sin evaluación Hermes que no debe confundirse con discreción. No se modifica el límite ni la interfaz en esta revisión.

## Audio y estado final

Durante las inferencias se observan 31 turnos, 2.084 chunks, 104.200 ms de audio enviado y 490 tokens finales: el flujo continuó mientras Hermes respondía. Nativo: `capturing:false`, cero paquetes perdidos registrados, errores de decodificación, duplicados, paquetes malformados o descartes de cola; **28 `pcmDeliveryDrops`**. `BoundedPcmDelivery` cuenta reemplazos de un chunk pendiente o descartes por antigüedad >250 ms. No hay timestamps de esos descartes ni evidencia para relacionarlos con las abstenciones; no afirmar audio sin pérdidas. Backlog Soniox al cierre 5.820 ms.

Recursos finales: lease/timer false, buffers cero, motores inactivos. Se cierra únicamente el diálogo de métricas; final **Conectado / Display off / Hermes en conversación OFF**. Ambos servicios de Jarvis activos. Se eliminan los XML temporales del móvil.

Evidencia local ignorada y ACL Usuario/SYSTEM: `.tools/session-review-20261008-private/metrics-ui.xml` y `hermes-numeric-journal.txt` (contadores y resultados, sin transcripciones). Sin nueva captura, evaluación de modelos, cambios de producción, ajustes/suspensión, build/APK/instalación/despliegue/reinicio, commit/push ni NAS. Cambios locales previos conservados.
