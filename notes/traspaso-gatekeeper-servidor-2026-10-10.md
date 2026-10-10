# Traspaso: Gatekeeper en el servidor (plan B) · 10-10-2026

Punto de partida para continuar en una conversación nueva. Estado del código: rama
`codex/conversation-detection-g0`, APK S2.9 instalada (`0.8.2-es.5-conversation.s2.9-speakers`, última
compilación `bfdabfb4…d540`). Antecedentes: [implantación S2.9](whisper-hablantes-gatekeeper-implantacion-2026-10-10.md).

## Por qué cambiar de enfoque

El Gatekeeper local (llama.cpp en el Pixel) no es viable:

| LFM2.5 1,2B Q4 en el Pixel, 48 casos sintéticos | p50 | p95 | «ignore» |
|---|---|---|---|
| 1 hilo, prioridad background, lotes 32 | 4645 ms | 7940 ms | 1/48 |
| 2 hilos (límite oculto en runner y C++) | 4302 ms | 5140 ms | 0/27 |
| 3 hilos, prioridad por defecto, lotes 128 | 3853 ms | 4919 ms | 1/48 |

- El plazo operativo es 1500 ms (caliente) / 8000 ms (frío): en vivo todo acaba en bypass. Sesión
  real revisada por Codex: 69 peticiones, 0 evitadas, 68 bypass, 5 timeouts, circuito abierto.
- ~11 s de CPU por decisión: el prellenado del prompt domina; más hilos no lo arreglan.
- LFM casi nunca dice «ignore» (ahorro ≈ 0 % aunque fuera instantáneo). Qwen3 0,6B (p50 3002 ms con
  1 hilo) se va al extremo contrario: 43/48 «ignore».
- Compite con Whisper small (4 hilos) por la CPU y gasta batería.

## Propuesta B

Clasificar en el puente de Hermes (`integrations/hermes/conversation.py`, servidor Jarvis/BMAX), justo
antes de llamar al agente caro, con un modelo pequeño y rápido en servidor:
- Opciones de modelo: llama-server del PC (Qwen3.6-35B, ~211 tok/s, `localhost:8080` en el PC — habría
  que exponerlo a Jarvis por la red local/Tailscale) o un modelo pequeño junto al puente. Decidir con el
  usuario según disponibilidad (el PC no siempre está encendido) → necesita **fallback**: sin clasificador,
  pasar directamente a Hermes (comportamiento actual).
- Reutilizar del móvil: gramática/JSON `{"action","reason"}`, `parseGatekeeperDecision`, el prompt con
  `speaker`/`relation` (`app/conversation-detection/gatekeeper.ts`), el replay
  (`scripts/gatekeeper-replay.cjs`, fixtures `pilot.jsonl` + `speakers.jsonl`) y las métricas de ahorro.
- Medir antes de activar: latencia p50/p95 y decisiones sobre los 60 casos sintéticos, y una sesión real
  comparando llamadas evitadas, ayudas útiles bloqueadas y abstenciones `nada` de Hermes.
- En el móvil: dejar el Gatekeeper local como opción experimental o retirarlo; el modo «Escucha
  continua con Gatekeeper» pasaría a pedir el filtrado al servidor (capacidad nueva en el handshake,
  p. ej. `conv/gatekeeper/1`, con el patrón de capacidades de `conv/daily-context/1`).
- Despliegue al servidor con un helper reversible propio (los helpers antiguos fijan hashes históricos;
  ver `integrations/hermes/README.md`). Hermes MCP no conectaba en esta sesión.

## Fallos detectados por el camino

| Fallo | Estado |
|---|---|
| Hilos del Gatekeeper limitados a 1–2 y prioridad background (núcleos pequeños) | Corregido (`dc6680b`), no basta |
| Escucha continua cortada a los 20 min | Corregido: sin límite (seguridad nativa 24 h) |
| Texto «Máximo 20 min» en la pantalla de Conversación | Corregido en esta entrega |
| El progreso de la prueba sin audio no se veía; parecía que no hacía nada | Corregido: se muestra bajo Gatekeeper mientras corre |
| La prueba sin audio se cancela si se apaga la pantalla (se cierra la vista) | Documentado; se avisa «Mantén la pantalla encendida» |
| Test Python de estilo de Hermes desfasado tras el estilo participativo | Corregido; `conversation.py` participativo incluido en el commit |
| **En reposo no se ven las respuestas en las gafas (o se para la escucha)** | **Abierto.** App exenta de Doze (lista blanca, bucket 5) y captura con wakelock; la presentación en gafas no depende de la pantalla del móvil. Falta reproducirlo con `adb logcat` en vivo y leer «Lentes Hermes» (presented/woke/refused) en «Métricas tras OFF» |

Pendientes de S2.9 sin relación con B: clips reales para `scripts/asr-score.cjs` (WER y atribución),
calibrar umbrales de voz 0,80/0,60/0,70 y comparar `pause-2-12` con `ref-6-3` en el Pixel.

`integrations/hermes/conversation.py` (estilo participativo de la otra sesión) **no está desplegado**
por esta sesión: confirmar el estado de Jarvis antes de desplegar nada.

## Prompt para la conversación nueva

> Continúa el plan B de Faceclaw: mover el Gatekeeper al servidor. Lee primero
> `notes/traspaso-gatekeeper-servidor-2026-10-10.md` y `notes/whisper-hablantes-gatekeeper-implantacion-2026-10-10.md`.
> Rama `codex/conversation-detection-g0`. Diseña con el replay sintético antes de tocar el puente,
> propón dónde corre el modelo (PC con llama-server o junto a Hermes en Jarvis) y con qué fallback, y
> mide latencia y decisiones antes de desplegar. Aparte, queda abierto el fallo de «en reposo no se
> ven las respuestas en las gafas»: reprodúcelo con el móvil conectado por ADB y log en vivo.
