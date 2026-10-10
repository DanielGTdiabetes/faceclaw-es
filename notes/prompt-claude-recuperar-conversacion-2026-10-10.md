# Encargo preparado para Claude: recuperación de conversación continua

Este prompt está preparado, **no enviado ni ejecutado**. La sesión que lo redacta solo revisa y planifica. El usuario lo lanzará a Claude cuando decida comenzar.

## Prompt

Continúa Faceclaw en `E:\projects\faceclaw-es`. Lee primero `AGENTS.md`, `notes/plan-recuperacion-conversacion-asr-2026-10-10.md` y `notes/continuidad-entre-pcs.md`. La memoria `C:\Users\danie\.codex\memories\faceclaw.md` aporta rutas de firma/NAS, pero su cabecera G3.4 está desactualizada.

El usuario informa: continuo se detiene, móvil muy caliente, cuesta volver al modo sin filtro sin salir de la pantalla, Whisper (probablemente small) transcribe mal, en exterior hay ruido y cambios de red/Tailscale con errores. Inicialmente no vio aportaciones de Hermes; después sí, aparentemente solo a preguntas. Rechaza explícitamente el apagado a los cinco minutos sin voz. Quiere soluciones sin pagar STT, evaluar BMAX si sirve y participación natural. Busca mejoras completas, no otra ampliación de modelo sin demostrar el resultado.

Hechos comprobados por Codex:

- Rama `codex/conversation-detection-g0`, HEAD de revisión `bf46b4793bdf3aab3088933d8dae96b0d90199a2`, **47 entradas de cambios locales previos**. Conservarlos y revisarlos: representan buena parte de S2.10; no implementar sobre HEAD ignorándolos.
- Pixel tiene `0.8.2-es.5-conversation.s2.10-rules` /805, APK extraída idéntica a la de dist, SHA-256 `35df5df6eeab337d7ed90a18a1a3926de4ca3f0a25097f9ba5c82027fc0bbf87`. Ya no tiene el runner Gatekeeper LLM ni el transcriptor Pixel; sí WebRTC VAD. No atribuir su calor al LLM retirado.
- Código: caída del bridge → `conversation.reset()` → canal disabled → `ConversationHermesRuntime.stop()` → `onStopped` apaga la captura manual. Desacoplar red/Hermes de captura local, sin resucitar una sesión después de OFF.
- `coordinator.endForSilence` termina el continuo tras 300000 ms sin VAD positivo. Eliminar esa política para continuo y corregir la contradicción de «sin límite». Silencio debe ahorrar inferencia, no apagar la escucha.
- UI `localTranscriptionCanStart` usa solo `!enabled`, aunque JNI puede seguir cerrando. El motivo de rechazo se muestra en una tarjeta oculta cuando OFF. Resolver cierre observable, feedback visible y reinicio en la misma pantalla.
- «Voces» está acoplado a PAUSE vs REFERENCE. Separarlo antes de comparar coste/calidad. WebRTC veta ventanas enteras antes del decode; comprobar si pierde voz débil con el mismo PCM.
- Hermes sí recibió datos: entre instalación S2.10 y 14:11:12 de Madrid, 44 assess/incierto, 13 assess/tema, 75 assist/nada y 1 assist/stale. Ningún mensaje en esa ventana. La prueba posterior del usuario sí produjo respuestas. No afirmar que todo lo filtró el móvil ni que nunca funciona la entrega.
- Journal muestra múltiples cortes/reconexiones. No prueba que los cause Tailscale, pero el fallo de dependencia entre canal y captura está localizado.
- `conversation.py` remoto conserva el STYLE anterior, muy silencioso; el local contiene el participativo. Diferencia de contenido comprobada. No está pendiente inventar otro prompt: revisar y desplegar el cambio mínimo cuando corresponda.
- BMAX comprobado: Celeron N5095A, 4 núcleos, 7714 MiB RAM, SSE4.1/4.2, sin AVX/AVX2. No es una mejora de potencia demostrada; faster-whisper CPU es compatible en principio según CTranslate2, rendimiento pendiente. Sin GPU adecuada ni PC permanentemente encendido como dependencia.

Trabaja por entregas, siguiendo P0–P7 del informe:

1. Base recuperable y correcciones de ciclo de vida, red, silencio y botones. Tests funcionales de pérdidas/reconexiones, cierre JNI, prioridad PTT, pantalla apagada y OFF que nunca se revierte. Revalidar capacidades tras handshake; conservar solo la intención ON explícita actual, no colas de conversación vieja.
2. Diagnóstico por etapas con contadores sin contenido. Separar PCM/VAD/decode/filtros/turnos/Hermes/entrega. Reutilizar corpus consentido y reproducir secuencialmente el mismo audio; no hacer ensayos indefinidos ni varias inferencias simultáneas en el Pixel.
3. Baseline small con VAD ON/OFF en banco, segmentación desacoplada de voces y comparación crudo/acondicionado cuando proceda. Después base/small, whisper.cpp y Moonshine Streaming español; BMAX solo benchmark aislado antes de integrar. Medium CPU ya falló sostenido: no repetir por rutina. Vosk y otras familias son reservas, no hay que integrar todos los candidatos.
4. Reconciliar STYLE de Hermes y validar aportaciones a preguntas y conversaciones sin preguntas; medir generación/envío/ACK real. No hacer que ASR incomprensible produzca respuestas inventadas.
5. Elegir una configuración por cobertura, calidad de interlocutor, latencia, temperatura y recuperación de red. Una compilación correcta o TV a un metro no validan uso real exterior.

La fase exterior debe separar ruido de conexión: interior/exterior con red estable y cambios de red controlados, sin asumir que modo avión prueba solo Internet. Con ASR local y Tailscale caído debe seguir habiendo texto; ayudas deben recuperarse al restaurar el canal dentro de la misma sesión.

Primero castellano; registrar limitaciones de valenciano sin ocultarlas. Moonshine español y Parakeet v3 no deben presentarse como sustitutos bilingües demostrados. La referencia G2 usa large-v3-turbo en GPU de servidor, no el mismo hardware que el usuario.

Conserva firma original, datos, perfil, GPS, reloj y firmware. No reinstales la misma versión ni reenroles por rutina. No mezcles secretos con código/informes. No despliegues un servicio ASR o una nueva APK solo por leer este prompt preparado: sigue la autorización del mensaje con el que el usuario te lo encargue; cuando autorice ejecutar, progresa sin pedir confirmaciones repetidas para cambios de código reversibles. Para ensayos físicos coordina la sesión: el usuario ha seguido probando y el estado ON/OFF ya no se puede inferir de la revisión.

Entrega resultados por fase y una conclusión honesta: qué estaba roto, qué se corrigió, qué candidata gana con evidencia, qué límites quedan. Actualiza continuidad con versión/hash y fuente que realmente quedó instalada/desplegada. No declararlo resuelto porque el build pase.
