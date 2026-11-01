# Diseño Claude: conversación proactiva con Hermes, 04-10-2026

Encargo `notes/prompt-claude-conversacion-proactiva-hermes-2026-10-04.md`. Rama `codex/conversation-detection-g0`, base `826449c`. Solo diseño: sin implementación, build, instalación, ensayo, cambios de modelo/umbral ni conexión real. **Pendiente de revisión Codex antes de implementar.**

**Corrección 04-10-2026** (encargo `notes/prompt-claude-correccion-diseno-c1-2026-10-04.md`, revisión `notes/revision-codex-diseno-conversacion-proactiva-2026-10-04.md`): dirección aceptada por Codex, contratos corregidos **pendientes de revisión Codex**. §1-§8 se conservan como historial. Donde contradicen a §9-§13, prevalecen §9-§13. Resolución por hallazgo en §9, contratos posteriores en §10, comparación con Merge en §11, especificación final C1 en §12 y ensayo posterior en §13. C1 no está implementado.

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
| VAD | `LocalEnergyVad`: inicio con RMS ≥ max(0,003, 3× ruido) durante 150 ms y mantenimiento con 1,8× / 0,002 | **Corregido:** una señal sostenida bajo el umbral nunca es positiva ni llega a `candidato` (`candidato` ya supera el umbral, solo le faltan 150 ms seguidos). Un candidato abortado no prueba voz débil. Si alguien responde justo tras el usuario, el umbral de mantenimiento (1,8× / 0,002) puede incluirlo en el episodio abierto |
| Segmentación | `LocalTranscriptBuffer`: abre en `posible voz` con 200 ms previos, cierra tras `sin actividad` (600 ms), mínimo 0,3 s con voz y máximo 8 s | Respuestas cortas («sí», «vale») → `shortSegments`. Turnos rápidos (<600 ms) se funden con los del usuario en un segmento |
| Trabajador | **Corregido:** `LocalTranscriptSession` admite un único trabajo pendiente **o** activo en total (`busy`). El callback del buffer descarta cualquier segmento completado mientras `busy` | Segmentos descartados al cerrarse durante otra inferencia (`dropped`) o invalidados por época/OFF (`invalidatedDecodes`). No hay cola ni sustitución de pendientes |
| ASR | Whisper base int8, idioma automático (`FaceclawLocalTranscriber.kt`, idioma `""`) | Voz lejana identificada como otro idioma (`rejectedLanguage`) o mal transcrita |
| Filtros | `localTextRejection`: solo es/ca, no vacío, ≤600 caracteres, sin `[`, `(` o `<|` al inicio | Rechazo por idioma o estructura |
| Entrega | `LocalTranscription` guarda las 3 últimas líneas. La lente muestra el final | Una línea ajena corta queda desplazada por las del usuario antes de leerse. Es una pérdida de **presentación**, no de reconocimiento |

El ensayo G3.4.2 solo permite afirmar que la captura fue continua, que el VAD acumuló 29,84 s y que hubo 4 rechazos por idioma. No atribuye nada a un hablante ni descarta pérdidas en VAD o segmentación.

### Diagnóstico mínimo [P] (sin grabar ni leer conversación privada)

> **Superado por §12.** Restar snapshots al pulsar contamina las fases y el histograma de tramas positivas excluye la señal bajo umbral. Se conserva como historial.

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

> **Superado por §12 (especificación final C1) y §13 (ensayo).** Esta versión inicial se conserva como historial: su histograma solo positivo, la resta de snapshots y la promesa «sin cambios en el AAR» quedan retiradas.

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

1. *(Reformulado en §10.4: queda como configuración pendiente de C3 de habilitación, envío y retención. No bloquea C1/C2 y el diseño no afirma conocer el consentimiento de otras personas.)* **Envío de lo que dicen otras personas a un modelo externo.** Hermes usa hoy `gpt-6-luna` vía `openai-codex` (README del puente). C3 mandaría texto de interlocutores a ese proveedor, y el sistema no conoce su consentimiento. Opciones a configurar en C3: proveedor externo, modelo local (pila Hermes/llama.cpp del usuario) o aviso a los presentes. Esta decisión no bloquea C1/C2.
2. **Despertar las lentes para una respuesta** con la pantalla apagada: por defecto no.

Supuestos rutinarios ya tomados: valores iniciales de frecuencia y caducidad de §5 sin validar, humor desactivado hasta que el usuario elija el nivel, controles en RAM hasta estabilizar.

## 8. Conservación

Sin implementación, build, instalación, ensayo, consulta al móvil, cambio de modelos/umbrales ni conexión a Hermes en este encargo. Perfil propio intacto (sin leer, exportar ni copiar). Firma, 33 ajustes, Hermes habitual, bloqueo y GPS sin tocar. Firmware /36 y Wear sin tocar. Incidentes 492 ms/siete descartes y UI 1046 ms/21 drops, precisión, participación y autonomía siguen abiertos. G3.4.2 sigue pendiente de revisión completa por Codex (informe `notes/informe-claude-g3.4.2-2026-10-04.md`).

---

# Corrección de contratos, 04-10-2026

Base: `22d63d0` sobre el diseño `5bffdf4`, árbol limpio al empezar. Fuentes releídas: `local-vad.ts` (`LocalEnergyVad.accept`), `coordinator.ts` (`setEnabled`, `acceptNativePcm`, `release`, `resetAcousticStream`), `LocalTranscriptSession.kt` (`LocalTranscriptBuffer`, `LocalTranscriptSession`), `LocalParticipationSession.kt` (`LocalParticipationTurns`), `FaceclawLocalTranscriber.kt`, `AndroidSpeechEngines.recognizerConfig`, `local-transcription.ts`, `session-controls.ts`, `voice-control.ts` (`onExperimentalPcm`), `main-view-model.ts` (`onConversationDetectorMetricsTap`). Sin build, pruebas, dispositivo ni servicios.

## 9. Resolución de hallazgos

| # | Hallazgo Codex | Resolución | Dónde |
| --- | --- | --- | --- |
| 1 | El histograma solo positivo excluye la señal bajo umbral. `candidato` ya supera el umbral | Histograma de **todas** las tramas válidas por fase, en dB relativos al umbral de inicio y en dBFS, más tramas saturadas, estado VAD por trama y duración de entrada. Fase de referencia sin habla. `candidateOnlyMs` cuenta solo candidatos abortados. Sin habla indicada se habla de «actividad acústica», nunca de voz o hablante | §12.2 |
| 2 | Restar snapshots al pulsar contamina las fases | **Atribución en origen**: cada trama/chunk lleva la fase vigente al llegar. Los segmentos ASR guardan sus muestras por fase y los resultados heredan la fase del segmento. Exige cambiar `LocalTranscriptBuffer`/`LocalTranscriptSession` (Kotlin compartido, **AAR**). Se descarta el drenaje con frontera explícita | §12.3 |
| 3 | Faltan pruebas que fallen con atribución incorrecta | Diez pruebas con entrada y resultado esperados, incluida una señal bajo umbral | §12.6 |
| 4 | `auto/es` | Selector RAM solo en OFF, congelado durante la sesión, por defecto `auto`. En `es` el idioma se informa como **forzado**, nunca como detectado ni como confianza | §12.4 |
| 5 | Ensayo con altavoz insuficiente y criterios poco honestos | Control artificial de idioma + comprobación humana mínima separada, criterios fijados antes, resultado inconcluso posible, sin deducir «bajar umbral» | §13 |
| — | Descripción del trabajador ASR | Corregida en §3: un único trabajo pendiente o activo en total, sin cola ni sustitución | §3 |
| — | Texto y etiquetas de voz sin origen común | Unión por época + rango de chunks, `desconocida` por defecto | §10.1 |
| — | `setEnabled(true)` no reconfigura una sesión ON | API de motores por época con drenaje, contexto inicial declarado | §10.2 |
| — | Ignorar toda incertidumbre no está aprobado | Reglas de continuidad y de ruptura con casos negativos | §10.3 |
| — | Aislamiento efectivo de Hermes | Allowlist en ejecución, capacidad negociada, cancelación selectiva, idempotencia. Habilitación/envío/retención pendientes de C3 | §10.4 |

### Por qué atribución en origen y no frontera con drenaje

La frontera explícita exigiría, al marcar: cerrar el segmento abierto, dejar de pasar PCM al ASR hasta que `busy=false` y esperar a que el `post` de entrega se ejecute en el hilo principal. Tres problemas concretos:

- **Audio excluido sesgado.** El tramo excluido durante el drenaje (hasta ~1,1 s de inferencia) cae justo al principio de la fase nueva, donde suele empezar la respuesta del interlocutor.
- **Carrera en el hilo principal.** `runWorker` encola `publish()` antes de poner `busy=false`, pero un tick de 500 ms que ya se esté ejecutando puede ver `busy=false` antes de que corra el `post`. Haría falta otro tick o un contador de entregas pendientes.
- **Cerrar el segmento con `resetStream()` invalida la inferencia en curso** (`generation++`) y pierde precisamente el último segmento de la fase anterior.

La atribución en origen no altera la segmentación, no excluye audio ni espera. El coste es tocar Kotlin compartido y regenerar el AAR. Las bibliotecas nativas (`.so`, sherpa-onnx) no cambian: condición verificable por hash en el build.

## 10. Contratos del camino posterior (sin desarrollar)

### 10.1 Unión de texto y etiqueta de voz (C2/C3)

Hoy los dos workers son independientes [E]: cada sesión tiene su `LocalTranscriptBuffer`, sus `dropped`, su estado `ready` y sus resets. Participación exige ≥1 s con voz para comparar (`next.voiced >= 16000`) y ASR solo 0,3 s. `onText` entrega texto e idioma, sin intervalo. Las dos segmentaciones pueden divergir aunque reciban los mismos chunks.

Contrato [P]:

- **Origen común:** el coordinador numera cada chunk aceptado con `chunkSeq` (monótono dentro de una época, 50 ms por chunk) y lo pasa a ambos motores junto con `epoch`. Cada buffer guarda en el segmento `{epoch, firstSeq, lastSeq, segmentId}`.
- **Resultados con origen:** ASR entrega `{epoch, segmentId, firstSeq, lastSeq, text}`. Participación entrega por segmento `{epoch, firstSeq, lastSeq, label: propia|otra|abstencion}`, no solo el último snapshot.
- **Unión:** misma `epoch` y solapamiento de intervalos ≥ 80 % de la duración de cada uno. Si el texto solapa comparaciones con etiquetas distintas → `desconocida` (mezcla). Si no hay comparación (descartada por `busy`, segmento <1 s con voz, abstención, reset) → `desconocida`.
- **Caducidad:** un resultado espera a su pareja como mucho 10 s [H] o hasta cambio de época. Después sale como `desconocida`. Un texto nunca toma la etiqueta del último snapshot de voz.
- **Uso sin unión:** la detección de episodio funciona con eventos acústicos y comparaciones (sin texto). Hermes puede recibir texto `desconocida`. La etiqueta llega a Hermes como dato incierto, nunca como identidad.
- **Coste declarado:** cambio en Kotlin compartido (listener con intervalo, eventos por segmento en participación) y AAR. Pruebas Kotlin con segmentaciones divergentes, drop en un solo worker y resultado tardío tras cambio de época.

### 10.2 Motores dentro de una sesión ON (C2/C5)

`setEnabled(true, ...)` vuelve si ya está ON y `transcribing` se fija al inicio [E]. API propuesta en `ConversationCaptureCoordinator`:

| Llamada | Efecto | Estados del motor |
| --- | --- | --- |
| `setEngines({transcribe, language})` | Solo con `enabled`. No toca la concesión, el VAD ni la época de captura | `inactivo → cargando → listo → drenando → inactivo` |
| Activar ASR | `transcription.start(language, deadlineMs = remainingMs)`. PCM no se pasa hasta `listo`. Los chunks en carga se cuentan (`loadingAudioMs`) | Si `worker` sigue vivo de un stop anterior, `start()` devuelve false → estado `drenando`, reintento en el siguiente tick, sin bloquear |
| Desactivar ASR | `transcription.stop()`: no bloquea, invalida la inferencia en curso (`generation++`), borra buffer y resultado pendiente | `drenando` hasta `worker=false` |
| OFF/expiración/suspensión | Igual que hoy, más `stop()` de todos los motores. Idempotente | — |

- **Límite:** el deadline del motor no puede superar el de la sesión (hoy cada `start()` fija 120 s propios). Se pasa `remainingMs`. El tope de 120 s no se amplía.
- **Buffers:** sin cambios: ≤8 s de segmento + 200 ms previos + un trabajo (`activeInputBytes`).
- **Contexto inicial perdido:** al confirmar una conversación candidata, los turnos que la formaron (≥3 segmentos, típicamente 5-20 s [H]) **no** se transcribieron, y la carga del modelo (verificación SHA-256 + creación del reconocedor, coste sin medir [H]) añade más. Una pregunta temprana se pierde. No se promete recuperarla ni se fecha el inicio del diálogo en el instante de confirmación.
- **Propuesta mínima:** en C2 (sesión manual) el ASR sigue activo toda la sesión, como hoy, y no hay pérdida nueva. En C5 primero se mide la pérdida con el modelo cargado en reposo. Solo si las preguntas tempranas se pierden en la práctica, se añade un anillo PCM de ≤8 s (256 KB PCM16) que se reenvía al pasar a Candidata y se borra en cada cierre de segmento sin candidata, reset, OFF y caducidad. Coste: retención de audio en RAM, a declarar en privacidad.

### 10.3 Incertidumbre y continuidad (C2)

Sustituir `reset()` por «ignorar todo» no queda aprobado. Reglas [P]:

| Evento | Efecto en la evidencia |
| --- | --- |
| Comparación en zona intermedia (0,60-0,80) o nula | No cuenta como turno ni como transición. **No** reinicia si es aislada |
| ≥3 abstenciones seguidas, o >10 s [H] sin comparación válida | Reinicia la evidencia |
| Hueco entre turnos etiquetados >20 s (valor actual) | Caduca la evidencia |
| Cambio de época, hueco PCM >250 ms (`resetAcousticStream`), cesión a Hey Even/PTT, OFF, expiración | Rompe la evidencia siempre |
| Texto unido a varias etiquetas (mezcla) | Abstención |
| Error de embedding | Reinicia (como hoy) |

- `otra` = «no coincide con el perfil». Reproducción, TV o voz ajena no se presentan como persona verificada.
- Antes de cualquier autoactivación, pruebas negativas: solo `otra` (TV) nunca activa; solo `propia` nunca; `propia, intermedia, propia` no es transición; alternancia con hueco de 25 s caduca; reset entre turnos rompe; tres abstenciones rompen; resultado tardío de época anterior no suma.

### 10.4 Hermes (C3)

- **Canal aislado `conv`**, historia propia por episodio, sin compartir `turnId`, historial ni cerrojo con `chat`.
- **Capacidad negociada:** el puente anuncia `conv/1` en el saludo. El móvil no envía nada por `conv` si no está anunciada o si «Hermes en conversación» está OFF.
- **Allowlist en ejecución:** el dispatch del agente `conv` rechaza en tiempo de ejecución cualquier herramienta fuera de la lista (búsqueda/información actual y, si hace falta, ubicación de solo lectura). No basta `enabled_toolsets` ni el prompt. Prueba: un agente falso que intenta memoria/terminal/teléfono queda bloqueado y solo se cuenta el intento.
- **Prioridad y cancelación selectiva:** un turno `chat` cancela la evaluación `conv` en curso, nunca al revés. `cancel {episodeId}` solo afecta a ese episodio.
- **Idempotencia:** `episode-end` repetido no falla. La desconexión borra todos los episodios del teléfono. Un resultado tardío con episodio o época vieja se descarta.
- **Pendiente para C3, sin decidir ahora:** habilitación, envío y retención. La retención del Hermes instalado en Jarvis está por verificar. Un proveedor externo sigue siendo externo aunque el puente esté en Jarvis. El diseño no afirma conocer el consentimiento de otras personas y no exige esta decisión para C1/C2.

## 11. Referencia Mentra Merge (Merge-Legacy)

Fuente: lectura de Codex de `Mentra-Community/Merge-Legacy`, commit `935cf3eebe2e3df78611649d444364079bb6e062` (repositorio archivado). Referencia de una versión anterior, no prueba del Merge distribuido hoy. No se adopta MentraOS ni su stack.

| Pieza Merge | Patrón útil | Adaptación a Faceclaw/Hermes | Fuera de su alcance |
| --- | --- | --- | --- |
| `User.ts`: procesa al `isFinal` o 2 s después de la **primera actualización** de la intervención (no 2 s de silencio) | Disparar evaluación por final de frase o por tiempo acotado desde su inicio | Nuestro ASR solo produce finales por segmento, así que el disparo es el `consider` de §5 (pregunta, pausa, periódica). No hay perfil ni alternancia antes de procesar texto en esa capa | Detección de participación propia + otra voz |
| `initial-agent.ts`: decide `insight/silent/route`, frecuencia, preguntas explícitas y curiosidad indirecta, evita repetir, deriva a especialistas | Salida tipada con «silencio» como opción normal y prioridad a preguntas | Coincide con `output.kind` (`respuesta/idea/comentario/nada`) en **un solo** agente `conv` de Hermes. Las preguntas explícitas suben de prioridad dentro de la cola de `consider`, pero **sin** saltarse la separación mínima ni el máximo por minuto ni el presupuesto de coste. Nada de bypass de frecuencia | Captación local del interlocutor |
| `response-handler.ts`: contexto de texto reciente y ayudas previas, deduplicación, bloqueo temporal de pantalla | Contexto con salidas ya mostradas y deduplicación por similitud | Ya previsto en §5. Su similitud 0,7 y tarjeta 10 s (`config.ts`) son valores de esa implementación, no calibración. Los nuestros se fijan midiendo | — |

No se copian sus logs de transcripción o contexto, su conservación de historial ni sus callbacks tardíos: rigen nuestros contratos de privacidad, época y cancelación. Merge consume texto ya producido por MentraOS y no aporta solución a la captación del interlocutor ni a la detección fiable de participación. Su STT no equivale a nuestro Whisper local. Si algún día se reutiliza código literal, verificar antes licencia y avisos del archivo y de sus dependencias. Este estudio no bloquea C1.

## 12. Especificación final C1 [P]

### 12.1 Alcance

C1 añade diagnóstico acústico y ASR **atribuido por fase** y un selector RAM de idioma `auto/es`. No cambia umbrales, modelos, segmentación, tope de 120 s, prioridad del asistente ni comportamiento por defecto (`auto`, modo diagnóstico desactivado). No guarda texto ni audio. No envía nada a Hermes.

**Fases** (índice fijo): `0 sin-marcar` (desde ON hasta la primera marca), `1 otra-persona`, `2 yo`, `3 referencia` (nadie habla, solo ambiente), `4 fin` (tras «Fin» hasta OFF). Solo el ASR usa además `5 mixta` para segmentos que abarcan más de una fase. Las marcas solo existen con la sesión ON iniciada por el usuario y el modo diagnóstico activado. Se pueden repetir en cualquier orden: los contadores se acumulan por etiqueta. Máximo 32 marcas por sesión (las siguientes se ignoran y se cuentan).

La fase dice lo que **el usuario indicó**, no lo que el sistema reconoce. Las métricas describen actividad acústica de esa fase. Fuera de una fase con habla indicada no se habla de voz ni de hablante.

### 12.2 Acústica por fase (TypeScript, síncrona)

`LocalEnergyVad.accept()` emite cada trama de 10 ms a un receptor opcional `frameSink({rms, onsetThreshold, clipped, state, event})` con `event ∈ {null, "open", "abort"}`. `onsetThreshold = max(0,003, 3 × noiseFloor)` calculado en esa trama con la fórmula **de inicio** aunque el episodio esté activo, para que las franjas sean comparables. El VAD no cambia su decisión.

`PhaseDiagnostics` (nuevo, `app/conversation-detection/phase-diagnostics.ts`) acumula, por fase:

| Campo | Definición |
| --- | --- |
| `wallMs` | Tiempo de reloj (`host.now()`) entre la marca y la siguiente marca u OFF |
| `inputMs`, `chunks` | Tramas válidas × 10 ms y chunks de 1600 B aceptados en la época vigente. `wallMs − inputMs` = audio no llegado o en suspensión |
| `gapResets`, `preemptions` | `resetAcousticStream` por hueco >250 ms y cesiones durante la fase |
| `stateMs` | ms por estado VAD de la trama: `sinActividad`, `candidato`, `posibleVoz`, `pausa` |
| `relBins[7]` | Tramas no saturadas por `20·log10(rms / onsetThreshold)`: `<−12`, `−12…−6`, `−6…−3`, `−3…0`, `0…+6`, `+6…+12`, `≥+12` dB. `rms=0` va a la primera franja. Todo lo que está bajo 0 dB es **actividad acústica bajo umbral**, nunca «voz perdida» |
| `absBins[6]` | Mismas tramas en dBFS: `<−60`, `−60…−50`, `−50…−40`, `−40…−30`, `−30…−20`, `≥−20` |
| `clippedFrames` | Tramas con ≥2 muestras de valor absoluto ≥ 32760 (el VAD ya las trata como negativas). Excluidas de las franjas |
| `positiveMs`, `episodesOpened` | Tramas sobre el umbral vigente y episodios abiertos en la fase |
| `candidateOnlyMs`, `candidateAborts` | Solo candidatos que **abortan** (vuelven a `sin actividad` antes de 150 ms). Cada trama de candidato suma a la fase en que llegó. Un candidato que abre episodio no suma nada |
| `candidateInterruptedMs` | Candidato cortado por reset de flujo, OFF o expiración. No cuenta como abortado |

La **línea base** es la fase `referencia`: su distribución `relBins`/`absBins` describe el ambiente sin habla indicada. Las fases con habla se leen contra ella.

Coste: un `log10` y dos incrementos por trama (100 tramas/s). Memoria: unas 25 cifras por fase.

### 12.3 ASR por fase (Kotlin compartido + AAR)

Cambios en `native/kotlin/shared/.../LocalTranscriptSession.kt`:

- `LocalTranscriptSession.setPhase(phase: Int)` bajo `condition`. El coordinador la llama en el mismo hilo y antes del siguiente chunk, así que la frontera es exacta a nivel de chunk (50 ms). Sin espera ni drenaje.
- `LocalTranscriptBuffer.accept(pcm, state, phase = 0)`: guarda muestras por fase del segmento, **incluidos los 200 ms previos** (el anillo previo son exactamente 4 chunks alineados, basta un array de 4 fases). Segmento de una sola fase → esa fase. Si no → `mixta`, con `mixedAudioMsByPhase[5]`. `LocalParticipationSession` usa el valor por defecto y no cambia.
- Atribución por **segmento**: `silenceClosures`, `limitClosures`, `shortSegments`, `submittedAudioMs`, `interruptedSegments/AudioMs` (en reset) y `dropped` (descartado por `busy`).
- `Job` y `Result` llevan la fase del segmento. Por **trabajo**: `decodeCalls`, `decodedAudioMs`, `decodeTotalMs`, `decodeMaxMs`, `languageEs/Ca/Other/Forced`, `forcedMismatch`, `rejected*`, `decodeErrors`, `processingErrors`, `invalidatedDecodes`, `accepted`, `abstentions`.
- Por **entrega** (en `publish`, con la fase del `Result`): `delivered`, `deliveredChars` (longitud del texto aceptado, nunca el texto) y `deliveryDiscarded` (resultado aceptado que nunca se entrega). Como `resetStream()`/`stop()` ponen `result = null` antes de que corra el `post`, el descarte se cuenta donde ocurre: al anular un `Result` pendiente en `resetStream()`/`stop()`, al sobrescribirlo, o en `publish` si el `post` encuentra el resultado pero la sesión ya no es válida.
- **Ranura única de resultado [E]:** `result` guarda un solo `Result`. Si el hilo principal tarda más que la siguiente inferencia, el worker sobrescribe el resultado aún no entregado y el primer `post` entrega el segundo. C1 no cambia ese comportamiento, pero lo cuenta: al sobrescribir un `Result` pendiente se suma `deliveryDiscarded` a la fase del sobrescrito. El texto entregado conserva la fase de su propio `Result`.
- Por **llegada**: `pcmAudioMs`, `loadingAudioMs` con la fase vigente.
- `diagnostics()` añade `"phases":[…]` con 6 objetos de escalares, sin texto. Los totales actuales se conservan para compatibilidad.

**Fronteras y estados.** La atribución no depende del momento de lectura:

| Caso | Tratamiento |
| --- | --- |
| Buffer parcialmente lleno al marcar | El segmento continúa. Al cerrarse queda en una fase o en `mixta` |
| Carga del modelo | Chunks a `loadingAudioMs` de su fase. No entran al buffer (como hoy) |
| JNI activo al marcar | El resultado cuenta en la fase del trabajo |
| Resultado/callback pendiente | `delivered` o `deliveryDiscarded` en la fase del resultado |
| Descarte por `busy` | `dropped` en la fase del segmento descartado |
| Hueco/cesión/cambio de época | `resetStream()` como hoy: segmento abierto a `interrupted*` de su fase, inferencia en curso a `invalidatedDecodes` de la fase del trabajo |
| OFF/expiración | `stop()` como hoy. La inferencia en vuelo acaba y suma `invalidatedDecodes` a su fase. No se publica texto (`publish` exige `running`) |

**Agregados tras OFF.** `stop()` y `resetStream()` no borran los contadores, solo `start()`. Los agregados son **finales** cuando `worker=false` y `busy=false`. Antes, «Métricas tras OFF» muestra «drenando» y no da cifras por buenas. El listener de `LocalTranscription` ya ignora texto con `enabled=false` y borra las líneas en `stop()`. `PhaseDiagnostics` se borra solo en el siguiente ON.

**Coste declarado.** Cambio de Kotlin compartido y regeneración del AAR. Las siete bibliotecas nativas no cambian: condición verificable por hash. Memoria: 6 × ~25 contadores `Long`.

### 12.4 Selector de idioma `auto/es`

- `session-controls.ts`: `conversationTextLanguage(): "auto" | "es"` y `setConversationTextLanguage(v)`, no-op con sesión ON. Por defecto `auto`. Solo RAM, no entra en los 33 ajustes.
- `conversationStartPlan` incluye `language`. `ConversationCaptureCoordinator.setEnabled(true, transcribe, mode, language)` lo congela para la sesión y lo expone como `transcription.languageMode`.
- `DetectorTranscription.start(language)` → `FaceclawLocalTranscriber.start(language)` guarda el idioma antes de `session.start()`. `loadDecoder()` llama a `recognizerConfig(dir, WHISPER, if (language == "es") "es" else "")`. El reconocedor se crea por worker y `start()` se rechaza mientras quede un worker, así que no puede cambiar a mitad de sesión.
- **Mapeo:** en modo `es`, el decodificador devuelve `LocalDecodedText(text, lang, forced = true)` con `lang = "es"` si el motor da `""` o `"es"`, y el valor del motor en cualquier otro caso (rechazo `LANGUAGE` como hoy, más `forcedMismatch`). `LocalDecodedText` gana `forced: Boolean = false` (Kotlin compartido). Con `forced` se cuenta `languageForced`, no `languageEs`. La UI dice «castellano (forzado)», nunca «detectado», y no muestra confianza (el runtime no la ofrece).
- **Condición verificable:** el valor real de `result.lang` con idioma forzado no se conoce. Las pruebas de software cubren `""`, `"es"` y `"en"`. El dispositivo lo confirma en el ensayo.
- Sin reintento, sin cambios de modelo ni umbral.

### 12.5 Archivos y símbolos

| Archivo | Cambio |
| --- | --- |
| `app/conversation-detection/local-vad.ts` | `frameSink`, `onsetThreshold`, eventos `open/abort`. Decisión intacta |
| `app/conversation-detection/phase-diagnostics.ts` (nuevo) | `PhaseDiagnostics`, `DiagnosticPhase`, `markPhase`, `snapshot` |
| `app/conversation-detection/coordinator.ts` | `markPhase()`, `language`, `phases` en `DetectorSnapshot`, reset solo en ON |
| `app/conversation-detection/transcription.ts` | `start(language)`, `setPhase?`, tipos `phases`, `languageMode` |
| `app/native/local-transcription.ts` | Paso de idioma y fase |
| `app/conversation-detection/session-controls.ts`, `conversation-ui.ts` | Selector y plan |
| `app/phone-ui/main-view-model.ts` + vista principal | Selector, modo diagnóstico, botones de fase, tabla por fase tras OFF |
| `native/kotlin/shared/.../LocalTranscriptSession.kt` | §12.3 y `LocalDecodedText.forced` |
| `App_Resources/.../FaceclawLocalTranscriber.kt` | `start(language)`, `setPhase`, mapeo |
| `tests/conversation-detection.test.cjs`, `tests/kotlin/.../LocalTranscriptSessionTest.kt` | §12.6 |

### 12.6 Pruebas mínimas (a escribir en la implementación, no ahora)

Kotlin con decodificador falso bloqueable y `CallbackDispatcher` manual. Node con PCM sintético. Cada prueba falla si la atribución se hace por resta de snapshots o con la fase vigente al leer.

| # | Entrada | Resultado esperado |
| --- | --- | --- |
| K1 Inferencia cruza la frontera | Fase 1: 0,5 s `posible voz` + 600 ms `sin actividad` → trabajo enviado, decodificador bloqueado. `setPhase(2)`. Se libera con `("hola", "es")` y se ejecuta el dispatcher | `phases[1]`: `decodeCalls=1`, `accepted=1`, `delivered=1`, `deliveredChars=4`. `phases[2]`: todo 0 |
| K2 Callback demorado | Fase 1, decodificador inmediato con `("hola","es")`, dispatcher retenido. `setPhase(2)`. Segundo segmento en fase 2, decodificado con `("adiós","es")` antes de ejecutar el dispatcher. Se ejecuta | Fase 1: `accepted=1`, `delivered=0`, `deliveryDiscarded=1` (resultado sobrescrito). Fase 2: `accepted=1`, `delivered=1`, `deliveredChars=5`. Variante con decodificador bloqueado en el segundo: el primero entrega en fase 1 y nada se cuenta en fase 2 hasta liberar |
| K3 Segmento abierto al marcar | Fase 1: 200 ms `sin actividad` y 0,4 s `posible voz`. `setPhase(2)`: 0,4 s `posible voz` + 600 ms silencio | Un segmento en `mixta`: `submittedAudioMs` en `phases[5]`, 0 en 1 y 2. `mixedAudioMsByPhase[1] ≈ 600` (200 previos + 400), `[2] ≈ 1000`. Su resultado cuenta en `mixta` |
| K4 OFF durante el drenaje | Fase 1, decodificador bloqueado. `stop()`. Se libera | `invalidatedDecodes=1` en fase 1, `delivered=0`, listener no llamado. `diagnostics()` tras `worker=false` conserva `decodeCalls=1` en fase 1. Un `start()` posterior lo pone a 0 |
| K5 Reset con entrega pendiente | Resultado aceptado y `post` encolado. `resetStream()`. Se ejecuta el dispatcher | `accepted=1`, `deliveryDiscarded=1`, `delivered=0` en fase 1, sin texto entregado |
| K6 Idioma forzado | Decodificador `forced=true` devuelve `""`, `"es"` y `"en"` | `languageForced=2`, `languageEs=0`, `forcedMismatch=1`, `rejectedLanguage=1` |
| N1 Señal bajo umbral | 2 s de seno con `rms = 0,6 × onsetThreshold` en fase 1, tras 1 s de silencio para fijar el suelo | `positiveMs=0`, `episodesOpened=0`, `candidateOnlyMs=0`, las 200 tramas en franjas bajo 0 dB (`−6…−3` al principio, `−12…−6` cuando el suelo de ruido sube) y 0 sobre 0 dB. Un histograma solo positivo daría 0 tramas. Comprueba además que el suelo adaptativo sigue a la señal sostenida bajo umbral y sube el umbral [E: `noiseFloor` se actualiza con tramas no positivas] |
| N2 Candidato abortado frente a abierto | Fase 1: 100 ms sobre umbral y silencio. Después 200 ms sobre umbral | Primero `candidateOnlyMs=100`, `candidateAborts=1`. Después `episodesOpened=1` y `candidateOnlyMs` sigue en 100 |
| N3 Candidato entre fases y reset | 80 ms sobre umbral en fase 1, marca, 40 ms en fase 2 y silencio. Repetir con hueco >250 ms en vez de silencio | `candidateOnlyMs` 80 en fase 1 y 40 en fase 2. Con hueco: 0 abortados y `candidateInterruptedMs` 80/40 |
| N4 Selector, OFF y privacidad | `setConversationTextLanguage("es")` con ON; luego en OFF. Snapshot y diagnósticos con texto falso «zanahoria» entregado | Con ON no cambia. En OFF cambia y el siguiente ON lo congela (`languageMode="es"`). Ni snapshot ni diagnósticos contienen «zanahoria». Saturación: tramas con 2 muestras a 32767 cuentan en `clippedFrames` y no en franjas |

### 12.7 Aceptación de software

TypeScript, lint, Node nuevas y existentes, Kotlin nuevas y existentes (incluida `LocalParticipationSessionTest` sin cambios), AAR, build release, `lintVitalRelease`. Condiciones verificables: siete bibliotecas nativas con hash igual a G3.4.2, 33 ajustes sin claves nuevas, modo diagnóstico y `auto` por defecto. Instalación y ensayo requieren autorización aparte.

### 12.8 Reversión

Con `auto` y el modo diagnóstico desactivado, el comportamiento visible es el actual (solo se añaden contadores). Reversión de código: revertir el commit de C1 y regenerar el AAR. Reversión instalada: APK G3.4.2 respaldada con `adb install -r`, firma original, datos conservados.

## 13. Ensayo posterior (no se ejecuta en este encargo)

Requiere C1 instalado y autorización. El agente no lee ni captura la UI durante ON. El usuario marca las fases y cierra con OFF. Solo se leen agregados después de OFF, con `worker=false`.

**E1 · Control artificial de idioma.** Altavoz a 1 m reproduciendo un guion castellano fijo y conocido (voz sintética), usuario callado. Fase `referencia` de 30 s sin habla antes del guion. Una sesión `auto` y otra `es` con el mismo guion, alternando el orden. Al ser material sintético, el usuario puede comparar el texto visto con el guion. Mide: proporción de palabras del guion recuperadas, rechazos por fase y texto entregado en `referencia`. **No** demuestra captura de una persona presente ni rechazo de reproducción o alternancia.

**E2 · Comprobación humana mínima.** Una persona real, 60-90 s por modo. El usuario marca `otra-persona` cuando habla ella y `yo` cuando habla él. Se usan solo agregados por fase y el juicio del usuario sobre si aparecieron sus palabras. Sin TV ni alternancia: eso pertenece a C2.

**Criterios fijados antes de medir:**

- Adoptar `es` por defecto solo si se cumplen las tres: (a) en E1 recupera claramente más palabras que `auto` (umbral orientativo +15 puntos), (b) en E2, fase `otra-persona`, `deliveredChars` sube y el usuario ve **mejor texto real**, no solo menos rechazos, (c) en `referencia` no hay más de un segmento entregado por modo. (c) es evidencia limitada de falsos textos, no prueba de que no haya alucinaciones.
- **Inconcluso** si las diferencias son pequeñas, si ambas fases `otra-persona` tienen poco `submittedAudioMs` o si E1 y E2 discrepan. Se informa así, sin adoptar nada.
- Si `otra-persona` muestra mucha actividad bajo 0 dB relativos frente a `referencia` y pocos episodios, la lectura posible es señal insuficiente, pero también ruido o segmentación (`shortSegments`, `dropped`, `mixta`). **No** se deduce «bajar umbral» por falta de candidatos. El siguiente paso sería una medición dirigida, no un cambio de umbral.
- Altavoz no equivale a conversación presencial.

**Tras OFF:** dos lecturas separadas por un tick deben coincidir (sin entregas nuevas), `worker=false`, `busy=false`, líneas de texto vacías y concesión liberada.

## 14. Estado

Dirección aceptada por Codex. Contratos corregidos, **pendientes de revisión Codex**. C1 no implementado. G3.4.2 sigue pendiente de revisión completa y esta corrección no la aprueba. Conservación de §8 vigente: perfil, firma, 33 ajustes, Hermes habitual, GPS/bloqueo, Wear desconectado y firmware /36 sin tocar. Sin build, instalación, ensayo, consulta al móvil ni conexión real. Al aprobarse, el siguiente encargo es implementar C1 acotado según §12.
