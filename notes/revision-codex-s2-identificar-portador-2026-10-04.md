# Validación Codex del diseño S2 — 04-10-2026

Documento revisado: `notes/revision-claude-s2-identificar-portador-2026-10-04.md`, sobre HEAD `ae55d83`. Revisión de código TS/Kotlin, puente Hermes y documentación oficial mediante el MCP Soniox. Sin cambios de aplicación, instalación, captura, perfil o servicios. No procede compilar ni ejecutar suites de aplicación por esta revisión de diseño.

## Dictamen

**Enfoque aceptado; diseño pendiente de las correcciones siguientes antes de implementar.** La identificación explícita por sesión es un incremento razonable. Reutilizar automáticamente el perfil exige contratos y evidencia que hoy faltan. Soniox/S1 sigue aceptada por el usuario; mantener su configuración, Whisper de reserva, perfil existente y decisión de no filtrar televisión.

Confirmados: se descartan tiempos/progreso Soniox; `stop()` borra sus contadores; el perfil local ofrece resultados agregados sin origen temporal por trabajo; el puente Hermes cancela el turno activo al recibir otro `chat/utterance` y no consume el canal `conv` propuesto. Preparar eventos sin enviarlos es coherente con el alcance S2.

## Correcciones necesarias

### R1 — P1: la regla acepta voces sin la frase pedida (§4.3, líneas 138–153)

Se aceptan tres de cinco palabras de control, sin orden ni necesidad de reconocer la frase completa. Contraejemplo reproducido al evaluar la regla: otra persona dice «Soy yo quien paga la cena»; contiene `soy`, `yo`, `quien`, tiene `match = 0,6` y, con una duración de 1 s o más, sin otro hablante, cumple todos los requisitos. El portador puede estar callado y se identificaría a esa persona.

Sustituir la bolsa de palabras por una frase completa y ordenada reconstruida desde tokens contiguos del mismo hablante; normalizar mayúsculas, tildes y puntuación. Especificar cómo se unen subpalabras, qué variantes completas se admiten y qué fronteras interrumpen la frase. No concatenar palabras separadas por otro hablante o por distintos turnos para fabricar una coincidencia. Un reconocimiento incompleto debe abstenerse; la selección manual permanece disponible.

La frase es una declaración explícita dentro de un flujo cooperativo, no una prueba biométrica: no afirmar que otro hablante nunca puede pronunciarla. Añadir pruebas negativas con tres palabras comunes, palabras desordenadas y fragmentos separados, además de una frase válida dividida en subpalabras.

### R2 — P1: la elección manual debe invalidar el intento pendiente (§4.2 y §5.3)

La tabla cambia la identidad al elegir «Soy la voz N» o «No soy ninguna», pero no cancela el intento ni fija qué ocurre con su resultado tardío. Falta un contrato que impida que la frase anterior reemplace la corrección explícita. No es un fallo observado de código S2 —aún no existe—; es una ambigüedad importante que no debe trasladarse a la implementación.

Elegir o borrar manualmente debe cancelar el intento activo, invalidar su identificador y sus temporizadores, y eliminar su evidencia. Los callbacks deben comprobar sesión, stream, intento vigente y estado. Un menú retenido de otra sesión no puede asignar una etiqueta de la sesión nueva. Validar que la etiqueta elegida pertenece al stream actual.

Añadir pruebas de corrección manual y borrado mientras se espera la frase, seguidos de sus tokens tardíos; menú viejo después de OFF/ON; y vencimiento antiguo después de un nuevo intento.

### R3 — P2: `desconocido` y `otro` tienen reglas incompatibles (§4.2 frente a §5.2)

El diseño dice que una etiqueta nueva del portador quedará `desconocido`, pero el contrato marca `otro` a toda etiqueta distinta de la asociada. Ambas reglas no pueden cumplirse a la vez. La API también declara `speaker` opcional; un token sin etiqueta no puede convertirse automáticamente en `otro` por tener una identidad guardada.

Definir una única política de relación: qué etiquetas se consideran conocidas, cuándo una nueva permanece desconocida y cómo cambia con una corrección explícita. Reflejarla en UI, intervención y eventos. Representar la falta de hablante como `null` o equivalente inequívoco, nunca como identidad inventada. Probar etiqueta nueva tras identificar y token sin `speaker`. No añadir filtros de televisión.

### R4 — P2: completar el contrato temporal y sus validaciones (§4.1–4.4)

Los tiempos son de tokens, incluidos fragmentos de palabras. La API describe tiempos y progreso, pero las páginas consultadas no establecen explícitamente el origen desde el primer byte del WebSocket. Es correcto registrar esa limitación; no es correcto garantizar que cualquier desalineación solo puede dar «sin resultado».

Definir el tratamiento de tiempos ausentes, no finitos, negativos, invertidos o fuera del audio enviado; no usarlos para identificar. Una frase del intento anterior o que cruza una frontera de intento no puede incorporarse al nuevo por el mero solapamiento parcial. Delimitar la tolerancia de 300 ms. Para duración y solapamiento, usar la unión de intervalos válidos, sin contar doble tokens que se solapan ni usar habla ajena a la frase para completar su duración mínima.

Acotar también por tiempo monotónico el estado `escuchando-frase`, no solo por incremento de audio enviado. Dar un resultado definido a una espera con audio/progreso detenido. Para cierres de turnos por pausa, distinguir hueco en tiempos de audio de un retraso del socket o de finalización: esperar la evidencia de procesamiento necesaria y no cerrar una frase solo porque falta un mensaje nuevo. Especificar huecos, cesión de audio, OFF y callbacks tardíos sin unir evidencia de capturas incompatibles.

Añadir pruebas de metadatos inválidos, tokens con intervalos solapados/subpalabras, frase fuera de ventana, progreso detenido y finales retrasados sin pausa real. La prueba con servidor real debe registrar la comprobación temporal como observación, sin afirmar que una sola identificación acredita todas las garantías del reloj.

## Ajustes de precisión del documento

- `firstTokenAfterMs`/`firstFinalAfterMs`, medidos desde el primer envío hasta recibir resultado, **sí incluyen la espera de red y servicio**. Excluyen la presentación posterior en pantalla; no son latencia percibida completa.
- Añadir la vía de suscripción para `WearerAssociationEvent`, ya que el contrato dice que se emite, pero la interfaz solo ofrece `subscribeTurns`. Definir el estado inicial que recibe un suscriptor y su limpieza.
- Unificar incremento/reinicio de `streamId` entre §4.1 y prueba 9: la identidad es la tupla de sesión y stream, y un identificador reutilizado no debe aceptar callbacks anteriores.
- El menú de lentes limitado a cuatro etiquetas debe permitir acceder a todas las observadas mediante paginación o dejar explícita la alternativa del móvil. No ocultar sin explicación la etiqueta del portador si aparece quinta.
- Definir cómo se propaga `stopReason` al resumen (el coordinador marca `expired` después de su limpieza) y conservar el resultado de identidad previo al borrado, con cancelación si había intento pendiente. Errores agregados: categorías estables, sin copiar mensajes arbitrarios del proveedor.
- No llamar «voz suficiente» a una mera suma de tiempos de texto sin explicar su carácter de criterio de selección, no de medición acústica ni de precisión.

## Evidencia externa consultada

- [WebSocket API: respuesta, campos opcionales y errores](https://soniox.com/docs/api-reference/stt/websocket-api#response).
- [Timestamps: palabras y subpalabras](https://soniox.com/docs/stt/concepts/timestamps).
- [Endpoint detection: finalización y token final de frontera](https://soniox.com/docs/stt/rt/endpoint-detection).

No se propone cambiar endpoint detection ni el tope de 120 s como parte de estas correcciones. No se ha enviado texto a Hermes. El documento de Claude se conserva intacto para comparar su revisión corregida.
