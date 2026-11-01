# Revisión y diseño S2 — identificar al portador (Claude, 04-10-2026, revisión corregida)

Encargos: `notes/prompt-claude-s2-identificar-portador-2026-10-04.md` y `notes/prompt-claude-corregir-s2-identificar-portador-2026-10-04.md`. **Implementación:** ver `notes/informe-claude-s2-identificar-portador-2026-10-04.md`; tras la validación se corrigieron aquí §6 (captura del resumen) y §10.6 (fallback frente a cierre terminal). Corrige la versión anterior de este mismo documento (SHA-256 `a2c4516c…`) según la validación `notes/revision-codex-s2-identificar-portador-2026-10-04.md` (R1–R4 y ajustes de precisión). La correspondencia hallazgo → regla → prueba está en §11.

Solo diseño. No se ha modificado código de aplicación, APK, ajustes del móvil, perfil, firmware, Wear ni Hermes. No se ha iniciado captura ni ejecutado builds o suites.

Estado comprobado: rama `codex/conversation-detection-g0`, HEAD `ae55d83`, S1 en `219380a`. Cambios locales conservados: `AGENTS.md` modificado (entradas S1 y S2), notas sin seguimiento (prompts S2, revisión S1, esta revisión, validación Codex) y `scripts/__pycache__/`.

Convención: **[existe]** describe código o documentación comprobados. **[propuesta]** describe lo que S2 debería añadir. Ninguna cifra de precisión o latencia de este documento está medida. Los umbrales son criterios de selección elegidos para el diseño, no mediciones acústicas.

Se mantienen las decisiones vigentes de S1: Soniox por defecto con su configuración actual, Whisper local de reserva, perfil existente sin nuevo registro, sin filtros de televisión, tope de 120 s y ningún envío a Hermes.

---

## 1. Recomendación

**Alternativa elegida para S2: identificación explícita por sesión (alternativa 2)**, con dos entradas:

1. **«Identificar mi voz»**: el usuario pulsa y pronuncia una frase fija. Se asocia la etiqueta Soniox que contiene **la frase completa y en orden**, en tokens finales contiguos de esa etiqueta, dentro de la ventana del intento, sin solapamiento relevante de otras etiquetas y con tiempos válidos. Cualquier reconocimiento incompleto o dudoso se abstiene.
2. **«Soy la voz N» / «No soy ninguna»**: elección o borrado manual de una etiqueta observada en el stream actual. Tiene prioridad sobre cualquier intento pendiente, que queda cancelado.

La frase es una **declaración explícita dentro de un flujo cooperativo**, no una prueba biométrica. Otra persona podría pronunciarla. El diseño reduce ese caso (frase completa, ventana propia, una sola etiqueta) y siempre deja visible la asociación con su fuente para que el usuario la corrija.

La alternativa 1 (perfil local automático) queda para después (§3).

Motivos:

- **Todo lo necesario ya llega por el socket Soniox**: tiempos por token, etiqueta, finalidad y progreso de audio final. S1 lo descarta. Sin cambios Kotlin, AAR ni nativas.
- **La alternativa 1 carece hoy de piezas básicas**: resultados por segmento, intervalos, reloj común con Soniox y umbrales medidos.
- **No requiere nuevo registro de perfil.**

Coste aceptado: con el tope de 120 s, la identificación se repite en cada ON. No se propone cambiar el tope.

---

## 2. Evidencia: qué existe hoy

### 2.1 Soniox en la app — `app/native/soniox-conversation.ts`

- [existe] Configuración en `onOpen`: `stt-rt-v5`, `pcm_s16le`/16 kHz/mono, `language_hints` `["es"]` o `["es","ca"]`, `enable_speaker_diarization: true`, `enable_endpoint_detection: true`. S2 no la cambia.
- [existe] `type Token = { text?, is_final?, speaker? }`: se descartan `start_ms`, `end_ms` y `confidence`. `handle()` no lee `final_audio_proc_ms`, `total_audio_proc_ms` ni `error_type`.
- [existe] `handle()` ignora `<end>` y `<fin>`.
- [existe] `appendFinal()` concatena por etiqueta en `finals[]` y recorta por caracteres con `shift()`: vista de texto sin tiempos.
- [existe] `stats.speakers` cuenta etiquetas distintas entre las líneas retenidas, no en toda la sesión.
- [existe] `stats.sentMs += 50` por cada `sendBinary` correcto. El coordinador valida 1600 B/800 muestras por trama (`ConversationCaptureCoordinator.accept`).
- [existe] `generation` invalida callbacks de sockets anteriores. `stop()` y `fail()` la incrementan.
- [existe] `resetStream()` envía `{"type":"finalize"}`. El coordinador lo llama por hueco >250 ms (`resetAcousticStream()`) y en `release()` (cesión a Hey Even/PTT, cambio de sesión BLE). El socket sigue abierto tras la cesión.
- [existe] `fail()` pasa a Whisper local y conserva el texto Soniox en `fallbackText`.
- [existe] `stop()` llama a `reset()`, que borra texto y contadores.
- [existe] `lastError` del snapshot copia hasta 120 caracteres del mensaje del proveedor.
- [existe] El host usa `android.os.SystemClock.elapsedRealtime()` como `now()` en Android (`dashboard-controller.ts`): reloj monotónico disponible para plazos.

### 2.2 Coordinador y controles

- [existe] `coordinator.ts`: `setEnabled()` arranca transcripción y participación. `refresh()` cada 500 ms; tope 120 000 ms. En `expire()` llama a `setEnabled(false)` (que limpia y fija `stopReason = "manual"`) y **después** fija `stopReason = "expired"`.
- [existe] `conversationStartPlan`: con perfil `guardado`, la participación corre en paralelo a Soniox.
- [existe] `session-controls.ts`: elecciones en RAM cambiables solo en OFF.
- [existe] `local-conversation-app.ts`: toque = ON/OFF, doble toque = OFF y salir, rueda = desplazamiento. Las acciones nuevas van al menú.
- [existe] El sistema de menús de lentes ya ofrece submenús (`submenuItem`, `openSettingsSubMenu` en `app/ui/dashboard/remote-input-menu.ts`).

### 2.3 Participación local

- [existe] `DetectorParticipation.snapshot()` agregado, sin eventos por segmento.
- [existe] `LocalParticipationSession.kt`: segmentos VAD de hasta 8 s, ≥1 s con voz, umbrales 0,80/0,60 sin medición de acierto, `Job` sin desplazamiento temporal, descarte si está ocupado.
- [existe] Arranque independiente de Soniox: no hay reloj común.

### 2.4 Documentación oficial Soniox (MCP oficial, 04-10-2026)

Lo que documenta:

- Cada token puede traer `text`, `start_ms`, `end_ms`, `confidence`, `is_final`, `speaker`. La referencia de la API marca `start_ms`/`end_ms` y `speaker` como **opcionales** (`/api-reference/stt/websocket-api`).
- Los tokens pueden ser palabras o **subpalabras**, cada una con su intervalo (`/stt/concepts/timestamps`).
- Cada respuesta trae `final_audio_proc_ms` y `total_audio_proc_ms`.
- Los finales se envían una sola vez y no cambian. Los no finales pueden cambiar o desaparecer (`/stt/rt/real-time-transcription`).
- Diarización en tiempo real: más errores que en asíncrono y cambios temporales de hablante que se estabilizan. Hasta 15 hablantes por sesión.
- Endpoint detection devuelve `<end>` final al cerrar un segmento. La documentación afirma que `max_endpoint_delay_ms` (por defecto 2000) acota el retraso del endpoint tras el fin de la voz. También avisa de que endpoint y finalización manual reducen la precisión de diarización (`/stt/rt/endpoint-detection`, `/stt/rt/manual-finalization`).

Lo que **no** documenta, y el diseño trata como supuesto no garantizado:

- El origen de `start_ms`/`end_ms` (si cuentan desde el primer byte de audio del WebSocket).
- Que los tiempos de tokens finales sean monótonos o no se solapen.
- La estabilidad de una etiqueta para la misma persona durante toda la sesión.

Soniox no ofrece identificación de hablantes conocidos.

### 2.5 Puente Hermes (lectura)

- [existe] Protocolo v1: `ctl` hello/ack/ping, `chat` `utterance`/`cancel`, `mcp`. Sin tareas proactivas propias.
- [existe] Un `chat/utterance` nuevo cancela el turno activo. Otros canales se ignoran.
- [existe] En el móvil, `assistant.allowProactive` controla las llamadas proactivas de herramientas.
- Las intervenciones de conversación no deben enviarse como `utterance` (§5.5).

---

## 3. Comparación de alternativas

| Criterio | 1. Perfil local automático | 2. Identificación explícita (elegida) |
|---|---|---|
| Base de la asociación | Similitud de embedding sobre segmentos VAD, a menudo mezclados. Umbrales sin medir | Declaración explícita: frase completa y ordenada en una sola etiqueta, o elección manual |
| Interlocutor primero o TV | Resultado sin medir | No forma la frase completa: identidad sigue desconocida |
| Unión con intervalos Soniox | Inexistente | Tiempos de tokens frente a audio enviado, con validación (§4.1) |
| Cambios | Kotlin + AAR + TS + calibración | Solo TS y UI |
| Fricción | Ninguna | Unos segundos por sesión |
| Lo que se puede acreditar | Nada sin datos etiquetados | Reglas verificables por pruebas. El acierto real queda como observación humana |

Para la alternativa 1 faltaría: desplazamientos por segmento en un contador común del coordinador, evento por segmento sin vector, unión con tokens Soniox, abstención en segmentos mixtos y medición de concordancia frente a identificaciones explícitas, solo con contadores.

---

## 4. Diseño S2

### 4.1 Identificadores, reloj y validación temporal [propuesta]

**Identidad de la evidencia**: toda evidencia pertenece a la tupla `(sessionId, streamId)`.

- `sessionId`: aleatorio por cada `start()` aceptado. Nunca se reutiliza.
- `streamId`: empieza en 1 en cada sesión y aumenta con cada socket Soniox nuevo dentro de ella. Hoy solo hay uno por sesión, porque la caída a local termina Soniox. Se incluye para que una futura reconexión no herede evidencia.
- Además se conserva `generation` (existe) para descartar callbacks de sockets anteriores.

Ningún callback, temporizador, menú o evento se aplica si su tupla no coincide con la vigente.

**Relojes**:

- `streamMs` = `stats.sentMs` del socket vigente: audio aceptado por `sendBinary`.
- `monoNow` = `host.now()` (en Android, `elapsedRealtime`). Sirve para plazos de UI y espera.
- **Supuesto no garantizado**: `token.start_ms`/`end_ms` y `final_audio_proc_ms` se expresan en la misma escala que `streamMs`. Las validaciones de abajo rechazan lo que lo contradice de forma observable. No pueden detectar un desfase pequeño y constante. Por eso la frase y la ventana son condiciones independientes, y el usuario ve la asociación y puede corregirla. No se afirma que una desalineación solo pueda producir abstención.

**Validez de un token final** (`timing: "valido" | "invalido"`):

1. `start_ms` y `end_ms` presentes, números finitos y ≥ 0.
2. `end_ms ≥ start_ms`. Duración 0 admitida (puntuación). Cuenta 0 ms.
3. `end_ms ≤ streamMs_en_recepción + 100`. Ningún token puede terminar después del audio enviado. Los 100 ms absorben el redondeo.
4. `start_ms ≥ ultimoFinalValido.start_ms − 500`. Un retroceso mayor se trata como incoherente.

Un token inválido se sigue mostrando en el texto (la transcripción no cambia), pero:

- nunca contribuye a identificar;
- una ocurrencia de frase que lo contenga se rechaza (`tiempos-invalidos`);
- en intervenciones marca `timing: "parcial"` o `"invalido"` (§5.2).

**Validez del progreso**: `final_audio_proc_ms` se acepta si es finito, ≥ 0, no decrece respecto al último aceptado y es ≤ `streamMs + 100`. Si no, se ignora en ese mensaje y suma `invalidProgress` en el resumen.

**Fronteras de captura**: cada `resetStream()` (hueco >250 ms o cesión) registra `boundaryMs = streamMs` en ese instante. Ninguna frase ni intervención puede contener tokens a ambos lados de una frontera. El `finalize` que ya envía S1 produce `<fin>`, que también cierra.

**Duraciones y solapamientos**: siempre como **unión de intervalos válidos**. Los tokens que se solapan no cuentan dos veces.

### 4.2 Frase y reconstrucción [propuesta]

Frase canónica: **«Soy yo quien lleva las gafas»**. Secuencia normalizada: `soy yo quien lleva las gafas` (6 palabras). Variantes admitidas, completas y en orden: `soy yo el que lleva las gafas` y `soy yo la que lleva las gafas`. Nada más.

**Normalización**: NFD sin diacríticos, minúsculas, puntuación y guiones como separador, espacios colapsados.

**Reconstrucción de palabras** a partir de tokens finales con `speaker` no nulo, en el orden de recepción:

- Un **tramo** es una secuencia máxima de tokens finales consecutivos de la **misma etiqueta**. Lo cortan:
  - un token final de otra etiqueta o sin etiqueta;
  - `<end>` o `<fin>`;
  - una frontera de captura (§4.1);
  - un hueco > 1000 ms entre el `end_ms` de un token y el `start_ms` del siguiente;
  - el inicio de la ventana del intento: los tokens con `start_ms < windowStartMs` no entran.
- Dentro de un tramo, el texto se concatena tal cual. Soniox codifica el espacio entre palabras en el texto de los tokens (por ejemplo `" are"` en la documentación). Así, `"lle"` + `"va"` forman `lleva`, y `" las"` empieza otra palabra.
- Las palabras se obtienen tras normalizar y separar por espacios.

**Ocurrencia válida**: la secuencia canónica o una variante aparece como **subsecuencia contigua de palabras** dentro de un único tramo. Se admiten palabras antes o después en el mismo tramo («vale, soy yo quien lleva las gafas»). No se admiten palabras intercaladas, orden distinto, palabras parciales ni coincidencia difusa. Un reconocimiento incompleto («soy yo quien lleva las gafa») se abstiene. La elección manual sigue disponible.

### 4.3 Regla de aceptación [propuesta]

Ventana del intento `W = [windowStartMs, windowEndMs + 300]`. Los 300 ms solo se aplican al final, para la última sílaba cuando el usuario cierra con «Listo». Por el inicio no hay tolerancia.

Para cada ocurrencia válida `O` de la etiqueta `S`:

1. Todos los tokens de `O` son finales, tienen tiempos válidos y están dentro de `W` (`start_ms ≥ windowStartMs`, `end_ms ≤ windowEndMs + 300`). Si no: `frase-fuera-de-ventana` o `tiempos-invalidos`.
2. `span(O)` = desde el `start_ms` del primer token de `O` hasta el `end_ms` del último.
3. **Plausibilidad temporal**: unión de intervalos de los tokens de `O` ≥ 700 ms. Es un criterio de coherencia de tiempos para 6 palabras, no una medición acústica ni de calidad de voz. Si no: `tiempos-implausibles`.
4. **Solapamiento**: unión de intervalos válidos de tokens finales de **otras etiquetas** dentro de `span(O)` ≤ 300 ms. Los tokens sin etiqueta dentro de `span(O)` cuentan como otra voz. Si no: `voces-solapadas`.

Decisión del intento:

- Exactamente una etiqueta `S` con al menos una ocurrencia que cumple 1–4 → `identificado { speaker: S, source: "frase" }`.
- Ocurrencias válidas en dos o más etiquetas distintas → `frase-ambigua`.
- Ninguna ocurrencia válida → el motivo del mejor candidato (en este orden: `voces-solapadas`, `tiempos-invalidos`, `frase-fuera-de-ventana`, `tiempos-implausibles`) o `frase-no-reconocida`.

No cuentan el orden de llegada, la primera etiqueta, la más frecuente ni la etiqueta «1». Otra voz antes o después de la frase, sin solaparla, no impide aceptar.

S2 no envía `finalize` para acelerar el resultado.

### 4.4 Máquina de identidad [propuesta]

Estados:

- `no-disponible`: OFF, motor local, Soniox `cargando` o tras la caída a Whisper.
- `sin-identificar`: Soniox abierto, sin asociación.
- `escuchando-frase { attemptId, windowStartMs, openedAt }`.
- `esperando-resultado { attemptId, windowStartMs, windowEndMs, deadlineAt }`.
- `identificado { speaker, source, version, knownOthers, associatedAtMs }`.

Un intento activo (`escuchando-frase` o `esperando-resultado`) conserva aparte la **asociación previa** (`identificado` o `sin-identificar`), que sigue vigente para la relación de las intervenciones mientras dura el intento.

`lastOutcome` ∈ `ninguno | aceptado | frase-no-reconocida | frase-ambigua | voces-solapadas | tiempos-invalidos | tiempos-implausibles | frase-fuera-de-ventana | audio-insuficiente | sin-resultado | audio-interrumpido | cancelado-manual | cancelado-off | motor-local`. Se muestra una vez en la línea de estado. Nunca hay avisos repetidos ni reintentos automáticos.

**Intentos**:

- Solo se abre uno si no hay otro activo. Mientras dura, el menú ofrece «Listo» y «Cancelar», no «Identificar».
- `attemptId` crece de forma estricta en la sesión. Toda la evidencia, los temporizadores y los callbacks llevan `(sessionId, streamId, attemptId)` y se ignoran si no coinciden con el intento vigente **y** su estado.
- `windowStartMs = max(streamMs, finVentanaAnterior + 301)`. Las ventanas de intentos distintos nunca se solapan. Una frase que empezó en el intento anterior no puede completarse en el nuevo: sus tokens con `start_ms < windowStartMs` quedan fuera del tramo (§4.2).

**Cierre de la ventana** (`escuchando-frase` → `esperando-resultado`), lo primero que ocurra:

- 5000 ms de `streamMs` desde `windowStartMs`;
- «Listo» del usuario;
- 8000 ms de `monoNow` desde `openedAt` (plazo monotónico aunque el audio se detenga).

Si al cerrar la ventana tiene menos de 2000 ms de `streamMs`, el intento termina con `audio-insuficiente` sin evaluar.

**Espera del resultado**: se evalúa cuando el progreso válido cumple `final_audio_proc_ms ≥ windowEndMs + 300`. Así hay evidencia de que todo el audio de la ventana está finalizado. `deadlineAt = monoNow + 6000`. Si vence sin esa evidencia (progreso detenido, socket mudo, finales retrasados), el intento termina con `sin-resultado`. La documentación de endpoint describe un retraso máximo por defecto de 2000 ms. Los 6000 ms son margen de diseño, no una garantía de Soniox.

**Tabla de transiciones**:

| Evento | Comprobaciones | Efecto |
|---|---|---|
| Soniox abierto en ON (`status = "listo"`) | — | `sin-identificar`, `version = 0`, `knownOthers = ∅` |
| «Identificar mi voz» | tupla vigente, sin intento activo, Soniox abierto | `escuchando-frase`, `attemptId++` |
| Cierre de ventana | intento vigente en `escuchando-frase` | `esperando-resultado` o fin `audio-insuficiente` |
| Progreso suficiente | intento vigente en `esperando-resultado` | Evaluar §4.3. Aceptado → `identificado`, `version++`. Si no, vuelve a la asociación previa y fija `lastOutcome` |
| `deadlineAt` vencido | temporizador del intento vigente | Asociación previa, `sin-resultado` |
| «Cancelar» | intento vigente | Asociación previa, `cancelado-manual` |
| «Soy la voz N» | tupla del menú = vigente, `N` observada en el stream vigente | **Cancela el intento activo** (`cancelado-manual`), invalida `attemptId`, sus temporizadores y su evidencia. `identificado { N, "manual" }`, `version++` |
| «No soy ninguna» | tupla del menú = vigente | Cancela el intento activo igual. `sin-identificar`, `version++` |
| `resetStream()` durante un intento | intento vigente | Asociación previa, `audio-interrumpido`. Fuera de un intento, la asociación se mantiene |
| Caída a Whisper | — | Cancela el intento (`motor-local`). `no-disponible`. La asociación termina con su stream |
| OFF, `expire()`, error | — | Cancela el intento (`cancelado-off`). Captura el resumen (§6) y pasa a `no-disponible` |
| Callback, temporizador, menú o token de otra tupla, otro intento o estado | — | Ignorado sin efecto |

**Cancelación**: invalidar el `attemptId` (el vigente pasa a `null`), cancelar `deadlineAt` y el plazo monotónico, borrar los tokens retenidos para la ventana. Un resultado tardío de ese intento no puede reemplazar una elección manual posterior ni una cancelación.

### 4.5 Política única de relación [propuesta]

Se calcula por intervención con la asociación vigente en el momento de cerrarla:

| Caso | `speaker` | `relation` |
|---|---|---|
| Token o intervención sin etiqueta | `null` | `desconocido` |
| Sin asociación (`sin-identificar`, `no-disponible`, intento sin asociación previa) | etiqueta | `desconocido` |
| Etiqueta = asociada | etiqueta | `portador` |
| Etiqueta ∈ `knownOthers` | etiqueta | `otro` |
| Etiqueta que apareció por primera vez después de la asociación | etiqueta | `desconocido` |

`knownOthers` = etiquetas distintas de la asociada con al menos un token final válido en el stream vigente **antes** de la asociación. Se fija en cada asociación (frase o manual) y no crece sola. Una etiqueta nueva puede ser el portador separado por la diarización o una voz nueva, y no se clasifica sin otro acto explícito.

Una nueva asociación (reidentificación o manual) recalcula `knownOthers` con todas las etiquetas observadas hasta ese momento. «No soy ninguna» deja todo en `desconocido`.

Limitación conocida: si la diarización ya había dividido al portador en dos etiquetas antes de asociarlo, la otra queda `otro`. La corrección manual lo resuelve, y la UI siempre muestra qué etiqueta es «Yo». No se añaden filtros de televisión: la televisión es una etiqueta más.

UI: `Yo:` para `portador`, `N:` para `otro` y `N?:` para `desconocido` con asociación vigente. Sin asociación, `N:` como en S1.

### 4.6 Intervenciones [propuesta]

Módulo puro `app/conversation-detection/conversation-turns.ts`, alimentado solo con tokens finales.

Cierre de una intervención, lo primero que ocurra:

- cambio de etiqueta (incluido pasar a o desde `null`);
- `<end>` o `<fin>`;
- frontera de captura (§4.1);
- **pausa con evidencia**: hueco de audio ≥ 1500 ms entre el `end_ms` del último token y el `start_ms` del siguiente, o progreso válido con `final_audio_proc_ms ≥ lastEnd + 1500` sin tokens nuevos de esa intervención. Nunca solo porque no llegan mensajes o el socket se retrasa;
- 600 caracteres;
- `stop()` o caída a local (`closedBy: "fin-sesion"`).

Los no finales nunca entran. Ring de 40 en RAM, borrado en OFF.

### 4.7 Whisper local de reserva

- [propuesta] Identidad `no-disponible` con motivo «Identificación solo con Soniox». Menús de identificación deshabilitados con ese motivo.
- [propuesta] Sin intervenciones (`turnsAvailable: false`). Su texto llega en ventanas de 6 s con solape (A4), sin fronteras de hablante.
- [existe] El texto local y `fallbackText` se muestran igual que en S1.

---

## 5. Contratos [propuesta]

### 5.1 Snapshot (sin texto, frase ni clave)

```ts
identity?: {
  state: "no-disponible" | "sin-identificar" | "escuchando-frase" | "esperando-resultado" | "identificado";
  speaker?: string;              // solo en "identificado", o asociación previa durante un intento
  source?: "frase" | "manual";
  version: number;
  knownOthers: number;           // cuántas etiquetas son "otro"; no se exponen textos
  lastOutcome: IdentityOutcome;  // §4.4
  windowRemainingMs?: number;    // en "escuchando-frase"
  speakersSeen: number;          // etiquetas distintas con tokens finales en toda la sesión
};
turnsAvailable?: boolean;
```

### 5.2 Intervención

```ts
export type ConversationTurn = {
  v: 1;
  sessionId: string;
  streamId: number;
  seq: number;                    // monotónico dentro de (sessionId, streamId), desde 1
  engine: "soniox";
  speaker: string | null;         // null = sin etiqueta; nunca se inventa
  relation: "portador" | "otro" | "desconocido";   // §4.5
  associationVersion: number;
  text: string;                   // solo tokens finales
  timing: "valido" | "parcial" | "invalido";
  startMs: number | null;         // unión de intervalos válidos; null si no hay ninguno
  endMs: number | null;
  closedBy: "cambio-hablante" | "endpoint" | "finalize" | "frontera" | "pausa" | "limite" | "fin-sesion";
};
```

Las intervenciones emitidas no se reescriben.

### 5.3 Evento de asociación

```ts
export type WearerAssociationEvent = {
  v: 1;
  sessionId: string | null;       // null tras OFF
  streamId: number | null;
  version: number;
  kind: "estado-inicial" | "frase" | "manual" | "borrado" | "fin-sesion";
  speaker: string | null;
  knownOthers: string[];          // etiquetas, sin texto
};
```

- **Suscripción**: `subscribeAssociation(listener): () => void`. Al suscribirse se entrega de inmediato un `estado-inicial` con la asociación vigente, o `sessionId: null` si no hay sesión. Se emite en cada asociación, borrado, inicio de sesión (`estado-inicial`, versión 0) y fin (`fin-sesion`).
- **Limpieza**: el `unsubscribe` devuelto retira el listener. Los listeners sobreviven entre sesiones, como `coordinator.subscribe`. El estado no.
- `subscribeTurns(listener): () => void` con el mismo patrón, sin reenviar intervenciones antiguas al suscribirse.

### 5.4 Interfaces en la app

- `DetectorTranscription` (opcional, solo Soniox):
  - `identifyWearer(): boolean`, `finishIdentification(): void`, `cancelIdentification(): void`.
  - `assignWearer(ref: { sessionId: string; streamId: number; speaker: string | null }): boolean`. Devuelve `false` si la tupla no es la vigente o la etiqueta no se ha observado en el stream vigente.
  - `observedSpeakers(): { sessionId; streamId; speaker; preview }[]`. La vista previa (≤ 30 caracteres) es solo para el menú y nunca va al snapshot ni al resumen.
  - `subscribeTurns`, `subscribeAssociation`.
- `ConversationCaptureCoordinator`: pasarelas que solo actúan con `enabled`, `state === "escuchando"` y Soniox abierto. Ninguna inicia captura.
- **Lentes**: «Soy la voz…» abre un submenú (patrón `openSettingsSubMenu`) con **todas** las etiquetas observadas, la asociada primero, y «No soy ninguna». Cada elemento lleva la tupla capturada al construir el menú. Un menú retenido tras OFF/ON no asigna nada.
- **Móvil**: la misma lista en el diálogo de acciones.

### 5.5 Frame futuro hacia Hermes (no implementar en S2)

`{"v":1,"chan":"conv","type":"turn", ...ConversationTurn}` y `{"v":1,"chan":"conv","type":"association", ...WearerAssociationEvent}`. El puente actual los ignora. No usar `utterance`, porque cancela el turno activo y entra en la conversación como si hablara el usuario. La respuesta en lentes, cuando se implemente, pasará por las herramientas proactivas sujetas a `assistant.allowProactive`.

---

## 6. Diagnóstico tras OFF [propuesta]

`lastSessionSummary`, sustituido en el siguiente `start()` aceptado. Solo escalares y categorías.

**Captura**: `stop()` calcula el resumen **antes** de `reset()`. Si había un intento activo, lo registra como `cancelado-off`.

**Captura antes de la invalidación (implementado, precisión 2 de la validación Codex)**: `ConversationCaptureCoordinator.cleanup()` llama primero a `transcription.prepareStop()` y después a `release()`. `prepareStop()` cierra la identidad (`end("cancelado-off")`, que guarda el estado previo y el intento pendiente en el resumen) y las intervenciones (`fin-sesion`), y marca la sesión como terminando. Así el `resetStream()` que provoca `release()` durante la limpieza no se interpreta como hueco (`audio-interrumpido`), mientras que un hueco o una cesión reales, que llegan sin `prepareStop()`, siguen dando `audio-interrumpido`. El arbitraje, la revocación de entregas, el `finalize` y la parada nativa no cambian.

**Motivo de cierre**: la transcripción no conoce el motivo, y el coordinador fija `expired` después de limpiar. Por eso `coordinator.lastSessionSummary()` compone el resumen de la transcripción con el `stopReason` vigente del coordinador (`manual`, `expired`, `error`, `saved`), leído en el momento de la consulta. No hace falta reordenar `expire()`.

| Campo | Significado | Qué no significa |
|---|---|---|
| `engineFinal` | `soniox`, `local`, `local (sin red)` | — |
| `sentAudioMs` | Audio enviado por el socket | No es audio procesado |
| `finalAudioProcMs`, `totalAudioProcMs` | Últimos valores válidos de Soniox | No es latencia |
| `backlogAtStopMs` | `sentAudioMs − finalAudioProcMs` en el último mensaje | Retraso de finalización en audio |
| `firstTokenAfterMs`, `firstFinalAfterMs` | Reloj monotónico del móvil desde el primer envío hasta recibir el primer token o el primer final. **Incluyen la espera de red y del servicio** | Excluyen la presentación posterior en pantalla. No son la latencia percibida completa |
| `messages`, `finalTokens`, `turns`, `speakersSeen` | Contadores | No indican calidad |
| `invalidTimingTokens`, `invalidProgress` | Tokens y progresos rechazados por §4.1 | No miden alineación |
| `fallbacks`, `errors` | Contadores | — |
| `lastErrorCategory` | `red`, `config`, `envio-audio`, `fin-servidor`, `servidor:<error_type>` si es un tipo documentado por Soniox, o `servidor-otro` | Nunca el mensaje del proveedor |
| `identity` | Último `state` previo al borrado, `source`, `lastOutcome`, intentos y número de asignaciones manuales | No es precisión |
| `endedBy` | `stopReason` del coordinador | — |

El texto, las intervenciones y la asociación se borran en OFF como en S1. El `lastError` en vivo de S1 no cambia.

---

## 7. Cambios mínimos por archivo [propuesta]

| Archivo | Cambio |
|---|---|
| `app/native/soniox-conversation.ts` | `Token` con `start_ms`, `end_ms`. Validación de tiempos y progreso (§4.1). `sessionId`, `streamId`, fronteras en `resetStream()`. Pasar finales a turnos e identidad. Resumen tras OFF con categorías de error. `render()` con `Yo:`/`N:`/`N?:`. `speakersSeen` de toda la sesión. Sin cambios en la configuración Soniox |
| `app/conversation-detection/conversation-turns.ts` (nuevo) | §4.6, puro |
| `app/conversation-detection/wearer-identity.ts` (nuevo) | §4.2–4.5, puro, con relojes inyectados |
| `app/conversation-detection/transcription.ts` | Tipos de §5 |
| `app/conversation-detection/coordinator.ts` | Pasarelas y `lastSessionSummary()` con `stopReason`. Sin cambios de ciclo de vida ni tope |
| `app/conversation-detection/session-controls.ts` | Acciones compartidas móvil/lentes con la tupla |
| `app/conversation-detection/conversation-ui.ts` | `wearerLabel(snapshot)` y textos de `lastOutcome` |
| `app/apps/local-conversation/local-conversation-app.ts` | Menú: «Identificar mi voz»; durante el intento, «Listo» y «Cancelar»; submenú «Soy la voz…». Línea de portador y frase pedida durante la ventana. Gestos sin cambios |
| `app/phone-ui/main-view-model.ts`, `main-page.xml` | Botón, etiqueta de portador, lista de etiquetas y resumen en OFF |
| Kotlin, AAR, nativas, ajustes persistentes, configuración Soniox, tope de captura | Sin cambios |

Fuera de S2: endpoint detection y `finalize` reducen la precisión de diarización según la documentación. Solo se valorará si la observación humana muestra cambios de etiqueta frecuentes.

---

## 8. Pruebas automatizadas [propuesta]

Node: `tests/soniox-conversation.test.cjs` (con el `harness` existente de reloj y socket simulados), `tests/wearer-identity.test.cjs` y `tests/conversation-turns.test.cjs`. Los contraejemplos de la validación Codex figuran como casos explícitos.

**Frase (R1)**

1. Frase válida en subpalabras: `"Soy"," yo"," quien"," lle","va"," las"," ga","fas"` de la voz 2 → `identificado` voz 2.
2. **Contraejemplo Codex**: otra voz dice «Soy yo quien paga la cena» con duración ≥ 1 s y sin otras voces → `frase-no-reconocida`.
3. Tres palabras comunes: «soy yo quien» sin el resto → `frase-no-reconocida`.
4. Desordenada: «las gafas lleva quien soy yo» → `frase-no-reconocida`.
5. Fragmentos separados por otra voz: voz 2 «soy yo quien», voz 1 «sí», voz 2 «lleva las gafas» → `frase-no-reconocida`.
6. Fragmentos de la misma voz separados por `<end>` o por un hueco > 1000 ms → `frase-no-reconocida`.
7. Frase repartida entre etiquetas: «soy yo quien» en la voz 2 y «lleva las gafas» en la voz 3 → `frase-no-reconocida`.
8. Variante admitida «soy yo el que lleva las gafas» → aceptada. Palabra incompleta «gafa» → `frase-no-reconocida`.
9. Frase completa en dos etiquetas dentro de la ventana → `frase-ambigua`.
10. Interlocutor primero sin solapar: voz 1 «¿qué tal?» y después voz 2 con la frase → `identificado` voz 2.
11. Frase solo en no finales que luego cambian → nunca aceptada.

**Elección manual e invalidación (R2)**

12. «Soy la voz 1» durante `escuchando-frase`, y después llegan los finales con la frase de la voz 2 → sigue `manual` voz 1, `lastOutcome = cancelado-manual`.
13. «No soy ninguna» durante `esperando-resultado`, y después llegan el progreso y los finales → sigue `sin-identificar`.
14. Menú construido en la sesión A, OFF/ON (sesión B), selección del menú viejo → rechazada sin efecto.
15. Etiqueta no observada en el stream vigente → `assignWearer` devuelve `false`.
16. Plazo antiguo: el intento 1 se cancela, se abre el intento 2 y vence el temporizador del 1 → sin efecto sobre el 2.
17. Resultado tardío del intento 1 (ventana anterior) durante el intento 2 → no resuelve el 2. Una frase que empezó antes de `windowStartMs` del intento 2 no cuenta.
18. Respuesta de un socket anterior tras OFF/ON → ignorada por `generation` y por la tupla.

**Relación (R3)**

19. Asociación con la voz 2 y `knownOthers = {1}`. Aparece después la voz 3 → intervenciones de la voz 3 `desconocido`, las de la voz 1 `otro` y las de la voz 2 `portador`.
20. Token final sin `speaker` con asociación vigente → intervención `speaker: null`, `desconocido`.
21. Reidentificación manual tras aparecer la voz 3 → `knownOthers` incluye la 3. Evento de asociación con nueva versión. Intervenciones previas sin reescribir.
22. «No soy ninguna» → todas `desconocido`.
23. UI: `Yo:`, `N:`, `N?:` según la tabla de §4.5.

**Tiempos y fronteras (R4)**

24. Tokens con `start_ms`/`end_ms` ausentes, `NaN`, negativos, invertidos o con `end_ms > streamMs + 100` → no identifican. Una frase que los contenga → `tiempos-invalidos`. El texto se muestra.
25. Tokens solapados: duración y solapamiento por unión, sin doble cuenta. Habla de otra voz fuera de `span(O)` no completa ningún mínimo.
26. Frase con un token antes de `windowStartMs` → excluida. Frase con un token terminando en `windowEndMs + 301` → `frase-fuera-de-ventana`. En `windowEndMs + 300` → aceptada.
27. Unión de intervalos de la frase < 700 ms → `tiempos-implausibles`.
28. Progreso detenido (`final_audio_proc_ms` no alcanza `windowEndMs + 300`) → `sin-resultado` a los 6000 ms monotónicos.
29. Audio detenido durante la ventana: 8000 ms monotónicos con < 2000 ms enviados → `audio-insuficiente`.
30. `final_audio_proc_ms` decreciente o mayor que `streamMs + 100` → ignorado y contado en `invalidProgress`.
31. `resetStream()` durante la ventana → `audio-interrumpido`. Frase con tokens a ambos lados de una frontera → rechazada.
32. Finales retrasados sin pausa real: sin mensajes durante 3 s de reloj, después llegan tokens contiguos en tiempo de audio → la intervención no se cierra por pausa.
33. Pausa real: hueco de audio ≥ 1500 ms entre tokens, o progreso que lo cubre → cierre `pausa`.

**Sesión, resumen y privacidad**

34. OFF durante un intento → `cancelado-off` en el resumen, `no-disponible`, sin asociación posterior.
35. Nueva sesión: `sessionId` nuevo, `streamId = 1`, `seq` desde 1, evento `estado-inicial`, resumen anterior sustituido.
36. Caída a Whisper durante la ventana → `motor-local`, `no-disponible`, `turnsAvailable: false`, texto local continúa.
37. `expire()`: el resumen muestra `endedBy = expired`.
38. Error de Soniox con mensaje arbitrario → `lastErrorCategory` estable, sin el mensaje.
39. Snapshot, resumen y eventos sin texto, frase, vista previa ni clave.
40. `subscribeAssociation`: `estado-inicial` inmediato, eventos en orden y `unsubscribe` efectivo.
41. Coordinador: las pasarelas devuelven `false` en OFF, `suspendido`, motor local y Soniox `cargando`. Nunca inician captura.
42. Lentes: abrir la app no inicia captura. El submenú lista todas las etiquetas, con la asociada primero. Gestos sin cambios.

Kotlin: sin pruebas nuevas, porque no cambia.

---

## 9. Comprobación humana breve

Una sesión ON con Soniox, el usuario y otra persona, sin repetir baterías ni registro de perfil:

1. Iniciar. La otra persona habla primero.
2. «Identificar mi voz» y decir la frase. Anotar si aparece «Portador: voz N (frase)» y si las líneas `Yo:` corresponden al usuario.
3. Alternar unos 20 s. Anotar si aparecen etiquetas `N?:` nuevas.
4. Segundo intento: la otra persona dice una frase parecida, como «soy yo quien paga la cena», mientras el usuario calla. Esperado: un único motivo «no se reconoció la frase» y se conserva la asociación previa.
5. Elegir manualmente otra etiqueta y volver a la correcta.
6. OFF. Revisar el resumen en el móvil, sin texto.

Lo observado se registra como **observación de una sesión**. Incluye si la alineación temporal parece coherente (identificación aceptada sin `tiempos-invalidos` y contadores de invalidez en cero o no). No acredita precisión general, alineación garantizada del reloj Soniox ni latencia.

---

## 10. Criterios de aceptación

1. Solo crean asociación una frase completa y ordenada que cumple §4.3 o una elección manual válida. Nunca el orden de llegada ni coincidencias parciales.
2. La elección manual y el borrado cancelan el intento activo. Ningún resultado tardío los reemplaza.
3. Una sola política de relación (§4.5), aplicada igual en UI, intervenciones y eventos. `speaker: null` nunca se convierte en `otro`.
4. No se usa evidencia con tiempos o progreso inválidos, de otra tupla, de otro intento ni a través de una frontera de captura.
5. Pruebas 1–42 pasan. TS y lint correctos. Sin cambios Kotlin, AAR, nativas, firma, ajustes persistentes, configuración Soniox ni tope.
6. **Cierre terminal** (OFF, `expire`, error terminal del coordinador) borra asociación, texto temporal e intervenciones; solo queda el resumen agregado con categorías estables. **Caída a Whisper** no es cierre terminal: borra la asociación y el buffer de intervenciones Soniox, no emite intervenciones locales y conserva la continuidad del texto (`fallbackText` + texto local) hasta OFF, como en S1. *(Corregido el 04-10-2026 en la implementación, según la precisión 1 de `validacion-codex-s2-corregido-2026-10-04.md`.)*
7. La transcripción no se bloquea por ningún estado de identidad. Sin avisos repetidos.
8. Whisper local sigue funcionando sin identidad ni intervenciones inventadas.
9. Ningún envío a Hermes.
10. La comprobación humana se documenta como observación, sin afirmar precisión ni latencia medidas.

---

## 11. Correspondencia con la validación Codex

| Hallazgo | Corrección | Pruebas |
|---|---|---|
| **R1** Bolsa de 3/5 palabras acepta «Soy yo quien paga la cena» | §4.2: frase completa y ordenada (6 palabras más 2 variantes cerradas) dentro de un único tramo contiguo de la misma etiqueta. Unión de subpalabras por el texto de los tokens. Tramos cortados por otra voz, `<end>`/`<fin>`, frontera, hueco > 1 s e inicio de ventana. Sin coincidencia difusa. §1: declaración cooperativa, no biométrica | 1–11 |
| **R2** La elección manual no invalidaba el intento | §4.4: la elección o el borrado manual cancelan el intento, invalidan `attemptId`, temporizadores y evidencia. Comprobación de tupla, intento y estado en todo callback. §5.4: el menú lleva la tupla y se valida la etiqueta en el stream vigente | 12–18 |
| **R3** `desconocido`/`otro` incompatibles. `speaker` opcional | §4.5: tabla única con `knownOthers` fijado en cada asociación. Etiquetas nuevas `desconocido`. `speaker: null` explícito. Reflejada en UI (§4.5), intervención (§5.2) y evento (§5.3) | 19–23 |
| **R4** Contrato temporal incompleto | §4.1: validez de tokens y progreso, tolerancias, fronteras, unión de intervalos, supuesto de origen sin garantía. §4.3: ventana sin tolerancia inicial y 300 ms solo al final, frase íntegra dentro, plausibilidad 700 ms. §4.4: ventanas disjuntas, plazo monotónico de 8 s, `audio-insuficiente`, espera por progreso con plazo de 6 s. §4.6: pausa solo con evidencia de audio o progreso | 24–33 |
| Ajuste: `firstTokenAfterMs` | §6: incluye la espera de red y del servicio y excluye la presentación | — |
| Ajuste: suscripción de eventos de asociación | §5.3: `subscribeAssociation` con `estado-inicial` y limpieza | 40 |
| Ajuste: `streamId` | §4.1: tupla `(sessionId, streamId)`, `sessionId` nunca reutilizado, `streamId` desde 1 por sesión | 14, 18, 35 |
| Ajuste: menú de 4 etiquetas | §5.4: submenú con todas las etiquetas, la asociada primero | 42 |
| Ajuste: `stopReason` y resumen | §6: resumen capturado antes de `reset()`, intento pendiente como `cancelado-off`, `endedBy` compuesto por el coordinador. Errores por categorías estables | 34, 37, 38 |
| Ajuste: «voz suficiente» | §4.3: sustituido por un criterio de plausibilidad temporal (700 ms de unión) declarado como selección, no medición | 27 |
