# Gatekeeper S2.7 — implantación y evidencia · 10-10-2026

Estado: instalada versión experimental corregida, **Conversaciones OFF y Gatekeeper OFF**.
ACTIVE implementado internamente para pruebas, sin entrada en la UI y sin validación de uso real.
Autorización del usuario: «implantarlo todo»; conserva el orden audio/Whisper → reglas → replay →
comparación → shadow → valorar ACTIVE. Gemini Nano queda como investigación aislada.

## Instalación y corrección de arranque

- Pixel 10 Pro Fold, com.faceclaw.app/805, versión0.8.2-es.5-conversation.s2.7-gatekeeper-shadow.
- APK revisión 3 SHA256: 5f0b6a5c37668cbc9b7c93685bee884c9eb6be0c131ddbdc0db80bae73306d83.
  Extraída después e idéntica. Certificado original57aaa887…c435; install-r, sin desinstalar.
-35ajustes privados idénticos antes/después(SHA d1ee861b…af95), perfil guardado/Conectado/OFF en UI.
  No se leyó/exportó el vector ni se tocó firmware/Wear/proveedores/GPS.
- Runtime package.json idéntico(70f23257…b647),6nativas idénticas; solo cambia libfaceclaw_llama.so
  e8800a3083b2790fcf61bed7cc5e1ca6cd4c5854187a0a623be508f11e38f2b9.
- Reversión fresca:S2.6.13 c99eacf4…362b,
  dist/conversation-g0/before-install-20261010-040243.apk; conservar datos con install-r.
- Primera candidataff6a30a5…7d45 falló al arrancar:V8Android sin ICU rechazaba dos literales
  de propiedades Unicode en prefiltro/fallback. Usuario y logcat confirmaron. Se restauró S2.6.13,
  verificaron arranque/ajustes y reemplazaron ambos usos por lista explícita conservadora compartida.
  Después se recompiló/firmó/instaló y comprobó arranque real. No distribuir primera candidata.
  Las pruebas Node no acreditan compatibilidad de sintaxis del V8Android.
- Instalador ahora abre actividad y comprueba proceso durante5s; no sustituye UI/OFF/ajustes.
- Revisión 3: el diagnóstico lee `analysis.engine`, donde Kotlin publica el modelo ASR real,
  también tras OFF. Antes buscaba el campo en la raíz y podía devolver null. No cambia decodificación.
  Replay registra `completed/priority/capture/cancelled`; no atribuir cancelaciones sin motivo medido.
  Reversión adicional: `dist/conversation-g0/before-install-20261010-043321.apk`, revisión 2 `5d6525de…a7b3`.

## Implementado

- Prefiltro conservador de vacío/puntuación y reenvío exacto del mismo intervalo/origen/identidad;
  conserva palabras breves, cantidades, negaciones, acentos y ventanas solapadas de Whisper.
  Cadencia basal existente2s silencio/5s solicitudes conservada; no hay filtro semántico determinista.
- Núcleo puro:GBNF desde token0/JSON cerrado, epochs, un trabajo en vuelo, timeout warm1,5s/cold8s
  provisionales,3fallos→bypass180s, siguiente candidato real como sonda, recuperación automática.
  Cooldown configurable solo2–5min. Cancelación por prioridad no se cuenta como fallo.
- Todas las oportunidades assess/assist pasan por el punto de evaluación, incluido assist inmediato.
  SHADOW envía contexto/cadencia basal a Hermes sin esperar al filtro. ACTIVE revalida episodio/revisión,
  nunca promueve una candidata como tema por sí solo ni cierra episodios al devolver IGNORE.
- WAIT opcional/inicialmenteOFF:continúa acumulando,2s de silencio o4s/límite de contexto→una única
  reevaluación completa; ante fallo reglas conservadoras/ASSIST en duda. Sin resultado final no cuenta ahorro.
- Memoria:ACTIVE hace bypass de IGNORE si memoria diaria activada hasta evidencia específica.
  Shadow correlaciona decisiones/resultados por referencias acotadas a64, sin almacenar voz/texto.
- Runner propio independiente del asistente explícito:executor Android background,CPU1hilo/1–2máximo,
  contexto4096,batch32,pool poll0/park entre llamadas,KV eliminado tras cada llamada,pesos residentes
  durante opt-in. Cancelación nativa por epoch antes de carga/progresscallback/computeabortcallback.
  Solicitud inmediata no demuestra cesión física instantánea:mmap/IO/contextinit entre callbacks pendientes.
- Modelos oficiales/hash/tamaño registrados:Qwen3 0.6B Q8,LFM2.5 1.2B Q4_K_M,Qwen2.5 1.5B Q4_K_M,
  Qwen3 1.7B Q8. No Qwen4B para filtro; asistente explícito intacto. Descarga solo explícita/hash/resumible.
- UI:OFF/shadow,modelo/descarga,WAIT,benchmark sin audio,métricas. Selecciones RAM congeladas duranteON;
  abrir/restaurar no inicia captura ni filtro. El benchmark cancela ante captura/HeyEven.
- Replay:mismo provider real,48ejemplos sintéticos del piloto generado por sync-gatekeeper-pilot.cjs.
  Exporta solo IDs/acciones/latencia/recursos. Medición30/45s warm/cold,no deadline operativo aceptado.
- Métricas:assist evitables/nada/mensajes bloqueados,recall proxy Hermes,memoria perdida/desconocida,
  fallos/bypasses/cancelaciones/WAIT,P50/P95 por histogramas,CPU total proceso durante llamadas,PSS,
  temperatura de batería/thermalstatus(no temperaturaCPU). Deltas Whisper por época/modelo solo durante
  inferencia:calls/totalMs/drops/busyAlInicio. Requiere baseline para inferir degradación causal.

## Prueba TV/Whisper

Usuario confirma texto bastante correcto yOFF; inicialmente recuerda small, después corrige que era
base. Selector y diagnóstico nativo coinciden:whisper-base,threads4/CPU/default,Auto/Solo texto,
GatekeeperOFF. No evidencia de fallo del selector. Prueba guiada TVa~2m,no interlocutor humano real.

116200msaudio,37ventanas ref-6-3,decodeTotal22961ms/media620,6ms/máximo897ms;0ventanas descartadas,
0errores decode/processing;32accepted/31delivered,5abstenciones por idioma otro. Cobertura114000ms;
5200msfinales interrumpidos porOFF(incluyen solape,no pérdida disjunta). Captura2324paquetes,
0missing/duplicates/queue/PCM drops,gapmáximo106ms,0clippedSamples.

Señal muy baja:34/37ventanas loud<-60dBFS,3entre-60/-50; ganancia media23dB/máxima27.
VADenergético solo110mspositivos/0episodios pero ASR por ventanas entrega texto: no usar ese VAD
para eliminar audio lejano. Distancia/precisión cuantitativas no medidas. No se almacenó/exportó audio
ni transcripción. Snapshot de participaciónOFF no carga perfil:sin-perfil allí no implica archivo ausente;
UI perfil guardado comprobada independientemente.

## Primer benchmark y límites

[Resultados reproducibles](../evaluations/gatekeeper/2026-10-10/README.md):Qwen0.6BQ8 completa48/48,
0fallos de formato,P50/P953002/3172ms;43IGNORE/5ASSIST/0WAIT. Solo4/36ASSIST provisionales pasan,
incluidas preguntas claras bloqueadas. Configuración rechazada paraACTIVE,sin extrapolar a otros prompts
/modelos. Todas las etiquetas siguen pending; sin referencias Hermes no hay recall útil/ahorro demostrado.
PSS máximo proceso2137159KiB,CPU142958ms,batería33,1°C,thermalstatus0. No Whisper concurrente;
proceso había usado base antes,por lo que no atribuir toda la memoria al filtro. QwenSHA9465e63a…b031
verificado enPixel. LFM2.5 Q4 descargado y hash oficial verificado: `b1b3de11…b4f5`.
Primera prueba LFM interrumpida tras 26/48, sin errores de formato, todos ASSIST y latencias
aproximadas de 4–5 s. Usuario confirma que solo apagó/bloqueó pantalla, sin interacción explícita.
La causa no quedó instrumentada: no demuestra preempción de Hey Even. La repetición en revisión 3
termina 48/48, `stopReason: completed`, sin errores: 47 ASSIST/1 IGNORE. P50/P95 4645/7940ms,
primera llamada5165ms; las47warm superan1500ms. Solo bloquea pilot-044, etiquetado ASSIST provisional:
no aporta reducción útil demostrada. CPU263308ms, PSS1879535KiB, batería35,3°C, thermalstatus0.
Configuración tampoco apta paraACTIVE. Otros candidatos todavía sin medir. No comparar PSS como
memoria exclusiva de los modelos: LFM se midió tras reiniciar, base seleccionado pero sin captura.

## Puente y validación

Solo conversation.py añade memoryUpdated:bool con retorno REAL de remember,incluso para nada.
No sale texto de memoria en ese campo; puentes antiguos quedan unknown/clientes antiguos lo ignoran.
Auto-review bloqueó copia inicial por falta de autorización específica; no se eludió. Usuario autorizó
expresamente copia/pruebas/despliegue en dani@192.168.0.234.64pruebas candidatas pasan con proveedores
simulados en Python real de Hermes; aplicado SHA8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868.
bridge.py e285abf6…bb5/daily_context.py5702985a…bf7 intactos. faceclaw-hermes.service y
hermes-gateway.service activos. Consulta al nombre inexistente faceclaw-hermes-gateway daba inactive;
verificado el nombre real,no reiniciado. Sin llamadas API reales/cambios proveedor/credenciales/SQLite.
Respaldo ~/faceclaw-hermes-bridge/rollback-20261010-gatekeeper-metrics/700 y archivo600.
Reversión:Python Hermes ejecutando helper candidato deploy-hermes-gatekeeper-metrics.py --rollback.
Helper porhash,atómico,restaura ante fallos;4simulaciones pasan local/remoto.

260/260 Node específicas (conversación/Whisper/Gatekeeper), TS global/pruebas, lint, prepare production,
Gradle assembleRelease/lintVital correctos. Python local64incluye2skips históricos de despliegues anteriores;
64remotas actuales sin esos tests históricos pasan. ClaudeCLI se intentó2veces sin resultado,cancelado;
código nativo de Codex. Caches/Python/ADB requieren exec escalado; no tratar los hangs de sandbox como
fallo funcional. Rechazo remoto inicial resuelto por autorización humana explícita.

## Pendiente antes de ACTIVE

Persona real a~2m/coberturaWhisper/cambios de idioma;revisión humana y particiones del dataset;
comparar restantes modelos/reglas/Hermes assess+assist reales/modelo cloud fijo;compararWAITvs2s;
cesión físicaHeyEven;shadow real con positivos útiles y memoria;interferenciaWhisper/autonomía.
No levantar gates por tener código o por sesión sin mensajes útiles. Nano continúa aislado.

## Español/catalán

Preferencia provisional:un Whisper multilingüe y comparar auto/es/ca,antes de cargar dos copias iguales.
La UI actual ofrece auto/es;no se ha modificado ASR por la pregunta. Dos fine-tunes distintos solo si
mejoran precisión/coste y alternancia dentro de frase. LLM que lee texto posterior no recupera idioma
original cuandoASRya lo normalizó;introducirlo agrega dependencia/latencia.
Fuentes: https://github.com/openai/whisper/blob/main/whisper/tokenizer.py y https://arxiv.org/abs/2507.13875.

Reserva Pixel propia liberada. Pantalla temporalmente encendida por USB para repetir LFM;
restaurado y verificado `stay_on_while_plugged_in=0`. Última UI antes de restaurar energía:
48/48 completo, Solo texto OFF, perfil guardado; después la pantalla quedó bloqueada y no se eludió.
Fuentes, pruebas e informes sintéticos forman el checkpoint S2.7 de esta rama; comprobar HEAD/origin al retomar. Sin copia NAS nueva. No copiar perfil/audio/SQLite/credenciales a entregas.
