# Encargo a Claude: revisión y diseño S2 — identificar al portador

Prepara una revisión técnica del siguiente incremento de Faceclaw: asociar mi voz a una etiqueta de hablante de Soniox para continuar hacia la asistencia proactiva de Hermes. Entrega un diseño concreto y listo para implementar que Codex pueda validar. Esta entrega es de revisión y diseño; la implementación vendrá después de esa validación.

## Estado vigente y decisiones del usuario

Proyecto `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. HEAD comprobado por Codex: `ae55d83`; integración Soniox `219380a`. Comprueba el estado actual antes de trabajar y conserva los cambios locales, incluida la revisión de S1 y AGENTS. No hagas reset, clean ni sobrescribas trabajo ajeno.

S1 instalada: `0.8.2-es.5-conversation.s1`, código 805. Firma original y 34 ajustes intactos según tu informe de instalación. Codex comprobó versión, Conectado/OFF y perfil existente guardado. Soniox funciona: el usuario hizo una conversación real entre dos personas con la televisión encendida, distinguió una tercera voz y confirmó que transcripción y retraso son aceptables. No hace falta volver a investigar la clave o replantear la captación de audio.

**Decisión explícita: no intentar filtrar la televisión.** Es un caso puntual que el usuario acepta. No añadir rechazo de TV, clasificación de fuentes ni pruebas de TV como requisito para avanzar.

Soniox por defecto, Whisper local como reserva. Castellano primero. Con Soniox el audio de todas las voces se envía a su API; esa ruta ya se usa y está aceptada. El MCP oficial de documentación Soniox está disponible: úsalo para comprobar capacidades y contratos actuales, sin crear otro MCP.

Lee `AGENTS.md`, `notes/revision-s1-prueba-real-2026-10-04.md` y `notes/continuidad-entre-pcs.md`; en este PC consulta `C:\Users\danie\.codex\memories\faceclaw.md`. Los documentos anteriores a S1 conservan contexto del objetivo, pero sus hipótesis de Whisper/VAD y estados antiguos no prevalecen sobre S1.

## Objetivo de la revisión

Recomienda el camino más sencillo y fiable para relacionar una etiqueta Soniox de la sesión con el portador. No asumir que hablante 1 sea siempre el usuario ni que las etiquetas persistan entre sesiones.

Compara dos alternativas concretas:

1. Reutilizar el perfil local existente para asociar automáticamente evidencia de voz propia con un hablante Soniox. Comprueba si la comparación actual permite hacerlo con evidencia suficiente y qué falta para unir sus resultados con los intervalos transcritos.
2. Una identificación explícita breve por sesión: por ejemplo, una acción «Identificar mi voz» y una frase pronunciada por el usuario, o confirmar una etiqueta observada. Define cómo se selecciona el intervalo y cómo se evita identificar a otra persona si habla primero, hay solapamiento o aparecen resultados tardíos. No basta con tomar el primer hablante recibido.

Elige una alternativa para S2 y explica por qué; la otra puede quedar para después. Evita un nuevo registro del perfil por defecto. No presentes el perfil guardado como prueba de precisión de identificación. Si la evidencia es insuficiente, la identidad debe seguir desconocida sin impedir la transcripción ni molestar con avisos repetidos.

## Revisión del código y contrato propuesto

Inspecciona `app/native/soniox-conversation.ts`, `app/native/local-participation.ts`, `app/conversation-detection/participation.ts`, el coordinador, controles de sesión, guía de perfil, implementación Kotlin de participación, interfaz móvil y app Conversación de lentes.

Actualmente Soniox expone texto rodante y agrupa tokens por `speaker`; su tipo Token no recoge tiempos. Participación expone un snapshot agregado. No inventes que ya existe una unión fiable entre ambos: cita archivos/símbolos y especifica los cambios mínimos si la alternativa elegida necesita eventos e intervalos. Consulta qué garantiza Soniox sobre tiempos, etiquetas y resultados provisionales/finales.

Define estados, interacción móvil/lentes, alcance de la asociación y contrato de intervenciones para el siguiente paso Hermes: sesión/época, secuencia, hablante, relación con el portador, texto confirmado e intervalos si son necesarios. Describe OFF, nueva sesión, callbacks tardíos, cambios de etiqueta, solapamientos, huecos de audio y caída a Whisper. La reserva local debe seguir funcionando sin inventar identidad o diarización que no tenga.

El objetivo final sigue siendo que Hermes use la conversación para aportar respuestas, ideas y comentarios breves en las lentes, con humor irónico ocasional. S2 debe dejar preparada esa integración; en esta entrega no conectes ni envíes conversaciones a Hermes. Puedes revisar en lectura `E:\projects\faceclaw-hermes-bridge\README.md` y `bridge.py` para evitar contratos incompatibles, sin consultar secretos ni historial privado.

## Diagnóstico y validación

S1 borra texto y contadores Soniox al parar. Propón conservar tras OFF únicamente métricas agregadas útiles de la última sesión, manteniendo el borrado de texto/audio y su sustitución al empezar otra sesión. Distingue contador de audio enviado, audio procesado, tiempo hasta primer resultado y percepción de latencia; no deduzcas calidad a partir de contadores. No exportar el perfil o sus vectores.

Especifica pruebas automatizadas relevantes para la alternativa elegida: interlocutor primero, respuesta tardía de una sesión anterior, identificación ambigua/solapada, OFF durante identificación, nueva sesión y reserva Whisper. Propón una comprobación humana breve para el incremento, sin repetir baterías históricas ni el registro del perfil.

## Entrega

Guarda la revisión en `notes/revision-claude-s2-identificar-portador-2026-10-04.md`. Incluye recomendación, evidencia del código/documentación oficial, cambios mínimos por archivo, contratos/estados, pruebas y criterios de aceptación. Señala qué ya existe y qué es propuesta; no afirmes precisión o latencia medidas si no lo son.

No modifiques código de aplicación, APK, configuración del móvil, perfil, firmware, Wear ni servicios Hermes durante esta revisión. No necesitas builds o suites completas para el documento. En tu respuesta final indica la ruta de la revisión y la alternativa elegida. El usuario pasará la entrega a Codex para validarla; no la envíes automáticamente a otra conversación.
