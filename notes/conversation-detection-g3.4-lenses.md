# G3.4 — conversación local en las gafas, 04-10-2026

**Instalada `0.8.2-es.5-conversation.g3.4`, código805, firma española original.** Continúa `3e3922a` en `codex/conversation-detection-g0`. Actualización con `adb install -r`, respaldo fresco G3.3 y 33 ajustes privados idénticos antes/después. El registro existente se conserva: no se ha creado otro perfil, leído/exportado su vector ni copiado al NAS.

## Implementación

App propia **Conversación local** (`local-conversation`) registrada en el launcher/selector de las gafas. Usa el mismo coordinador y motores G3.3 del móvil, sin una segunda captura ni servicio independiente. Abrir, restaurar o pintar la ventana no activa audio ni descarga pesos. Android/G2; iOS muestra la indisponibilidad correspondiente.

- Toque dentro de la app: iniciar explícitamente, o detener si la sesión está ON. Comprueba perfil/modelos y drenaje antes de iniciar, reutilizando el plan G3.3. Sin perfil conserva el alcance anterior sin comparación; un error al consultar un perfil nunca degrada silenciosamente a ese modo.
- Doble toque **dentro de la app**: OFF antes de ceder foco al selector. Cerrar la ventana también detiene y retira suscripciones/sondeo. Doble toque en un menú conserva la navegación normal del shell; en el selector rigen sus gestos habituales. La prioridad Hey Even/PTT/asistente y el máximo120s siguen en el coordinador existente.
- Tap-then-hold abre el menú de la app: inicio/OFF, Texto local ON/OFF y OFF explícito. La selección de texto se comparte en RAM con el móvil; solo cambia estando OFF, sin añadir preferencias persistentes. Un menú de detener abierto antes de agotar el plazo nunca reinicia accidentalmente al seleccionarlo después.
- Las lentes muestran OFF/escucha/suspensión/error, perfil guardado/ausente/error, texto realmente activo y tiempo restante. Comparación y alternancia se presentan como provisionales. No confirma participación ni identidad en vivo.
- Transcripción temporal es/valencià en las lentes, sin atribuirla a una persona: usa el buffer G3.3 de últimas tres líneas/máximo600 caracteres por línea. Rueda para revisar líneas ajustadas a la anchura; normalmente sigue el final. No mantiene una copia histórica en la app. OFF, cesión, pérdida de continuidad y error retiran el texto anterior de la vista; los motores existentes limpian sus buffers.
- El sondeo del drenaje en OFF dura como máximo30s, solo de UI; se cancela al cerrar. No inicia motores/captura ni mantiene un temporizador permanente estando OFF.

Corregida además la indicación del móvil: si otra entrada inicia una sesión con un modo distinto, «Texto local opcional» refleja el motor realmente activo, en vez de mostrar la selección para el próximo inicio.

No se editan VAD/ASR/embeddings, modelos, umbrales, segmentación, cifrado/almacén del perfil, GPS, proveedor, Hermes, Wear ni firmware. No se añaden herramientas para leer el texto, audio o perfil desde Hermes; el catálogo normal de apps solo descubre la nueva ventana como las demás. No se conecta el contenido experimental al asistente.

## Observación del dispositivo

El usuario confirma OFF antes de la consulta inicial. Pixel USB conectado; UI G3.3 observada: «Conectado», «Conversación local · OFF», «Mi perfil: guardado en este móvil», texto opcional ON. Cero wakelocks experimentales **en la sección actual** de `dumpsys power`; el historial contiene adquisiciones antiguas y no acredita recursos activos.

Instalación G3.4 `Success`, versión/código comprobados y 33 ajustes idénticos después, incluidos Hermes y bloqueo desactivado. La primera consulta posterior encontró la pantalla de bloqueo del sistema. Después el usuario confirmó Pixel desbloqueado con Faceclaw abierta: observados «Conectado», «Conversación local · OFF», «Mi perfil: guardado en este móvil», texto opcional ON e inicio explícito disponible. Cero wakelocks experimentales activos después. La vista previa estaba negra/pantalla de gafas apagada; no se abrió la app de lentes ni se observó texto bajo escucha. No se activó audio ni empezó ningún ensayo.

Reloj desconectado deliberadamente por el usuario porque ya estaba actualizado; no se reconecta ni se repite el ACK previamente documentado. Se conserva Wear0.8.2-es.1 y la confirmación previa del usuario de gafas /36 funcionando como antes, sin nueva medición ni modificación de firmware.

## Comprobaciones de software

**67 Node correctas,0fallos**: coordinador/prioridad, plan UI, cableado móvil, lentes y regresiones del host iOS. Incluyen apertura sin captura, perfil existente sin ASR, fallo de perfil, drenaje acotado, texto obsoleto tras suspensión/OFF/error/plazo, revisión de líneas, cierre y menú OFF retenido después del plazo. Verificación de límites del viewport con fuente grande simulada. Son comprobaciones de software; no acreditan lectura física, precisión acústica, autonomía ni Doze.

TypeScript, lint completo con tipos, webpack producción, Android `assembleRelease` offline y `lintVitalRelease`: correctos. Sin cambios Kotlin; no se repite la batería240Kotlin ni las782Node anteriores. Reutilizado el AAR. Webpack directo con restauración del runtime `assets/app/package.json` original, como en el cierre anterior; el proyecto Android generado aplica el `app.gradle` fuente. APK final: paquete/código/versión/certificado verificados, nueva app en `assets/app/bundle.mjs`, configuración runtime y siete bibliotecas nativas idénticas byte a byte a G3.3.

## Artefactos y continuidad

Certificado público SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Ambos originales locales comprobados presentes antes de firmar; no se genera clave ni desinstala la app.

| Artefacto local (`dist/conversation-g0/`) | SHA256 |
| --- | --- |
| `faceclaw-0.8.2-es.5-conversation.g3.4.apk` | `b9c69767fdb58a22d0b3c351228582075a01f6a42fe9cd6622c9d078c9c86332` |
| `faceclaw-0.8.2-es.5-conversation.g3.4-unsigned.apk` | `c04a581b6902358e6ac083701f84f7456232911b740b3503b5ad2c1002008153` |
| `before-update-g3.4.apk` (G3.3 extraída del Pixel) | `dc0370bae67863a5a6b061f374b8186def0997544a93762c3c04039467dfaf05` |

Ajustes privados `.tools/g3.4-private/before.xml`/`after.xml`, ACL usuario/SYSTEM. Contienen preferencias, no el almacén noBackup del perfil. Destinos NAS autorizados: `apk-builds/0.8.2-conversation-g3.4/` y `connection-backups/2026-10-04-g3.4/`, bajo `/volume1/home/Dani/Faceclaw/`; registrar comprobación de copias/hashes al completarla. Nunca incluir perfil/audio/secretos en fuente, notas o Git.

## Próxima continuidad

Usar el perfil existente y el flujo integrado móvil/gafas. No repetir registro ni reiniciar evaluación/baterías. La visualización de texto y los controles en lentes están implementados y comprobados en software; observación física bajo escucha y precisión de comparación/participación siguen pendientes. Corregir incidencias concretas de uso sin prometer resultados no observados. Incidentes históricos492ms/siete descartes y UI1046ms/21drops siguen abiertos. G4 solo ante errores justificados, G5 estabilidad/autonomía prolongadas pendientes, G6 requiere decisión posterior; sin audio/texto experimental a Hermes. Verificar conexión y OFF antes de cualquier consulta de UI.
