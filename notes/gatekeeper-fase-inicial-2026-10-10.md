# Gatekeeper: primera fase de implementación · 10-10-2026

Petición: «lo implantamos?» después del estudio de viabilidad. Se inicia por fases, sin Gatekeeper
activo ni Nano en Conversaciones. **Código local implementado y verificado; no instalado.**
Base de trabajo a2cedde, rama codex/conversation-detection-g0. La nota de evaluación preexistente
sin rastrear se actualiza conforme a esta autorización. No se descartan cambios ajenos.

## Cambios entregados

- Prefiltro determinista en el tracker de episodios: puntuación/espacios sin contenido y reenvíos
  iguales del mismo intervalo exacto/fuente/voz. No renuevan el episodio ni provocan otra evaluación.
- Preguntas breves, cifras, negaciones, repeticiones en audio distinto y ventanas Whisper meramente
  solapadas se conservan. Cadencia 2 s/5 s, una petición en vuelo y assist tras tema intactos.
- Diagnóstico agregado prefilter.empty/duplicate del runtime conservado tras OFF y reiniciado en
  ON, incluso antes de recibir la asociación. El buffer de texto del tracker se vacía como antes.
- Replay offline: validación de dataset y evaluación por ID de predicciones obtenidas por separado.
  Separa assess/assist, nada observados, ayudas útiles bloqueadas, memoria, WAIT y P50/P95.
  Las referencias assess conservan verdict; las assist conservan kind. Nada puede actualizar memoria.
- Piloto de 48 candidatos sintéticos en 23 episodios con contexto temporal; etiquetas propuestas
  pendientes de revisión humana. No contiene resultados inventados de Hermes/modelos.
- Nota de evaluación reescrita con el orden acordado, memoria, candidatos 0,6–1,7B, limitaciones reales
  de gramática/cancelación, WAIT revisado, circuit breaker/recuperación y criterios de shadow.

El replay por defecto no llama a ningún modelo. El control --baseline-pass sólo deja pasar todo:
no sustituye a medir el flujo real de Hermes. Sin positivos medidos, recall útil es null. No se
estiman cuota/CPU/RAM/temperatura/interferencia sin datos reales. Ver
[contrato](../tests/fixtures/gatekeeper/README.md) y
[evaluación actualizada](evaluacion-gatekeeper-gemini-nano-2026-10-09.md).

## Verificación

- TypeScript app --noEmit y compilación de pruebas correctos.
- 219/219 pruebas del área conversación, replay y prioridad de audio correctas: 18 casos nuevos.
  El replay se volvió a comprobar (9/9) tras reforzar el contrato de referencias assess/assist.
- Al ampliar la batería aparecieron seis fallos de simuladores previos: dos harnesses omitían las
  funciones de memoria diaria añadidas antes. Se actualizan únicamente esos mocks con memoria OFF;
  no se cambia producción para satisfacerlos ni se eliminan sus aserciones originales.
- oxlint de los tres módulos TS afectados correcto; Node comprueba/ejecuta el replay y sus pruebas.
  El lint del proyecto excluye CJS, por lo que no se atribuye a oxlint la validación de esos archivos.
- Webpack Android production correcto. git diff --check correcto.
- No cambios Kotlin/JNI/modelos/protocolo/proveedores, build Android/APK, instalación, captura,
  inferencia Pixel, llamada cloud, consulta móvil, despliegue Hermes, firmware/Wear ni copia NAS.

## Siguiente fase y límites

S2.6.13-r2 sigue siendo la última instalada documentada, no comprobada otra vez en este encargo.
La revisión vigente deja pendiente el ensayo humano a ~2 m y medium CPU no sostiene ref-6-3.
Este incremento no arregla ni valida captación. No repetir benchmarks ni instalar por rutina.

Antes de llevar un LLM a la ruta real: terminar diagnóstico de captación/Whisper, validar la fase
determinista, revisar/ampliar dataset a 150–300 y recoger referencias completas. Después comparar
reglas solas, Hermes actual, llama.cpp pequeño y cloud fijo. El runner/GBNF actuales requieren
adaptación para JSON estricto desde el comienzo y cesión física prioritaria al asistente explícito.

Provider LLM, máquina WAIT, circuit breaker, shadow en móvil y ACTIVE **todavía no implementados**.
No presentar esta primera fase como Gatekeeper instalado ni como ahorro de cuota demostrado.
La condición anterior «no implementar ACTIVE» se conserva. Nano queda sólo como investigación
tecnológica aislada opcional, sin incorporación automática aunque su sonda funcionara.
