# Omisiones ASR: análisis e incremento de diagnóstico

03-10-2026, Europe/Madrid. Continuación de `79312b3`, rama `codex/conversation-detection-g0`, sin reiniciar la evaluación. **Código validado con fixtures, no instalado.** Pixel conserva G2.2 con GPS `c6cdedf`, firma original y33ajustes; usuario confirmó GPS funcionando. Último cierre experimental: OFF comprobado en el informe G2.2. No se ha consultado ni activado el teléfono en este trabajo.

## Evidencia frente a hipótesis

El usuario informa algunas palabras reconocidas y muchas omitidas/incorrectas. Sin grabaciones ni frases alineadas no se puede calcular exactitud ni atribuir palabras concretas a una etapa. Último tramo:825paquetes/chunks,41,25s PCM,4episodios VAD completados,3resultados aceptados por filtros,1abstención y0descartes por saturación. Cero pérdidas/errores/descartes nativos observados y máximos UI90/nativo79ms. No demuestra que el PCM contuviese todas las palabras ni que el texto aceptado fuese correcto. Hueco492ms y7`pcmDeliveryDrops` históricos siguen abiertos.

La revisión de `LocalTranscriptSession.kt`, VAD, coordinador, adaptador Android y puente TypeScript identifica:

| Ruta comprobada en código | Incertidumbre del tramo anterior |
| --- | --- |
| ASR ignora PCM mientras verifica pesos/carga, aunque VAD pueda procesarlo. | Duración de audio coincidente con carga. |
| Pre-roll200ms; exige300ms de chunks en estado posible voz, sin incluir todo el pre-roll en ese mínimo. | Si se excluyeron partes breves o débiles. |
| Corta segmentos a8s sin solapamiento; cierre habitual al volver a sin actividad tras silencio VAD. | Si cortó dentro de una palabra; episodios VAD no cuentan cortes ASR. |
| OFF/cesión/hueco borran fragmentos abiertos y trabajos pendientes; JNI activo drena e invalida su resultado. | Si quedó un fragmento abierto al OFF; cero episodios VAD interrumpidos no es un contador de fragmentos ASR. |
| Solo un trabajo; descarta otro segmento si está ocupado. | Saturación no evidenciada en ese tramo (`dropped=0`); no usarla para explicarlo. |
| Idioma automático por segmento; filtros es/ca, vacío y estructura. | Motivo de la abstención y etiquetas retornadas. es/ca no acreditan idioma real ni alternancia. |
| Máximo tres fragmentos temporales visibles; `accepted` cuenta antes de entregar callback. | Sin referencia del texto visto no se distingue reconocimiento incorrecto de sustitución del texto temporal. |

Modelo, idioma, VAD, segmentación y señal acústica siguen como **hipótesis sin causa atribuida**. Palabras incorrectas en resultados aceptados no prueban fallo del VAD. Los filtros estructurales no detectan todos los errores/alucinaciones.

## Cambio implementado

`transcription.analysis` añade agregados al JSON del modal técnico existente. Solo RAM, sin audio/texto/timestamps de conversación/eventos por frase/rutas/mensajes de excepción/identificadores. Se conservan modelo, idioma automático, umbrales, límites, filtros efectivos, almacenamiento y rutas del asistente. Sin ajustes nuevos ni envíos a Hermes.

| Contadores | Significado |
| --- | --- |
| `pcmAudioMs`, `loadingAudioMs` | Duración PCM válida recibida por el puerto ASR; subconjunto anterior a motor listo. No duración de habla. |
| `silenceClosures`, `limitClosures`, `shortSegments` | Cierres por VAD sin actividad, límite8s y cierres excluidos por mínimo300ms. Cortos incluidos en cierres, fuera de `abstentions`. |
| `interruptedSegments`, `interruptedAudioMs` | Fragmentos abiertos borrados por invalidación/cierre, con contexto/silencio acumulados. Reset repetido sin fragmento no cuenta otra interrupción. |
| `submittedAudioMs` | Audio que pasa el mínimo y se ofrece al trabajador, incluso si después se descarta por ocupación/invalidez. |
| `decodeCalls`, `decodedAudioMs`, `decodeTotalMs`, `decodeMaxMs` | Intentos/audio de entrada y duración monotónica de decode, también fallido/invalidado. Excluye carga, cola, filtros y UI. No es memoria interna JNI ni latencia completa. |
| `rejectedLanguage`, `rejectedEmpty`, `rejectedStructure`, `decodeErrors`, `processingErrors` | Desglose de abstenciones vigentes por primer filtro aplicable, excepción de decode u otra excepción de procesamiento/entrega, sin contenido. Orden: idioma, vacío, estructura. |
| `languageEs`, `languageCa`, `languageOther` | Etiquetas de resultados aún vigentes antes del filtro; otros incluye desconocido sin guardar su valor. No mide alternancia/acierto. |
| `invalidatedDecodes` | Inferencias que terminan invalidadas por OFF/generación/caducidad; no abstenciones por comprensión. |
| `delivered` | Resultados vigentes entregados al listener del teléfono; no acredita lectura, permanencia visible ni corrección. |

Agregados conservados tras OFF y reiniciados en siguiente inicio ASR válido; PCM/texto se borran como antes. Durante drenaje JNI pueden completarse tiempos/invalidez: leer cierre definitivo cuando `worker=false/busy=false/inputBufferedBytes=0`. No se añade cancelación ni límite de inferencia.

Los tiempos de PCM/segmentación/decode no constituyen una partición de palabras o habla: incluyen contexto/silencio, excluyen candidatos no confirmados y pueden divergir por descartes o trabajos pendientes borrados. No restarlos para calcular palabras perdidas.

## Validación

12 pruebas Kotlin específicas `LocalTranscriptSessionTest` pasan (2nuevas y ampliación de invalidación); compilan fuentes compartidas de producción. Cubren cortes/mínimo/borrado, carga, causas de abstención, idiomas, tiempos con reloj controlado, entrega, reinicio y ausencia de contenido privado en diagnóstico. 35pruebas Node específicas coordinador/VAD pasan; TypeScript completo y fixtures, oxlint con tipos del TypeScript cambiado correctos.

No se repiten suites completas732/220 históricas, build APK, instalación, GPS ni batería física. Sin firma/versión instalada nuevas. Fixtures no validan precisión acústica, valenciano, latencia real o convivencia bajo inferencia. **Este incremento aporta observabilidad, no corrige precisión ASR.**

## Próximo paso acotado

Una futura lectura posterior a OFF con estos contadores permitirá localizar exclusiones antes de modificar reconocimiento. Requiere incorporar el incremento al móvil mediante una decisión posterior; no reinstalar por defecto. Si se ensaya, dos frases breves de referencia (española y valenciana, cada una<8s), motor listo antes de hablar y resultado/intervalo suficiente entre frases. Comparación visual local sin conservar audio/texto, sin asistente ni consultas automatizadas UI durante ON, tope120s y siempre OFF. No repetir G0/G1/G2 ni continuidad100s.

Carga/corte/rechazo/interrupción localizarían exclusión de audio/resultado, sin explicar automáticamente una palabra. Si ambos fragmentos llegan a decode/entrega sin exclusiones y siguen con errores, se acota la incidencia a reconocimiento/señal/idioma, sin justificar automáticamente otro modelo o VAD.

G3/perfiles excluido. Hermes, firma, ajustes, bloqueo desactivado, firmware y otros proyectos conservados. Referencias: [G2.2](conversation-detection-g2-asr-results.md), [G2.1](conversation-detection-g2-results.md), [GPS instalado](gps-location-freshness-2026-10-03.md).

## Preparación autorizada de G2.3

El usuario aprobó continuar con APK de diagnóstico y ensayo breve. Se identifica como **0.8.1-es.5-conversation.g2.3**, paquete `com.faceclaw.app`, código805; helper acepta también versiones anteriores con `-ExpectedVersion`. No cambia motor/modelo/umbrales. Preparación NativeScript, AAR compartido, compilación Android release unsigned y lint vital correctos. La primera invocación Gradle omitió `-Prelease` y llegó a metadata debug fallida; se corrigió la invocación a `assembleRelease -Prelease -PfaceclawUnsigned`, sin cambio adicional de código para ese error.

Firma original verificada con helper que falla si falta cualquiera de los dos originales. APK contiene campos nuevos de diagnóstico en DEX; fuente GPS generada idéntica a `FaceclawLocationProvider.kt` vigente (`c6cdedf`). Sin descarga de pesos, grabaciones, perfiles ni activación experimental.

| Artefacto | SHA-256 |
| --- | --- |
| G2.3 firmada | `83cfa3616266fa70a352603abee3d4832737d0f49e1e72acd1d87564acdebb53` |
| G2.3 unsigned | `1880809911365cb8faa9dda779593b684ec8e47675b54892a903880758c0eb16` |

Locales en `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g2.3.apk` y mismo nombre con `-unsigned.apk`. NAS `/volume1/home/Dani/Faceclaw/apk-builds/conversation-g2.3/`, ambos hashes idénticos, carpeta700/archivos600. **Todavía no instalada**: Pixel USB autorizado, versión G2.2 y sin wakelock experimental activo al consultar; no se obtuvo OFF visible al estar inaccesible la pantalla. Se solicitó desbloquear y mostrar OFF para verificar cierre antes de exportar ajustes/instalar. Ese requisito pendiente es comprobación de estado, no nueva autorización de la actualización. No empezar el ensayo ni instalar mientras no esté comprobado.
