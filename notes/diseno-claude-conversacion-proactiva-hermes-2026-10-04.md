# Diseño Claude: conversación proactiva con Hermes, 04-10-2026

Encargo `notes/prompt-claude-conversacion-proactiva-hermes-2026-10-04.md`. Rama `codex/conversation-detection-g0`, base `826449c`. Solo diseño: sin implementación, build, instalación, ensayo, cambios de modelo/umbral ni conexión real. **Pendiente de revisión Codex antes de implementar.**

Etiquetas: **[E]** existe en el código (archivo y símbolo citados), **[I]** instalado según una entrega previa, **[P]** propuesta, **[H]** hipótesis sin medir.

## 0. Objetivo y alcance temporal

Detectar una conversación en la que participa el usuario (su voz y al menos otra que intercambian turnos), activar un contexto conversacional y enviar a Hermes las intervenciones relevantes. Hermes responde, aporta ideas o comenta en las lentes sin «Hey Even». La transcripción es un medio.

- **Primera versión solo en castellano.** Sin traducción ni pruebas bilingües. El perfil propio existente se conserva sin recrearlo.
- **Recuperar el valenciano después:** volver a habilitar la autodetección de idioma (o un selector es/ca), aceptar `ca` en `localTextRejection` (ya lo acepta hoy) y repetir la medición de §3 con material valenciano. El perfil de voz no depende del idioma.
- La categoría «otra voz» significa solo «no coincide con el perfil». No demuestra una segunda persona presente (TV, altavoz, grabación).

## 1. Mapa del desfase

| Pieza | Estado | Evidencia |
| --- | --- | --- |
| Captura BLE local, VAD por energía, ASR Whisper base, comparación con perfil | [E][I] G3.4.2 | `coordinator.ts` `ConversationCaptureCoordinator`, `local-vad.ts` `LocalEnergyVad`, `LocalTranscriptSession.kt`, `LocalParticipationSession.kt` |
| Inicio manual, tope 120 s, OFF, prioridad Hey Even/PTT/asistente | [E][I] | `coordinator.ts` `refresh()`/`expire()`, `dashboard-controller.ts` `detectorEnvironment()` |
| App en lentes, texto temporal, pantalla encendida mientras ON | [E][I] G3.4.2 | `local-conversation-app.ts` `keepsScreenOn` (`0161fdd`) |
| Captura sigue con pantalla apagada mientras hay concesión | [E], no observado | `dashboard-controller.ts` suspensión EvenHub omitida si `conversationDetector.holdsSession()` |
| Alternancia propia/otra | [E] **solo etiqueta** | `LocalParticipationTurns.state()` devuelve «conversación candidata». Ningún consumidor: solo `conversation-ui.ts` la pinta |
| Conversación activa/confirmada, fin automático | **No existe** | — |
| Escucha de fondo sin inicio manual | **No existe** | El coordinador exige `setEnabled(true)` explícito |
| Envío a Hermes | **No existe** | El ASR local no tiene ruta a `bridge-client.ts`. «Sin envío al asistente» es un requisito actual |
| Proactividad del asistente | [E] pero **no conecta** el diálogo | `mcp-server.ts` limita llamadas a herramientas `proactive: true` (6/min) iniciadas por el agente. El puente Hermes no tiene planificador proactivo (README del puente) |
| Captación del interlocutor | **Deficiente** [I] | El usuario lo ve bien a él, y del otro «apenas aparecen algunas palabras». Agregados: 4/14 rechazos por idioma, sin atribuir |

No validado: precisión de comparación/participación, rechazo de TV/replay, autonomía/Doze, estabilidad larga, incidentes 492 ms/siete descartes y UI 1046 ms/21 drops.

Lo que falta hasta el objetivo: (a) captar bien al interlocutor en castellano, (b) una máquina de estados que convierta la alternancia en conversación activa con inicio y fin, (c) escucha sin inicio manual con coste acotado, (d) un canal conversacional aislado hacia Hermes, (e) una política de intervención y su presentación en las lentes.

## 2. Arquitectura y estados [P]

Se reutiliza `ConversationCaptureCoordinator` como dueño único de la captura. Encima se añade un **`ConversationEpisodeTracker`** en TypeScript (nuevo, sin audio) que consume las instantáneas del coordinador y decide el episodio. Hermes nunca recibe audio ni vectores.

### Controles (separados)

| Control | Ámbito | Efecto |
| --- | --- | --- |
| **Escucha de conversaciones** ON/OFF | Usuario, RAM al principio (no toca los 33 ajustes) | Permite el estado Escuchando. OFF libera todo |
| **Hermes en conversación** ON/OFF | Usuario | Permite enviar intervenciones a Hermes. Con OFF el episodio solo muestra texto local |
| **Comentarios**: silencio / solo respuestas / respuestas + ideas / + humor | Usuario, gesto rápido en la app de lentes | Filtra qué tipos de salida de Hermes se muestran. Silencio no detiene la escucha |
| OFF explícito | Doble toque, cerrar ventana, botón móvil | Todo a OFF, como hoy |

### Estados

| Estado | Entra | Motores activos | Sale |
| --- | --- | --- | --- |
| **OFF** | Inicio, OFF explícito, error | Ninguno | Escucha ON |
| **Suspendido** | Gafas no puestas, desconexión, Hey Even/PTT/asistente, audio ocupado (`detectorEnvironment()` existente) | Ninguno. Concesión liberada | Condición resuelta → Escuchando, con época nueva |
| **Escuchando** | Escucha ON y entorno disponible | Captura + VAD + **comparación de perfil** por segmento. **Sin ASR** (ahorra CPU) | Evidencia de candidata → Candidata. Presupuesto de escucha agotado → OFF con motivo |
| **Candidata** | `participation` acumula voz propia + otra con ≥2 transiciones en ventana corta | Añade **ASR** (calentado). Texto en buffer local, **no** se envía a Hermes | Confirmación (≥1 turno propio más en ventana, sin abstenciones dominantes) → Activa. Caducidad (p. ej. 15 s sin nueva alternancia) → Escuchando y buffer borrado |
| **Activa** | Confirmada | Captura + VAD + comparación + ASR. Intervenciones delimitadas → política de §5 → Hermes si está ON | Sin intercambio respaldado durante T_fin (hipótesis 20-30 s) → Escuchando. OFF/suspensión → fin interrumpido |
| **Silencio de comentarios** | Subestado de Activa (control) | Igual que Activa. Hermes puede recibir contexto si lo permite el usuario, pero no se muestra salida | Cambio del control |

Reglas:

- **Evidencia antes de activar.** Basta la alternancia propia/otra ya calculada, pero con dos correcciones: (1) una comparación «insuficiente» no debe reiniciar toda la secuencia (hoy `LocalParticipationTurns.accept` hace `reset()`), sino ignorarse y caducar por tiempo, y (2) se exige al menos un turno propio «compatible». Oír solo al usuario o solo voces ajenas nunca activa.
- **Fin.** Un único evento de fin por episodio. El buffer de texto, el contexto de Hermes y los identificadores del episodio se borran. Los resultados tardíos llevan `episodeId`+`epoch` y se descartan si no coinciden (mismo patrón de época que `coordinator.ts`).
- **Prioridad.** Sin cambios: Hey Even/PTT/asistente revocan la concesión (`preempt()`), el episodio pasa a Suspendido sin enviar nada y, al volver, empieza una evidencia nueva. Un turno de Hermes en vuelo se cancela con `cancel` al entrar en Suspendido u OFF.
- **Pantalla.** Escuchar no requiere lentes encendidas: el código ya evita la suspensión EvenHub mientras `holdsSession()` [E, no observado]. `keepsScreenOn` de G3.4.2 queda solo para la app abierta en modo manual. En Activa, la salida de Hermes se presenta con una tarjeta breve que puede encender la pantalla solo si el usuario lo permite (§5). Verificar físicamente que la captura sigue con la pantalla apagada es un requisito del incremento de escucha de fondo.
- **Tope de 120 s.** Se mantiene para el modo manual actual. La escucha de fondo necesitaría un **presupuesto** propio: duración máxima por bloque, reposo entre bloques y límite diario, configurables, con OFF al agotarse. Las cifras se fijarían tras medir batería del Pixel y las G2, temperatura y pérdidas de audio en G5 (A/B con y sin escucha, misma jornada). No se elimina el tope en este encargo.
- **Coste por estado.** Escuchando ejecuta solo VAD y embeddings por segmento (worker acotado existente). El ASR, lo más caro (decodificación máxima observada 1,08 s por segmento), solo corre en Candidata/Activa.

## 3. Captación del interlocutor en castellano

### Dónde puede perderse su intervención

| Etapa | Mecanismo actual [E] | Pérdida posible [H] |
| --- | --- | --- |
| Señal | Micrófono G2, PCM 16 kHz mono. `metrics.rms` solo da el último valor | La voz ajena llega más débil y reverberada que la propia |
| VAD | `LocalEnergyVad`: inicio con RMS ≥ max(0,003, 3× ruido) durante 150 ms y mantenimiento con 1,8× / 0,002 | Una voz débil se queda en `candidato` y nunca abre episodio. Si responde justo tras el usuario sí entra (umbral de mantenimiento más bajo) |
| Segmentación | `LocalTranscriptBuffer`: abre en `posible voz` con 200 ms previos, cierra tras `sin actividad` (600 ms), mínimo 0,3 s con voz y máximo 8 s | Respuestas cortas («sí», «vale») → `shortSegments`. Turnos rápidos (<600 ms) se funden con los del usuario en un segmento |
| Trabajador | Un trabajo en curso y uno pendiente | Segmentos sustituidos (`dropped`) o invalidados por época (`invalidatedDecodes`) |
| ASR | Whisper base int8, idioma automático (`FaceclawLocalTranscriber.kt`, idioma `""`) | Voz lejana identificada como otro idioma (`rejectedLanguage`) o mal transcrita |
| Filtros | `localTextRejection`: solo es/ca, no vacío, ≤600 caracteres, sin `[`, `(` o `<|` al inicio | Rechazo por idioma o estructura |
| Entrega | `LocalTranscription` guarda las 3 últimas líneas. La lente muestra el final | Una línea ajena corta queda desplazada por las del usuario antes de leerse. Es una pérdida de **presentación**, no de reconocimiento |

El ensayo G3.4.2 solo permite afirmar que la captura fue continua, que el VAD acumuló 29,84 s y que hubo 4 rechazos por idioma. No atribuye nada a un hablante ni descarta pérdidas en VAD o segmentación.

### Diagnóstico mínimo [P] (sin grabar ni leer conversación privada)

1. **Marcas de fase en el móvil**, solo en modo ensayo: «Fase: interlocutor», «Fase: yo», «Fin». Al pulsar, el coordinador copia sus contadores agregados y la tabla de métricas muestra **diferencias por fase**. No se guarda texto.
2. **Contadores nuevos en TypeScript** (`local-vad.ts`, sin cambios nativos): ms en `candidato` que no llegaron a abrir episodio, e histograma del nivel de las tramas con voz en 4-5 franjas de dBFS. Con eso se ve si la voz ajena queda bajo el umbral.
3. **Por fase, de los motores existentes:** episodios VAD, `shortSegments`, `submittedAudioMs`, decodificaciones, `rejectedLanguage`, `rejectedEmpty`, entregas y **número de caracteres entregados** (no el texto). Opcional y pequeño en Kotlin: comparaciones por franja de similitud (≥0,80, ≤0,60, intermedia), útil para §2.
4. **Material artificial conocido**, en un ensayo separado y futuro: frases castellanas fijas reproducidas por un altavoz a 1 m y a 2 m con el usuario callado, y después el usuario leyendo otro guion. Al ser contenido sintético se puede leer el texto y calcular palabras recuperadas. Con una persona real solo se usan los agregados por fase.

### Opciones de ASR

| Opción | Calidad esperada | Falsos textos | Coste |
| --- | --- | --- | --- |
| Autodetección (hoy) | Pierde segmentos castellanos mal identificados (4/14 en el ensayo, sin atribuir) | El filtro de idioma también descarta basura en otros idiomas | Base |
| **Idioma fijo `es`** | Elimina el rechazo por idioma. No mejora una voz demasiado débil | Mayor riesgo: ruido o TV pueden producir castellano inventado. Mitigan el VAD, el mínimo de 0,3 s, los filtros de estructura y la confirmación de conversación | Igual o menor (sin detección de idioma) |
| Autodetección + reintento `es` | Similar a fijo `es` en los rechazados | Igual que fijo en esos segmentos | Una decodificación extra (hasta ~1 s) por rechazo. Complejidad solo útil con bilingüe, que está aplazado |
| Whisper small (id `whisper-small-es` ya definido en `asr-model.ts`) | Probablemente mejor con voz débil | Algo menor | Varias veces más CPU por segmento. Solo si `es` con base falla con niveles medidos |
| Ajustar umbrales VAD/segmentación | Solo si el diagnóstico muestra la voz ajena en `candidato` o en `shortSegments` | Más episodios de ruido | Bajo |

**Recomendación:** con el alcance castellano, el idioma fijo `es` es la simplificación justificada. Elimina un mecanismo que solo servía al bilingüe y no añade decodificaciones. Se adoptaría solo tras compararlo con la autodetección en el mismo material artificial (selector RAM `auto | es`), midiendo palabras recuperadas y textos inventados en tramos sin voz. El cambio nativo es de una línea en el módulo de la app: `FaceclawLocalTranscriber.kt` pasa hoy `""` a `AndroidSpeechEngines.recognizerConfig(dir, kind, whisperLanguage)`, cuyo valor por defecto, que usa el asistente, ya es `"es"`. No requiere AAR. **Precaución:** con idioma fijo hay que comprobar con una prueba qué devuelve `result.lang` (puede venir vacío). Si no es `es`, `localTextRejection` rechazaría todo, y en ese modo el decodificador del módulo de la app debe devolver `LocalDecodedText(text, "es")`, sin tocar `localTextRejection` del AAR compartido. No se elige el reintento.

## 4. Contrato con Hermes [P]

### Lo que existe y por qué no sirve tal cual [E]

- Móvil: `bridge-client.ts` `sendUtterance()` admite un solo turno activo y **sustituye** el anterior ("Superseded by a new request"). El historial del chat del asistente se persiste en el ajuste `assistant.conversations` (`conversations.ts`, `shell.ts`).
- Puente (`faceclaw-hermes-bridge/bridge.py`): un único `AIAgent` con `enabled_toolsets=["hermes-cli","faceclaw-phone"]`, un único `self.history` en RAM compartido por todos los turnos, ejecución serial con `self.lock`, y una frase nueva **cancela** el turno activo (`self.cancel(phone)`). `save_trajectories=False`, `skip_background_review=True` y `skip_context_files=True`, pero **conserva la memoria normal de Hermes** (README) y el estilo indica cómo usar su herramienta de memoria.

Enviar la conversación por la ruta actual mezclaría lo oído con el historial del asistente, cancelaría las peticiones del usuario y permitiría a Hermes guardar en su memoria persistente o ejecutar herramientas de `hermes-cli` a partir de lo oído. **No se usa la ruta actual.**

### Transporte

Texto local, nunca audio ni vectores. Nuevo canal en el mismo WebSocket v1: `chan: "conv"`, que no comparte `turnId` ni historial con `chat`.

```
conv: episode-start {episodeId, startedAt, lang:"es"}                        phone → bridge
      segment {episodeId, seq, speaker:"propia"|"otra"|"desconocida",
               text, t0, t1, final:true}                                     phone → bridge
      consider {episodeId, uptoSeq, reason:"pregunta"|"pausa"|"periodica"}   phone → bridge
      episode-end {episodeId, reason:"silencio"|"off"|"suspendido"|"error"}  phone → bridge
      output {episodeId, basedOnSeq, kind:"respuesta"|"idea"|"comentario"|"nada",
              text, ttlMs}                                                   bridge → phone
      cancel {episodeId}                                                     phone → bridge
```

- **Atribución:** `propia` solo con similitud ≥ umbral actual, `otra` = «no coincide con el perfil», `desconocida` en zona intermedia, abstención o segmento fundido. Hermes recibe la etiqueta como dato incierto, nunca como identidad.
- **Contexto acotado en el puente:** ventana deslizante por episodio, p. ej. últimos 2-3 min o N caracteres, el menor. Se descarta al `episode-end`. Sin nombres de personas ni datos del perfil.
- **Cola y caducidad:** como mucho una evaluación en curso por episodio. Un `consider` nuevo sustituye al pendiente. Cada `output` lleva `basedOnSeq` y `ttlMs`, y el móvil lo descarta si el episodio terminó, cambió la época o la conversación avanzó más de K segmentos o T segundos desde `basedOnSeq` (contexto antiguo).
- **OFF, suspensión y desconexión:** `episode-end` + `cancel`, y el puente interrumpe el agente del modo conversación. Al desconectar, el puente borra el contexto de todos los episodios de ese teléfono. Al reconectar no se reanuda un episodio viejo.
- **Prioridad del asistente normal:** el canal `chat` del usuario tiene preferencia. Si el usuario invoca a Hermes durante un episodio, se cancela la evaluación `conv` en curso. Las dos rutas nunca comparten historial.

### Aislamiento en el puente

- **Segundo `AIAgent`** dedicado («faceclaw-conv») con su propio `session_id`, sin `conversation_history` compartido, con `ephemeral_system_prompt` propio (política de §5) y cerrojo propio.
- **Herramientas solo de lectura:** búsqueda web/información actual y, si hace falta, ubicación. **Sin** herramienta de memoria, terminal, archivos, mensajería ni herramientas del teléfono que escriban o actúen. Lo oído es contexto, nunca una orden: aunque alguien diga «manda un mensaje a…», el modo conversación no ejecuta acciones. Como mucho sugiere en la lente que el usuario lo pida por la vía normal.
- **Retención:** pendiente de comprobar en el código de Hermes instalado en Jarvis (no accesible desde este encargo) si `AIAgent` con `session_id` guarda sesiones o registros en disco aunque `save_trajectories=False`. Hasta comprobarlo, **no se promete ausencia de retención**. Requisito del incremento del puente: verificarlo, desactivar la persistencia de sesión de este agente si existe y documentarlo. Las métricas del puente siguen sin registrar textos.
- **Móvil:** las salidas `conv` no se guardan en `assistant.conversations` ni en ajustes. Solo RAM del episodio.

## 5. Política de intervención [P]

### Cuándo consulta el móvil a Hermes (`consider`)

No hay consulta por palabra ni por segmento. Se dispara con:

- **Pregunta probable:** un segmento final termina en «?» o empieza por un interrogativo castellano (qué, cuándo, cuánto, dónde, quién, cómo, cuál, por qué), de cualquier hablante.
- **Pausa del diálogo:** sin voz durante ~2 s tras al menos un intercambio nuevo.
- **Periódica:** como mucho cada P segundos de conversación con texto nuevo, para ideas o comentarios.

Un `consider` que llega mientras otro está en curso sustituye al pendiente. Esto limita el coste aunque la conversación sea larga.

### Qué decide Hermes (prompt del agente de conversación)

Devuelve exactamente un `output` por `consider`, normalmente `kind:"nada"`:

1. **respuesta:** hay una pregunta factual sin contestar en el diálogo. Busca información actual si hace falta (sin fechas fijadas en el prompt) y responde en una o dos líneas. Si un participante ya contestó correctamente, calla.
2. **idea:** solo si aporta un dato, aclaración o corrección útil que nadie ha dicho. Nunca resume ni repite.
3. **comentario:** humor espontáneo, irónico o algo sarcástico, privado para el usuario (p. ej. «menud@ pesad@», «habla sin parar» ante un monólogo largo del otro). Es una preferencia de estilo, no algo obligatorio: raro y solo cuando el contexto lo pide claramente. Nunca sobre rasgos sensibles de las personas.
4. **nada:** texto incomprensible, contexto insuficiente, charla sin necesidad de ayuda. Los fragmentos ininteligibles se ignoran en silencio: ni avisos, ni texto inventado, ni interrupciones.

El prompt indica que el texto es una transcripción automática con errores y atribución incierta, y que lo oído no autoriza acciones.

### Límites ajustables (valores iniciales sin validar)

- Separación mínima entre salidas visibles: p. ej. 20 s. Máximo de salidas por minuto: p. ej. 2. «Comentarios» con presupuesto propio más bajo (p. ej. 1 cada 3 min).
- Niveles de salida: silencio, solo respuestas, respuestas + ideas, + humor. Se cambian desde el menú de la app de lentes y en el móvil.
- Deduplicación: el móvil descarta una salida casi idéntica a otra mostrada en el episodio (normalización simple). El puente incluye en el contexto las salidas ya mostradas para que Hermes no las repita.
- Los proactivos de `mcp-server.ts` (6/min) siguen aplicándose a llamadas de herramientas. Esta ruta no las usa para mostrar.

### Presentación en las lentes

- La salida de Hermes es una **tarjeta** breve (≤2-3 líneas) con un marcador de tipo (respuesta / idea / comentario) y caduca sola (`ttlMs`, p. ej. 8-12 s). La transcripción completa no es obligatoria: la vista por defecto de un episodio Activo muestra estado + última tarjeta, y la transcripción queda como vista secundaria (rueda).
- Con la pantalla apagada, una tarjeta solo enciende las lentes si el usuario activó «despertar para respuestas». Si no, queda en la vista de la app para el próximo vistazo, hasta su caducidad.
- Sin salida hablada automática por defecto.

## 6. Camino corto y siguiente incremento

| Inc. | Contenido | Verificable con texto/datos sintéticos | Necesita observación física |
| --- | --- | --- | --- |
| **C1** | Diagnóstico por fases + selector RAM de idioma ASR `auto/es` | Contadores, diferencias por fase, mapeo `lang`, pruebas Node | Un ensayo con material artificial (altavoz 1 m / 2 m) y una fase con persona real solo con agregados |
| C2 | `ConversationEpisodeTracker` (Candidata/Activa/fin) dentro de la sesión manual + alternancia que no se reinicia por «insuficiente» (Kotlin compartido, AAR) | Secuencias de etiquetas/tiempos en Node y Kotlin | Que una conversación real se active y una voz sola o una TV no |
| C3 | Canal `conv` en el puente: segundo agente aislado, herramientas de solo lectura, retención verificada. Cliente `conv` en el móvil, Hermes OFF por defecto | Servidor de pruebas aislado (como `test_bridge.py`) con episodios de texto sintético: preguntas, silencios, órdenes que no deben ejecutarse, caducidad, OFF | Latencia real BLE→lente |
| C4 | Política de §5 y tarjeta en lentes | Salidas simuladas: frecuencia, duplicados, caducidad, silencio | Legibilidad en lentes |
| C5 | Escucha de fondo con presupuesto, sin pantalla encendida | Lógica de presupuesto | Captura con pantalla apagada, batería/temperatura (G5) |
| C6 | Recuperar valenciano | — | Material valenciano |

### C1 recomendado: captación del interlocutor medible

**Por qué primero:** sin texto fiable del interlocutor no hay detección útil ni contexto para Hermes, y el único dato disponible no se puede atribuir. C1 no cambia umbrales, modelos ni el comportamiento por defecto.

**Cambios:**

- `app/conversation-detection/local-vad.ts`: añadir a `LocalVadSnapshot` `candidateOnlyMs` (tramas en `candidato` que no abrieron episodio) y `levelBins` (histograma de RMS de tramas positivas en 5 franjas de dBFS). Solo escalares.
- `app/conversation-detection/phase-diagnostics.ts` (nuevo): `markPhase("interlocutor"|"propia"|"fin")` guarda una copia de los contadores agregados del coordinador y calcula diferencias por fase. RAM, sin texto. Disponible solo con la sesión ON iniciada por el usuario.
- `app/conversation-detection/transcription.ts` y `app/native/local-transcription.ts`: `deliveredChars` agregado (número, no texto) y `start(language: "auto"|"es")`.
- `App_Resources/.../FaceclawLocalTranscriber.kt`: aceptar el idioma (`""` o `"es"`) y, con `"es"`, devolver `lang="es"` si el motor lo deja vacío. Sin cambios en el AAR.
- `session-controls.ts` + `main-view-model.ts` + vista principal: selector RAM «Idioma del texto: automático / castellano» (por defecto **automático**, comportamiento actual), botones de fase visibles solo en modo ensayo y tabla de «Métricas tras OFF» por fase. No se consulta la UI durante ON. El usuario marca las fases.

**Aceptación de software:** TypeScript, lint, pruebas Node nuevas (contadores VAD con tramas sintéticas, diferencias por fase, selector que solo cambia en OFF, ningún texto en las métricas) y las 71 existentes de lentes/móvil/UI/coordinador/iOS. Build y `lintVitalRelease` con nativas idénticas salvo el módulo de la app. Instalación con el procedimiento habitual y los 33 ajustes comparados.

**Aceptación del ensayo (separado, a autorizar):** con el mismo guion artificial, por fase y para `auto` y `es`: palabras recuperadas del guion, `candidateOnlyMs`, `levelBins`, `shortSegments`, rechazos y caracteres inventados en un tramo de silencio o ruido. Criterio fijado antes de medir: adoptar `es` por defecto si recupera más palabras del interlocutor sin texto inventado en el tramo sin voz. Si la voz ajena queda en `candidato` o bajo la franja útil, el problema es de señal/VAD y el siguiente paso sería C1b (umbrales) con esos datos, no un cambio de idioma.

**Reversión:** el selector por defecto conserva el comportamiento actual. Revertir el commit o reinstalar la APK G3.4.2 respaldada (`before-update` del siguiente incremento) con `adb install -r`.

## 7. Decisiones del usuario que faltan

1. **Envío de lo que dicen otras personas a un modelo externo.** Hermes usa hoy `gpt-6-luna` vía `openai-codex` (README del puente). C3 mandaría texto de interlocutores, que no han dado su consentimiento, a ese proveedor. Hay que decidir si es aceptable, si se exige un modelo local (pila Hermes/llama.cpp del usuario) para este modo, o si se avisa a los presentes. Esta decisión no bloquea C1/C2.
2. **Despertar las lentes para una respuesta** con la pantalla apagada: por defecto no.

Supuestos rutinarios ya tomados: valores iniciales de frecuencia y caducidad de §5 sin validar, humor desactivado hasta que el usuario elija el nivel, controles en RAM hasta estabilizar.

## 8. Conservación

Sin implementación, build, instalación, ensayo, consulta al móvil, cambio de modelos/umbrales ni conexión a Hermes en este encargo. Perfil propio intacto (sin leer, exportar ni copiar). Firma, 33 ajustes, Hermes habitual, bloqueo y GPS sin tocar. Firmware /36 y Wear sin tocar. Incidentes 492 ms/siete descartes y UI 1046 ms/21 drops, precisión, participación y autonomía siguen abiertos. G3.4.2 sigue pendiente de revisión completa por Codex (informe `notes/informe-claude-g3.4.2-2026-10-04.md`).
