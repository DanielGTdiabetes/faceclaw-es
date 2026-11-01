# Conversaciones continuas en Faceclaw: auditoría y plan propuesto

**Actualización de despliegue, 09-10-2026:** el usuario autorizó después instalar. [S2.6.11 y puente desplegados, prueba y reversión](despliegue-memoria-diaria-2026-10-09.md). Memoria implementada/instalada; arquitectura nueva de audio aún propuesta. Los estados de candidata/no instalada que siguen describen el momento de auditoría, no el estado actual. [Estudio Pixel/Tensor](whisper-aceleracion-pixel-tensor-2026-10-09.md) separado, sin aceleración implantada.

Fecha: 09-10-2026. Estado: **arquitectura de audio propuesta para revisión; incremento de memoria diaria autorizado posteriormente por el usuario**.

**Prioridad final del usuario:** reducir dependencia de Soniox y conseguir texto de otra persona a unos dos metros, ausente con Pixel y Whisper. La propuesta completa no debe implantarse de golpe: primero diagnóstico pequeño de señal/STT, memoria aparte y reversible. Véanse O para esta prioridad y N para lo implementado localmente.

**Restricción posterior confirmada:** el usuario indica que el BMAX que aloja Hermes no tiene GPU adecuada. Se descarta STT en GPU en ese equipo para este encargo; P8 y las menciones previas a medir una GPU quedan fuera del plan activo. No se propone contratar GPU remota ni trasladar por defecto Whisper a la CPU del servidor.

Durante la auditoría el usuario amplió el encargo a implementar memoria y eligió expresamente **resúmenes por tema durante 24 h, con borrado automático, sin audio ni transcripción completa**. Esa adaptación se prepara como un incremento separado; no autoriza reescribir captura ni desplegar el plan completo. La sección A describe el HEAD auditado antes del incremento. La sección N documenta los cambios locales de memoria y sus límites.

## Alcance, fuentes y comprobaciones

Se ha actualizado E:\projects\faceclaw-es mediante fast-forward, desde b634d84 a **6395abdf57b1eb934ccd3605d66800ecf21ebe00**, rama codex/conversation-detection-g0. Tras actualizar, local y remoto estaban a 0/0 y el árbol estaba limpio. Los cuatro archivos locales anteriores se conservaron en stash@{0}, mensaje pre-sync-faceclaw-2026-10-09-local-oct06: AGENTS.md, integrations/hermes/conversation.py, integrations/hermes/test_conversation.py y notes/diagnostico-latencia-2026-10-06.md. No se reaplicaron sobre las versiones posteriores: el stash conserva el trabajo y permite revisar su recuperación por separado.

La referencia se clonó en E:\projects\reference-even-memory-20261009, commit **a90e39dbea074ba54ecfbec97060950d1b937240**. Se inspeccionó código de lens-app, backend y package, además del README y LICENSE. Las conclusiones sobre esa versión no equivalen a una auditoría del servicio comercial que aparece en la demostración.

Se leyó la [publicación de Reddit y sus comentarios visibles](https://www.reddit.com/r/EvenRealities/comments/1x10bc9/even_g2s_conversate_mode_was_meh_so_i_made_a_10x/). El autor explica que redujo los bloques de 25 a 4 segundos, transcribe en una GPU alojada y genera ayudas con un planner previo. También declara búsquedas paralelas, un intervalo mínimo entre ayudas y textos de aproximadamente 220 caracteres. Estas tres últimas características no coinciden plenamente con el repositorio auditado. El post enlaza ahora a [Constella Desktop](https://github.com/Constella-OS/constella-desktop): se consultó su árbol Git, cd0685e6b244540e98862c0ae3d3ae32af24059a, sin encontrar los archivos lens-app/backend de la referencia. No se ha auditado íntegramente ese escritorio ni demostrado que publique la última implementación del plugin.

El Pixel conectado por USB se identifica como Pixel 10 Pro Fold. ADB confirma Faceclaw **0.8.2-es.5-conversation.s2.6.10-model-selector**, código 805, actualizada el 08-10-2026. Se consultaron versión, proceso y memoria, sin iniciar escucha, instalar, consultar UI, exportar ajustes ni leer audio/transcripciones/perfil. Una muestra puntual de memoria no permite inferir autonomía, crecimiento sostenido o latencia. La consulta de threads no identificó de forma fiable los workers; no se declara “cero workers” ni OFF físico a partir de ella.

Pruebas no destructivas ejecutadas en esta auditoría:

- TypeScript de aplicación, sin emisión: correcto.
- Compilación del proyecto de pruebas TypeScript: correcta.
- Trece archivos Node relacionados con captura, VAD, Soniox, modelos, episodios, bridge, métricas, Hermes y presentación: correctos.
- Nueve pruebas Python de validación: correctas.
- Suite Python de conversación, memoria, fallback y bridge: **44/44 correctas**. Los tests asíncronos no progresaban dentro del aislamiento; la ejecución con acceso a loopback fuera de ese aislamiento terminó correctamente. No se llamaron proveedores reales ni se usó el móvil para estas pruebas.

No se ejecutaron Gradle/build, inferencia Whisper, ensayos acústicos, cargas de una hora ni pruebas de batería. La primera frase humana Pixel correcta procede del relevo previo, no de una nueva medición. El código del bridge remoto desplegado no se ha vuelto a verificar por SSH: aquí se audita la copia Git sincronizada.

El usuario autorizó apoyarse en Claude. Está instalado, pero su ejecución de revisión devolvió “Invalid API key”; **no produjo una segunda auditoría**. Se conserva un [prompt acotado de revisión de audio](E:/projects/faceclaw-audit-20261009/prompt-claude-captura-voz.md), con herramientas de lectura y sin edición, shell ni móvil. No se modificaron credenciales.

## A. Estado actual de Faceclaw

### A.1. Captura real y transporte

Faceclaw es una aplicación NativeScript/TypeScript con captura y BLE nativos en Kotlin. No es simplemente una miniapp React dentro del WebView oficial de Even.

Ruta de audio:

~~~text
G2 → BLE LC3 → Lc3PacketFramer → VoiceCaptureSession
   → BoundedPcmDelivery → callback TypeScript
   → métricas/VAD de energía + adaptador STT elegido
~~~

[Lc3PacketFramer](E:/projects/faceclaw-es/native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/Lc3PacketFramer.kt:20) recibe paquetes de 205 bytes: cinco tramas LC3 de 10 ms/40 bytes, metadatos SSR/ángulo y contador. Decodifica 800 muestras/50 ms a 16 kHz. El contador descarta duplicados de ambos brazos y copias tardías con aritmética de vuelta de contador. **50 ms es la entrega PCM; no una ventana STT de cuatro segundos.**

[VoiceCaptureSession](E:/projects/faceclaw-es/native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/VoiceCaptureSession.kt:306) usa un worker nativo para decodificar. La ruta experimental de Conversaciones reduce la cola a cinco paquetes y descarta paquetes de más de 250 ms. [BoundedPcmDelivery](E:/projects/faceclaw-es/native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/BoundedPcmDelivery.kt) mantiene una sola entrega pendiente, sustituye la anterior y borra sus bytes. La entrega al callback se hace fuera del lock. Esto acota memoria, pero un atasco del hilo JS puede causar huecos.

[beginRawCapture](E:/projects/faceclaw-es/app/native/voice-control.ts:317) desactiva expresamente supresión propia y filtro angular para el flujo crudo. La captura conversacional **no está filtrando al interlocutor por el perfil del portador ni por un haz angular**. Los metadatos del firmware no demuestran por sí mismos proximidad ni identidad. Cambiar el beamforming o filtrar TV sería un trabajo independiente, no una consecuencia de adoptar este plan.

El micrófono ya sigue abierto mientras Hermes procesa. El punto pendiente es reforzar la independencia respecto al hilo JS y la recuperación de fallos; no introducir por primera vez asincronía.

### A.2. Tres rutas STT distintas

| Ruta | Implementación actual | Consecuencia |
| --- | --- | --- |
| Soniox | [SonioxConversationTranscription](E:/projects/faceclaw-es/app/native/soniox-conversation.ts:87), WebSocket binario, PCM16 mono/16 kHz cada 50 ms, stt-rt-v5, endpointing y diarización | Streaming continuo. No espera a acumular cuatro segundos. Audio sale del teléfono; parciales y finales son diferentes. |
| Pixel | [FaceclawSystemTranscriber](E:/projects/faceclaw-es/App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawSystemTranscriber.kt), SpeechRecognizer público on-device, PCM por ParcelFileDescriptor y worker escritor | Cola de veinte entregas de 50 ms, aproximadamente un segundo. Si se llena, falla en lugar de crecer indefinidamente. Español disponible comprobado anteriormente; ca no acreditado. No es una API privada de ASI/Gemini. |
| Whisper móvil | [FaceclawLocalTranscriber](E:/projects/faceclaw-es/App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawLocalTranscriber.kt) + [LocalTranscriptSession](E:/projects/faceclaw-es/native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/LocalTranscriptSession.kt:105) | sherpa-onnx OfflineRecognizer, modelos base/small/medium int8, verificación de hashes, ventanas de seis segundos con tres de solape, un decode activo. |

Whisper local recibe ventanas completas: la ruta selecciona WINDOWS, aunque el buffer también dispone de modo VAD. El VAD de energía no decide qué partes de una frase llegan al decoder en esa ruta. El acondicionamiento local modifica una copia para el reconocimiento, no convierte el perfil del usuario en un veto al audio de otras personas.

El solape 6/3 procesa aproximadamente dos veces el audio en régimen sostenido. Si el worker está ocupado, descarta un nuevo trabajo completo. El solape protege frente a ciertos descartes aislados; no garantiza conservar toda la conversación cuando el motor es sostenidamente más lento que el audio.

Soniox conserva una ruta de fallback local, pero el coordinador manual valida el motor esperado. No se debe presentar esa ruta como continuidad automática garantizada para cualquier error o selección.

### A.3. VAD, contexto y evaluación

[LocalEnergyVad](E:/projects/faceclaw-es/app/conversation-detection/local-vad.ts:33) analiza cinco subtramas de 10 ms por entrega. Resta componente continua, adapta el suelo de ruido y usa histéresis: inicio aproximado de 150 ms y salida de 600 ms. Detecta actividad acústica, no relevancia, identidad ni fin lingüístico de una frase.

[ConversationCaptureCoordinator](E:/projects/faceclaw-es/app/conversation-detection/coordinator.ts:64) gobierna captura, disponibilidad de motores, VAD, identidad y entorno. Manual ON tiene máximo de veinte minutos y OFF tras cinco minutos sin actividad acústica positiva; diagnóstico, 120 segundos. Un hueco de audio introduce una frontera. No conservar toda la conversación es una propiedad real, pero aún no existe la ventana temporal contextual solicitada.

[ConversationEpisodeTracker](E:/projects/faceclaw-es/app/conversation-detection/conversation-episodes.ts:48) conserva hasta doce turnos/6.000 caracteres. Candidata caduca a quince segundos; episodio activo termina tras treinta segundos sin turnos. Assess devuelve tema/cortesia/incierto. Cortesía o incertidumbre pueden cerrar y borrar el episodio: se pierde contexto que podría completar “eso” poco después.

[ConversationHermesRuntime](E:/projects/faceclaw-es/app/conversation-detection/conversation-hermes.ts:45) tiene una petición en vuelo. Espera dos segundos sin nuevo turno y al menos cinco desde la petición anterior; no llama por cada paquete PCM. Al confirmar tema solicita assist, y en episodio activo nuevos turnos pueden disparar más assist. Falta un presupuesto explícito por texto nuevo y un intervalo mínimo entre cues.

Existe revisión de contexto, pero [acceptsOutput](E:/projects/faceclaw-es/app/conversation-detection/conversation-episodes.ts:188) acepta resultados de una revisión anterior si pertenecen al mismo episodio/sesión/stream/asociación. Esta decisión evita cancelar indefinidamente cuando la gente sigue hablando, pero **no detecta la contradicción “máquina X descartada” dentro del mismo episodio**. Restaurar cancelación por cualquier palabra nueva también sería incorrecto: provocaría inanición de resultados.

### A.4. Hermes explícito, seguridad y contrato

[AudioCaptureArbiter](E:/projects/faceclaw-es/app/native/audio-capture-arbiter.ts:2) da baja prioridad al detector y revoca su lease cuando una captura normal toma el audio. Usa generaciones para impedir que una parada antigua detenga al nuevo propietario. La navegación y la invocación explícita siguen en [shell.ts](E:/projects/faceclaw-es/app/ui/shell/shell.ts:1624) y [AssistantSession](E:/projects/faceclaw-es/app/assistant/session.ts); el cue usa una capa independiente que se bloquea ante teclado, PTT o asistente.

[bridge-client](E:/projects/faceclaw-es/app/assistant/bridge-client.ts) separa el canal conv del chat. El [bridge Python](E:/projects/faceclaw-es/integrations/hermes/bridge.py) mantiene el agente normal y su ruta de herramientas; [ConversationService](E:/projects/faceclaw-es/integrations/hermes/conversation.py:275) crea agentes restringidos distintos. [restricted_agent_class](E:/projects/faceclaw-es/integrations/hermes/conversation.py:99) bloquea despachos reales de herramientas, además de entregar tools vacías y desactivar persistencia/memoria. La protección no depende solo del prompt. Hay comprobaciones de compatibilidad del runtime Hermes.

Contrato actual localizado:

| Parte | Contrato y responsabilidad |
| --- | --- |
| Negociación | conv/1; conv/2 permite identidad opcional; conv/memory-ack/1 confirma presentación. Negociar no activa el envío automáticamente. |
| Productor móvil | [ConversationChannel](E:/projects/faceclaw-es/app/assistant/conversation-channel.ts:40), requestId y EpisodeRef correlacionados, plazo monotónico y modos assess/assist. |
| Entrada bridge | valid_request en conversation.py: valida turnos, límites, etiquetas y modalidad antes de evaluar. |
| Productor LLM | Assess: objeto con verdict tema/cortesia/incierto. Assist: objeto kind nada o kind mensaje con text. |
| Parser | [_response_fields](E:/projects/faceclaw-es/integrations/hermes/conversation.py:409) ejecuta json.loads sobre final_response; rechaza parciales, fallos, JSON inválido y textos fuera de límites. |
| Respuesta wire | v:1, chan:conv, type:result, mode, requestId, ref y verdict o kind/text. Puede incluir timing y deliveryId negociado. |
| Consumidores | ConversationChannel → ConversationHermesRuntime → ConversationHermesPresenter/compositor → confirmación nativa correlacionada. |
| Límites | Hasta cuarenta turnos y 6.000 caracteres de entrada; parser de assist hasta 1.200 caracteres. No es todavía el objetivo de 200–350. |
| Error/cancelación | Mensajes correlacionados, cancel y deadline. Texto plano, SILENT o bloques Markdown alrededor del JSON rompen el contrato. |

El bridge ejecuta el agente bloqueante mediante asyncio.to_thread y mantiene un trabajo activo y uno pendiente sustituible. El fallback se solicita tras el presupuesto principal, pero **espera a que termine el intento cancelado antes de empezar otro**. No hay dos generadores simultáneos por diseño. Un timeout asíncrono no garantiza terminar una llamada nativa o HTTP no interrumpible.

No se ha acreditado barge-in completo que cancele toda generación/reproducción al comenzar a hablar: la prioridad explícita y la toma de audio sí existen. No se localizó TTS propio en el flujo de cues inspeccionado; su cancelación debe añadirse al contrato si se incorpora o se identifica otra ruta de reproducción.

### A.5. Presentación, privacidad y cierre

[ConversationHermesPresenter](E:/projects/faceclaw-es/app/ui/shell/conversation-hermes-ui.ts) escucha con lentes oscuras en modo Hermes, muestra el cue en una capa independiente y mantiene una lista RAM de cinco mensajes. La duración es aproximadamente 12–30 segundos, salvo retirada explícita, prioridad, cambio de identidad o cierre. No se reproduce un cue antiguo al reanudar.

El ACK de memoria se emite tras la confirmación de envío del frame nativo, no tras generar ni encolar texto. “Enviado al compositor/protocolo” no prueba que una persona lo haya leído ópticamente.

El bridge guarda en RAM seis aportaciones propias confirmadas, con TTL de dos horas, y deduplicación textual normalizada. Esto **ya es memoria antirrepetición**, no una base de transcripciones ni RAG. La lista móvil se borra al OFF; el antirrepetición del servidor puede sobrevivir al OFF hasta su TTL/reinicio. Los logs de esta ruta son métricas sin contenido.

La captura cruda usa buffers temporales y no activa grabación WAV. Soniox recibe audio; el bridge/LLM recibe texto seleccionado y ayudas recientes. Pixel/Whisper local no requieren sacar ese audio para transcribir. No se ha auditado la retención del proveedor: no se afirma “sin retención” para servicios externos.

Existen otros almacenes de Faceclaw: [FaceclawConversationStore](E:/projects/faceclaw-es/App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawConversationStore.kt) para otras funciones y [AssistantConversations](E:/projects/faceclaw-es/app/assistant/conversations.ts) para chat. No deben conectarse inadvertidamente al contexto pasivo.

El cierre de la app Conversación [onClosed](E:/projects/faceclaw-es/app/apps/local-conversation/local-conversation-app.ts:223) pide OFF y libera temporizadores/suscripciones. Sin embargo, detener Whisper invalida resultados y deja drenar una inferencia JNI en curso; no la interrumpe inmediatamente. La captura nativa puede esperar hasta 1,5 segundos al worker. No se encontró un cierre global de todos estos componentes en bootstrap.android.ts. Son mejoras necesarias antes de prometer “X = cero trabajadores”.

## B. Proyecto externo: mecanismos reales

### B.1. Lo útil de su captura

En [glasses.ts, entrada PCM y drainRecordingBuffer](https://github.com/Tej-Sharma/even-reality-memory-system/blob/a90e39dbea074ba54ecfbec97060950d1b937240/lens-app/lib/glasses.ts#L317), el SDK proporciona PCM16 LE mono a 16 kHz. startRecording abre el micrófono; los callbacks añaden bytes al buffer; drainRecordingBuffer entrega lo acumulado **sin cerrar el micrófono**.

[uploadMeetingChunk](https://github.com/Tej-Sharma/even-reality-memory-system/blob/a90e39dbea074ba54ecfbec97060950d1b937240/lens-app/lib/app.ts#L277) drena cada cuatro segundos, deja una subida activa y acumula las nuevas entregas por separado. STT lento no detiene el SDK. Al quedar libre la subida, concatena lo pendiente: cuatro segundos es el objetivo normal, no un máximo garantizado. Convierte PCM a base64/JSON.

Este es el patrón que merece reproducirse donde falte: **abrir una vez, buffer independiente, consumidor asíncrono y nunca esperar al LLM en el callback de audio**. Faceclaw ya cumple buena parte de él; debe conservar además sus límites y arbitraje.

El SDK oculta transporte y procesamiento previo a ese PCM. Este código no permite concluir que sus micrófonos, ganancia, DSP o captación de personas lejanas sean superiores. La diferencia percibida puede venir del reconocimiento GPU, segmentación o presentación.

### B.2. VAD y STT

El VAD cliente es RMS fijo, umbral 500 sobre PCM16 y salida tras 1.600 ms de silencio; se usa para terminar una captura corta. En [beginMeeting](https://github.com/Tej-Sharma/even-reality-memory-system/blob/a90e39dbea074ba54ecfbec97060950d1b937240/lens-app/lib/app.ts#L306), startRecording se llama sin callback VAD. Por eso **el modo reunión no usa ese VAD para segmentar el envío**.

[whisper_server.py](https://github.com/Tej-Sharma/even-reality-memory-system/blob/a90e39dbea074ba54ecfbec97060950d1b937240/backend/whisper_server.py) usa faster-whisper/CTranslate2, large-v3-turbo por defecto, CUDA/int8_float16 en producción y CPU/int8 en desarrollo. Carga el modelo una vez y decodifica fuera del event loop en un ThreadPoolExecutor de dos workers. vad_filter está activado: el filtrado de voz se hace dentro del reconocimiento mediante la integración Silero de faster-whisper.

El router prueba primero su servidor Whisper, después proveedores cloud. La llamada al servidor fuerza en en la versión inspeccionada; no debe copiarse a castellano/valenciano sin configuración explícita. La afirmación de rendimiento incluida en comentarios no es una medición comparable en nuestro Pixel o Jarvis.

### B.3. Ayudas, contexto y concurrencia

En [glasses_router.py, motor de cues](https://github.com/Tej-Sharma/even-reality-memory-system/blob/a90e39dbea074ba54ecfbec97060950d1b937240/backend/glasses_router.py#L1227), un umbral de veinte palabras nuevas o tres frases inicia un worker daemon protegido por lock Redis SETNX de noventa segundos. Planner, recuperación inicial, segunda recuperación relacionada, web opcional y composición se ejecutan sucesivamente dentro de ese worker. No se ha encontrado el paralelismo de búsquedas declarado en Reddit en esta versión.

Hay contexto de fondo de 2.000 caracteres, texto nuevo y cinco ayudas anteriores. No es una ventana de 45–90 segundos. El transcript de reunión se conserva en Redis con TTL y se guarda como nota al terminar. El límite de lectura no demuestra por sí solo un límite equivalente de todo lo almacenado.

El compositor admite novecientos caracteres y solicita varias frases; el cliente consulta novedades cada cuatro segundos. Ninguno de esos tiempos obliga a ejecutar el LLM cada cuatro segundos. El código no implementa un cooldown explícito entre cues ni un ACK comparable a nuestro frame nativo. El historial de ayudas incluye producción, aunque quizá no se hayan mostrado.

### B.4. Puntos que no conviene copiar

Son riesgos deducidos del código, sin una reproducción integral del servicio:

- meetingPending y el executor STT no tienen un límite de cola explícito. Acumular audio durante red lenta aumenta memoria y edad de los resultados.
- Si el servidor confirma un chunk pero se pierde su respuesta, el retry puede mezclar audio nuevo bajo la misma secuencia ya procesada. La deduplicación podría ignorar también ese audio nuevo.
- finishMeeting espera la subida antes de parar el micrófono; fetch no incorpora timeout/abort. El cierre puede quedar retenido por red.
- meetingEnd recibe cinco argumentos en el llamador, pero su wrapper declara cuatro y omite final_seq. Esa instantánea no es un paquete listo para integrar sin revisar.
- pollMeetingCue no vuelve a validar sesión/fase después del await: una respuesta antigua puede llegar tras terminar o cambiar reunión.
- El lock Redis no tiene token de propietario. Si caduca mientras sigue el worker, el finally antiguo puede borrar el lock de uno posterior.
- No hay control equivalente a context_revision/generation_id antes de publicar; tampoco cancelación fuerte de workers daemon al terminar reunión.
- asyncio.wait_for limita la espera HTTP, pero no termina la inferencia subyacente. health devuelve status ok aunque model_loaded sea false; hay que interpretar readiness.
- El servidor convierte WAV a muestras sin validar/remuestrear su frecuencia. La entrada G2 prevista es 16 kHz; un adaptador nuevo debe comprobarla.
- Un log incluye el texto completo del cue. No cumple nuestra política de observabilidad sin contenido.
- Faltan módulos privados del backend Constella para ejecutarlo completo. No se debe estimar su reutilización como “copiar dos archivos y arrancar”.

## C. Diferencias y comparación de decisiones

| Función | Faceclaw actual | Referencia auditada | Problema a resolver | Recomendación | Reuso | Complejidad | Riesgo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Captura continua | Worker nativo LC3, PCM 50 ms; no espera LLM | SDK abierto, drenaje periódico | Entrega a consumidores atraviesa JS | Preservar captura y medir atasco JS; fanout nativo si se demuestra pérdida | Adaptar patrón | Media | Medio |
| Colas de audio | Cinco paquetes + latest-slot; descartes medidos | Acumulación y mezcla sin cota explícita | Pérdida bajo sobrecarga frente a crecimiento infinito | Límites, antigüedad y gap explícito | Preservar/mejorar propio | Media | Alto |
| VAD | Energía adaptativa, DC e histéresis | RMS cliente inactivo en reunión; Silero en servidor STT | Ruido acústico no equivale a voz útil | Silero en sombra; elegir por evidencia | Adaptar | Media-alta | Medio |
| Soniox/Pixel | Streaming ya continuo | HTTP por lotes | No hay beneficio en reiniciarlos cada 4 s | Mantener los adaptadores | Preservar | Baja | Alto si se reescribe |
| Whisper móvil | Ventanas 6/3, un decode, descarta si ocupado | Bloques nominales 4 s, GPU remota | Espera inicial, duplicación de cómputo y cola | Comparar segmentación 2/4/6 con baseline; GPU opcional después | Adaptar patrón | Media-alta | Alto |
| Contexto | Doce turnos/6.000 caracteres por episodio | Fondo 2.000 caracteres + nuevo; reunión persistida | Referencias perdidas al cerrar episodio | Rolling RAM por tiempo y tamaño, independiente de assess | Implementar propio | Media | Medio |
| Trigger | Quietud 2 s, intervalo de petición 5 s | Palabras/frases nuevas | Frecuencia y starvation en habla sostenida | Texto nuevo + pausa/final + presupuesto; excepción de pregunta corta | Adaptar | Media | Medio |
| Assess/planner | Assess ya existente, luego assist | Planner de búsquedas, luego compositor | No añadir tres llamadas por intervención | Assess+plan en una llamada negociada | Adaptar sobre propio | Media | Medio |
| Generación | Un activo y un pendiente reemplazable | Lock Redis + thread daemon | Antigüedad semántica | Un solo activo, última intención pendiente, validación antes de publicar | Preservar/mejorar propio | Media | Alto |
| Obsolescencia | Protege sesión/stream/identidad; no revisión del mismo episodio | Sin protección equivalente localizada | Cue contradicho por nuevas frases | Epoch duro + revisión blanda + validación de delta | Implementar propio | Alta | Alto |
| Antirrepetición | Prompt + comparación exacta + seis ayudas ACK/2 h | Cinco ayudas producidas en prompt | Paráfrasis repetidas | Mantener ACK y exacta; similitud conservadora con cifras protegidas | Mejorar propio | Media | Medio |
| Pantalla | Capa independiente, oscuridad al escuchar, 12–30 s | HUD con texto/REC y tarjetas | Cue demasiado largo | 1 idea, objetivo 240–260, máximo 350; compositor propio | Adaptar estilo | Baja-media | Bajo |
| Herramientas | Agente pasivo bloqueado mecánicamente | Búsqueda sobre memoria y web | No convertir voz en órdenes | Mantener prohibición; conectores de lectura aislados después | Preservar/deferir | Media | Alto |
| Hey Even | Arbitraje, chat prioritario, capa separada | Invocación oculta en producto según autor | Cancelación/reanudación verificable | Integración mediante lease y epochs; no copiar su reducción de funciones | Preservar/mejorar | Media | Alto |
| OFF/X | Invalida, cierra; JNI drena | Puede esperar red antes de parar audio | Trabajadores residuales y cierre sin prueba | stopAccepting + release inmediato + drained verificable | Implementar propio | Alta | Alto |
| Recuperación | Algunos errores STT/Hermes paran toda sesión | Fallback remoto y reintento de chunks | Fallo semántico no debe apagar audio | Degradación por componente y retries limitados | Adaptar | Media | Medio |
| Datos | Buffers RAM; audio remoto según motor; logs sin texto | Redis + notas + texto de cues en logs | Persistencia no solicitada | No importar guardado automático ni logs de contenido | Descartar | Baja | Alto |
| Plataforma | NativeScript/Kotlin + sesión EvenHub retenida | WebView miniapp y SDK oficial | Confundir descarga de página con ciclo nativo | Documentar ambos límites por separado | Preservar | Baja | Medio |

La referencia aporta un ejemplo claro de drenaje continuo y disparo por contenido, además de una opción de STT GPU. Faceclaw aporta controles más sólidos de prioridad, JSON, seguridad, colas nativas y confirmación de ayudas. **No hay evidencia suficiente para decir que la captura acústica externa sea más óptima.** Sí hay una hipótesis razonable de mejora del Whisper por lotes, que se puede medir sin reemplazar toda la captura.

## D. Decisiones recomendadas y licencia

**ADOPTAR:** separar reloj de audio y reloj semántico; seguir recibiendo mientras se transcribe/genera; evaluar texto nuevo útil; conservar pocas ayudas recientes; una sola generación activa; presentación breve y específica; silencio ante ruido o falta de evidencia.

**ADAPTAR:** drenaje hacia STT por lotes con límites; segmentación en pausas; servicio Whisper cargado una vez si compensa en hardware disponible; assess+plan sin una llamada adicional; estado de contexto y cancelación con revisiones. Son diseños nuevos sobre las interfaces Faceclaw, no un traslado de React/Redis.

**DESCARTAR:** colas infinitas, juntar audio indefinidamente, esperar red antes de apagar el micrófono, threads daemon como sustituto de shutdown, locks sin propietario, cues en texto plano/NONE/SILENT, guardado automático de reuniones, logs de texto, sustituir el shell o esconder Hey Even.

**POSPONER:** STT en Jarvis hasta medir hardware/red; archivo permanente de reuniones/RAG masivo y web de lectura; embeddings para deduplicación; proximidad/direccionalidad y filtrado de TV; TTS conversacional. La petición posterior adelanta únicamente la memoria diaria acotada descrita en N. No se importa el archivo de reuniones ni las integraciones de cuentas de Constella.

LICENSE de even-reality-memory-system es MIT, Copyright 2026 Tejas Sharma. Faceclaw incluye GPLv3. La [lista GNU identifica Expat/MIT como compatible con GPL](https://www.gnu.org/licenses/license-list.en.html#Expat): si se toma código literal hay que conservar su aviso y licencia. La nueva referencia Constella Desktop declara AGPL-3.0 y debe evaluarse por separado; no hereda la licencia MIT del otro repositorio. SDK, runtime y pesos también tienen sus propias licencias.

Código con valor para consulta/reutilización pequeña: la separación startRecording/drainRecordingBuffer/stopRecording y el patrón de carga única de Whisper. Para producción es preferible expresar esos patrones en Kotlin/adaptadores existentes. **No recomiendo copiar literalmente ninguna función completa de orquestación**, por sus dependencias y los riesgos anteriores. El cue prompt puede inspirar estilo, conservando el JSON y las restricciones propias.

## E. Arquitectura objetivo propuesta

~~~mermaid
flowchart TD
  G2["G2 / BLE LC3"] --> Capture["Captura nativa existente + lease exclusivo"]
  Capture --> Ring["Buffer PCM acotado / epoch / gaps"]
  Ring --> Vad["VAD acústico nativo<br/>energía inicial; Silero en sombra"]
  Ring --> Streaming["Soniox / Pixel streaming"]
  Ring --> Segment["Segmentador por lotes<br/>pausa + objetivo 4 s + máximo 6 s"]
  Vad --> Segment
  Segment --> Batch["Whisper móvil / futuro remoto<br/>1 activo + 1 pendiente reciente"]
  Streaming --> Turns["Finales STT normalizados<br/>sin inventar identidad"]
  Batch --> Turns
  Turns --> Context["RollingTranscript RAM<br/>75 s + 6000 caracteres + presupuesto tokens"]
  Context --> Trigger["Trigger local<br/>texto nuevo / final / frecuencia"]
  Trigger --> Assess["Assess + plan<br/>sin herramientas"]
  Assess -->|esperar o ignorar| Context
  Assess -->|generar| Cue["CueGenerator aislado<br/>1 activo + última intención pendiente"]
  Cue --> Validate["Validez actual + dedup + formato"]
  Context -. "revisión y delta" .-> Validate
  Validate --> Publisher["Publisher propio + prioridad + ACK"]
  Publisher --> Lens["G2: una idea breve"]
  Explicit["Hey Even / PTT / chat explícito"] --> Priority["AudioPriority / cancelación / epochs"]
  Priority -->|"revoca lease pasivo"| Capture
  Priority --> Agent["Hermes normal + herramientas autorizadas"]
  Priority -->|"bloquea cue"| Publisher
  Optional["Futuro: consultas de lectura<br/>memoria / web limitadas"] -.-> Cue
~~~

ConversationSession será un propietario de ciclo de vida delgado sobre el coordinador existente. No duplicará VoiceCaptureSession, bridge ni shell. VadEngine y SttAdapter serán interfaces; el streaming no dependerá de que el segmentador cierre un bloque. TranscriptBuffer, ConversationTrigger, CueValidity y CueDeduplicator serán módulos puros comprobables con reloj simulado. El presentador actual seguirá haciendo las operaciones de lentes.

Configuración central propuesta, inmutable durante cada sesión:

| Parámetro | Valor inicial propuesto | Condición |
| --- | --- | --- |
| native_audio_max_age_ms | 250, baseline actual | Cambiar solo tras medir pérdida/edad; no aumentar por intuición. |
| batch_min/target/max_ms | 2.000 / 4.000 / 6.000 | Solo Whisper por lotes; mínimo flexible para intervenciones cortas completas. |
| pre_roll_ms / forced_overlap_ms | 200–300 / 150–250 | Afinar con fixtures; conservar tiempos para deduplicar. |
| rolling_context_seconds | 75 | Banda a evaluar: 45–90. |
| max_context_chars / turns | 6.000 / 40 | Ambas cotas y caducidad por tiempo; no toda la reunión. |
| context_token_budget | aproximadamente 1.200 para transcript | Usar tokenizador del modelo o estimador conservador; prompt/otros datos tienen presupuesto aparte. |
| min_new_text_chars / words | 60 / 10 | OR, con excepción de pregunta corta completa. |
| min_assess_interval_ms | 8.000 | Cota máxima inicial, no objetivo de uso continuo. |
| max_wait_for_complete_final_ms | 8.000 | No esperar indefinidamente a silencio global si hay finales completos. |
| min_cue_interval_ms | 20.000 | Saltos excepcionales solo si se diseñan y prueban expresamente. |
| target/max_cue_chars | 240–260 / 350 | No imponer longitud mínima a una respuesta útil corta. |
| recent_cues | seis ACK, TTL actual 2 h | Lista móvil de cinco hasta OFF; revisar TTL como decisión aparte. |
| semantic_deadline_ms | 15.000 inicialmente | Mantener el presupuesto existente; no añadir esperas ilimitadas. |

### E.1. Segmentación y VAD

Silero es candidato razonable, no una mejora de precisión garantizada. Su [implementación ONNX](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py) espera 512 muestras a 16 kHz, **32 ms**; no pasar arbitrariamente tramas de 20 ms. Reencuadrar entregas PCM de 800 muestras conservando el residuo. Un estado recurrente por stream; reset ante hueco, pausa, OFF o cambio de fuente. Evaluar compatibilidad y memoria del runtime ONNX ya usado, sin cargar otra copia innecesaria.

Primero energía y Silero en paralelo sin alterar decisiones. Comparar voz lejana, voz baja, música, TV, ruido y coste. VAD no identifica al portador, no distingue una televisión que habla y no sabe si una frase ha terminado.

Para batch: incluir pre-roll, cerrar ante pausa válida cuando se alcance contenido suficiente; a partir de cuatro segundos preferir la próxima pausa; a seis, corte forzado con solape pequeño y marcador. Una pregunta completa de menos de dos segundos se entrega: el mínimo evita microfragmentos, no elimina frases útiles. La continuidad lingüística la determina el texto/final STT, no el VAD.

Soniox y Pixel continúan recibiendo el stream: **no reiniciarlos cada cuatro segundos ni retirar silencio sin revisar sus contratos de endpointing y tiempos**. Omitir audio indiscriminadamente alteraría timestamps, diarización y continuidad.

### E.2. Rolling context y trigger

El transcript se conserva en RAM durante 75 segundos de tiempo de captura, limitado además por caracteres, turnos y tokens. La poda ocurre también por temporizador sin habla; “últimos N turnos” por sí solo no constituye TTL. Cada fragmento lleva tiempos, final/parcial, procedencia y gaps. Solo los finales válidos alimentan decisiones estables; los parciales sirven a UI y señal de continuación.

La decisión cortesia/incierto no borra el rolling transcript. El assess puede esperar una continuación y recordar el antecedente dentro de la ventana. TopicEpoch cambia al detectar un cambio claro, sin borrar automáticamente todo contexto a cada palabra. Correcciones importantes invalidan la intención relevante aunque siga siendo el mismo tema.

Pausa corta: detener audio pasivo, marcar gap y excluir audio/órdenes/respuestas del asistente. Puede conservarse contexto aún dentro del TTL. OFF, cierre y cambio de identidad eliminan el contexto. Reconexión no reproduce ni sube audio antiguo. Un resumen opcional futuro conservaría hechos con incertidumbre y fuentes; no instrucciones, y con presupuesto propio. No hace falta otro LLM para resumir en el primer incremento.

El trigger local comprueba contenido nuevo, final completo o pausa, ausencia de huecos dudosos, hash no intentado, prioridad, cooldown y presupuesto. Una pregunta corta tiene excepción al umbral. Si siguen llegando finales completos, no exige dos segundos de silencio global. Un timer máximo permite evaluar texto suficiente aunque alguien continúe hablando. No enviar LLM ante cada segmento, tick o palabra.

La clasificación semántica de pregunta/decisión/relevancia corresponde a assess; las reglas previas son baratas y aproximadas. En fixtures ordinarios se busca alrededor de 1–3 evaluaciones/minuto, con cota inicial de una cada ocho segundos. La frecuencia adecuada se valida contra utilidad; no es una promesa universal.

## F. Máquina de estados

No usar un único estado processing que deje de aceptar audio. Proponer regiones independientes:

| Región | Estados | Reglas |
| --- | --- | --- |
| Sesión | IDLE/OFF → STARTING → ON; PAUSED; STOPPING → OFF | OFF no acepta audio. STARTING prepara y verifica; ON requiere lease. PAUSED no graba. STOPPING invalida antes de esperar. |
| Acústica durante ON | SILENCE, SPEECH_START, SPEECH, SPEECH_END | VAD actualiza actividad; puede seguir SPEECH mientras se procesa un cue. |
| STT | READY, PROCESSING, DEGRADED, DRAINING | PROCESSING no cambia ON. Solo un decode batch activo. Streaming conserva su propia conexión. |
| Semántica | WAITING, ASSESSING, GENERATING, VALIDATING, COOLDOWN | Un activo y una intención pendiente reciente; ningún estado bloquea captura. |
| Prioridad explícita | NONE, EXPLICIT_AGENT_REQUEST, AGENT_RESPONSE, RESUME | Desde cualquier fase pasiva revoca audio/cue; no esperar a la red para ceder control. |

conversation-listening equivale a sesión ON; speech es la región acústica; processing pertenece al worker, no a la sesión entera. Estas regiones cubren los estados pedidos sin producir una combinación inmanejable de decenas de estados.

Al invocar Hey Even/PTT/chat: incrementar validityEpoch, cancelar semántica pasiva, retirar su overlay, revocar el lease, descartar PCM pendiente y marcar gap. Hermes normal conserva su agente y herramientas. Su audio/órdenes no alimentan el transcript pasivo. Al terminar, RESUME comprueba conexión, permiso, prioridad, gafas puestas y consentimiento; adquiere lease nuevo sin reproducir audio ni cues anteriores. ON original no se prolonga automáticamente más allá de veinte minutos.

Barge-in explícito: además de tomar el audio, cancelar la respuesta anterior mediante AssistantSession antes de empezar otra y detener reproducción si existe. Habla ambiental por sí sola no es autorización para cancelar el agente normal. La prueba debe cubrir tanto “respuesta aún generándose” como “texto ya mostrado”; TTS requiere una prueba adicional si está presente.

Desconexión G2: PAUSED, sin micrófono ni audio retenido. Reconexión puede recuperar captura solo dentro de la sesión previamente habilitada y todavía válida, con stream nuevo y requisitos comprobados. Reconexión del bridge no reactiva automáticamente el permiso de transmisión. Cambio de red invalida resultados del transporte anterior; no reenvía una cola antigua.

## G. Concurrencia, obsolescencia y cierre

### G.1. Componentes y límites

| Componente | Ejecutor | Buffer/cola | Saturación |
| --- | --- | --- | --- |
| BLE/LC3 | Worker nativo ya existente | Cinco paquetes inicialmente; edad máxima 250 ms | Descartar antiguos con contador/gap, nunca bloquear BLE esperando un LLM. |
| VAD/segmentador | Worker nativo, no UI | Residuo de reencuadre + segmento máximo de seis segundos | Cierre forzado con frontera; no buffer infinito. |
| STT batch | Un worker nativo | Un decode + un segmento pendiente reciente | Sustituir pendiente antiguo, borrar PCM y emitir gap. No concatenar hasta 30 s. |
| STT streaming | Red/pipe propios | Cola acotada según motor | Límite explícito de antigüedad y reset recuperable del stream; revisar backlog OkHttp. |
| Contexto/trigger | TypeScript, operaciones pequeñas | Ventana acotada; una marca “hay revisión nueva” | Coalescer, no una task por turno. |
| Assess/generate | Python asyncio + worker bloqueante | Un activo + última intención pendiente | Reemplazar pendiente obsoleto. Nada de cinco generadores simultáneos. |
| Publisher | Compositor existente | Un cue válido pendiente | Una referencia nueva sustituye a la antigua; comprobar prioridad al enviar. |
| Memoria diaria | SQLite fuera del event loop + purga propia | 32 temas y tres resultados por consulta | Evicción y TTL; fallo de memoria no invalida un cue válido. |

Mantener locks cortos solo para propiedad/colas. Nunca mantener un lock de audio durante decodificación de modelo, red o presentación. No imponer asyncio en Android: Kotlin utiliza threads/colas nativas; Python sí usa su event loop.

### G.2. Validez de un resultado

Referencia propuesta: sessionId + streamId + associationVersion + topicEpoch + validityEpoch + generationId + contextRevision. Separar invalidación dura de nueva evidencia:

1. OFF, pausa, prioridad explícita, nueva identidad, nueva fuente o cambio claro de tema incrementan el epoch duro. Cancelación inmediata y resultado descartado aunque termine después.
2. Nuevo texto incrementa contextRevision. No cancelar por cualquier palabra: seguir escuchando no hace necesariamente inútil una respuesta.
3. Al terminar, comparar la revisión actual. Si coincide, aplicar formato/dedup y publicar. Si hay delta relevante, validar la ayuda contra ese delta y la intención original antes de mostrarla. Contradicción/revocación invalida.
4. Esa revalidación ocupa el mismo slot semántico, tiene presupuesto y máximo de un intento por generación. Si llega otra corrección relevante o se agota el plazo, descartar y usar la última intención pendiente. No crear una cadena ilimitada de validaciones.
5. Volver a comprobar epoch, revisión validada y prioridad justo antes de comprometer el frame. Un callback antiguo nunca confirma otra generación.

La variante inicial segura puede descartar cualquier revisión distinta; solo debe mantenerse si los fixtures demuestran que no deja el sistema permanentemente mudo. La validación de delta y la política contra inanición deben entregarse juntas al habilitar la nueva asincronía.

No es posible garantizar que una frase todavía no transcrita no cambie una recomendación. Medir y limitar esa ventana; una pausa breve de presentación durante habla puede ayudar, pero también necesita máximo de espera.

### G.3. Shutdown y errores

OFF/X debe: invalidar epochs y dejar de aceptar audio; retirar cue; liberar micrófono/lease antes de esperar red; cerrar conexiones de sesión; descartar y poner a cero buffers; cancelar tareas; esperar un resultado drained con límite y diagnóstico de los trabajadores propios. El bridge compartido del asistente normal no se apaga por cerrar el modo pasivo.

Una task.cancel no termina JNI ni un thread bloqueado. Si un decoder no puede acreditar salida acotada, mantener STOPPING visible y bloquear un nuevo worker. Evaluar aislamiento de ASR en proceso solo si es necesario para una terminación dura; no fingir que un flag worker=false lo ha detenido.

Fallo transient STT: conservar captura acotada mientras se intenta recuperar el adaptador y marcar la discontinuidad. Reintentos inmediatos limitados; después, componente DEGRADED y reintento explícito o probe limitado, sin bucle de reconexión. No acumular audio para subirlo posteriormente. Si el motor sigue caído, informar en móvil; la sesión conserva sus límites generales de veinte minutos/inactividad.

Fallo assess/generate/parsing: abstenerse, registrar motivo y esperar nueva evidencia/backoff. Fallo bridge: puede mantenerse captura/transcripción local en degradación; el estado de transmisión necesita reactivación explícita. Fallo memoria/render: omitir ese resultado/componente, no detener audio. Pérdida real de G2 o permiso obliga a PAUSED porque ya no existe una fuente disponible.

## H. Contratos internos propuestos

Son contratos de diseño para el pipeline futuro; no implican que se hayan implementado ya:

~~~typescript
type StreamRef = {
  sessionId: string; streamId: number; associationVersion: number;
  validityEpoch: number;
};
type ContextRef = StreamRef & {
  topicEpoch: number; contextRevision: number;
};
type AudioFrame = StreamRef & {
  frameId: number; capturedAtMs: number; sampleOffset: number;
  sampleRate: 16000; channels: 1; format: "pcm_s16le";
  pcm: Uint8Array; gapBeforeMs: number;
};
type SpeechSegment = StreamRef & {
  segmentId: number; startMs: number; endMs: number;
  frameFrom: number; frameTo: number;
  closedBy: "pause" | "max-duration" | "boundary";
  overlapMs: number; gapBeforeMs: number;
  pcm: Uint8Array;
};
type TranscriptFragment = StreamRef & {
  fragmentId: number; segmentId?: number;
  engine: "soniox" | "android-system" | "whisper";
  text: string; final: boolean;
  startMs: number; endMs: number;
  timing: "provider" | "capture-window";
  speaker: string | null;
  relation: "portador" | "otro" | "desconocido";
  confidence?: number; gapBeforeMs: number;
};
type AssessRequest = {
  requestId: string; ref: ContextRef; deadlineMs: number;
  fragments: readonly TranscriptFragment[];
  newFragmentIds: readonly number[];
  recentCues: readonly string[];
  dailyContext?: readonly { topicId: string; summary: string; expiresAt: number }[];
};
type AssessResult = {
  requestId: string; ref: ContextRef;
  decision: "ignore" | "wait" | "generate";
  reason: "noise" | "courtesy" | "uncertain" | "incomplete" | "repeat"
    | "question" | "fact" | "decision" | "problem" | "useful-context";
  intent?: string; anchorFragmentIds?: readonly number[];
  needsMemory?: boolean; needsWeb?: boolean;
};
type CueRequest = {
  generationId: number; requestId: string; ref: ContextRef;
  deadlineMs: number; intent: string;
  fragments: readonly TranscriptFragment[];
  recentCues: readonly string[];
};
type CueResult = {
  generationId: number; requestId: string; ref: ContextRef;
  kind: "nada" | "mensaje"; text?: string;
  validatedRevision?: number; expiresAtMs: number;
};
~~~

Tiempos internos de captura/deadline: monotónicos del mismo dispositivo. expiresAt persistido de memoria: UTC del servidor. No restar relojes absolutos de equipos distintos para calcular latencia. PCM tiene dueño y se borra al liberar; no se incluye en contratos wire semánticos. La confianza solo existe si el motor la proporciona; una etiqueta desconocida sigue siendo desconocida.

La ampliación del assess requiere una capacidad nueva, por ejemplo conv/3; conv/1 y conv/2 conservan los tres verdicts actuales. El resultado final al móvil sigue siendo kind nada o mensaje/text. La memoria de N usa una capacidad aditiva distinta, conv/daily-context/1, sin cambiar esos verdicts ni introducir órdenes.

## I. Prompts, seguridad, deduplicación y alternativas

El prompt de assess+plan recibirá contexto acotado, nuevos fragmentos y datos anteriores citados como no fiables. Pedirá únicamente JSON validable con decisión, motivo e intención. “Continuación” produce wait; ruido/cortesía/repetición, ignore; pregunta, comparación o decisión con oportunidad real, generate. Una corrección relevante actual prevalece sobre recuerdos o sugerencias anteriores.

El generador responderá únicamente:

~~~json
{"kind":"nada"}
~~~

o:

~~~json
{"kind":"mensaje","text":"Una idea breve y útil."}
~~~

Una idea, una o dos frases, máximo 350 caracteres, sin encabezados, listas, Markdown ni “basándome en…”. No exigir alcanzar 200 caracteres si una respuesta de 90 es suficiente. Validar primero JSON y límites, después normalizar espacios/controles y presentación; no cortar a ciegas una cifra o frase que altere su significado. Un resultado demasiado largo se descarta o se repara solo con un presupuesto previamente acordado.

Conservar antirrepetición del servidor basada en ACK. Prompt + normalización textual exacta siguen siendo la primera barrera. Una similitud por tokens/ngramas puede retirar paráfrasis muy próximas, comprobando números, negaciones y entidades: 2,5 y 25 no son el mismo dato. Embeddings/LLM dedup separado se posponen hasta justificar el coste. Un cue no confirmado no bloquea un reintento útil.

Datos escuchados, recuerdos recuperados y páginas futuras son DATA. El agente pasivo conserva bloqueo de herramientas, historial normal vacío, sin MCP de escritura ni terminal ni persistencia del agente. La memoria diaria es una operación tipada del host con límites y consentimiento; el LLM solo propone un resumen, no decide rutas, duración, SQL, cuentas o comandos. “Borra tus correos” no provoca ninguna acción.

Memoria/web futuras: conectores de lectura específicos, consultas y resultados limitados, timeout, procedencia y sin importar el catálogo general Hermes. Una búsqueda web también transmite una consulta: requiere una política explícita antes de habilitarla.

| Alternativa | Llamadas aproximadas | Latencia | Complejidad/calidad |
| --- | --- | --- | --- |
| A: reglas → assess → generate | N assess + P·N generate | Dos inferencias para una intervención nueva | Menor migración; separación clara, gate todavía útil. |
| B: reglas → assess+plan pequeño → generación cuando aporta valor | Igual número base que A | Similar; puede ahorrar trabajo al orientar generación | Recomendada si las mediciones prueban beneficio. Añade negociación/schema y, opcionalmente, otro modelo/configuración. |
| C: una llamada decide y genera | N inferencias completas | Menor espera para casos positivos | Puede gastar más tokens/capacidad en negativos; cambia la separación assess pedida y complica comparar filtros. |

No añadir ASSESS → PLAN → GENERATE como tres llamadas iniciales. Primero medir con el modelo/proveedor que ya funciona; separar un modelo pequeño solo si reduce coste/latencia manteniendo cobertura de momentos útiles.

Coste por periodo: N·coste_assess + N·P·coste_generate + revalidaciones + tokens de contexto. No se consultaron precios ni saldos, por lo que no se inventan euros/hora. La memoria diaria añade tokens acotados a las mismas evaluaciones, no una inferencia periódica de resumen.

## J. Plan por incrementos

Los incrementos de audio siguen propuestos. No representan autorización para implementarlos todos. Cada fila define un cambio revisable con su aceptación:

| Fase | Objetivo y archivos previstos | Cambios | Pruebas | Riesgo / aceptación | Dependencias |
| --- | --- | --- | --- | --- | --- |
| P0: ADR y baseline | Este informe; conversation-metrics.ts; notas de latencia | Fijar contratos, relojes, política de datos, métricas existentes y comparación por motor | Typecheck, suites relevantes y fixture de timings | Bajo. Todos distinguen captura/STT/LLM; baseline sin nuevas capturas no consentidas | Ninguna |
| P1: ciclo de vida | coordinator.ts, voice-control.ts, VoiceCaptureSession.kt, LocalTranscriptSession.kt, local-conversation-app.ts, bootstrap.android.ts | Propietario de sesión, stopping/drained, apagado de audio antes de esperas, recuperación por componente | OFF/X durante decode/red; 100 ciclos; prioridad y desconexión | Alto. Sin lease ni audio tras stop; cero workers de sesión tras drain verificable; agente normal intacto | P0 |
| P2: contexto y trigger | Nuevos rolling-transcript.ts, conversation-trigger.ts y conversation-policy.ts; conversation-episodes.ts, conversation-hermes.ts | Ventana temporal/tokens, conservar antecedentes, umbral de texto, límite de frecuencia, no depender de silencio global | Reloj virtual, anáforas, habla continua, cortesía seguida de tema, presupuesto de llamadas | Medio. TTL/cotas siempre; pregunta corta no se pierde; no LLM por chunk | P1 |
| P3: assess+plan y validez | conversation-channel.ts, conversation.py, bridge.py; nuevos cue-validity.ts/contracts.ts | Capacidad nueva, resultado tipado, epochs/revisiones, una generación + coalescing, delta validation | Contradicción X; resultado tardío; 3 s assess/8 s generate; cambio de tema/OFF/identidad | Alto. Cero resultados de epoch antiguo; no inanición sistemática; JSON legacy pasa | P2 |
| P4: ayudas breves y dedup | conversation-hermes-ui.ts, conversation.py; cue-deduplicator.ts/cue-format.ts | Máximo 350, prompt específico, dedup con cifras protegidas, ACK actual, cooldown de cues | Paráfrasis, traducciones, decimales, negación, Unicode, frame viejo, render fallido | Medio. Una idea legible, no repite lo confirmado, no cuenta un frame rechazado | P3 |
| P5: fanout y VAD en sombra | VoiceCaptureSession.kt, BoundedPcmDelivery.kt; nuevos VadEngine/PCM fanout nativos; adaptador de diagnóstico | Quitar trabajo crítico del callback JS si baseline muestra pérdida; Silero 512 muestras con reset | Bloqueo JS simulado, ruido/TV/voz lejana, RTF y memoria VAD, ABI/runtime | Alto. Sin degradar captura propia/interlocutor; coste medido; inicialmente no altera segmentación activa | P1 y baseline |
| P6: segmentación batch | LocalTranscriptSession.kt, FaceclawLocalTranscriber.kt, adaptador TS STT | Pausas/2–4–6 s, solape pequeño, un pendiente reciente y gaps; mantener baseline seleccionable | Fixtures PCM idénticos en 6/3 y propuesta; palabras cruzando cortes; decoder lento | Alto. Mejor tiempo/precisión según umbral acordado; cotas y cero reinicios Soniox/Pixel por chunk | P5 |
| P7: validación de producto | Fixtures/harness; notas de release; controles de memoria y conversación | Integración Android/G2, replay, cierre global, pruebas de duración y consumo | 30 min/1 h/varias horas virtuales; ensayo físico acotado; batería comparada | Alto. Sin crecimiento sostenido, workers duplicados o regresión Hey Even; mantener firmware/firma/datos | P1–P6 |
| M1: memoria diaria autorizada | daily_context.py, conversation.py, bridge.py; conversation-channel.ts, session-controls.ts; controles del móvil | Resúmenes 24 h, consulta por tema, consentimiento, purga y borrado; ver N | SQLite/fake clock, cancel/forget, JSON, bridge real loopback, compatibilidad UI | Medio-alto. No audio/transcript persistidos por el host; opt-in bilateral; TTL y borrado probados | Independiente del nuevo audio; sobre HEAD actualizado |
| P8: STT remoto opcional | Adaptador nuevo aislado + servicio propio, sin importar router Constella completo | Whisper precargado, cola limitada, cancelación/health auténticos, idioma explícito, sin fallback cloud implícito | Mismo audio; CPU/GPU/red disponibles; fallo/timeout/reintento y cancelación | Alto. Solo elegirlo si las mediciones justifican precisión/latencia/consumo y privacidad | P6/P7 y hardware medido |
| P9: memoria ampliada/web | Conectores de lectura separados del agente normal | Fuentes elegidas, citas, búsquedas limitadas; sin archivo automático de reuniones | Inyección en notas/web, permisos, timeouts, coste y relevancia | Alto. Cero herramientas de escritura y fuentes visibles; no se necesita para M1 | Producto estable y nueva política explícita |

No ampliar por defecto el límite manual de veinte minutos para ejecutar una prueba de una hora: simular sesiones o utilizar un harness de pruebas claramente separado. La instalación/reversión y el despliegue se revisan con la candidata concreta; no regenerar una firma ni restaurar ajustes históricos.

## K. Estrategia de pruebas y métricas

### K.1. Fixtures y concurrencia

Fixtures de eventos reproducibles y, para acústica, PCM sintético/consentido con verdad de referencia:

| Caso | Resultado verificable |
| --- | --- |
| Saludo/cortesía | Nada; no crear recuerdo útil por un saludo. |
| Pregunta de bomba de calor de 12 kW | Puede aportar; distinguir potencia térmica de eléctrica y no inventar COP/consumo exacto. Evaluar utilidad, no una frase literal única. |
| “Creo que deberíamos…” | Wait; no inventar la decisión antes de la continuación. |
| “Comprar X” → “X descartada” | Cue anterior inválido; resumen actual sustituye la propuesta, no conserva ambas como vigentes. |
| Repetición/paráfrasis | No repetir la ayuda confirmada; una cifra/corrección diferente sí puede ser nueva. |
| Orden ajena/inyección | Cero herramientas, comandos, mensajes o borrado; cualquier memoria recuperada sigue siendo DATA. |
| Hey Even/PTT/chat | Lease explícito inmediato, overlay pasivo retirado, sin contaminar contexto. |
| Restaurante/TV/música | Medir falsos positivos y cobertura; VAD no puede prometer separar una TV hablante. |
| STT fallido o Hermes lento | Audio continúa mientras haya fuente; buffers acotados y estado degradado explicable. |
| OFF/X/red/reconexión | Sin replay, sin callback antiguo efectivo; drained y contadores verificables. |
| Retomar un tema horas después | Recuperar resumen relevante no caducado; no toda la conversación anterior. |
| Caducidad/borrado de memoria | A 24 h deja de recuperarse; purga física periódica; Forget impide resurrección por evaluación antigua. |

Harness de concurrencia: alimentar PCM a veinte entregas/segundo; STT tarda dos segundos, assess tres y generación ocho. Contar frames recibidos/decodificados/entregados, profundidad/edad de colas, revisiones, cancelaciones, resultados fuera de orden, entregas válidas y tareas vivas. Introducir atasco JS, CPU lenta, red sin respuesta y retorno después de OFF. No se acepta demostrar asincronía solo con que la UI siga dibujando.

Una prueba a tiempo virtual durante 30 minutos, una hora y cuatro horas comprueba crecimiento y cuotas; no mide batería ni temperatura. Para carga real, reutilizar fixtures con autorización, medir PSS/RSS/CPU, latencias p50/p95, máxima cola, llamadas/minuto y fugas tras ciclos ON/OFF. Umbrales de mejora de precisión/latencia física deben fijarse con la baseline, no con un porcentaje inventado.

### K.2. Descomponer la latencia

Medir speech_end→STT final; STT→trigger/assess; assess→cue start; cue start→ready; ready→frame nativo; speech_end→frame. Incluir cola, cancelWait y antigüedad del contexto. VAD_SPEECH_END incorpora hangover: si son 600 ms, no confundir esa marca con la última muestra de voz real. Para medidas entre servidor y teléfono, usar duración interna + round trip del cliente, no restar relojes absolutos.

Eventos debug propuestos: AUDIO_CHUNK, VAD_SPEECH_START/END, STT_RESULT, TRANSCRIPT_APPEND, ASSESS_TRIGGER/SKIP/RESULT, CUE_START/CANCELLED/STALE/READY/DISPLAYED/DUPLICATE, AGENT_OVERRIDE, MEMORY_HIT/UPDATE/EXPIRED/FORGOTTEN y ERROR.

Solo timestamps relativos, identificadores efímeros, revisión, motor, contadores, duración y códigos de motivo. Sin texto, audio, claves, etiquetas de voz o perfiles. Usar buffers de métricas de tamaño fijo; no logs a veinte líneas/segundo por defecto. DISPLAYED indica confirmación técnica de frame, no lectura humana.

### K.3. Consumo y plataforma

PCM16 mono a 16 kHz son 32.000 bytes/s: aproximadamente 115,2 MB/h sin compresión. Base64 aproxima 153,6 MB/h antes de JSON/HTTP/TLS; cuatro segundos son 128 KB crudos. BLE sigue llevando LC3, no esa tasa PCM. El solape 6/3 del Whisper móvil aproxima doble audio decodificado. Son cálculos de volumen, no mediciones de batería.

Comparar VAD energía/Silero, Whisper local, Pixel y Soniox con la misma señal, pantalla/lentes, red y duración; registrar CPU, radio, wakelocks y temperatura. Servicio GPU mueve cómputo fuera del móvil, pero añade red, servidor y fallos posibles. Reemplazar polling externo por el WebSocket ya existente evita introducir otro timer sin necesidad.

La descarga de una página termina una miniapp del WebView oficial, como explica el autor. Faceclaw mantiene una sesión EvenHub propia y captura nativa; suspensión del proceso Android, cierre del módulo y cambio de página son hechos distintos. No tratar una limitación del SDK/host como un bug que se arregla ampliando una cola.

## L. Riesgos

**Altos:** pérdida de audio al mover fanout/colas; publicación obsoleta dentro del mismo episodio; starvation por cancelación excesiva; cierre de JNI no interrumpible; filtrar otras voces por error; mezcla entre pasivo y herramientas; almacenamiento sensible o resurrección tras Forget; regresión de Hey Even; nuevas dependencias/modelos incompatibles en Android.

**Medios:** segmentación demasiado agresiva; alucinaciones STT/LLM que parezcan recuerdos reales; lookup lexical que pierda sinónimos; ambigüedad de “eso” entre temas; caducidad dependiente del reloj del servidor; más tokens por memoria; fallos de red/SQLite; consumo térmico; deuda del coordinador central y de callbacks globales.

**Bajos:** textos de menú y etiquetas; ajustes de presentación acotados; configuración central y documentación, siempre que no alteren protocolo ni preferencias existentes.

Mitigaciones: feature flags, consentimiento, capacidades negociadas, pruebas de estados y clocks, fallback al flujo anterior, límites fijos, métricas sin contenido, salida fail-soft de memoria, revisión de fuentes del runtime Hermes y releases pequeñas reversibles.

## M. Preguntas realmente abiertas

- ¿Qué mejora acústica/latencia produce cada motor con otra persona a distancia habitual? Hace falta la misma señal y medición; la demo y una frase Pixel no lo resuelven.
- Resuelto posteriormente: el usuario descarta STT en GPU en el BMAX que aloja Hermes por falta de GPU adecuada. No hace falta una inspección adicional para mantener esa alternativa fuera del encargo.
- ¿Se pretende en el futuro superar veinte minutos de sesión manual? El plan conserva el límite vigente.
- ¿Qué precisión de cues y frecuencia de intervención resulta cómoda en el uso cotidiano? Validar con fixtures etiquetados y una prueba breve, no con una política “hablar siempre” o “callar siempre”.
- Para habilitar la candidata de memoria: revisar el directorio privado del servidor, su exclusión de backups y el runtime SQLite/bridge concretos. El código local no verifica por sí solo ese despliegue.

**Decisión ya resuelta por el usuario:** memoria cotidiana de resúmenes por tema durante 24 h, sin archivo de reuniones, sin audio ni transcripción completa. Consultar un recuerdo no renueva el TTL. La web, las cuentas externas y el archivo permanente no se incluyen.

## N. Incremento local de memoria diaria: implementado, sin desplegar

La petición posterior del usuario autoriza esta adaptación concreta. No se ha copiado el archivo permanente de reuniones de Constella ni su infraestructura privada. El diseño es deliberadamente pequeño: SQLite FTS5/BM25 y recencia sobre resúmenes temporales, sin Qdrant, embeddings, grafo, cuentas externas ni llamadas adicionales al modelo. La recuperación es lexical; no equivale a búsqueda semántica híbrida y puede perder un sinónimo.

### N.1. Cambios efectivos

| Componente | Cambio local |
| --- | --- |
| daily_context.py | Máximo 32 temas; título 80 caracteres y resumen 600; hasta tres coincidencias por consulta; TTL 24 h; purga/Forget e índice FTS5. |
| conversation.py | Consulta opcional antes de la evaluación existente; esa misma respuesta puede proponer memoryUpdate validado y respaldado por turnos suministrados. Sin herramientas, persistencia del agente o llamada extra. Fallo del almacén no invalida una ayuda válida. |
| bridge.py | Capacidad conv/daily-context/1 solo si se inicializa el almacén; configuración del servidor explícita; control autenticado y correlacionado para borrar. |
| conversation-channel.ts | Capacidad negociada, consentimiento separado, opción enviada solo cuando procede; borrado con ACK/plazo, sin declarar éxito ante desconexión. |
| session-controls/dashboard-controller | Selección RAM, congelada durante ON, aplicada a la siguiente sesión manual; no inicia audio ni descarga modelos. |
| main-page.xml/main-view-model.ts | Menú de activar, desactivar y borrar desde OFF, con explicación de almacenamiento y alcance. |

El modelo recibe los recuerdos como datos no verificados; la voz desconocida no se transforma en una preferencia del portador. Las correcciones sustituyen el resumen anterior. No se envía el resumen al móvil ni se añade al historial del chat normal. El agente conversacional sigue sin herramientas. El antirrepetición de seis aportaciones confirmadas/dos horas sigue siendo un mecanismo separado.

El esquema no contiene audio ni transcripciones. El resumen lo escribe el modelo: su calidad, selección de detalles y ausencia de afirmaciones inventadas requieren evaluación real. Solo se almacena una propuesta estructuralmente válida dentro de una evaluación vigente; no constituye un registro exhaustivo del día ni guarda todas las frases escuchadas.

### N.2. Caducidad, borrado y reversión

El plazo se comprueba al consultar y al mutar. La purga del servicio activo se ejecuta cada 30 segundos y al arrancar; si el bridge está apagado no puede borrar físicamente el archivo hasta su siguiente apertura. Leer un resumen o repetir exactamente el contenido normalizado no renueva su plazo. La instrucción exige novedades sustantivas, pero una paráfrasis equivocadamente propuesta por el modelo podría renovarlo: el código no demuestra equivalencia semántica.

Forget incrementa una generación y elimina temas/índice; un resultado antiguo no puede reintroducirlos con su generación anterior. El cliente bloquea ON mientras espera el acuse y no afirma borrado ante timeout/desconexión. Desactivar la opción impide consultas/escrituras futuras; los resúmenes existentes caducan normalmente o se borran con la acción explícita.

La base usa permisos privados y secure_delete/reindexado, sin cifrado de aplicación. Hay que provisionar su directorio y excluirlo de backups en el servidor real. Las instantáneas externas y la retención del proveedor no quedan controladas por borrar SQLite. No se ha creado ninguna base con datos reales en esta sesión.

Activación posterior: FACECLAW_DAILY_CONTEXT=24h y FACECLAW_DAILY_CONTEXT_DB con ruta absoluta privada, SQLite FTS5 disponible y consentimiento separado del móvil. Hay que desplegar conjuntamente bridge.py, conversation.py y daily_context.py; los helpers históricos de dos archivos no sirven. Antes de instalar/desplegar, preparar una candidata reversible con hashes, respaldo y firma original. Este incremento no se ha compilado como APK, instalado ni desplegado. No se han modificado servicios, modelos, firmware o ajustes del Pixel.

Reversión funcional: dejar desactivada la memoria tanto en móvil como en servidor. El protocolo antiguo no lleva la opción y el audio utiliza el flujo existente. La versión instalada sigue siendo S2.6.10; ninguna prueba de esta candidata exige restaurar datos o desinstalar Faceclaw.

### N.3. Validación efectuada

- 60 pruebas Python de conversación, memoria, fallback y bridge correctas, incluidas 16 nuevas con relojes, resúmenes y proveedores sintéticos. Caducidad exacta, reinicio, contradicciones, límites, recuperación relevante, borrado, resultados antiguos, fallos de almacenamiento y purga sin solicitudes.
- Protocolo standalone test_bridge.py correcto: autenticación, chat, streaming, cancelación, reconexión y propiedad serial conservados.
- 155 pruebas Node relacionadas correctas, incluidas cinco nuevas de capacidad/consentimiento, reconexión, borrado/ACK/timeout y opción RAM sin inicio de audio.
- TypeScript de aplicación y pruebas, oxlint de los cuatro archivos TypeScript modificados y parseo XML correctos; git diff --check sin errores de contenido.

Estas pruebas no miden precisión, utilidad, coste o latencia del LLM real, retención del proveedor, visualización física ni autonomía. La memoria añade instrucciones/contexto/tokens a evaluaciones existentes; no es gratis por evitar una segunda llamada. La recomendación actual es mantenerla desactivada mientras se resuelve primero la voz ajena.

## O. Prioridad revisada: interlocutor a dos metros y menor dependencia de Soniox

El usuario aclara que con Pixel y Whisper **no aparecía texto de la otra persona**, situada aproximadamente a dos metros. No informa aquí de ruido de fondo, idioma de esa intervención ni resultado de Soniox en una comparación equivalente. El fallo precede a la generación de ayudas; cambiar el prompt de Hermes o añadir memoria no lo resuelve. La distancia es un dato del caso, no una especificación garantizada del micrófono.

### O.1. Qué demuestra el código y qué sigue siendo una hipótesis

Transcribir otras voces y distinguir sus identidades son tareas diferentes. Whisper es un ASR general, no un modelo entrenado exclusivamente con la voz del portador; su ficha no establece diarización robustamente evaluada. No disponer de etiquetas de hablante no explica por sí solo la desaparición de texto. Las voces simultáneas superpuestas sí requieren una evaluación específica; no se ha confirmado que este caso tuviera solapamiento. [Ficha oficial de Whisper](https://github.com/openai/whisper/blob/main/model-card.md).

La captura propia de Conversaciones solicita supresión de ruido y filtro de haz desactivados. El perfil del portador no veta la transcripción de otras personas. Eso no demuestra qué procesamiento realiza el firmware antes de entregar LC3 ni qué realiza internamente el reconocedor Pixel. La [API pública Android](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_AUDIO_SOURCE) permite aportar un descriptor de audio, pero no documenta un control general para obligar al motor a conservar todas las voces de fondo. La prueba sintética previa confirma funcionamiento de una frase por esa entrada; no demuestra precisión a dos metros.

Whisper tiene un procesamiento propio en [LocalAsrConditioner.kt](E:/projects/faceclaw-es/native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/LocalAsrConditioner.kt:23): estima un nivel de ruido por ventana, aplica menos amplificación a frames cercanos a ese nivel y luego reduce globalmente la ventana si un pico supera el límite. Antes de la limitación global la ganancia nunca baja de uno. Por tanto, no es correcto afirmar que ese código elimina una voz lejana; sí es razonable comparar su efecto sobre una voz débil junto a otra mucho más fuerte. Solo afecta a la copia para Whisper; **no explica automáticamente que Pixel también falle**.

La ruta Whisper actual emplea ventanas de seis segundos con salto de tres; no recorta el ASR por el VAD energético de episodios. Una inferencia ocupada puede descartar una ventana posterior. El solape no garantiza cobertura si el motor queda saturado de forma sostenida. Los rechazos por idioma, estructura o alucinación también pueden ocultar una salida. Conviene distinguir ausencia de señal, decode vacío, decode rechazado y resultado no entregado; no llamar a todos «no reconoce otras voces».

El proyecto de Reddit usa en su servicio publicado faster-whisper large-v3-turbo en GPU. No documenta en ese código una técnica especial de entrenamiento para la voz del portador ni una captura de micrófonos demostrablemente superior. Su capacidad de cómputo y tamaño de modelo difieren de Whisper móvil, pero la mejora acústica y en español/valenciano no está acreditada. Además, el router publicado fuerza inglés en su ruta local: copiarlo literalmente sería un retroceso para este uso.

### O.2. Prueba mínima antes de una reescritura

1. Mantener memoria OFF y Solo texto durante el diagnóstico, para que Hermes no intervenga en la medida. Conservar modelo, idioma y condiciones explícitos. Una prueba coordinada breve con otra persona es suficiente para empezar; no repetir toda la batería histórica ni cambiar firmware/perfil.
2. Comparar voz propia y voz ajena por turnos a uno y dos metros; después ambas en el mismo fragmento sin hablar encima. Registrar solo cobertura de frases conocidas, latencia, niveles agregados, pérdidas, ventanas descartadas y motivos de rechazo. No basta con ver el estado «escuchando».
3. Cuando exista un harness de reproducción, alimentar a cada motor **el mismo PCM consentido**, conservado solo transitoriamente en RAM. Para Whisper comparar copia sin acondicionar y acondicionada. La app actual no ofrece ese fanout/replay: hay que prepararlo como diagnóstico aislado antes de afirmar una comparación controlada. No guardar audio por defecto ni interpretar la autorización para usar el móvil como una captura ya efectuada.
4. Si Soniox transcribe bien ese mismo PCM y los locales no, priorizar el adaptador/modelo y sus rechazos/carga; no cambiar primero la captura común. Si todos fallan y la voz ajena apenas está presente en PCM, estudiar ruta de captura/DSP y geometría antes de entrenar un ASR. Si el texto aparece en resultados nativos pero no en pantalla, reparar la entrega/filtro.
5. El usuario descarta la ruta GPU del BMAX por falta de hardware adecuado. Priorizar Pixel y Whisper móvil, probando un cambio por vez con medidas de cobertura/carga. No trasladar Whisper a la CPU de Hermes por defecto ni contratar una GPU remota. Soniox queda como opción explícita de comparación/respaldo, sin abrir automáticamente otra suscripción ni subir audio por una decisión opaca del sistema.

Cambiar una sola variable por incremento, conservar la versión instalada y una candidata reversible. Aceptar la mejora cuando aumente cobertura de la otra voz sin degradar excesivamente voz propia, latencia y estabilidad; si no aporta, retirar ese incremento. No introducir ahora Silero, otro planner, embeddings o memoria para intentar arreglar un problema de señal/STT. La arquitectura A–M es una propuesta de evolución, **no una obligación de implementarla completa**.
