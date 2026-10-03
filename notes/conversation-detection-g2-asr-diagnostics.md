# Omisiones ASR: análisis e incremento de diagnóstico

**Aclaración de alcance posterior al cierre:** el usuario cuestiona haber excluido perfiles de voz; recuerda pedir adelantar pruebas. No considerar «G3/perfiles excluido» de las secciones históricas como veto permanente confirmado. G3 original con perfil propio local es una opción pendiente de consentimiento concreto para crear/persistir el vector; no se ha recogido ni autorizado biometría en esta aclaración. La alternativa manual no se impone como único siguiente paso. Revisar el apartado registro del usuario de [la auditoría original](auditoria-conversaciones-g2-2026-10-03.md). Priorizar avance G3 sin repetir G2 por defecto; cierre/instalación ASR conservados.

03-10-2026, Europe/Madrid. Continuación de `79312b3`, rama `codex/conversation-detection-g0`, sin reiniciar la evaluación. Código `b92f18a` publicado. **G2.3 instalada con firma original y33ajustes idénticos; ensayo guiado cerrado en OFF y drenado.** Usuario valora transcripción casi perfecta, con algunas palabras valencianas pasadas a castellano que considera poco importantes. Se conserva modelo/umbrales; no acredita precisión bilingüe general ni resuelve incidencias históricas. Conserva GPS `c6cdedf`, cuyo funcionamiento físico ya confirmó el usuario; no se repite GPS. Las secciones iniciales analizan el cierre anterior; nueva instalación y resultados al final.

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

## Validación inicial del código

12 pruebas Kotlin específicas `LocalTranscriptSessionTest` pasan (2nuevas y ampliación de invalidación); compilan fuentes compartidas de producción. Cubren cortes/mínimo/borrado, carga, causas de abstención, idiomas, tiempos con reloj controlado, entrega, reinicio y ausencia de contenido privado en diagnóstico. 35pruebas Node específicas coordinador/VAD pasan; TypeScript completo y fixtures, oxlint con tipos del TypeScript cambiado correctos.

En la validación inicial no se repitieron suites completas732/220 históricas, build APK, instalación, GPS ni batería física. La preparación/instalación posteriormente autorizada se documenta abajo. Fixtures no validan precisión acústica, valenciano, latencia real o convivencia bajo inferencia. **Este incremento aporta observabilidad, no corrige precisión ASR.**

## Próximo paso acotado

Una lectura posterior a OFF con estos contadores permitirá localizar exclusiones antes de modificar reconocimiento. El usuario autorizó después incorporar el incremento y el ensayo; no reinstalar por defecto en la siguiente continuación. Dos frases breves de referencia (española y valenciana, cada una<8s), motor listo antes de hablar y resultado/intervalo suficiente entre frases. Comparación visual local sin conservar audio/texto, sin asistente ni consultas automatizadas UI durante ON, tope120s y siempre OFF. No repetir G0/G1/G2 ni continuidad100s.

Carga/corte/rechazo/interrupción localizarían exclusión de audio/resultado, sin explicar automáticamente una palabra. Si ambos fragmentos llegan a decode/entrega sin exclusiones y siguen con errores, se acota la incidencia a reconocimiento/señal/idioma, sin justificar automáticamente otro modelo o VAD.

G3/perfiles excluido. Hermes, firma, ajustes, bloqueo desactivado, firmware y otros proyectos conservados. Referencias: [G2.2](conversation-detection-g2-asr-results.md), [G2.1](conversation-detection-g2-results.md), [GPS instalado](gps-location-freshness-2026-10-03.md).

## Preparación autorizada de G2.3

El usuario aprobó continuar con APK de diagnóstico y ensayo breve. Se identifica como **0.8.1-es.5-conversation.g2.3**, paquete `com.faceclaw.app`, código805; helper acepta también versiones anteriores con `-ExpectedVersion`. No cambia motor/modelo/umbrales. Preparación NativeScript, AAR compartido, compilación Android release unsigned y lint vital correctos. La primera invocación Gradle omitió `-Prelease` y llegó a metadata debug fallida; se corrigió la invocación a `assembleRelease -Prelease -PfaceclawUnsigned`, sin cambio adicional de código para ese error.

Firma original verificada con helper que falla si falta cualquiera de los dos originales. APK contiene campos nuevos de diagnóstico en DEX; fuente GPS generada idéntica a `FaceclawLocationProvider.kt` vigente (`c6cdedf`). Sin descarga de pesos, grabaciones, perfiles ni activación experimental.

| Artefacto | SHA-256 |
| --- | --- |
| G2.3 firmada | `83cfa3616266fa70a352603abee3d4832737d0f49e1e72acd1d87564acdebb53` |
| G2.3 unsigned | `1880809911365cb8faa9dda779593b684ec8e47675b54892a903880758c0eb16` |

Locales en `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g2.3.apk` y mismo nombre con `-unsigned.apk`. NAS `/volume1/home/Dani/Faceclaw/apk-builds/conversation-g2.3/`, ambos hashes idénticos, carpeta700/archivos600. Inicialmente Pixel USB autorizado/G2.2 sin wakelock experimental, pero pantalla inaccesible; se solicitó desbloquear y mostrar OFF. Después usuario confirmó «esta en off visible», se comprobó y se instaló como sigue.

## Lectura OFF nueva antes de actualizar

La pantalla anterior a instalar ya tenía contadores distintos del cierre825chunks: **1351chunks/67,55s PCM**, huecoUI1046ms,6episodios VAD completados/0interrumpidos,1inicio/0cesiones. ASR3aceptados/3abstenciones/0descartes por ocupación; sin motivos de abstención en G2.2. No atribuir esta lectura a las dos frases guiadas de G2.3 ni sumarla a otros tramos: no hay cronología ni protocolo de esa actividad.

Nativo del stream: **1372paquetes/68,6s**, gapmáximo102ms, **21`pcmDeliveryDrops`**,0pérdidas/duplicados/malformed/stale/queueDrops/errores de decode. Diferencia1372−1351=21, compatible con pérdida de entrega tras decodificación; no demuestra que todos coincidan con el hueco1046ms. `BoundedPcmDelivery` conserva un solo chunk pendiente y cuenta sustituciones antes del dispatcher o descarte por antigüedad>250ms. Eso localiza el contador en entrega, no identifica qué retrasó el dispatcher ni qué palabras afectó. No atribuir a JNI, consultas UI, VAD o modelo sin cronología. Los siete descartes/hueco492 históricos siguen abiertos; esta lectura añade una incidencia, no los resuelve.

Cierre comprobado **enabled/lease/timer=false, buffers0, ASRworker/busy=false/input0**,0wakelocks experimentales activos. `capturing:true` en nativo es el snapshot antes de STOP, no captura actual. Modal cerrado antes de instalar. Sin audio/frases guardados.

## Instalación y ensayo acotado autorizado

Helper seguro actualizó con `adb install -r`; manifest instalado **G2.3/código805**. SHA de firmada conserva el de la tabla. Respaldo fresco G2.2+GPS extraído antes: `dist/conversation-g0/before-install-20261003-175043.apk`, SHA256`9e197c66981bdcee57dd3a91206c523170871c1a0c49f997244963988677b475` (coincide con GPS instalado conocido); copia NAS `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-g2.2-gps-before-g2.3-20261003-175043.apk`,600/hashcoincidente.

**33ajustes actuales idénticos antes/después**, comparación privada completa. Exportaciones `.tools/g2.3-private/before.xml`/`after.xml` con ACL usuario/SYSTEM; NAS `/volume1/home/Dani/Faceclaw/connection-backups/2026-10-03-g2.3/`700/archivos600 y checksums privados verificados sin mostrar contenido. Copias del almacenamiento compartido del Pixel retiradas. Hermes/bloqueo conservados; no nueva prueba de respuesta de Hermes o GPS en esta instalación.

Arranque nuevo comprobado **OFF/inactivo,0episodios/0chunks**,0wakelocks experimentales. Fuente del incremento ZIP`faceclaw-g2.3-source-b92f18a.zip` y notas en raíz privada NAS,600 y hashes coincidentes. Código publicado en GitHub.

Se envió guía de un único ensayo: esperar estado listo, frase de referencia española, esperar resultado (si no aparece en20s cerrarOFF y no segunda),2s de separación, frase valenciana, esperar hasta20s, siempreOFF. Referencias sintéticas proporcionadas en chat, no transcripciones del usuario almacenadas. Solicitud de resultado exclusivamente cualitativo por frase y OFF confirmado; sin copiar texto/capturas. Se respetó ausencia de consultas UI/dispositivo durante ON. Tras usuario confirmar OFF se leyeron agregados y se comprobó drenaje; modal cerrado.

## Resultado del único ensayo G2.3

Usuario confirma OFF y valora «casi perfecto»; indica que se transcribió valenciano con algunas palabras pasadas al castellano y considera esa diferencia poco importante. No se almacenaron transcripciones ni audio ni se calcularon errores contra referencia alineada. No atribuir la mejor valoración a los contadores: el código nuevo solo añade diagnóstico y la precisión varía entre muestras. Conservar la incidencia inicial de omisiones, sin declararla resuelta globalmente. No añadir otro ensayo o cambiar modelo/umbrales por este resultado.

Lecturas después de OFF:

| Dato | Observación |
| --- | --- |
| Captura |900chunks/paquetes,45s PCM,1inicio/0cesiones,0clipping |
| Continuidad | UIgap88ms/nativo86ms;0pérdidas/errores/duplicados/malformed/stale/queueDrops/pcmDeliveryDrops en este tramo |
| VAD |2episodios completados,0interrumpidos;6230ms positivos, no duración de conversación |
| Entrada ASR |45000ms PCM recibidos;250ms durante carga; no cronología para asignarlos a voz/silencio |
| Segmentación |2cierres por silencio,0cortes8s/segmentos cortos/interrumpidos;8250ms ofrecidos al trabajador |
| Inferencia |2decodeCalls,8250ms de entrada decodificada,1460ms acumulados de decode/máximo777ms |
| Filtros/entrega |2aceptados y2entregados,0abstenciones/saturación/rechazo de idioma-vacío-estructura/errores decode-procesamiento/inferencias invalidadas |
| Etiquetas de modelo |2`es`,0`ca`,0otros; etiquetas por segmento, no referencia del idioma realmente hablado |

En este tramo no se evidencia exclusión de **segmentos ofrecidos** por cortes/límites/filtros/ocupación/invalidez o pérdida de entrega. No prueba que el PCM/segmentador incluyese cada palabra pronunciada. Las etiquetas2es y la observación de palabras valencianas castellanizadas son compatibles con una limitación de la ruta de idioma/reconocimiento, sin atribuir causa exacta al detector automático, modelo, acústica o segmentación. Aunque la tarea configurada sigue siendo `transcribe`, no garantizar que el modelo preserve siempre todas las palabras del idioma original.

**Cierre nuevo comprobado:** enabled/lease/timer=false, buffers0; ASRenabled/status=inactivo/worker=false/busy=false/inputBufferedBytes=0;0wakelocks experimentales activos y modal de métricas cerrado. `capturing:true` es snapshot nativo previo alSTOP. Modelo/umbrales/GPS/ajustes/Hermes/firma/firmware y otros proyectos conservados. No se repite batería ni GPS; estabilidad prolongada, autonomía/Doze, convivencia bajo inferencia con asistente, alternancia dentro de frase y abstención semántica siguen pendientes. Ceros nuevos no resuelven21descartes/UI1046 previos ni históricos492/siete descartes.
