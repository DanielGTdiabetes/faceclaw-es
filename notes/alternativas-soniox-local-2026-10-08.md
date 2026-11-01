# Sustituir Soniox: móvil frente a equipo propio

**Actualización posterior:** [S2.6.10 instalada y prueba real del Pixel](selector-modelos-conversacion-2026-10-08.md). Selector Soniox/Pixel/base/small/medium, descarga separada, Texto y Hermes/Solo texto. La API pública y el adaptador instalado reconocen PCM sintético externo sin permiso de micrófono; no se accede a ASI por interfaz privada. Español instalado, catalán no anunciado. La comparación humana entre motores y la ruta STT en Jarvis siguen pendientes. Las afirmaciones inferiores de «sin implementación» describen la evaluación inicial, superada por esta entrega.

Fecha: 08-10-2026, Europe/Madrid. El usuario marca como mejora principal intentar sustituir Soniox de pago por un sistema gratuito o local y pide comparar las dos posibilidades: dentro del móvil y en Jarvis/un ordenador propio. Este registro es una comparación de arquitectura y documentación; no contiene una sustitución implementada ni rendimiento demostrado.

## Comprobación posterior del móvil, solicitada por el usuario

08-10-2026, aproximadamente 12:24 CEST. El usuario pregunta si ya había un modelo mayor y autoriza comprobar el móvil conectado. ADB identifica Pixel 10 Pro Fold y Faceclaw `0.8.2-es.5-conversation.s2.6.9-manual-context`/805. UI inicial Conectado/Display off/Hermes en conversación OFF.

Se abrió únicamente «Opciones de conversación». Etiquetas observadas:

- **«Modelo preciso (small): listo, en uso»**.
- **«Motor de texto: Soniox (nube, separa voces) · tocar para local»**.

Conclusión: **Whisper small ya está presente según el gestor de la app**, como modelo mayor que base. La etiqueta «en uso» expresa su preferencia para la ruta local; no prueba inferencia activa, puesto que el motor seleccionado es Soniox y la sesión está OFF. `isAsrModelReady` comprueba existencia y tamaño mayor que cero de todos los archivos esperados; los hashes se validan al cargar el decoder. No se inició el decoder para verificar hashes ni se ejecutó reconocimiento. `run-as` no permitió listar los archivos porque la APK no es depurable; no se intentó eludir esa protección.

La recomendación anterior de «modelo mayor» se refería a evaluar uno superior a small, no a repetir el paso base → small. Que este salto ya se hiciera no demuestra que otro tamaño resuelva el reconocimiento de interlocutores. Antes de elegir otra arquitectura, revisar el resultado del intento small y comparar reconocimiento/entrada de audio sin prometer una causa.

Cuadro cerrado; final observado Conectado/Display off/Hermes OFF. Temporal de interfaz eliminado. Sin cambiar motor/idioma/ajustes, descargar modelos, iniciar captura/inferencia, instalar, reiniciar o desplegar. Esta consulta posterior supera las menciones inferiores de «sin consultar dispositivos» correspondientes a la comparación inicial.

## Antecedente decisivo aportado por el usuario

### Base sí se probó; comparación controlada pendiente

El usuario plantea después si se habría probado siempre small descartando base por considerarlo peor. Las notas no respaldan esa lectura: G2.2 usa explícitamente Whisper base int8 (`conversation-detection-g2-asr-results.md`); G2.3 conserva ese modelo (`conversation-detection-g2-asr-diagnostics.md`). El informe A3 describe la sesión A2 anterior también con base, sin mejora percibida del interlocutor, e incorpora después small junto con acondicionamiento de nivel.

No se encontró en los informes consultados una comparación base/small sobre la misma entrada y con la misma segmentación, idioma y acondicionamiento. Las observaciones históricas no aíslan el efecto del tamaño de modelo. Base sigue siendo candidato: su menor carga podría resultar útil si el retraso/ocupación de small perjudica la entrega, pero eso no se ha demostrado. Antes de descartar cualquiera, una comparación deberá evaluar tanto exactitud como demora, continuidad y comprensión de otras voces; no basta el tamaño teórico ni la etiqueta «mayor precisión».

Durante esta comparación el usuario recuerda que Whisper local funcionaba medianamente bien para quien llevaba las gafas, pero entendía peor al resto de locutores. Se refiere al reconocimiento de palabras; no confundirlo con identificar o separar hablantes. **La candidata debe mejorar o conservar la comprensión de otras voces, no limitarse a reconocer al portador.**

Ese antecedente también consta en `diagnostico-codex-c1-interlocutor-2026-10-04.md`: C1 no quedó aceptada como solución física. No había filtro «solo mi voz» antes de ese ASR. La medición por fases no permitió atribuir el audio al interlocutor, por lo que no fijó una causa. `informe-claude-a3-2026-10-04.md` documenta el intento posterior con ganancia por ventana y Whisper small; sus atribuciones sobre señal/modelo y orientación del micrófono son hipótesis del informe, no demostración causal que esta revisión adopte. El código actual ya incorpora acondicionamiento y preferencia por small; proponer simplemente esos dos cambios repetiría trabajo existente.

La prioridad provisional pasa a explorar un modelo más capaz en Jarvis/equipo propio y mantener la ruta del móvil como segunda candidata. Esto es una hipótesis de mejora, no una garantía: un modelo mayor puede reconocer mejor una señal audible difícil, pero no asegura recuperar palabras tapadas por ruido o ausentes del PCM. Usar la misma entrada de las G2 y controlar el preprocesamiento al comparar permite separar esas posibilidades. No se ha guardado ni recogido audio para hacerlo.

## Qué existe realmente en Faceclaw

La ruta local ya está integrada. `app/native/local-transcription.ts` usa `FaceclawLocalTranscriber`, con sherpa-onnx y Whisper multilingüe. La implementación actual en `App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawLocalTranscriber.kt` prefiere small int8, cuatro hilos, si los pesos descargados verifican; si no, base int8, un hilo. No descarga pesos automáticamente. No se ha consultado qué pesos tiene hoy el teléfono.

El transcriptor arranca en modo de ventanas: seis segundos de audio, avance/solapamiento de tres segundos (`LocalTranscriptSession.kt`). Estas duraciones describen la segmentación, no una medición de latencia final. Las entregas incluyen texto e idioma, sin modelo de hablantes en ese adaptador. El texto se mantiene acotado en RAM y se borra al parar o romper el flujo.

La sustitución no consiste en elegir el selector local:

- `app/native/soniox-conversation.ts` informa `turnsAvailable: false` en modo local; ese modo no alimenta los turnos conversacionales de Soniox.
- `app/conversation-detection/coordinator.ts` hace fallar/cerrar el modo manual si el motor no es `soniox`.
- `app/conversation-detection/conversation-hermes.ts` detiene Hermes si el motor informado no es `soniox`.
- El transporte Soniox actual solicita PCM mono de 16 kHz, diarización y detección de fin de intervención. Un sustituto debe cubrir los contratos que consume Faceclaw, además de escribir palabras.

El Pixel 10 Pro Fold está identificado en documentación previa. Jarvis está documentado como BMAX conectado por Tailscale, pero en las notas consultadas no se encontró CPU/RAM/GPU suficientemente concreta para elegir tamaño de modelo o prometer tiempo real. No se consultaron móvil ni servidor.

## Comparación de las dos rutas

| Aspecto | En el Pixel | En Jarvis/un equipo propio |
| --- | --- | --- |
| Punto de partida | Reutilizar Whisper base/small int8 con sherpa-onnx ya integrado | Evaluar faster-whisper en CPU int8; whisper.cpp como alternativa según hardware |
| Pago por transcripción | Sin tarifa por minuto usando el motor/modelos abiertos localmente | Sin tarifa por minuto usando el motor/modelos abiertos en el equipo propio |
| Coste restante | Procesamiento, batería, memoria y desarrollo | Equipo encendido, electricidad, red y desarrollo; no presupone comprar hardware |
| Red para transcribir | No necesaria después de disponer de pesos | Conexión al equipo necesaria, también fuera de casa |
| Audio | Se procesa en el teléfono | Sale del teléfono hacia el equipo propio; hay que asegurar transporte/autenticación y evitar registros de audio/texto |
| Precisión | Por medir con el audio de las G2, ruido y español/catalán | Por medir; permite evaluar modelos mayores si el hardware alcanza |
| Demora | Ventanas actuales más inferencia; sin comparación actual contra Soniox | Red más estabilización de texto e inferencia; sin comparación actual contra Soniox |
| Consumo del móvil | Inferencia local añade trabajo; magnitud no medida | Evita esa inferencia local, pero añade tráfico; no se afirma ahorro neto medido |
| Hablantes | El adaptador actual no los separa | Puede añadirse un motor local de diarización; estabilidad y demora en directo pendientes |

Whisper contempla español y catalán, y su código reconoce valenciano como alias de catalán. Esto no demuestra precisión para el acento del usuario ni cambios de idioma dentro de una frase. Las observaciones antiguas de G2.2/G2.3 son limitadas y no validan la sustitución de Soniox en el modo Hermes actual.

Hermes seguirá necesitando su conexión/modelo actual aunque la transcripción se vuelva local. Sustituir Soniox elimina esa dependencia y su tarifa de STT; no hace por sí solo todo Faceclaw gratuito o sin conexión.

## Recomendación provisional y comparación necesaria

Priorizar esta mejora y evaluar ambas rutas con el mismo material antes de elegir. Por el antecedente de otras voces mal reconocidas, estudiar primero la viabilidad de un modelo mayor en equipo propio; mantener el motor del móvil como referencia y candidata secundaria. En Jarvis conviene elegir el tamaño de Whisper después de conocer su CPU/RAM y posibles aceleradores. No prometer que un modelo grande funcionará en tiempo real en el BMAX.

Para comentar el tema en el ON manual con identidad opcional puede estudiarse una primera ruta con hablante desconocido explícito, siempre que el resto del contrato lo admita. Eso reduce la necesidad inicial de diarización, pero pierde atribución entre voces: no presentarlo como sustitución completa de Soniox ni usar el texto para inventar quién habla. Si conservar separación de interlocutores es requisito, medirla como función adicional.

Cambios necesarios en cualquier candidata:

1. Separar el contrato de transcripción conversacional del nombre del proveedor. Conservar la identificación opcional y los límites, OFF, prioridades y cesiones actuales.
2. Emitir texto confirmado con referencias temporales y de sesión; resolver solapamientos y correcciones sin duplicar ni cerrar prematuramente frases. Los fragmentos provisionales no deben disparar aportaciones como si fueran definitivos.
3. Definir cierre de intervención y tratamiento honesto de hablantes desconocidos/diarización, sin convertir el perfil propio en requisito manual.
4. Mantener buffers acotados, cancelación/descarte tras OFF y desconexión; no dejar colas de audio creciendo si la inferencia no alcanza el flujo.

La comparación debe distinguir STT aislado de extremo a extremo hasta Hermes. Con audio público/con licencia o muestras expresamente acordadas: exactitud en es/ca, cambios de idioma, nombres/números y frases cortas, ruido, solapamiento de voces, silencio sin texto inventado, demora hasta texto estable y carga/RAM. Después, si procede una candidata y un ensayo coordinado, continuidad y batería durante una sesión de hasta veinte minutos. No se han recogido ni reutilizado audios privados.

Soniox puede permanecer disponible durante la evaluación para reversión. No diseñar un respaldo automático de pago sin una decisión explícita: podría contradecir el objetivo de eliminar ese coste.

## Viabilidad de subir por encima de small

El usuario pregunta si podemos subir después de small para mejorar reconocimiento. El siguiente tamaño de Whisper es **medium multilingüe**, 769 millones de parámetros frente a los 244 millones de small, según la [tabla del autor](https://github.com/openai/whisper#available-models-and-languages). Existe una [conversión sherpa-onnx de medium](https://huggingface.co/csukuangfj/sherpa-onnx-whisper-medium/tree/main) con encoder/decoder int8 publicados de aproximadamente 374/571 MB, más tokens: unos 950 MB de archivos de modelo. Es almacenamiento aproximado publicado, no RAM máxima ni medición en el Pixel. La [documentación de exportación sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/export-onnx.html) contempla medium; usar la variante multilingüe, no medium.en.

La app actual no ofrece medium: el catálogo y el adaptador Android admiten base/small. Haría falta ampliar catálogo/descarga con revisión fijada y hashes verificados, configuración nativa y selección explícita del candidato. No basta cambiar el nombre de un archivo ni copiar pesos al móvil. La selección debe permitir comparar y volver al modelo previo, sin reemplazo automático por encontrar archivos de medium.

Un modelo mayor es candidato razonable para estudiar reconocimiento, pero no demuestra mejora de otras voces ni rapidez suficiente en CPU en el Pixel. Evaluar demora sostenida, ocupación/descartes de ventanas y memoria además de precisión; inferencia local añade carga y su impacto térmico/batería queda sin medir. Si medium no alcanza el flujo, considerar ejecutarlo en equipo propio; no justificar por ello un despliegue no preparado. Los requisitos independientes de turnos/Hermes y hablantes continúan pendientes aunque medium transcriba mejor.

Esta consulta añadió solo comprobación de código y fuentes/documentación. No se descargó medium, no se integró una candidata ni se ejecutaron inferencias o pruebas físicas.

## Motor propio del Pixel: instalado y configurado, prestaciones pendientes

El usuario pregunta por el reconocimiento propio del Pixel 10 Pro Fold y aclara que busca saber si sería más potente o aportaría alguna ventaja. Lectura ADB autorizada en el móvil ya conectado, sin iniciar reconocimiento:

- Servicio general configurado: `com.google.android.tts/com.google.android.apps.speech.tts.googletts.service.GoogleTTSRecognitionService`.
- Servicio **on-device** del recurso del sistema `config_defaultOnDeviceSpeechRecognitionService`: `com.google.android.as/com.google.android.apps.miphone.aiai.app.AiAiSpeechRecognitionService` (Android System Intelligence).
- La consulta de servicios `android.speech.RecognitionService` encuentra ambos componentes. Eso acredita instalación/configuración; no se ha llamado desde Faceclaw a `isOnDeviceRecognitionAvailable`, `createOnDeviceSpeechRecognizer`, `checkRecognitionSupport` ni `startListening`.
- Búsqueda en las fuentes de Faceclaw sin integración existente de esas API.

La [API oficial SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer) permite un reconocedor explícitamente local desde API 31 y consulta de soporte desde API 33. El [contrato RecognizerIntent](https://developer.android.com/reference/android/speech/RecognizerIntent) contempla una fuente externa de audio con `ParcelFileDescriptor` (PCM mono 16 kHz adecuado a nuestras G2) y sesiones por segmentos. Estos extras dependen del reconocedor; la presencia del componente no demuestra que el servicio AiAi admita ambos ni sesiones de veinte minutos.

La [ayuda de Gboard](https://support.google.com/gboard/answer/11197787?hl=es) describe dictado avanzado local en Pixel 6 y posteriores, español entre los idiomas disponibles, pero no catalán en esa lista. Es documentación de Gboard, no evidencia de idiomas/funciones habilitados para Faceclaw a través de la API. Consultar la disponibilidad concreta de es/ca en el servicio local antes de declarar cobertura bilingüe.

**Posibles ventajas, como hipótesis:** aprovechar el servicio integrado en el Pixel, evitar integrar pesos propios adicionales de medium, menor demora/carga si su ejecución resulta más eficiente que nuestra ruta Whisper, y STT local sin tarifa Soniox. **Sin demostrar:** modelo exacto usado por este servicio en la instalación, mayor capacidad que small, mejor reconocimiento de otras voces, menor RAM/calor/batería o compatibilidad con diarización. La integración con Hermes/turnos sigue siendo necesaria.

Esta vía merece una comprobación de capacidades antes de invertir en medium. Corrige la valoración inicial demasiado restrictiva de SpeechRecognizer: la advertencia sobre reconocimiento continuo en la API general no basta para descartar el modo local con audio externo y sesiones segmentadas. Para una candidata, usar la fábrica on-device en vez de confiar solo en `EXTRA_PREFER_OFFLINE`, que puede ignorarse; verificar la fuente externa para evitar que el servicio abra el micrófono del teléfono cuando ignore ese extra. Primero consulta sin captura, después inferencia controlada únicamente si se prepara y autoriza ese ensayo.

No se cambiaron ajustes del sistema ni proveedor Faceclaw, no se descargaron pesos, no se activó micrófono/captura y no hubo instalación/reinicio/despliegue. Esta evaluación no demuestra mejora de rendimiento y no sustituye Soniox todavía.

## Otras opciones consultadas

- **whisper.cpp:** motor abierto compatible con Android, CPU, GPU y cuantización. Cambiar de runtime en el móvil no resuelve por sí mismo turnos/hablantes ni prueba mejora frente al sherpa-onnx ya integrado.
- **faster-whisper:** CPU/GPU e int8; candidato para servidor propio. Sus benchmarks publicados no corresponden a Jarvis ni a conversación con las G2.
- **SimulStreaming:** integración de Whisper para directo. WhisperStreaming indica que está siendo sustituido por este proyecto; evaluar la implementación y requisitos antes de añadirlo. Whisper convencional no ofrece el mismo contrato de streaming final de Soniox por sí solo.
- **pyannote community-1:** separación local de hablantes tras obtener el modelo y aceptar sus condiciones. Sus ejemplos y métricas no demuestran diarización continua con poca demora en Jarvis.
- **Vosk:** modelos ligeros separados de español y catalán; candidato secundario si domina la restricción de recursos. No se ha comparado su precisión ni diseñado la alternancia entre idiomas.
- **SpeechRecognizer local de Android:** candidato incorporado tras comprobar el servicio propio del Pixel. Audio externo, idiomas y sesiones segmentadas pendientes de comprobación; la API general no garantiza continuidad. Ver el apartado específico anterior, que supera su descarte provisional inicial.

## Fuentes oficiales comprobadas

- [Whisper: código y pesos MIT](https://github.com/openai/whisper).
- [Idiomas/alias de Whisper](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py).
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx).
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper).
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp).
- [WhisperStreaming y su transición](https://github.com/ufal/whisper_streaming).
- [SimulStreaming](https://github.com/ufal/SimulStreaming).
- [pyannote community-1](https://huggingface.co/pyannote/speaker-diarization-community-1).
- [Modelos Vosk](https://alphacephei.com/vosk/models).
- [SpeechRecognizer de Android](https://developer.android.com/reference/android/speech/SpeechRecognizer).
- [Diarización de Soniox](https://soniox.com/docs/stt/concepts/speaker-diarization).

## Alcance real

Código y notas locales leídos; documentación oficial consultada. Circuito Codex-Claude leído desactivado. Cambios locales previos conservados. Sin modelos descargados/ejecutados, medidas nuevas, llamadas STT, captura, consulta de dispositivos/producción, código de producción cambiado, APK, instalación, despliegue, reinicio, ajustes, commit, push o NAS. La recomendación es provisional; comparar ambas posibilidades queda como dirección aceptada, no como autorización de instalar/desplegar una candidata todavía inexistente.
