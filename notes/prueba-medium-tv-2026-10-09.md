# Whisper medium con TV a dos metros · 09-10-2026

El usuario probó Whisper medium con una TV a unos dos metros porque no disponía de
otra persona. Informa de buena captación/transcripción y bastante más lentitud; Hermes
mostró una sola frase. Es una observación útil de reconocimiento, no una comparación
controlada con small ni una validación de conversación humana a esa distancia.

Codex leyó los contadores después de que el usuario confirmara Faceclaw abierto y OFF.
S2.6.12/805 instalada; selector Whisper medium, Texto y Hermes, memoria 24 h. No se
inició captura, no se leyó la transcripción ni la memoria y no se cambió la selección.

| Medida | Valor |
| --- | ---: |
| Duración de escucha | 237,841 s |
| Turnos aceptados por el controlador de Hermes | 19 |
| Evaluaciones de tema / peticiones de ayuda | 2 / 19 |
| Respuestas `nada` a las ayudas | 18 |
| Mensajes / entregas / presentaciones en lentes | 1 / 1 / 1 |
| Errores, inválidos, caducados, cancelados del canal | 0 |
| Latencia media / máxima de ayuda (petición→respuesta) | 1.813 / 4.355 ms |
| Paquetes LC3 | 4.750 |
| Errores LC3, paquetes perdidos, descartes de cola | 0 |
| Descartes de entrega PCM | 25 |
| Hueco máximo entre paquetes | 127 ms |

Los 25 descartes de entrega representan unos 1,25 segundos de PCM de 50 ms por
fragmento. No conocemos su ubicación ni si contenían voz, ni su causa. No equivalen
a los descartes de ventanas ASR. La única intervención concuerda con las respuestas
recibidas; no se observa fallo de entrega del mensaje. Sin contenido ni referencia
no se puede juzgar si las 18 abstenciones eran pertinentes.

## Limitación de diagnóstico encontrada

Tras OFF, `SonioxConversationTranscription.stop()` cambia `mode` a `off` y reinicia
sus contadores. `snapshot()` deja entonces de exponer `local.snapshot()` y devuelve
el estado genérico de Soniox, incluso cuando la sesión fue Whisper. Por eso esta
lectura no proporciona tiempos, rechazos ni descartes de medium. El núcleo Kotlin
conserva contadores; no afirmar que el diagnóstico genérico con ceros describe esta
sesión ni que se usó Soniox por la etiqueta posterior al OFF.

Evidencia agregada privada: `.tools/medium-tv-review-20261009/metrics-after-tv.json`.
Al terminar se cerró el diálogo: Whisper medium, memoria 24 h y Conversación OFF
seguían seleccionados. No se instaló el auxiliar ni se ejecutó un benchmark nuevo.

## Prioridades resultantes

1. Medir y optimizar medium en el Pixel, con calidad y latencia separadas.
2. Incorporar medium al asistente «ey Even»: actualmente faltan opción de proveedor,
   fila de modelo, mapeo TS, parser compartido y resolución de archivos Android.
   No es solo ocultación del selector. El reconocedor Android ya admite el tipo
   `WHISPER_MEDIUM`, y las descargas de Conversación ya incluyen los archivos.
3. Conservar acceso al diagnóstico local tras OFF antes del siguiente ensayo humano.

No relajar Hermes ni cambiar memoria a partir de una sola reproducción de TV.
