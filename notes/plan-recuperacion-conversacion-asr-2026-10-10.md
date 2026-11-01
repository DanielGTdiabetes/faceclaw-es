# Recuperar la conversación continua: revisión y plan de implantación

Fecha: 10-10-2026. Horarios de las comprobaciones: Europe/Madrid. Encargo actual: **revisión y plan para Claude, sin implantar cambios**.

## 1. Conclusión y prioridades

No está demostrado que hayamos agotado el hardware. Hay defectos de ciclo de vida y de interfaz independientes de la precisión de Whisper. Cambiar solamente el modelo dejaría esos defectos intactos.

Orden recomendado:

1. Separar la captura local de la disponibilidad de Hermes/Tailscale. Una caída de Internet no debe apagar Whisper local.
2. Eliminar el cierre automático por cinco minutos sin voz en el modo continuo. Silencio significa esperar consumiendo menos, no terminar.
3. Reparar OFF → cierre nativo → nuevo inicio, sin abandonar la pantalla, y mostrar las causas de rechazo aunque la sesión esté OFF.
4. Medir dónde se pierde la voz: PCM, segmentación, VAD WebRTC, Whisper, rechazo de texto, filtro de llamadas, Hermes o presentación.
5. Comparar pocas candidatas sobre el mismo audio: Whisper actual corregido, whisper.cpp y Moonshine Streaming español. Evaluar BMAX como descarga de trabajo, sin asumir mayor potencia.
6. Corregir la divergencia del estilo de Hermes desplegado y validar conversaciones con preguntas **y sin preguntas**.

El usuario refiere calentamiento fuerte, desconexiones, dificultad para volver a escucha sin filtro, reconocimiento deficiente y falta inicial de aportaciones. Cree haber probado principalmente **small**. Más tarde confirma que recibe respuestas, aparentemente solo ante preguntas. También señala cambios de red, errores ocasionales de Tailscale y ruido exterior. Estas observaciones no identifican por sí solas una única causa.

El usuario rechaza expresamente el cierre por cinco minutos de silencio. Quiere alternativas sin pago por transcripción y un plan que Claude pueda seguir. No trasladar automáticamente el ASR al BMAX ni incorporar una suscripción.

## 2. Estado realmente comprobado

### Repositorio y móvil

- Repositorio `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, HEAD inspeccionado `bf46b4793bdf3aab3088933d8dae96b0d90199a2`.
- Había **47 entradas de cambios locales** antes de añadir este informe: retirada de Gatekeeper LLM/Pixel, reglas mecánicas, VAD WebRTC, interfaz y pruebas, entre otros. Son trabajo previo, no cambios de esta revisión. No hacer reset/stash/reaplicación automática ni empezar desde HEAD omitiéndolos.
- El móvil conectado lleva **`0.8.2-es.5-conversation.s2.10-rules` / 805**, actualización indicada por Android `2026-10-10 10:25:06`.
- APK extraída y copia `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.10-rules.apk`: mismo SHA-256 `35df5df6eeab337d7ed90a18a1a3926de4ca3f0a25097f9ba5c82027fc0bbf87`.
- Sus DEX contienen `FaceclawSpeechVad`; no contienen `FaceclawGatekeeperRunner` ni `FaceclawSystemTranscriber`. La biblioteca llama sigue empaquetada: su presencia **no** demuestra ejecución de Gatekeeper. S2.10 ya retiró el LLM de ese camino.
- La igualdad de APK confirma el artefacto; no certifica que cualquier modificación posterior del workspace corresponda exactamente a él.
- Consulta puntual: ningún wakelock activo de Faceclaw en la lista actual; las entradas ACQ históricas no son wakelocks actuales. Batería 66 %, 30,5 °C, cargando; estado térmico global 0. No mide el calor del ensayo ni acredita ausencia de todos los trabajadores ASR.
- No se obtuvo un diagnóstico completo de la sesión móvil ni una lectura verificable del selector RAM. Small queda como declaración del usuario. El log filtrado consultado no permitió reconstruir el corte.
- El móvil se liberó y el usuario continuó probándolo por su cuenta. No volver a consultarlo o iniciar ensayos suponiendo que permanece OFF.

### BMAX / Jarvis

Consulta SSH exclusivamente de lectura: Intel Celeron **N5095A**, cuatro núcleos/hilos, SSE4.1/SSE4.2, sin AVX/AVX2; 7714 MiB de RAM, 4719 MiB disponibles en esa instantánea; swap 4095 MiB, 1 MiB usada. No se ha ejecutado un benchmark ASR allí. No se verificó aceleración GPU; la restricción previa del usuario de no contar con una GPU adecuada se mantiene.

La documentación de CTranslate2 admite x86-64 con SSE4.1: la falta de AVX no basta para declarar incompatible faster-whisper. Tampoco prueba velocidad suficiente. Los benchmarks de un i7 o una RTX no se extrapolan a este Celeron.

### Hermes: sí recibió información

Servicio `faceclaw-hermes.service` activo. Eventos del journal normalizados con el timestamp de journald a Madrid; ventana **desde la instalación S2.10 hasta el último evento observado a las 14:11:12**, no toda posible prueba posterior:

| Resultado | Cantidad |
|---|---:|
| assess → incierto | 44 |
| assess → tema | 13 |
| assist → nada | 75 |
| assist → stale | 1 |
| Total de ejecuciones registradas | 133 |
| Aportaciones `mensaje` en esa ventana | 0 |

No fueron todos los fragmentos filtrados en el móvil. Llegaron peticiones y el servidor se abstuvo. `incierto` no prueba mala transcripción; también puede faltar tema/contexto. `nada` tampoco prueba fallo de transporte. Sin las frases de entrada no podemos atribuir esas abstenciones a Whisper o al criterio de Hermes. No se leyeron conversaciones ni se hicieron llamadas nuevas al modelo.

Hay eventos `ConnectionClosedError` seguidos de reconexión: por ejemplo 11:15:38 → 11:19:37; 12:26:31 → 12:31:34; 13:18:35 → 13:18:39. Otros reconectan en el mismo segundo. Confirman cortes del WebSocket, **no su causa**: cobertura, Tailscale, servidor o ciclo de vida requieren correlación adicional.

Código remoto `conversation.py`: SHA-256 `8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868`. Copia local: `417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc`. La comparación de contenido muestra el cambio de `STYLE`: remoto conserva silencio por defecto y exige una aportación claramente útil; local permite reacción específica, opinión breve, pregunta de seguimiento o comentario pertinente sin esperar una pregunta dirigida al asistente. **El estilo participativo no está desplegado.** No desplegar a ciegas todo el puente para corregirlo.

La observación posterior del usuario de que ahora recibe respuestas tiene prioridad para afirmar capacidad de entrega. No contradice la ausencia de `mensaje` en la ventana anterior ni demuestra estabilidad exterior.

## 3. Hallazgos de código y grado de certeza

| Hallazgo | Evidencia | Consecuencia / límite |
|---|---|---|
| Perder el canal de Hermes puede apagar la captura local | `bridge-client.ts:handleConnectionLost` llama a `conversation.reset`; el canal deshabilita su estado; `conversation-hermes.ts:tick` llama a `stop` si `!channel.isEnabled`; `dashboard-controller.ts:onStopped` apaga el detector manual | Camino causal confirmado en las fuentes. Es compatible con los cortes observados, sin probar cuál produjo cada parada |
| Cierre a los 5 minutos de ausencia de voz detectada | `coordinator.ts:endForSilence`, 300000 ms, basado en `LocalEnergyVad.positiveMs` | Existe aunque `sessionLimitMs=null`. Voz débil puede no contar. El requisito nuevo lo elimina en continuo |
| El botón parece disponible cuando aún drena JNI | `main-view-model.ts:localTranscriptionCanStart` mira solo `!enabled`; `setManualConversationEnabled` rechaza `worker/busy`; `LocalTranscriptSession.stop` invalida pero no interrumpe inferencia | Falta un estado visible de cierre. No demuestra por sí solo por qué volver atrás lo resuelve |
| La causa de un inicio rechazado puede estar oculta | `hermesNotice` se expone por `conversationHermesStatus`; su Label está dentro de `conversationStopVisibility`, oculto en OFF | Defecto concreto de feedback presente también en HEAD. Un toque rechazado puede parecer que no hace nada |
| Cambiar «Voces» cambia también la segmentación | `LocalTranscription.start`: con voces/modelo de voz usa `startWithSpeakers` → PAUSE; sin ello usa `start` → REFERENCE | Desactivar diarización no aísla su consumo. Deben ser opciones independientes |
| WebRTC VAD veta ventanas antes de Whisper en S2.10 | `LocalWhisperModels.load`, `FaceclawSpeechVad`, `faceclaw_vad.cpp`, `LocalTranscriptSession.run` | Modo 1, al menos seis frames positivos de 30 ms por ventana; rechazo contabilizado como `rejectedNoVoice`. Puede ahorrar cómputo y puede perder voz débil: medir ambas cosas |
| PAUSE usa un umbral de energía adicional | `acceptPause`: VAD positivo **o** RMS ≥ 0.0025 (~−52 dBFS), pausa de 400 ms, mínimo 2 s, máximo 12 s | Ruido sostenido puede mantener ventanas largas; voz por debajo de ambos criterios puede perderse. No es una demostración de fallo acústico |
| Whisper ejecuta cómputo repetido y puede perder ventanas | REFERENCE 6 s/avance 3 s; un único trabajo pendiente/en ejecución; PAUSE crece hasta 12 s si está ocupado | Medir cobertura única, cola y antigüedad, no solo tiempo de una inferencia |
| Filtros de llamada pueden retener texto corto | `mechanical-gatekeeper.ts`: mínimo 4 palabras salvo pregunta de 3; agrupa 20 s y limita 120 solicitudes/hora incluyendo assess/assist | No confundir con VAD ni con abstenciones del servidor. Revisar retención de fragmentos y contar cada causa |
| «Sin filtros» no significa ASR sin filtros ni necesariamente no continuo | Los tres botones del panel comparten el inicio manual; la selección cambia filtro de llamadas/Hermes | Nombrar correctamente las opciones y comprobar si el usuario se refiere al botón directo o al asistente normal/PTT |
| Hay un cierre adicional por falta de PCM | `coordinator.refresh`: hueco >250 ms reinicia stream; >2 s sin PCM lleva a error/OFF | Separar llegada nativa de retraso del hilo JS. No resolver aumentando el timeout sin evidencia |

Además revisar `scheduleEvenHubSuspend`, presencia ON_HEAD, prioridad PTT/Hey Even, `main-page.ts:loaded/cleanupPage` y suscripciones del view-model. Ya existen protecciones contra suspender EvenHub durante captura; hay que probar carreras concretas, no afirmar que faltan todas las protecciones o que Doze explica cualquier corte.

## 4. Plan ejecutable por entregas

### P0. Fijar una base recuperable

Revisar diff, artefactos y cambios de otras sesiones; preservar todo trabajo previo. Registrar qué fuentes generaron S2.10 y separar cambios pendientes. No hacer un merge o rollback masivo. Leer `AGENTS.md`, este informe y `continuidad-entre-pcs.md`. La memoria local antigua G3.4 no es el estado vigente.

Entregar un inventario breve: APK/hash, versiones de nativas, motor/política/idioma efectivos, filtros efectivos y hashes del puente. Copiar solo métricas sin contenido a los informes. Firma original, datos, perfil, GPS y configuración de Hermes se conservan. No reenrolar voz, borrar datos ni tocar firmware/reloj.

### P1. Corregir el ciclo de vida y la recuperación de red

Archivos: `app/assistant/bridge-client.ts`, `conversation-channel.ts`, `app/conversation-detection/conversation-hermes.ts`, `coordinator.ts`, `app/g2/dashboard-controller.ts`, `app/phone-ui/main-view-model.ts`, `conversation-panel.xml`, `main-page.ts`.

- Separar intención de escucha (`OFF/ON`) de captura (`preparando/escuchando/pausada/error/cerrando`), estado del enlace a las gafas y estado de Hermes (`conectando/listo/sin red/error de autenticación`). No usar un único booleano para todo.
- Quitar `endForSilence` como cierre del modo manual continuo y actualizar todos los textos/tests. Con silencio, conservar la sesión y un pre-roll acotado; no llamar a Whisper ni a Hermes por ausencia de voz. No restaurar un tope de 20 minutos.
- La cota nativa actual de 24 h es diferente del cierre de cinco minutos. Diseñar su renovación controlada mientras la misma sesión explícita siga ON, o documentar el límite real; no anunciar «sin límite» mientras otra capa termina silenciosamente. OFF siempre revoca concesión, callbacks y renovación.
- La caída de Hermes no debe invocar la parada del detector local. Cancelar solicitudes en vuelo, retirar aportaciones caducadas y conservar captura/transcripción local. No guardar una cola ilimitada de audio o texto durante el corte.
- Reconectar usando el mecanismo exponencial existente, con tope y evitando bucles al alternar redes. Después de `hello-ack` autenticado, restaurar la asistencia solo si sigue vigente la misma intención ON y el mismo destino autorizado. Revalidar capacidades e identidad/memoria; no basta con poner `channel.enabled=true` antes del handshake.
- Conservar el identificador de sesión y aumentar la generación de conexión para rechazar respuestas de sockets anteriores. Por defecto enviar solo contexto nuevo tras la reconexión; no volcar todo lo escuchado sin red ni lanzar ayudas viejas. No reactivar después de OFF, reinicio de proceso, cambio de servidor/token o error de autenticación.
- La memoria diaria opt-in debe reestablecerse únicamente desde la configuración congelada de esa sesión y si el servidor anuncia soporte. No activarla por reconexión.
- Con Soniox o un futuro ASR remoto, la transcripción sí depende de red: mostrar pausa y reintento. Fallback local solo si fue elegido y el modelo está preparado; nada de fallback de pago automático.
- Separar Tailscale inaccesible, socket cerrado, servidor no disponible y gafas desconectadas. No reiniciar VPN ni cambiar DNS/ajustes de batería como primera corrección. Registrar cambios de red y tiempos de reconexión sin SSID, IP pública, tokens ni texto.

Aceptación: diez cortes simulados de canal no apagan el ASR local; OFF durante un reintento nunca revive; una respuesta anterior al corte nunca aparece después. En una prueba física coordinada, cambiar Wi-Fi↔datos, interrumpir Tailscale y recuperarlo son casos separados; no usar modo avión como único ensayo porque también altera Bluetooth. Pantalla apagada, prioridad PTT y gafas en estuche se prueban por separado.

### P2. Recuperar controles fiables

- Sustituir la deducción `!enabled = listo` por estado explícito de cierre nativo. Captura OFF inmediata; si JNI sigue, «Terminando reconocimiento…». No arrancar dos workers ni forzar liberación de un contexto usado por JNI.
- Notificar cuando finaliza el worker; cubrir también carga de modelo, error y cancelación. El polling actual de 30 s puede expirar antes de un cierre lento; no debe dejar UI congelada. Mantener un watchdog informativo sin autoarranque.
- Mostrar estado, motivo de parada y aviso del último inicio rechazado fuera de los contenedores exclusivos de ON. La pantalla debe conservarlos tras un corte.
- El usuario puede pulsar detener y después iniciar con/sin filtro desde la misma pantalla. Una vez terminado el cierre, habilitar los controles automáticamente. El cambio de modo se aplica de forma atómica a la próxima sesión.
- Etiquetas propuestas: «Escuchar con Hermes», ajuste «Reducir llamadas», y «Solo transcribir». «Reducir llamadas» no modifica reconocimiento, VAD o diarización. Aclarar que las tres opciones pueden escuchar continuamente. Mantener parada visible.
- Validar attach/dispose al bloquear/desbloquear y navegar: una suscripción por vista, refresco completo al volver; el panel no es propietario de la vida de la captura.

Pruebas funcionales con worker que termina tarde, carga fallida, canal perdido, OFF repetido y veinte alternancias desde la misma vista. Evitar tests que solo busquen cadenas en el XML: comprobar visibilidad y transiciones reales del view-model/controlador.

### P3. Medir las pérdidas antes de elegir otro modelo

Preparar un pequeño diagnóstico reproducible, fuera de la sesión habitual. Usar clips consentidos de las G2, una sola captura por condición, no pedir al usuario que repita frases para cada motor. Reproducir secuencialmente el mismo PCM; no ejecutar varios ASR simultáneos en el móvil. Audio transitorio en RAM; si para pasar al BMAX hace falta un archivo, explicar y acordar ese uso concreto, mantenerlo privado y borrarlo al terminar. No subirlo a Git/NAS por rutina.

Primer corpus: 24 frases de 5–15 s, portador/interlocutor a 1 y 2 m, interior tranquilo/exterior, turnos cortos y largos; añadir silencio, ruido continuo y una conversación natural sin preguntas. Primero castellano, conforme a la prioridad histórica; valenciano/cambio de idioma como comprobación separada, sin darlo por soportado por modelos solo españoles. Tener referencias humanas, no transcripciones de otro ASR como verdad.

Medir por etapa, con sessionId/streamId/windowId y reloj monotónico:

`LC3/PCM → segmentación → VAD → decode → aceptación ASR → turnos → filtro de llamadas → assess/assist → resultado Hermes → envío de frame → ACK nativo`.

Contadores mínimos: paquetes/chunks perdidos, huecos nativos y JS, nivel/clipping, duración y cierre de ventanas, voz rechazada, audio único intentado/decodificado, vacíos/idioma/bucles, turnos entregados, causa de retención por reglas, peticiones/outcomes/latencia y aportaciones confirmadas. Mostrar un resumen comprensible después de OFF; conservar metadatos de la última sesión al navegar. Una línea «No hay ayudas» debe distinguir «sin texto», «agrupando», «sin Internet», «Hermes se abstuvo» y «respuesta no entregada».

Comparación incremental, no un producto cartesiano enorme:

1. Baseline S2.10/small con configuración conocida.
2. Mismo motor, mismos segmentos, **WebRTC VAD ON/OFF solo en el banco**: comprobar si `rejectedNoVoice` elimina voz humana inteligible.
3. Separar elección de `PAUSE/REFERENCE` de atribución de hablantes. Comparar diarización ON/OFF manteniendo ventanas idénticas; si falla el modelo de voz, no cambiar silenciosamente segmentación.
4. Comparar crudo/acondicionado e idioma es/auto únicamente sobre clips afectados. No combinar simultáneamente ganancia, VAD, modelo e idioma.
5. Elegir la política con mejor cobertura/latencia y comparar base/small; después evaluar otro runtime/modelo.

No basar el ahorro solo en «VAD positivo»: debe preservarse voz lejana. Si el PCM ya no contiene palabras audibles, investigar captación, paquetes LC3 y entorno; un ASR mayor no reconstruye información inexistente. Si hay PCM inteligible y salida nativa válida pero no texto entregado, reparar filtros/entrega. Los perfiles de voz no son una mejora de reconocimiento ni la atribución por ventana una diarización perfecta de voces solapadas.

Usar `scripts/asr-score.cjs --reference REF.jsonl --hypotheses HYP.jsonl`. Exigir `missingClips=0`; una hipótesis vacía debe estar presente y contar sus omisiones. La WER del script no debe parecer mejor por excluir clips ausentes. Separar WER portador/interlocutor/distancia/entorno, proporción de frases perdidas y falsos textos en silencio. La exactitud de etiquetas se evalúa aparte.

### P4. Reducir carga sostenida sin perder voz

- Retener la ruta nativa PCM y buffers acotados; evitar convertir audio a JSON/base64 o cruzar repetidamente JNI/JS para tareas que pueden quedarse nativas.
- Modelo precargado dentro de la sesión, un decoder activo y, si se añade, una única ventana pendiente reciente/coalescida con límites explícitos. Contabilizar cualquier audio que se descarte. No acumular minutos atrasados para mantener una cobertura ficticia.
- PAUSE desacoplada de voces; preroll y final de frase preservados. Mantener un límite de ventana para ruido sin pausas. Revisar el umbral fijo y VAD con el corpus antes de cambiarlos.
- Reducir embeddings de hablante a ventanas útiles y medir su coste; permitir ASR anónimo sin degradar segmentación. No añadir otro LLM local.
- Los cuatro hilos actuales no son automáticamente óptimos térmicamente para small. Comparar 2/4 solo después de tener un baseline estable; mantener resultados previos de base y medium como evidencia, sin repetir toda su batería.
- Evaluar padding/encoder/runtime solo con comprobación de WER: reducir padding puede impedir fin de texto. No llamar «acelerado» a XNNPACK/NNAPI/GPU por configurar un nombre; comprobar nodos/operaciones realmente delegados y tiempo completo.
- Limitar refrescos de UI, formateo de diagnósticos y logs durante captura. Medir CPU por proceso/hilo, PSS, temperatura térmica Android y batería; el USB cargando distorsiona la medición energética. La temperatura de batería no representa por sí sola la del SoC.
- Ante estado térmico severo o cola creciente, degradación explícita reversible o pausa justificada, sin ocultarla ni reiniciar ON en bucle. Eliminar el cierre por silencio no elimina el manejo de fallos reales.

### P5. Candidatas gratuitas y prueba BMAX

| Candidata | Motivo para probar | Limitación / prioridad |
|---|---|---|
| Whisper base/small actual, pipeline corregido | Integrado; multilingüe; base ya mostró mejor rendimiento con 4 hilos en ensayos anteriores | Primera referencia. No volver a vender small como novedad ni atribuir todo al tamaño |
| whisper.cpp cuantizado en Pixel | Runtime Android/CPU alternativo, cuantización y backends disponibles | Primera alternativa de runtime; piloto aislado y mismo PCM. No promete exactitud mayor con los mismos pesos |
| **Moonshine Streaming tiny/small español** | Modelo diseñado para procesamiento incremental y ejecución local; variante small-es publicada de 112,9 M y MIT | Primera alternativa de modelo. Verificar paquete Android/int8 exacto y versiones; no copiar los pesos float32 de Transformers como si fueran el artefacto móvil. No acredita catalán ni voz lejana; puede repetir con ruido |
| faster-whisper CPU int8 en BMAX | CTranslate2 soporta SSE4.1; descargaría ASR del teléfono | Medir base y small antes de diseñar servidor. Puede ser más lento; añade dependencia de red y compite con Hermes |
| whisper.cpp CPU en BMAX | Segunda opción si faster-whisper no cumple o presenta problemas de runtime | Compilar para ISA real; no ejecutar binarios preparados con AVX en el Celeron. No abrir otra investigación GPU sin hardware confirmado |
| Pixel SpeechRecognizer on-device | Adaptador y prueba sintética históricos, sin tarifa STT | S2.10 lo retiró. No restaurar por defecto: revisar motivo y comparar solo si aporta valor; audio externo y continuidad deben verificarse. No confundir API pública con dictado privilegiado de Gboard |
| Vosk es/ca | Modelos pequeños locales, streaming, ambas lenguas en catálogo | Reserva de bajo consumo, con modelos separados; no garantiza calidad ni alternancia automática |
| Parakeet TDT 0.6B v3 | Alternativa de familia distinta con español | Prioridad posterior por tamaño/integración. Su lista de 25 idiomas **no incluye catalán**; no proponerlo como sustituto bilingüe completo |

Medium CPU en el Pixel ya dio p95 sostenido ~15 s frente a un avance de 3 s y ~57 % de cobertura decodificada en el banco anterior. No es candidato continuo predeterminado. Las pruebas de aceleración previas no acreditaron un motor completo útil. No repetirlas sin una hipótesis/exportación concreta nueva.

Prueba BMAX, si se pasa a implementación: entorno aislado sin modificar el venv de Hermes, un proceso/modelo, primero base y después small int8, dos hilos inicialmente y cuatro solo si no perjudica al puente. Medir latencia fría/caliente, RAM, RTF sostenido y latencia de Hermes antes/durante; detener la exploración de modelos mayores si small ya no sostiene el flujo. Registrar versiones y pesos con hash. Sin instalación global ni despliegue de servicio hasta que haya un ganador.

Si gana el BMAX: adaptador `DetectorTranscription` separado y protocolo acotado con sample rate, secuencia, sessionId, ventana, timestamps y cancelación; PCM16 mono 16 kHz binario, autenticación y acceso LAN/Tailscale, sin puerto público ni reutilizar un endpoint de chat como transporte de audio. Una instancia cargada, límites de cola/TTL, reinicio aislado del proceso ASR si no cancela, sin reiniciar Hermes. Con PCM sin compresión son 32 kB/s (~115 MB/h antes de transporte); ahorro de CPU no implica ahorro total de batería. Medir móvil y red también.

La opción remota se elegirá por **calidad + latencia + estabilidad + consumo**, no por estar en un ordenador. Whisper con los mismos pesos y configuración no se vuelve más preciso solo por cambiar de máquina. No depender del PC/RTX que el usuario ya descartó por disponibilidad.

### P6. Conseguir aportaciones de Hermes y verificar su entrega

- Reconciliar el `STYLE` local/remoto; el cambio participativo ya existe. Preparar despliegue mínimo reversible de ese cambio, verificando compatibilidad de módulos y hashes, no sustituir el bridge con un helper histórico.
- Antes, replay con transcripciones de referencia y salidas ASR del mismo corpus: preguntas, opiniones, anécdotas, reacciones, texto incompleto, ruido convertido en texto y repetición. Si la referencia obtiene ayuda y el ASR no, la calidad/segmentación aporta evidencia causal; si ambos quedan en nada, revisar política/contexto.
- Distinguir el filtro de reglas previo de `assess` y de `assist`: recibir una petición no prueba que la frase completa haya llegado. Textos cortos retenidos deben incorporarse al contexto posterior; no se deben perder indefinidamente ni reenviar en bucle.
- No usar interrogación como única condición para intervenir: ASR puede omitir puntuación y el usuario quiere participación natural. Mantener límites de frecuencia, no repetición y abstención ante texto ininteligible; no forzar una respuesta a basura ASR.
- Presupuestos y cadencia con estados visibles y contadores. Reducir evaluaciones duplicadas por solapes/revisiones del mismo audio. Evaluar si assess+assist puede evitar una llamada cuando ya hay contexto suficiente, conservando el contrato y validación; no añadir un clasificador de pago.
- Tests simulados no consumen API. Cualquier replay real debe tener un número de peticiones acotado y contabilizado; «ASR gratuito» no significa que consultar Hermes continuamente carezca de coste/cuota.
- Verificar cadena `mensaje generado → enviado → aceptado móvil → overlay → frame nativo enviado/ACK`. `presented` es intento de presentación, no lectura confirmada del usuario. Examinar respuestas mientras la pantalla del teléfono y las lentes estaban apagadas, prioridades y caducidad.

### P7. Criterios de aceptación y decisión de límite

Objetivos de ingeniería propuestos, no prestaciones medidas ni umbrales universales:

| Dimensión | Criterio para aceptar |
|---|---|
| Ciclo de vida | Cambiar con/sin filtro desde la misma pantalla; OFF inmediato para captura y cierre del decoder observable; ningún resultado tardío ni autoarranque |
| Silencio | Más de 5 minutos de silencio conservan ON y vuelven a producir texto al hablar; mínima inferencia ASR en silencio |
| Red | ASR local continúa con Hermes/Tailscale caído; reconexión autenticada recupera ayuda dentro de la misma sesión; no hay ayudas atrasadas |
| Captura | Ninguna pérdida inexplicada en el tramo humano evaluado; pérdidas y descartes siempre contados y localizados |
| ASR | Comparación completa sin clips omitidos; no empeorar portador y reducir pérdidas/interlocutor; como orientación, mejora relativa ≥20 % de WER en el subconjunto problemático o mejora clara de frases recuperadas, con revisión humana |
| Flujo | RTF efectivo sostenido <1 y preferiblemente ≤0,7 de tiempo de worker por audio único; cola sin crecimiento; p95 fin de frase→texto orientativo ≤3 s en frases normales. Publicar también espera por segmentación y máximos |
| Carga | Candidato mantiene cobertura al calentarse; sin estado térmico severo ni crecimiento de PSS; mejora energética comparada con S2.10 bajo condiciones iguales, sin inventar un porcentaje objetivo |
| Hermes | Aportaciones pertinentes también sin pregunta explícita; sin repetir/acosar ni inventar sobre ASR incomprensible; entrega en lentes verificada |

No exigir que todo se mida en una sesión maratoniana. Primero corpus breve que descarta perdedores; después 10–15 min sostenidos de la mejor configuración; finalmente una conversación real de unos 30 min con el usuario, sin repetir pruebas históricas que no han cambiado.

Para exterior, matriz mínima: interior/red estable, interior/cambio de red, exterior/red estable, exterior/cambio de red. Mantener motor/ajustes, posición y locutores comparables; controlar viento y distinguir ruido de tráfico. Si es posible comparar sobre el mismo audio, hacerlo; las cuatro sesiones naturales solas no aíslan causalidad. No confundir ensayo de pérdida de Internet con micrófono peor.

Decisión final honesta: si ninguna candidata mantiene reconocimiento útil de otra persona, cobertura y temperatura, documentar el compromiso concreto: distancia/ruido que exige captura distinta, hardware insuficiente para ASR local útil o disponibilidad de red insuficiente para remoto. Entonces ofrecer un modo acotado/PTT como alternativa elegible, no imponerlo antes de reparar estos defectos. No prometer equivalencia con un servicio grande en GPU ni concluir que «en exterior es imposible» con la evidencia actual.

## 5. Qué enseñan los proyectos similares de G2

Se volvió a inspeccionar la referencia local `reference-even-memory-20261009` @ `a90e39dbea074ba54ecfbec97060950d1b937240`. Su `backend/whisper_server.py` usa faster-whisper **large-v3-turbo**, CUDA/int8_float16 en producción, CPU/int8 en desarrollo, modelo cargado una vez y VAD. El idioma por defecto allí es inglés. El rendimiento anotado en un comentario no es una medición en nuestro teléfono ni en BMAX.

Son aprovechables la carga única, separación de captura/inferencia, colas limitadas y cadencia de aportaciones. No demuestra que el micrófono G2 sea mejor ni que ese servicio sea gratis de operar. No copiar el idioma inglés, las dependencias privadas de Constella, timeouts que dejan trabajos vivos o dos decoders concurrentes a este móvil. La auditoría anterior ya explica límites y licencias; reutilizar patrones concretos y conservar atribución si se copia código.

## 6. Fuentes primarias y antecedentes

Consultadas el 10-10-2026; fijar revisiones/versiones antes de una implementación:

- [faster-whisper: CPU int8 y benchmarks con hardware identificado](https://github.com/SYSTRAN/faster-whisper).
- [CTranslate2: requisitos de CPU](https://opennmt.net/CTranslate2/hardware_support.html).
- [whisper.cpp: Android, CPU, cuantización y backends](https://github.com/ggml-org/whisper.cpp).
- [Moonshine Voice: toolkit y plataformas](https://github.com/moonshine-ai/moonshine).
- [Moonshine Streaming Small español: ficha, artefactos y limitaciones](https://huggingface.co/moonshine-ai/moonshine-streaming-small-es).
- [Vosk: catálogo es/ca](https://alphacephei.com/vosk/models).
- [Parakeet v3: idiomas y licencia](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3).
- [Android SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer).
- [Referencia G2](https://github.com/Tej-Sharma/even-reality-memory-system).
- Antecedentes locales: `revision-codex-s2.6.13-2026-10-10.md`, `auditoria-conversaciones-continuas-2026-10-09.md`, `traspaso-gatekeeper-servidor-2026-10-10.md`, `whisper-hablantes-gatekeeper-implantacion-2026-10-10.md`.

Evidencia de esta revisión, local y sin publicar: `.tools/audit-conversation-20261010/installed.apk`, `hermes-events-madrid.json` (solo métricas/eventos), `deployed-conversation.py` (fuente del servidor). No contiene audio ni transcripciones de usuario. No se han compilado/instalado APKs, descargado/ejecutado modelos, modificado servicios, cambiado ajustes, publicado Git ni copiado nada al NAS. No se ejecutó una batería de tests porque el encargo no ha cambiado código funcional.

## 7. Entregas que debe producir Claude

1. Corrección pequeña de ciclo de vida/UI/red/silencio, con pruebas funcionales dirigidas y diff revisable.
2. Diagnóstico por etapas y banco de audio reutilizable; resultados que elijan ASR, no una lista de modelos instalados.
3. Una sola candidata ganadora integrada de forma reversible, con selección explícita y métricas de carga/calidad.
4. Ajuste mínimo de estilo Hermes y validación de entrega sin depender solo de preguntas.
5. APK firmada con identidad original y reversión fresca; instalación únicamente dentro de la autorización de ejecución que dé el usuario, con OFF confirmado y preservación de datos. Actualizar continuidad con hashes, fuentes y pendientes reales; no declarar victoria solo porque compila o transcribe una frase.
