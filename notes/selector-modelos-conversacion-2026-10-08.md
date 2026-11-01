# Selector de modelos de Conversación · 08-10-2026

**Confirmación posterior del usuario:** la primera frase dicha con su voz usando Pixel se ha transcrito correctamente. Una frase confirmada, sin registro ni consulta nueva del móvil; no demuestra comparación con otras voces/ruido ni continuidad larga. [Relevo para el PC de casa y siguientes pruebas](relevo-casa-pixel-2026-10-08.md).

El usuario encarga sustituir la selección oculta/confusa por controles entendibles, comparar Soniox con modelos locales, descargar uno superior a small, usar Hermes y poder probar solo texto. Autoriza publicar en GitHub al terminar y probar la vía del Pixel. Se incorpora la API pública de reconocimiento local de Android; no se utiliza una librería ni interfaz privada de Android System Intelligence.

## Uso de la candidata S2.6.10

1. Mantén Conversación en OFF. En la pantalla principal pulsa **Motor** y elige **Soniox**, **Motor del Pixel**, **Whisper base**, **Whisper small** o **Whisper medium**.
2. Para un modelo local sin descargar, aparecerá **Descargar … MB** junto al motor. Púlsalo explícitamente. Verás el porcentaje; puedes pausar y reintentar. Elegir un modelo o terminar su descarga no inicia la escucha. Los archivos existentes de otros modelos se conservan.
3. Elige **Texto y Hermes** o **Solo texto**. El segundo modo no consulta a Hermes. Con el primero, el reconocimiento local mantiene el audio en el móvil, pero el texto se envía al puente Hermes y su proveedor: este selector no convierte el modelo de Hermes en local/gratuito.
4. El idioma comienza en **Automático** (español/catalán-valenciano) para Soniox y Whisper. Puedes escoger **Solo español**; la sesión respeta la elección, que queda bloqueada hasta OFF. El Pixel usa **Solo español**: el servicio probado anuncia es-ES instalado, no catalán/valenciano. Al volver a otro motor se recupera la elección anterior.
5. Pulsa **Iniciar**. La sesión dura como máximo veinte minutos y termina después de más de cinco minutos sin voz. Soniox requiere su clave; Whisper requiere los archivos del modelo elegido. Solo texto funciona sin puente Hermes.
6. **Detener** borra el texto temporal. Durante ON el móvil muestra texto y, si se usa Hermes, sus últimas aportaciones. En las gafas, «Texto y Hermes» conserva las lentes apagadas mientras escucha; «Solo texto» muestra el texto y permite desplazarse con la rueda.

El menú de la app Conversación de las gafas comparte motor, modo, idioma y descarga. En ON solo permite detener. Los diagnósticos/perfil/métricas se conservan en **Opciones avanzadas** del móvil. Los selectores son RAM: al reiniciar vuelven a Soniox, Texto y Hermes e idioma automático; no modifican los ajustes del asistente ni su proveedor.

## Qué se prueba realmente

| Motor | Archivos | Reconocimiento | Hablantes |
| --- | ---: | --- | --- |
| Soniox | Sin descarga | Nube, clave necesaria | Etiquetas de voces y asociación opcional |
| Motor del Pixel | Sin descarga en esta prueba | API pública local, español, experimental | Desconocidos |
| Whisper base int8 multilingüe | 161 MB | Móvil | Desconocidos |
| Whisper small int8 multilingüe | 376 MB | Móvil | Desconocidos |
| Whisper medium int8 multilingüe | 947 MB | Móvil, experimental | Desconocidos |

Los tamaños del botón se redondean hacia arriba en MB decimales. Más parámetros no garantizan un mejor resultado con voces lejanas ni funcionamiento en tiempo real. No se ha ejecutado medium ni comparado el reconocimiento con personas reales en esta implementación.

La selección es explícita hasta el decodificador: seleccionar base ya no carga small por encontrar sus archivos. No se sustituye un modelo local ausente o corrupto por otro. Los hashes se verifican antes de entrar en sherpa-onnx. Medium está fijado a la revisión [8c31d285… del mantenedor](https://huggingface.co/csukuangfj/sherpa-onnx-whisper-medium/tree/8c31d28503847560985df21f90e14f0c736e075e): encoder 374.196.283 bytes, decoder 571.059.257 y tokens 816.730, total 946.072.270. SHA-256 de pesos obtenidos de metadatos LFS; tokens descargados a un temporal local y su SHA-256 calculado coincide con base/small. Codex no ha iniciado la descarga de pesos. En la revisión del móvil a las 13:33 CEST, la UI anuncia base/small/medium «descargado»: presencia de archivos no vacíos, sin acreditar por ello validación de hashes, carga o inferencia de medium ni quién lo descargó.

## Conexión local con Hermes

Whisper y Pixel publican fragmentos sin inventar hablantes ni identidad del portador: `speaker:null`, relación desconocida y asociación 0. El tiempo se marca `ventana`, con límites de captura PCM reales; no afirma alineación de cada palabra. Whisper conserva el filtro de español/catalán, acondicionamiento de nivel, ventanas de seis segundos con solape de tres y eliminación de texto repetido existente. Las ventanas lentas pueden perderse; las métricas permiten observarlo. El límite interno de Whisper pasa a admitir el máximo manual de veinte minutos, sin cambiar los dos minutos predeterminados de los diagnósticos.

Los episodios/canal admiten estos fragmentos solamente en identidad opcional y con `conv/2`. El contrato enviado al puente no cambia y no requiere desplegar/reiniciar Jarvis. El modo con identidad requerida sigue rechazando ventanas locales. El fallback de Soniox conserva el comportamiento existente: no alimenta Hermes como si fuera el motor elegido; la sesión manual se detiene si deja de usar el motor solicitado. Cortes/OFF invalidan fragmentos y respuestas tardías. Cadencia, plazos, presupuesto manual por duración, prioridades y memoria con acuse se mantienen.

## Verificación y entrega

Pruebas locales de selección/bloqueo ON, modelos exactos, descarga/pause/callback tardío, episodios anónimos, canal y respuesta Hermes, texto sin Hermes y menús obsoletos. Pruebas nativas: 34/34 (`LocalTranscriptPhaseTest`, `LocalTranscriptSessionTest`, `LocalTranscriptWindowsTest`), incluyendo entrega con límites de ventana más allá de los dos minutos previos y liberación tras OFF. TypeScript y oxlint correctos.

## Prueba real del Pixel, sin micrófono

El diagnóstico temporal usa [la fábrica pública on-device](https://developer.android.com/reference/android/speech/SpeechRecognizer#createOnDeviceSpeechRecognizer(android.content.Context)) y [EXTRA_AUDIO_SOURCE](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_AUDIO_SOURCE). Su manifest no tiene permisos RECORD_AUDIO ni INTERNET. Audio conocido generado en el PC por Microsoft Helena Desktop sin red: 4.265 ms, PCM16 mono 16 kHz, entregado por tubería en bloques de 50 ms y sesión segmentada. No reproduce audio por altavoz ni captura personas/G2.

- API independiente: on-device disponible, es-ES/en-US instalados; ca-ES no anunciado. Reconoce «el lunes iremos al mercado para comprar tomates y preparar la cena», 4.663 ms desde el inicio, incluyendo el suministro en tiempo real del audio.
- Adaptador **real de la APK instalada**, cargado desde el paquete Faceclaw por el diagnóstico firmado con la misma clave y contexto sin permisos de micrófono: inicio aceptado, misma frase completa, ventana 0..4.450 ms y resultado a 4.688 ms. Tras stop: `enabled:false`, `worker:false`, cola 0, aceptados 1, descartes 0 y errores 0.
- Una primera prueba con archivo regular devolvió resultado vacío; la tubería y sesión segmentada sí funcionan. No extrapolar a precisión humana, latencia de inferencia aislada, ruido, distancia, batería ni veinte minutos continuos.
- Fuente y resultados sintéticos públicos: [evaluations/pixel-system-speech](../evaluations/pixel-system-speech/README.md). Aplicación auxiliar desinstalada al terminar. El adaptador solo admite Pixel compatible/español instalado, rechaza ausencia de soporte, invalida callbacks y limpia al OFF; no utiliza el reconocedor general de nube ni descarga modelos automáticamente.

## APK y revisión móvil

Primera APK S2.6.10 original `b8d8611c0cb146dbcab88612620dd58c9f90d008934de8adc854fe63232588a4` instalada/extraída igual, 35 ajustes byte idénticos/perfil guardado. Reversión S2.6.9 `d0d65331b46c1792bcdf04b6b54fe22a259f8ae58624bddba518c9a03fe481ce` en `dist/conversation-g0/before-update-s2.6.10-model-selector.apk`. Firma original, zipalign 16 KB, siete bibliotecas nativas y runtime package idénticos a S2.6.8. UI observada Conectado/OFF; Pixel disponible/solo español/sin descarga. Se cambia solo selección RAM a Pixel para revisar, sin ON. El usuario pide quitar «Display off» solapado en el mando: se retira esa etiqueta vacía de información y el texto general deja de afirmar dos idiomas automáticos sin atender al motor elegido.

Pruebas afectadas JS/TS finales 277/277; últimas compilaciones 203/203 de conversación, tsc/oxlint/webpack/Gradle/lintVital/firma correctos. Python local con agentes simulados 44/44, sin consultas a proveedores. La APK final con las correcciones visuales es `d9be4259ee278343c060fff1618b321ac049b27ee4d8919083420b003e259d60`, instalada y extraída con hash igual, 35 ajustes byte idénticos. Sus dos DEX son idénticos a la primera APK probada: cambios finales solo JS/texto, adaptador nativo probado conservado. La reversión a S2.6.9 se conserva sin sobrescribir; copias privadas finales en `.tools/model-selector-20261008-final-private/`. Comprobación OFF previa; sin arranque automático de escucha después. Publicación de fuentes/pruebas/notas autorizada; APK, firma, ajustes y audios quedan fuera de Git.

No se inicia conversación real ni se prueban lentes ópticamente. Sin ajustes persistentes, despliegue/reinicio del puente, cambios de suspensión ni NAS. Se conservan los cambios previos relacionados de sesión, métricas y entrega necesarios para reproducir el estado del móvil; el circuito Codex-Claude permanece desactivado.

Fuentes/pruebas/evidencia publicadas en [942da5e](https://github.com/DanielGTdiabetes/faceclaw-es/commit/942da5e872de4e54038a0d2ba94a34204e7afbcf), rama `codex/conversation-detection-g0`, remoto confirmado por ls-remote y divergencia 0/0. Se incluyen las mejoras previas relacionadas de memoria/discreción/entrega ya presentes en el estado instalado; los cambios ajenos de agent-bridge, evaluación contextual y consumo quedan locales. Sin APK, firma, preferencias ni audio en Git. Protocolo local simulado test_bridge también pasa. No hay nuevo despliegue de puente.

El móvil volvió a bloquearse tras la instalación final. La comprobación visual de la retirada del solapamiento queda pendiente de mantener Faceclaw visible; sí se inspecciona la **APK extraída instalada**: getter `padFocusLine` devuelve cadena vacía para «Display off» y el aviso antiguo «español/valenciano automáticos» está ausente. No se afirma observación de la pantalla final desde este chequeo del bundle.
