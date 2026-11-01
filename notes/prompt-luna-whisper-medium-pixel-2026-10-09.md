# Encargo para Luna: medir Whisper medium en el Pixel

Trabaja con razonamiento medio. Tu tarea es ejecutar y analizar el banco existente
para **Whisper medium**, sin modificar Faceclaw de producción. Codex revisará tus
resultados; Terra hará la implementación en otro encargo. No delegues más agentes.

## Contexto y referencias

- Consulta `C:\Users\danie\.codex\memories\faceclaw.md` y los `AGENTS.md` aplicables.
  La cabecera de memoria es antigua: contrasta las entradas recientes del repositorio.
- Tu checkout: `E:\projects\faceclaw-es-whisper-bench`, rama
  `claude/whisper-perf-bench-2026-10-09`, referencia inicial
  `342154c74a66d077e0a6961001a99094b5ddb159`. Comprueba el HEAD real y el árbol.
- Lee `evaluations/whisper-tensor/README.md`, el informe final de Claude y los
  resultados existentes. Reutiliza herramientas, corpus y modelos verificados.
- Principal, solo consulta: `E:\projects\faceclaw-es`, referencia inicial
  `72816632f7ec9dc8c510b080fa73a1ccbbf6739f`; lee
  `notes/revision-codex-whisper-s2.6.12-2026-10-09.md` y
  `notes/prueba-medium-tv-2026-10-09.md`.

S2.6.12 está instalada con firma original/código 805. En Conversación, base pasó
de 1 a 4 hilos; small y medium ya usaban 4. Medium no fue medido antes.
El usuario probó medium con TV a dos metros: buen reconocimiento subjetivo, lento.
Eso no valida una conversación con otra persona ni una comparación entre modelos.
El README del banco aún dice base a 1 hilo en su sección de reversión: es histórico.

## Coordinación: tú utilizas primero el Pixel

Terra trabaja mientras tanto en código y no debe usar ADB hasta tu entrega.
Antes de tu primer acceso al dispositivo, crea el directorio de reserva
`E:\projects\faceclaw-es\.tools\medium-pixel-reservation` con una operación que
falle si ya existe (PowerShell `New-Item -ItemType Directory -ErrorAction Stop`,
sin `-Force`). Guarda dentro un pequeño archivo de propietario/fecha/tarea.
No sobrescribas ni borres una reserva ajena. Si existe, sigue con preparación fuera
del dispositivo e informa del conflicto. Mantén la reserva durante todo tu uso.

Al empezar, escribe `E:\projects\faceclaw-es\.tools\medium-luna-handoff-2026-10-09.json`
con `state: "busy"`. Al terminar y después de retirar el auxiliar y comprobar el
estado final, actualízalo a `state: "released"`, con fecha ISO y zona horaria,
HEAD medido, rutas absolutas de informe/JSON/CSV, resultado y ganador si existe.
Incluye `completed: true/false`, motivo de interrupción y estado final comprobado.
Un resultado negativo o ensayo incompleto también debe liberar el dispositivo.
Quita únicamente tu reserva al acabar; no marques liberado mientras quede un
trabajador o prueba propia ejecutándose. Este JSON no lleva secretos ni texto privado.
Esta es tu única escritura permitida en el checkout principal, dentro de `.tools`.

## Alcance del dispositivo

Pixel 10 Pro Fold/Tensor G5; ADB esperado:
`C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe`,
serial observado `61161FDCG0013L`. Comprueba identidad y conexión actuales.
Antes de medir, comprueba Conversación OFF, captura y decoder drenados y ausencia
de wakelock de Faceclaw. La confirmación anterior de OFF no prueba el estado actual.
Si está ocupado, no interrumpas al usuario: prepara corpus/compilación fuera de él.

Puedes instalar el auxiliar `com.faceclaw.whisperbench` con su firma de desarrollo
y copiar modelos/corpus público a SU carpeta. No instales una APK de Faceclaw,
no cambies ajustes, motor, memoria, perfil, firmware, Hermes ni reloj.
No micrófono, grabaciones de TV/personas, conversaciones reales ni lectura de
transcripciones/memoria/perfil. No root, cambios de frecuencia o protección térmica.
El auxiliar no necesita permisos de micrófono ni red. Retíralo y borra sus propios
archivos al acabar; conserva Faceclaw y todos sus datos.

## Ejecución acotada

1. Recompila el auxiliar desde las métricas corregidas; verifica sus pruebas
   existentes y hashes de las bibliotecas usadas frente a producción. Registra
   revisión, APK y configuración efectiva. No instales un build antiguo por rutina.
2. Reutiliza el corpus público FLEURS/sintético o reconstrúyelo con su script.
   Verifica hashes y procedencia. El corpus no representa español peninsular ni
   valenciano ni simula acústicamente una persona distante. No publiques audios.
3. Descarga medium solo si falta una copia utilizable. Obtén nombres, URLs,
   revisión y hashes fijados en `app/native/asr-model.ts`/`LocalWhisperModels.kt`
   del principal. No asumas acceso `run-as` a los modelos de la APK release.
4. Baseline: `whisper-medium-es`, CPU, 4 hilos, idioma automático,
   acondicionamiento actual, padding por defecto y `ref-6-3`.
   Separa verificación de archivos, carga fría, calentamiento y decode estable.
5. Piloto de 1/2/4/6 hilos, mismos fragmentos es/ca/voz atenuada, calentamiento y
   repeticiones. Empieza pequeño; registra tamaño de muestra. No extraigas una
   conclusión firme de p95 con unas pocas observaciones. No abras un grid enorme.
6. Lleva solo baseline y finalista a corpus completo y bloques sostenidos ABBA,
   con enfriamiento y condiciones comparables. Registra orden, duración, pantalla,
   alimentación, temperatura/estado térmico y memoria. Usa al menos dos bloques
   por configuración cuando exista finalista; 5 min por bloque es el punto de
   partida del banco, ampliable si no basta para valorar estabilidad.
7. Mide tiempo real con la política actual. Separa tiempo de decode y entrega,
   intentos y decodificaciones correctas, cobertura de audio y texto reconocido.
   Para una ventana de 6 s cada 3 s el presupuesto sostenido es 3 s, no 6 s.
   Mide también frases completas: el asistente por intervención es otro caso.

Tu tarea compara hilos del backend actual. TFLite/NNAPI/NPU corresponde a Terra;
no reabras Vulkan, Tensor SDK ni la batería de base/small. Si surge un fallo real
del banco, haz solo la reparación mínima con evidencia y prueba pertinente,
en commit separado; no cambies el decoder de producción para obtener un ganador.

## Interpretación y entrega

Entrega p50/p95/máximo, carga fría, RTF, latencia de entrega, descartes y rechazos
por causa, cobertura decodificada, WER/CER es/ca y falsas palabras en silencio/ruido.
Usa el colector incremental corregido, nunca solo el último anillo de 256 ventanas.
Resultados incompletos deben quedar nulos con motivo, no convertirse en ceros.
No calcules WER/CER de un bucle sostenido contra una referencia concatenada inválida.
Una voz atenuada no demuestra captación a dos metros. Batería/térmico son indicadores:
no afirmes mejora energética sin una medición que la sostenga.

Ganador promocionable: al menos 20 % menos p95 que medium CPU/4 hilos, repetible,
sin empeoramiento material de reconocimiento, estabilidad o temperatura. Un resultado
menor se documenta; no se fuerza una victoria ni se cambia la app. Si todos son lentos,
entrega la evidencia y qué uso resulta viable, sin prometer tiempo real.

Guarda JSON/CSV e informe bajo
`evaluations/whisper-tensor/results/pixel-medium-2026-10-09/` y
`notes/resultado-luna-medium-pixel-2026-10-09.md` en tu checkout. Incluye comandos
reproducibles, versiones/hashes, condiciones, limitaciones y tabla comparativa.
Haz commits explícitos solo de tus fuentes/resultados públicos; no `git add .`,
push, merges, reset, clean ni stash de cambios ajenos. No publiques pesos, APK,
audios, claves, ajustes privados o logs sin filtrar. Actualiza el JSON de relevo.

Resume para Codex y Terra: qué mediste, si hay ganador, qué no pudo medirse,
rutas/commits y estado final real del Pixel. No esperes confirmaciones repetidas
para las mediciones ya autorizadas. Avanza sin repetir suites ajenas al encargo.
