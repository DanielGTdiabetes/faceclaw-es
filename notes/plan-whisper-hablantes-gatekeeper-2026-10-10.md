# Plan: hablantes en Whisper local + impacto en Gatekeeper · 10-10-2026

Estado: **plan, sin implementar.** Redactado en la rama `codex/conversation-detection-g0` sobre
`bad67d9` mientras otra sesión tenía cambios sin commitear en Gatekeeper/UI (eliminación del modo
`shadow` en `gatekeeper.ts`, `conversation-hermes.ts`, `session-controls.ts`, phone UI). **No
empezar hasta que esa sesión haya commiteado** y rebasar este plan sobre su resultado.

## Objetivo

1. Que los turnos de Whisper small local digan quién habla: primero `portador / otro /
   desconocido`, después hablantes de sesión (A, B, C) si se demuestra útil.
2. Que el Gatekeeper use esa atribución para decidir mejor (`assist/ignore/wait`) y evitar llamadas
   a Hermes cuando no hay conversación real (TV, radio, monólogo).
3. Mejorar la calidad de Whisper small sin cambiar de modelo: ventanas por pausas y filtros
   anti-alucinación.

## Decisión del usuario que cambia el diseño

El usuario decide **retirar las restricciones de privacidad** sobre voces ajenas en este contexto:
se permite mantener en RAM durante la sesión las huellas de voz de otras personas y etiquetar sus
turnos. Hasta ahora el diseño lo impedía en varios puntos, que este plan cambia de forma explícita:

| Restricción actual | Dónde | Cambio |
|---|---|---|
| Huellas ajenas se borran tras comparar | `native/kotlin/shared/.../audio/LocalParticipationSession.kt` | Agruparlas en RAM por sesión |
| Turnos Whisper siempre anónimos | `app/conversation-detection/local-conversation-turns.ts` (`speaker: null`, "No invented speaker labels") | Aceptar `speaker`/`relation` |
| Tracker solo acepta locales anónimos | `conversation-episodes.ts` → `isAnonymousLocalTurn` | Aceptar locales etiquetados |
| Unión huella↔turno solo con Soniox | `coordinator.ts` (`engine === "soniox"` en conversación manual) | Permitir motor Whisper local |
| Motor local sin modelo de hablante | `FaceclawLocalTranscriber.kt` ("No speaker model") | Embedding por segmento |
| Garantías documentadas | `AGENTS.md`, notas G2.x | Actualizar texto |

Lo que **se mantiene**: el perfil propio cifrado (Keystore), no persistir audio, no enviar audio a
la nube, prioridad del asistente explícito/PTT, y que Hermes no reciba vectores ni puntuaciones (solo
la relación/etiqueta textual del turno).

## Fases

Cada fase se cierra con: build (`build.sh`), `npm run lint`, pruebas Node y Kotlin del área, y nota
breve en `notes/`. Sin instalación en el Pixel salvo que el usuario lo pida.

### F0 · Banco de medida (antes de tocar comportamiento)

- Conjunto de 10–20 clips reales de las G2 (castellano y valenciano, 1 y 2–3 hablantes, algo de TV
  de fondo) con transcripción y hablante de referencia. Guardado fuera del repo o en fixtures
  sintéticos si el usuario no quiere audio en git.
- Script de replay offline: WER por configuración y, con hablantes, precisión de atribución
  (DER simplificado: % de palabras con hablante correcto).
- Extender `tests/fixtures/gatekeeper/` y `scripts/gatekeeper-replay.cjs` con campo opcional
  `relation` (y luego `speaker`) por turno, sin romper el formato actual de `pilot.jsonl`.
- Criterio de salida: línea base medida de Whisper small actual (ref-6-3) y del Gatekeeper sin
  hablantes.

### F1 · Calidad de Whisper small (sin hablantes)

1. **Segmentación por pausas**: ventanas que cierran en silencio del VAD, mínimo ~1,5 s, máximo
   12–15 s, solape corto solo si se corta por tope. Partir de `LocalTranscriptSegmentation.VAD` y
   de `LocalTranscriptWindowPolicy` (`LocalWhisperRunConfig.kt`); comparar con `COALESCE`.
2. **No decodificar sin voz**: saltar ventanas sin frames activos según `LocalAsrConditioner`.
3. **Filtros anti-alucinación** en `isKnownWhisperHallucination` / `LocalTextRejection`:
   ratio de compresión gzip > 2,4 y n-gramas repetidos ≥ 3 veces.
4. Mantener `language=""` (auto) para castellano/valenciano.

Archivos: `LocalTranscriptSession.kt`, `LocalWhisperRunConfig.kt`, `LocalAsrConditioner.kt`,
pruebas `tests/kotlin/.../LocalTranscriptSessionTest.kt`, `LocalTranscriptWindowsTest.kt`.

Aceptación: WER ≤ línea base en el banco, menos decodificaciones por minuto, p95 de latencia ≤
línea base en Pixel (si se mide), sin aumento de alucinaciones.

### F2 · Atribución yo / otro / desconocido en Whisper

1. Por cada segmento de F1 (≥ 1 s de voz), calcular la huella con el modelo de hablante ya usado por
   la participación (sherpa-onnx `SpeakerEmbeddingExtractor`, 1 hilo) y compararla con el perfil
   propio: ≥ 0,80 `portador`, ≤ 0,60 `otro`, intermedio o segmento corto `desconocido`
   (umbrales actuales de `LocalParticipationTurns`, a recalibrar con F0).
2. Emitir texto + atribución en el mismo callback del segmento (sin unir por tiempos a posteriori):
   evita el desalineo que tendría hoy entre ventanas de 6 s y segmentos de participación.
3. `LocalConversationTurns.accept` recibe `speaker`/`relation`; `isAnonymousLocalTurn` se sustituye
   por una comprobación de "turno local válido".
4. `ConversationEpisodeTracker.accept`: aceptar locales etiquetados con las mismas reglas de
   coherencia (`labelled`, `contradicts`).
5. Coordinador: permitir participación + transcripción local juntas en conversación manual.

Riesgos y mitigación:
- **Cortes de episodio por cambio de asociación** (`association()` → `end("identidad")`): para
  Whisper local la identidad del portador es fija durante la sesión (perfil propio), así que no debe
  emitir eventos de asociación nuevos por cada segmento.
- **CPU**: medir coste del embedding por segmento junto a Whisper small 4 hilos; si compite, hacerlo
  después del decode en el mismo worker.
- **Etiqueta errónea peor que ninguna**: ante duda, `desconocido`.

Aceptación: ≥ 90 % de turnos del portador bien etiquetados en el banco, < 5 % de `otro`
atribuidos al portador, sin pérdida de turnos frente a F1.

### F3 · Gatekeeper con atribución

1. El prompt ya envía `relation`; ajustar el texto del sistema para usarla: pregunta de `otro` al
   portador favorece `assist`; `wait` solo si quien está a mitad de frase es el interlocutor.
2. Regla determinista previa al LLM (en el prefiltro o en el engine): si el episodio no tiene
   portador y otro durante N s, no evaluar → evita llamadas por TV/radio/monólogo. Configurable y
   apagada por defecto hasta medir.
3. Replay F0 con y sin relación: medir evaluaciones evitadas, ayudas útiles bloqueadas, `nada`
   observados y P50/P95.

Archivos: `gatekeeper.ts`, `conversation-prefilter.ts`, `conversation-episodes.ts`,
`scripts/gatekeeper-replay.cjs`, `tests/gatekeeper*.test.cjs`, `tests/conversation-episodes.test.cjs`.

Aceptación: menos llamadas a Hermes sin aumentar ayudas útiles bloqueadas respecto a la línea base.

### F4 · Hablantes de sesión A/B/C (opcional, según F3)

- Agrupado online en RAM de huellas `otro` (centroides con `SpeakerEmbeddings.runningMean`, umbral
  de unión ~0,70 a calibrar), máximo ~6 hablantes, borrado al terminar sesión.
- Ampliar `Relation` o añadir `speaker` estable (`otro-1`, `otro-2`) que el prompt pueda ver.
- Mantener estabilidad: un hablante nunca cambia de etiqueta dentro de un episodio.
- Solo se implanta si el replay muestra mejora del Gatekeeper frente a F3.

### F5 · Dirección de llegada con micrófonos (investigación, fuera de este plan)

Requiere modo extended del CFW (`mic_control`) y llevar bearing/beam de `app/apps/microphones/dsp.ts`
a la ruta de conversación, que hoy recibe mono. Señal fuerte para separar al portador, pero cambio
grande; evaluar aparte.

### Línea paralela · Modelo bilingüe castellano/catalán

No hay Whisper small afinado para ambos. Opción: fine-tuning LoRA de `openai/whisper-small` con
Common Voice es/ca (acento valenciano), `projecte-aina/corts_valencianes_asr_a`,
`BSC-LT/CAESAR-TINY` y clips propios; exportar a sherpa-onnx int8; evaluar con
`projecte-aina/commonvoice_benchmark_catalan_accents` y el banco F0. Independiente de F1–F4.

## Orden y dependencias

```
esperar commit de la otra sesión → F0 → F1 → F2 → F3 → (F4) ; F5 y modelo bilingüe en paralelo
```

## Fuera de alcance

Cambios de firmware, nuevos proveedores cloud, persistencia de audio, envío de vectores a Hermes,
activar Gatekeeper `active` por defecto.
