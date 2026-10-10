# Ahorro de llamadas a Hermes en la escucha continua · 10-10-2026

Claude Code, rama `ccr-1c613d47-jr1ovg` sobre `codex/conversation-detection-g0` @ `5ecb2e5` (S2.11).
Encargo del usuario: revisar a fondo la escucha continua para que sea lo más fiable posible y gaste lo
mínimo de créditos de `gpt-6-luna` en el puente Hermes (BMAX/Jarvis) **sin limitarla**.

Sin APK, sin instalación, sin despliegue en Jarvis y sin pruebas con proveedores reales.

## 1. Dónde se van los créditos

Cada evaluación es una llamada completa al modelo. No hay historial: se reenvía todo cada vez.

| Componente por llamada | Tamaño |
|---|---|
| `STYLE` de conversación (+ `DAILY_STYLE`) | 7121 caracteres, ~1800 tokens, idéntico en `assess` y `assist` |
| Contexto del episodio | hasta 12 turnos / 6000 caracteres, ~1500 tokens |
| Memoria diaria (opcional) | hasta 3 × 600 caracteres |
| Razonamiento | `effort: low` también para `assess`, que solo devuelve una etiqueta |

Cadencia antes de este cambio en «Escuchar con Hermes» (sin filtros, `maxRequests = null`):

- Una petición por cada revisión nueva del episodio en cuanto hay 2 s sin texto y han pasado 5 s desde
  la anterior. Con Whisper local cada ventana de 2–12 s es un turno: ~1 llamada cada 6 s si se habla.
- `assess` y luego `assist` al abrir cada episodio: dos llamadas secuenciales antes de la primera
  respuesta.
- Un «vale» o «sí, sí» bastaba para reenviar los 12 turnos completos.
- Ninguna reducción cuando Hermes no participa. Evidencia previa en estas notas: TV a 2 m, 21 llamadas
  en 4 min con 18 `nada`; S2.8, 38 ayudas con 37 `nada`; journal del 10-10, 75 `assist/nada` seguidos
  sin aportación. Ese es el gasto que crece con las horas de escucha: TV, radio, gente hablando entre
  sí sin dar pie.

Estimación con la cadencia antigua: ~600 llamadas/h hablando sin pausa, ~300/h con conversación normal.
A ~3300 tokens de entrada por llamada son 1–2 M de tokens de entrada por hora. **Estimación, no
medida**: el puente no registraba tokens de `conv` (sí los del chat).

## 2. Cambios implementados

### Móvil (`app/conversation-detection/`)

1. **Enfriamiento adaptativo** (`conversation-hermes.ts`, solo escucha manual sin tope y sin filtros).
   Tras resultados sin aportación (`nada`, cortesía, incierto, fallo o caducidad), el intervalo mínimo
   crece 5 → 10 → 20 → 40 → 60 s (tope: al menos una evaluación por minuto de habla continua).
   Vuelve a 5 s **al instante** cuando:
   - llega una aportación válida de Hermes,
   - hay una pregunta (`¿`/`?` o arranque interrogativo en castellano/catalán, por si Whisper omite
     la puntuación),
   - alguien nombra a Hermes,
   - habla el portador (perfil de voz reconocido),
   - hay 30 s sin voz (empieza otro intercambio).
   El enfriamiento solo actúa **mientras se sigue hablando**: tras 8 s de pausa se evalúa lo retenido.
   Una pausa es justo cuando encaja una aportación, y así nunca se pierde contexto por el cierre del
   episodio a los 30 s de silencio. No se descarta nada oído: la siguiente petición lleva todo el
   contexto acotado (12 turnos).
2. **Muletillas solo como contexto.** Si lo nuevo desde la última petición tiene menos de 3 palabras y
   no es una pregunta («vale», «sí, sí», «ajá»), no se llama: se queda en el contexto de la siguiente.
3. **Ayuda directa en identidad opcional** (`conversation-episodes.ts: promote()`). En la escucha
   manual con conv/2 ya no se envía `assess` antes de `assist`. Ahorra una llamada por episodio y un
   viaje de ida y vuelta (1–3 s) antes de la primera respuesta. El prompt de `assist` ya se abstiene
   ante saludos y cortesías. Identidad requerida (puentes conv/1, sesiones de diagnóstico) conserva
   `assess`.
4. **Contadores visibles** en «Métricas tras OFF» → `savings`: `short`, `backoff`, `directAssist`
   (`assess` evitados), `quiet` y `gapMs` actuales. Sin texto.
5. Texto del botón: «Escuchar con Hermes sin límite de llamadas», con una línea que explica el
   espaciado adaptativo.

No cambia: filtro de llamadas (`mechanical-gatekeeper.ts`, 20 s/120 por hora), sesiones de diagnóstico
con presupuesto finito, contrato del protocolo, captura, VAD ni ASR.

Simulación sintética (prueba nueva): 10 min de TV con un turno cada 3 s y Hermes siempre en `nada`.
Antes ~100 peticiones, ahora **13** (−87 %). En conversación real el ahorro depende de cuántas veces
Hermes aporta. Con aportaciones frecuentes, el ritmo apenas cambia: ese es el objetivo.

### Puente (`integrations/hermes/conversation.py`) — **no desplegado**

1. Cada petición `conv` registra en `conv timing` sus tokens: `inputTokens`, `cacheReadTokens`,
   `outputTokens`, `reasoningTokens` y `promptChars`. Solo números, como el chat. Permite medir el
   coste real por hora en el journal y comprobar si la caché de prompts funciona.
2. `FACECLAW_CONV_REASONING_EFFORT` (`none|minimal|low|medium|high`, por defecto `low`, valor actual):
   permite bajar el razonamiento pagado de la conversación sin tocar el chat. Probar `minimal` solo
   después de medir y si el proveedor lo admite para `gpt-6-luna` (**no verificado**).

Despliegue: los helpers `scripts/deploy-hermes-*.py` fijan hashes históricos de `conversation.py`. Hace
falta uno nuevo para esta fuente o una copia manual reversible con respaldo, con autorización del
usuario. El móvil funciona igual con el puente actual: los campos nuevos de `timing` son aditivos y el
cliente los ignora.

## 3. Errores encontrados

| Error | Estado |
|---|---|
| `tests/conversation-local-speakers.test.cjs` importaba `gatekeeper.ts`, retirado en S2.10: el archivo entero fallaba y ocultaba 5 pruebas válidas | Corregido: retirada solo la prueba del prompt del Gatekeeper |
| Riesgo de diseño detectado al implementar: con esperas largas, un silencio de 30 s cerraba el episodio y se perdía lo retenido | Evitado con la liberación tras 8 s de pausa, con prueba |
| La ayuda inmediata tras `tema` quedaba retenida por el propio intervalo | Exceptuada (`followUp`), con prueba |
| 4 fallos previos ajenos (eventos de entrada, ajustes del asistente iOS/Android) | Sin cambios, iguales en `5ecb2e5` |

## 4. Recomendaciones no implementadas, por impacto

1. **Medir antes de seguir.** Desplegar el registro de tokens y hacer una sesión de 30 min (conversación
   y TV). Sin esa cifra, cualquier ajuste del prompt es a ciegas.
2. **Caché de prompts.** `STYLE` es constante y supera 1024 tokens: si va primero y sin datos variables
   (fecha, IDs), el proveedor puede cobrar la parte cacheada mucho más barata. Comprobar
   `cacheReadTokens > 0` en el journal. Si sale 0, revisar cómo construye Hermes el prompt de sistema
   (`ephemeral_system_prompt`). **No verificado** desde aquí: el código de Hermes no está en el repo.
3. **Prompt de `assess` corto.** Donde siga habiendo `assess` (identidad requerida), usar un prompt de
   ~200 tokens en vez del `STYLE` completo y `effort` mínimo. Requiere despliegue.
4. **Modelo barato solo para descartar**: ya descartado por el usuario (sin clasificador de pago) y
   sin LLM local viable en el N5095A sin AVX. Queda fuera.
5. **Respaldo OpenRouter**: un `timeout` del principal a los 6 s ya está facturado y luego se paga el
   respaldo. Vigilar `fallbackReason=timeout` en el journal; si es frecuente, subir `PRIMARY_SECONDS`
   cuesta menos que pagar dos veces.

## 5. Validación

- Node completo: 1093/1099 correctas, 4 fallos previos ajenos, 2 omitidas. Conversación incluida.
- Pruebas nuevas: escalera 5/10/20/40/60 s con habla continua, liberación por pausa, reinicio por
  pregunta/Hermes/portador/aportación/silencio, muletillas retenidas sin perderse, 10 min de TV,
  sesiones finitas sin enfriamiento.
- Python: 62 pruebas de conversación/memoria/fallback/bridge, `test_bridge.py` correcto, 2 nuevas
  (tokens por petición, esfuerzo configurable).
- TypeScript de la app y de pruebas, oxlint: correctos.
- Sin build Android ni prueba física.

## 6. Pendiente

1. Build e instalación de la APK con firma original (Windows, `install-conversation-g0.ps1`).
2. Prueba física: una conversación con preguntas, otra sin preguntas y 10 min de TV. Comparar
   `savings` y peticiones por minuto con S2.11.
3. Despliegue reversible del registro de tokens en Jarvis y lectura del journal.
4. Con los datos: decidir si retirar «Escucha continua con filtros locales». El enfriamiento adaptativo
   cubre el ahorro sin su cadencia fija de 20 s, que retrasaba respuestas.
