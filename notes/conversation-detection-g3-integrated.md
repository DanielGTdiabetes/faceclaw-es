# G3 integrado — 04-10-2026

Continuación desde el cierre `6244cf0`, sin reiniciar la evaluación G2. El usuario pidió completar el flujo integrado y corregir incidencias reales después, evitando pruebas físicas por cada componente. Hoy el móvil está desconectado; se avisó cuando la APK quedó lista. **G3 compilada y firmada, aún no instalada.** El último estado instalado comprobado sigue siendo G2.3, OFF, con GPS vigente y los 33 ajustes conservados.

## Cambio implementado

La pantalla principal ofrece un inicio de conversación local y un OFF común. Sin perfil, conserva transcripción es/valencià y no evalúa participación. Con perfil propio compatible añade comparación de voz y alternancia temporal. Opciones permite crear/borrar Mi perfil, usar solo transcripción o actividad VAD y consultar agregados después de OFF. Texto temporal: últimas tres líneas/máximo600 caracteres por línea, borrado al parar, ceder audio o perder continuidad; no se atribuye el texto a una persona mediante resultados de otro trabajador.

Crear Mi perfil requiere elegir explícitamente «Crear y guardar mi perfil» tras explicar persistencia, privacidad y límites. Si falta el modelo de voz, su descarga voluntaria (~29 MB, reutiliza WeSpeaker CAM++ ya definido en Microphones) no inicia captura ni enrolamiento. No se descarga nada desde este PC ni se cambia Whisper. El usuario habla solo con G2 puestas, tres o más frases diferentes de 4–8 s con pausas. El enrolamiento exige ≥3 segmentos coherentes y ≥10 s en estado VAD «posible voz». Cancela/borrado al OFF o cesión antes de completar; una discontinuidad reinicia la acumulación. Al guardar pasa automáticamente a OFF.

Solo se persiste el centroide propio normalizado. Almacén independiente de perfiles históricos: `noBackupFilesDir/faceclaw-own-voice/profile.aes`, AES-GCM con clave exclusiva Android Keystore. La dimensión y versión son parte del formato; el AAD vincula hash de modelo y 16kHz. La carpeta noBackup queda excluida de backup/transferencia de Android aunque allowBackup general permanezca activo. **No copiar esta carpeta, vectores o clave a NAS, exportaciones ni notas.** No se importan perfiles históricos, no se llama a SpeakerRegistry, no se crean perfiles de terceros ni se adapta el centroide al ambiente. Borrar Mi perfil retira archivo, clave exclusiva y copias RAM; no borra perfiles de otras funciones.

Preparación y cifrado del perfil ocurren fuera del hilo UI; la publicación final hace solo renombrado atómico bajo comprobación de generación/plazo. OFF/cesión invalida una preparación tardía antes de publicar; el temporal se elimina al drenar. Si el proceso muere en mitad de escritura puede quedar un temporal cifrado sin uso, excluido igualmente de backup; Borrar Mi perfil también elimina esos temporales. No se guardan muestras, frases ni textos de enrolamiento.

Un trabajador de embeddings y el trabajador ASR existente, cada uno acotado a un segmento pendiente/en curso, CPU1 por motor. Segmentación compartida máximo8s/pre-roll200ms: no se cambian umbrales ni comportamiento de ASR/VAD. Para embeddings se exige ≥1s de posible voz, energía RMS≥0,006 y clipping<1%. Enrolamiento rechaza similitud<0,70 frente a centroide provisional. Comparación ≥0,80 significa compatible con mi perfil, ≤0,60 no coincidente, intervalo/resultado inválido insuficiente. Dos alternancias de categorías dentro de20s producen «conversación candidata»; caduca y se limpia ante incertidumbre/gap/cesión/OFF. Son **parámetros iniciales de ingeniería, sin calibración acústica en este Pixel**. Dos categorías no identifican a un interlocutor ni prueban una persona presente. No se guardan vectores no propios después de comparar.

Captura OFF al arrancar, tope120s incluyendo suspensión, prioridad Hey Even/PTT/asistente intacta. El modelo de voz se valida por SHA256 antes de JNI; perfil ausente/incompatible o fallo no cae al verificador permisivo histórico. JNI activo no se interrumpe: se invalida y drena, borrando PCM/float/vectores y liberando motor. No se inicia captura hasta que el motor de comparación esté preparado. G3 no ejecuta acciones ni conecta audio/texto experimental a Hermes.

## Evidencia y límites

Implementación y comprobaciones de software completadas; **sin instalación, perfil real, captura ni ensayo físico nuevos**. No acredita precisión de identidad/participación, convivencia física bajo ambos motores, latencia/energía/RAM total, autonomía o Doze. La segmentación por VAD puede unir turnos cortos o mezcla en una misma frase; no detecta solapamiento ni es protección anti-replay. El modelo de embeddings ya existente es inglés y no se ha validado aquí en español/valenciano. Estos límites no bloquean instalar el flujo y corregir errores concretos en uso.

Se conserva valoración anterior del ASR: casi perfecto en el único ensayo guiado, algunas palabras valencianas castellanizadas poco importantes para el usuario. No atribuirlo a contadores ni afirmar precisión general. Se mantienen abiertas las incidencias históricas de entrega21drops/UI1046ms y siete/492ms, sin causa ni resolución. No más baterías G2/GPS por defecto.

## Validación y APK

- 40 pruebas Node de coordinador/VAD correctas (5 nuevas de integración).
- 21 Kotlin específicas correctas:9 participación (enrolamiento/calidad/caducidad/cancelación tardía/saturación/sin perfil) y12 ASR existentes.
- TypeScript, oxlint type-aware, XML principal, prepare/AAR, assembleRelease y lintVital correctos.
- Versión `0.8.1-es.5-conversation.g3.0`, código805, firma original comprobada por helper seguro. Sin desinstalar/generar firma ni instalar en este cierre.
- Firmada: `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g3.0.apk`, SHA256 `905948957dfd0855e121c02d9cdcb2ebc7805a1c149584b80da44932072bc450`.
- Sin firma: `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk`, SHA256 `a0d9111926b44beae53f94399e9e93bf008a9147733b98daa964d03e6e69a6c7`.
- Certificado público SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

## Próximo paso concreto

Usuario avisado: conectar/desbloquear Pixel, Faceclaw OFF visible. Tras conexión: comprobar estado actual, respaldar APK y ajustes privados nuevos, actualizar con adb install-r y comparar todos los ajustes preservando Hermes/bloqueo/GPS. No consultar UI mediante herramientas durante ON. El perfil se crea únicamente si el usuario elige el flujo informado en la app; ningún enrolamiento automático ni envío de audio. Cerrar siempre OFF. El ensayo de continuidad100s sigue aplazado y no es requisito.
