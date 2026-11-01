# Gatekeeper delante de Hermes: evaluación y primera fase · 10-10-2026

**Decisión posterior del usuario, 10-10-2026:** eliminar shadow y probar directamente con Hermes.
[S2.8: interfaz integrada, botón de escucha con Gatekeeper y evidencia](conversacion-integrada-s2.8-2026-10-10.md).
ACTIVE se ofrece como inicio explícito; shadow se elimina del código de ejecución y la UI. Se conservan
prioridad/cancelación/bypass y resultados desfavorables del replay. No hay ahorro validado; LFM
puede superar el deadline y activar bypass. Gemini Nano sigue fuera del camino principal.

La evaluación inferior conserva el diseño y los criterios originales como **historial**; sus requisitos
de shadow previo/ACTIVE oculto quedan reemplazados por esta decisión. No son nuevas barreras de aprobación.

Referencias: [auditoría](auditoria-conversaciones-continuas-2026-10-09.md),
[revisión S2.6.13-r2](revision-codex-s2.6.13-2026-10-10.md) y
[entrega inicial](gatekeeper-fase-inicial-2026-10-10.md). La última instalación documentada sigue siendo
S2.7 (firma original, 35 ajustes idénticos). El ensayo humano a unos dos metros continúa pendiente; medium CPU/4 hilos no sostiene el
salto de tres segundos en el benchmark existente. No atribuir a este incremento mejoras acústicas.

## Valor que se debe demostrar

El filtro debe estudiar **cada assess y cada assist** de un episodio activo, incluido el assist inmediato
tras un veredicto tema. Sustituir únicamente assess dejaría fuera gran parte del posible ahorro.
La sesión de 81,797 s tuvo 2 assess y 10 assist, diez nada y cero mensajes: evitar todos los assist
habría supuesto como techo retrospectivo 10/12 solicitudes (83,3 %), no ahorro predictivo demostrado
ni el mismo porcentaje de tokens/cuota.

**Nada no equivale a llamada inútil:** conversation.py admite memoryUpdate válido también con nada.
Hermes puede aportar un recuerdo sin mostrar mensaje y puede aprovechar memoria que el filtro no conoce.
Medir por separado ahorro, pérdida de ayudas útiles y pérdida de memoria. No resolver este problema
introduciendo por defecto otra llamada LLM para guardar cada fragmento filtrado.

La comparación justa incluye reglas deterministas solas, Hermes actual completo (assess + assist),
modelo pequeño local y modelo cloud pequeño fijo. El coste cloud del filtro más las llamadas restantes
debe ser menor que la baseline. Registrar intentos, fallbacks y tokens cuando estén disponibles; no
confundir número de solicitudes conv con llamadas físicas al proveedor.

## Orden original de evaluación (histórico; shadow retirado por el usuario)

1. Captación del interlocutor a ~2 m y fiabilidad/cobertura de Whisper. Sigue siendo la prioridad.
2. Mejoras deterministas independientes del Gatekeeper, conservadoras y medibles.
3. Dataset/replay temporal etiquetado, revisión humana y referencia real.
4. Comparar Hermes actual, llama.cpp pequeño y cloud pequeño con configuración versionada.
5. Mejor candidato a shadow real: no bloquea ni retrasa lógicamente las peticiones actuales.
6. Valorar ACTIVE únicamente con evidencia de utilidad, memoria, latencia y convivencia física.

Preparar herramientas offline no valida ni sustituye el primer punto. No se inicia una captura,
descarga de pesos, inferencia en Pixel, llamada cloud, reinstalación o ensayo humano como efecto de
ejecutar el replay. La prueba aislada de Nano es opcional y no bloquea ninguna de estas fases.

## G-1: cambios deterministas implementados

conversation-prefilter.ts se aplica dentro del tracker después de validar stream, secuencia,
identidad, motor y fronteras. Usa sólo el buffer acotado del episodio en RAM.

- Descarta texto compuesto exclusivamente de puntuación/espacios.
- Deduplica texto igual tras normalizar espacios/mayúsculas, sólo con el mismo intervalo exacto de
  audio, fuente, hablante, relación y versión. Conserva cifras, acentos, negaciones y puntuación.
- Conserva frases repetidas en otro tramo y ventanas Whisper meramente solapadas. Su igualdad textual
  no prueba que sean reenvíos. Sin similitud difusa ni lista de frases prohibidas.
- Sin mínimo de palabras: «¿Cuánto?», «No, quince» y preguntas breves siguen siendo evidencia.
- Mantiene 2 s sin texto nuevo, 5 s entre solicitudes y una evaluación en vuelo; conserva el assist
  inmediato posterior a assess. No añade cooldown de cues sin medir su efecto.
- Un descarte no incrementa revisión ni renueva la vida del episodio; tampoco cancela una evaluación
  útil en vuelo. Frontera/OFF/identidad conservan precedencia.
- Diagnóstico agregado prefilter.empty/duplicate sin contenido. Se conserva tras OFF hasta ON;
  no persiste texto ni añade timers, modelos o red.

Estas reglas no intentan predecir nada ni descartan hechos nuevos para memoria. El ahorro real puede
ser pequeño; se medirá. No se afirma que resuelvan las repeticiones parciales de Whisper o su cobertura.

## G-2: replay implementado, primera medición física

scripts/gatekeeper-replay.cjs puntúa predicciones externas por ID y modo, con contexto temporal.
tests/fixtures/gatekeeper/pilot.jsonl contiene 48 candidatos sintéticos/23 episodios, castellano y
algo de valenciano. Todas las etiquetas son propuestas **pendientes de revisión humana**. Ampliar a
150–300 casos útiles y separar episodios de desarrollo/evaluación; no fabricar variantes para aparentar
cobertura ni repartir versiones del mismo episodio entre particiones.

El modo por defecto sólo valida el dataset; --baseline-pass es un control dejar pasar todo, no Hermes.
El evaluador no genera predicciones, no ejecuta providers y no simula todavía la evolución completa
contrafactual de episodios/memoria/WAIT. Ver el [contrato y comandos](../tests/fixtures/gatekeeper/README.md).
El móvil ya ejecuta el mismo provider real sobre el piloto y exporta predicciones sintéticas.
[Primer resultado Qwen0.6B Q8](../evaluations/gatekeeper/2026-10-10/README.md): 48/48, 0 fallos de
formato, P50/P95 3002/3172 ms, 43 IGNORE/5 ASSIST. Solo 4/36 ASSIST provisionales pasan;
configuración rechazada para ACTIVE. No equivale a recall humano ni ahorro real de Hermes.

Informe: assess/assist evitables, nada observados, ayudas útiles bloqueadas, recall, WAIT pendiente,
bypass, memoria y P50/P95 de las latencias aportadas por el productor. Sin positivos útiles medidos,
recall útil = null. CPU/RAM/temperatura/interferencia/cuota = null hasta medirlas físicamente.
Las referencias medidas se aportan aparte: no convertir anotaciones en supuestas respuestas de Hermes.

## Providers locales candidatos, no validados

Qwen3-4B no es la baseline local aceptada para el Gatekeeper. Comparar primero:

| Modelo | Configuración inicial a comparar | Estado |
| --- | --- | --- |
| Qwen3-0.6B | GGUF Q8, pensamiento desactivado en plantilla | Primera prueba desfavorable |
| Qwen3-1.7B | GGUF Q8 registrado, explorar Q4/Q5 si justificado | Sin medir |
| LFM2.5-1.2B-Instruct | GGUF Q4_K_M | 48/48: 47 ASSIST, 1 IGNORE erróneo provisional; P50/P95 4645/7940 ms, no apto para ACTIVE |
| Qwen2.5-1.5B-Instruct | GGUF Q4_K_M | Sin medir |

Castellano conversacional, clasificación, latencia y consumo se prueban en este dataset y luego con
Whisper en el Pixel. Un benchmark de otro móvil no acredita convivencia en Tensor G5. Fijar GGUF/hash,
llama.cpp, plantilla, gramática, contexto, hilos, cuantización, sampling y warm/cold. Una salida mínima
con enums limita tokens, pero el prefill del contexto puede dominar el tiempo. Mantener pesos cargados
reduce carga inicial y retiene RAM; no garantiza consumo razonable.

Fuentes oficiales consultadas en el estudio del 09-10:
[Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B),
[Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B),
[LFM2.5](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct),
[Qwen2.5-1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct).

## Runner, prioridad y contrato implementados; validación física pendiente

Prioridad obligatoria: **Hey Even / interacción explícita > Gatekeeper**. Solicitar cancelación inmediata,
invalidar callbacks/colas del filtro y medir el tiempo físico de cesión, incluido prefill/carga.
El nuevo runner del filtro es independiente del asistente explícito: executor background, batch32,
1 hilo CPU, pool sin spinning residente, cancelación por epoch desde antes de cargar y callbacks
de aborto de compute/progreso de carga. Se solicita inmediatamente, pero mmap/IO/context init entre
callbacks no garantizan cesión instantánea. Hay que medirla físicamente antes de aceptar ACTIVE.

GBNF se aplica desde el primer token y falla si no se crea. Es una ruta propia, separada de la
gramática lazy de herramientas del asistente explícito.
Fallo de gramática/parsing/plazo produce bypass. JSON correcto no acredita clasificación correcta.
No aceptar instrucciones libres del modelo ni confiar en confidence autodeclarada sin calibración.
[GBNF oficial](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md).

Entrada actual: modo assess/assist, EpisodeRef/revisión, sentThroughSeq y contexto acotados,
política de memoria explícita. No se comparte por ahora historial de ayudas con el filtro.
Texto ambiental siempre no confiable. En OFF no instanciar
provider. Shadow sólo observa las oportunidades reales de petición, también el assist inmediato.
IGNORE en un episodio activo no lo cierra ni descarta automáticamente el contexto.
ASSIST permite la ruta actual; no confirma por sí solo una candidata como tema. Sustituir assess exige
definir esa transición por separado; no equiparar globalmente ignore/cortesia y wait/incierto.

Un slot en vuelo y como máximo un candidato reciente pendiente; no reiniciar por cada palabra.
Preservar epochs, stream, identidad, episodio y revisión. OFF e interacción explícita invalidan trabajo
pendiente. Recuperación/red no reactivan sesiones apagadas.

## WAIT y fallos: implementados, eficacia pendiente

WAIT mientras el interlocutor parece continuar, con presupuesto absoluto acotado que no se reinicia
indefinidamente con cada fragmento. Al agotarlo, una única reevaluación con el fragmento completo.
Si falla, reglas conservadoras y ASSIST ante duda. Medir demora total, ayudas perdidas y espera
innecesaria frente a los 2 s actuales. Si WAIT no mejora esa baseline, eliminarlo: IGNORE/ASSIST.

Circuit breaker ante fallos repetidos, bypass temporal al flujo original y cooldown configurable de
2–5 min. Después, una prueba de salud bajo carga representativa, subordinada a interacción explícita;
si pasa, recuperación automática, y si falla, reabrir el circuito. No reintentar cada fragmento, no
degradar permanentemente hasta la siguiente sesión y no contar cancelación por prioridad como avería.
El bypass mantiene assess en candidata y assist en activa, sin promocionar temas ficticios.

## Diseño histórico de shadow y criterios de calidad (shadow retirado)

Medir especialmente assist evitables y cuántos fueron nada; bloqueos de mensajes realmente útiles;
recall de intervenciones útiles con denominador y casos de duda; actualizaciones de memoria que se
perderían; P50/P95 incluyendo cola, prefill y WAIT; cold/warm; CPU/RAM/temperatura/consumo; cancelación
y efecto sobre Hey Even; cobertura, ventanas descartadas y latencia de Whisper.

Hermes conserva el flujo lógico en shadow, pero el filtro sí puede interferir físicamente por carga.
Comparar Whisper solo y Whisper + shadow con la misma configuración y condiciones. No dar por
aprobado ACTIVE sólo por cero falsos negativos en una sesión sin mensajes útiles. Fijar criterios
con la baseline y suficientes positivos revisados; ningún porcentaje del piloto demuestra seguridad.

## Gemini Nano: investigación tecnológica aislada

Fuera de los providers de Conversaciones, del benchmark principal y de la ruta hacia ACTIVE.
Google documenta BACKGROUND_USE_BLOCKED también desde foreground services:
[restricciones ML Kit GenAI](https://developers.google.com/ml-kit/genai).
Si se estudia, usar un APK aislado para foreground/background/pantalla apagada, disponibilidad,
warmup/latencia y cuotas. Un resultado favorable no lo incorpora automáticamente a Conversaciones;
requeriría otro estudio. No se crea esa sonda en esta fase.
