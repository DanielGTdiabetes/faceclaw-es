# Ahorro de llamadas a Hermes en la escucha continua · 10-10-2026

Claude Code, rama `ccr-1c613d47-jr1ovg` sobre `codex/conversation-detection-g0` @ `5ecb2e5` (S2.11).
Encargo del usuario: revisar a fondo la escucha continua para que sea lo más fiable posible y gaste lo
mínimo de créditos de `gpt-6-luna` en el puente Hermes (BMAX/Jarvis) **sin limitarla**.

La preparación inicial de Claude fue sin APK ni despliegue. **Actualización Codex, 10-10-2026:**
S2.12 instalada con firma original y medición desplegada en Jarvis; evidencia y reversión en §8.

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

## 7. Paso 1: solo medición (sin cambio de comportamiento ni despliegue)

Acordado con el usuario tras la revisión de las propuestas de Codex. `FACECLAW_CONV_REASONING_EFFORT`
sigue en `low` para tener una referencia limpia.

Móvil, «Métricas tras OFF»:
- `savings.resets`: reinicios de la espera por motivo (`question`, `hermes`, `wearer`, `message`,
  `silence`), contados solo cuando la espera era mayor de 5 s.
- `savings.pauseReleases`: envíos adelantados por 8 s de pausa.
- `savings.gapAtSend`: espera vigente en cada envío (5/10/20/40/60 s). `savings.interval`: tiempo real
  entre peticiones (media, máximo, p50/p95 por intervalos).
- `usage`: tokens que informa el puente (entrada, caché, salida, razonamiento, `promptChars`) y por cada
  «mensaje»: peticiones, tokens de entrada, de salida y totales. Con el puente actual queda a cero.

Puente (`conversation.py`, sin desplegar): cada línea `conv timing` añade `effort`, `primaryOutcome`
y `fallbackOutcome` (`ok`, `timeout`, `error`, `invalid`, `cancelled`), además de los tokens y
`promptChars` ya añadidos.

Resumen del journal: `integrations/hermes/conv_journal_summary.py`, solo biblioteca estándar.

```sh
journalctl -u faceclaw-hermes.service -o short-iso --since "2026-10-11 10:00" --until "2026-10-11 10:15" \
  | python3 conv_journal_summary.py --since 2026-10-11T10:00 --until 2026-10-11T10:15 --label "A conversación"
```

Opciones: `--json`, `--duration-min`, `--price-input/--price-cached/--price-output` (por millón).
Detecta si Hermes informa de la caché o del razonamiento fuera de entrada o salida. Con líneas del puente
actual (S2.11) ya da llamadas, resultados, respaldo y latencia, sin tokens: sirve como línea base hoy.

## 8. Despliegue S2.12 en este PC, Pixel y Jarvis — Codex, 10-10-2026

Autorización humana directa en este chat: pull conservando cambios, build e instalación con firma
original/`install -r`, despliegue de solo `conversation.py` mediante el helper, prueba conjunta de
2–3 min y commit/push. Orden seguido: repositorio → línea base S2.11 → APK → Jarvis → prueba mínima.
La batería A/B/C queda aplazada y requiere coordinación con el usuario.

### Repositorio y validación

- Checkout `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`; árbol inicial limpio.
  Pull fast-forward `5ecb2e5` → `2cae53c`, sin reset ni stash nuevo. Fuentes protegidas sin editar.
- `npm test` con acceso a sockets locales: **1095 correctas, 5 fallos, 1 omitida / 1101**. Cuatro
  fallos previos documentados (dos eventos de entrada y dos ajustes iOS/Android); quinto en
  `ios-config-scripts.test.cjs`, aserción de permisos POSIX `0600` en Windows. La primera ejecución
  aislada añadió dos fallos de sockets `EACCES`, resueltos al ejecutarla fuera del aislamiento.
- Python conversación/journal/memoria/bridge/daily-context: **68/68**. Desplegador: **4/4 en Linux**,
  sobre copia temporal del Git público, con servicios simulados; su aserción `0700/0600` no es
  aplicable a Windows. TypeScript app/pruebas y oxlint de los tres módulos modificados: correctos.
- Receta local adaptada `.tools/s2.12-build.ps1`, entorno `.tools/s2.10-env.ps1`; `ns prepare`
  producción y Gradle offline `assembleRelease lintVitalRelease`, sin reconstruir nativas: correctos.

### Línea base S2.11, obtenida antes de instalar o modificar el puente

Journal **de usuario**, `faceclaw-hermes.service`, 10-10-2026 **15:00–15:20 Europe/Madrid**,
procesado en `/tmp/faceclaw-conv-journal-summary-20261010.py`. Solo salida agregada; no se imprimió
texto de conversación. Ventana de 20 min, no equivale a 20 min de habla efectiva.

| Métrica | S2.11 |
|---|---:|
| Llamadas / proveedor / por hora de ventana | 63 / 63 / 189 |
| assess / assist | 26 / 37 |
| nada / tema / mensaje / incierto | 20 / 17 / 17 / 9 |
| Llamadas por mensaje | 3,7 |
| Inválidos / timeouts / errores / respaldos | 0 / 0 / 0 / 0 |
| Latencia total p50 / p95, ms | 1239 / 2155 |
| Latencia principal p50 / p95, ms | 1237 / 2154 |

Tokens, `promptChars` y esfuerzo **no registrados por S2.11**; los ceros del JSON no representan
consumo cero. Resumen local: `.tools/s2.12-baseline-user.json`. No se estimó coste monetario.

### APK instalada

- `com.faceclaw.app`, **0.8.2-es.5-conversation.s2.12-measurement / 805**.
- SHA-256 firmada y extraída: `f062cc3ceceb92ab2dc5199f5c6e70a81f74f3bc52d70baf173b33c30ec452a0`.
  Local: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.12-measurement.apk`.
  Unsigned: `d0055d9ca23bae8212b60384b3f7cdfd1dccd146fcf60d74f064b20c6c777431`.
- Certificado original verificado: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
  Ocho `.so` byte idénticas a la APK S2.11 extraída. Sin cambios Kotlin/nativos.
- OFF previo observado en UI y métricas: `enabled=false`, ambos `worker=false`, `busy=false`,
  `inputBufferedBytes=0`; ningún wakelock Faceclaw activo. Instalación `install -r` correcta,
  apertura/proceso estable y «Escucha apagada» comprobados después.
- **35 ajustes idénticos** antes/después, respaldo privado con ACL usuario/SYSTEM en
  `.tools/s2.12-measurement-private/`; sin contenido privado en Git ni chat. Sin leer/copiar el vector.
- Reversión fresca: `dist/conversation-g0/before-install-20261010-170550.apk`, S2.11,
  SHA-256 `28d24f8a8304dc7d8ab217e45d763db62b0311b40c6905e5c4027adc2d34517e`.
  Restaurar únicamente con Conversación OFF y `adb -s 61161FDCG0013L install -r <ruta>`.

### Jarvis

- Con OFF confirmado, candidato y helper en `/tmp/faceclaw-s2.12-tests-20261010/`.
  `--check` devolvió **`CHECK_OK live=417dc5c98ceb -> 5b9020d050a2`**, incluidos hashes fijos correctos.
- Aplicación: **`MEASUREMENT_APPLIED=TRUE ready_in=7.4s`**. Solo se reemplazó
  `/home/dani/faceclaw-hermes-bridge/conversation.py` y reinició `faceclaw-hermes.service`.
  SHA-256 final `5b9020d050a2704e924a0ae6387e6da3ec2da1d75668ff26ed80938da2a6db1a`.
- Respaldo: `/home/dani/faceclaw-hermes-bridge/rollback-20261010-measurement/conversation.py`,
  carpeta `700`, archivo `600`; hash original `417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc`.
- Helper comprobó puerto 8791, marcador `listening` y ausencia de `conversation unavailable`.
  Ambos servicios activos; `hermes-gateway.service` conservó PID **557095**.
- `bridge.py`, `daily_context.py` y `private.json`: hashes antes/después idénticos. Sin cambios de
  proveedor, credenciales ni unidad gateway. Proceso del puente sin override de
  `FACECLAW_CONV_REASONING_EFFORT`, efectivo **low** por defecto verificado.
- Reversión, con OFF: `python3 /tmp/faceclaw-s2.12-tests-20261010/scripts/deploy-hermes-measurement.py --rollback`.
  El helper queda también versionado en este repositorio para volver a copiarlo si se limpia `/tmp`.

### Prueba mínima conjunta

**No realizada:** solicitada a las 19:08 Europe/Madrid; el usuario respondió «Aún no puedo hacer la
prueba». Quedan pendientes la comprobación real de `inputTokens`, `cacheReadTokens`, `outputTokens`,
`reasoningTokens`, `promptChars` y `effort low`, la lectura móvil de `savings`/`usage` tras esa sesión,
y la observación de aportaciones en gafas. No se inició captura ni se hicieron llamadas reales por
el agente. Resumen posterior al despliegue desde 19:07: **0 llamadas**, por tanto no es una prueba
de registro de tokens ni evidencia de un problema con el journal. El journal de usuario sí contiene
la línea base S2.11 y los marcadores de arranque comprobados por el helper.

Cierre comprobado: móvil **Conectado / Escucha apagada**, sin wakelock Faceclaw activo. A/B/C
aplazada hasta otra prueba conjunta; no hay ahorro físico general ni coste por hora acreditados.
Notas de continuidad y copia compartida del NAS actualizadas; no se copiaron APKs ni ajustes
privados al NAS en esta entrega. Código y notas publicados en `codex/conversation-detection-g0`.
## 9. S2.13: retirada de «Escucha continua con filtros locales»

Decidido por el usuario el 10-10-2026, con S2.12 ya instalada por Codex. Motivos comprobados en el código:

- Con `assess` eliminado, la excepción de la ayuda inmediata tras `tema` ya no se daba: en ese modo todas
  las respuestas, preguntas incluidas, esperaban la cadencia fija de 20 s.
- Desactivaba la espera creciente (5→60 s), que gasta menos con TV o ruido de fondo (~78/h frente a
  hasta 180/h, con tope de 120/h) y responde antes en conversación.
- Venía **activado por defecto** (`mechanicalFilters = true`): un ON desde el interruptor de las gafas sin
  elegir modo usaba los filtros.
- Su tope de 120 llamadas/h pausaba Hermes hasta una hora: contrario a «sin limitarla».

Cambios: quedan dos modos en el móvil, el menú de sistema de las gafas y la app Conversación: «Escuchar con
Hermes» (con espera creciente) y «Solo transcribir». Retirados `mechanical-gatekeeper.ts`, su prueba, el
ajuste `conversationFiltersEnabled`, la sección «Filtros locales» de los ajustes y la entrada de su
diagnóstico. El estado de la tarjeta de ON solo muestra el aviso de VAD (`conversationVadStatus`); los avisos
de enlace con Hermes (`sin-red`, `revocado`) se conservan. Sin cambios en el puente ni en Kotlin.

No incluido, a decidir con datos: tope de seguridad alto en el modo sin límite (p. ej. 400/h), y si hace
falta evaluar durante habla continua sin pausas de 2 s (los filtros lo permitían a los 12 s; el modo sin
límite espera a una pausa, como antes).

Versión `0.8.2-es.5-conversation.s2.13-hermes-only`/805. Node 1088/1094 (4 fallos previos ajenos,
2 omitidas), TypeScript y oxlint correctos. Sin build Android en esta sesión.
