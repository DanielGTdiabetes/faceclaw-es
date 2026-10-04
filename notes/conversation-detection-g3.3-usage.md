# G3.3 — uso integrado con el perfil existente, 04-10-2026

**Estado posterior vigente: G3.3 instalada junto a Faceclaw0.8.2, firma original/código805,33ajustes idénticos y perfil guardado/OFF observados.** Leer [integración0.8.2](faceclaw-0.8.2-integration-2026-10-04.md). El usuario aclaró que actualizar la APK sí está autorizado. Las gafas notifican /35 y requieren /36; el usuario realiza la actualización con el actualizador de Faceclaw, sin modificaciones propias del firmware por el agente.

El resto de este informe conserva la instantánea de preparación previa a la instalación. Continuación de `1a23f42` en `codex/conversation-detection-g0`: G3.3 se preparó primero sobre0.8.1 y luego se integró con0.8.2, sin instalación intermedia. Las referencias inferiores a «no instalada» y «no exportados» son históricas y quedan superadas por el informe0.8.2.

## Estado observado del perfil

La comprobación posterior al registro supera las notas antiguas «sin perfil». El usuario terminó el asistente; se observaron «Conversación local · OFF», «OFF · Mi perfil se ha guardado localmente. Ya puedes iniciar conversación» y «Mi perfil: guardado en este móvil», con cero wakelocks experimentales activos. Es evidencia de guardado, **no de precisión de comparación, identidad en vivo o participación**. Un único perfil propio para castellano y valenciano. No repetir registro ni leer/exportar/copiar el vector.

Hoy se comprobaron conexión del Pixel, versión/código instalados y ausencia de `Faceclaw:ConversationG0` en la sección de wakelocks actuales. Había un wakelock normal `Faceclaw:G2Screen`; las entradas del historial no cuentan como activos. El último OFF visual procede de la comprobación posterior del perfil; no se obtuvo otro estado visual o agregado de la sesión hoy.

## Incidencias de código corregidas

- El inicio integrado exigía Whisper aunque ASR se presentaba como opcional. Ahora «Texto local opcional: ON/OFF» permite usar comparación y alternancia con el perfil existente sin iniciar ASR ni exigir sus pesos. Se cambia solo estando OFF; es una selección en RAM de la pantalla, no un ajuste persistente nuevo. Por defecto conserva texto ON.
- La captura podía comenzar mientras ASR seguía cargando y descartar entrada inicial dirigida a ese motor. Ahora espera a ambos motores seleccionados antes de adquirir audio. Defecto comprobado en código/pruebas simuladas; **no se atribuyen a él las omisiones acústicas históricas ni se afirma su resolución física**.
- Un error liberaba recursos pero dejaba `enabled=true`, presentando un modo armado sin temporizador. Ahora termina en OFF con error conservado, invalida entrega tardía y permite un nuevo inicio explícito tras cerrar el motor.
- El agotamiento de120s se confundía con OFF manual. Ahora conserva causa de cierre y muestra tiempo restante, incluyendo preparación/esperas/cesiones. No se amplía el tope.
- OFF puede preceder al final de una inferencia JNI. El inicio informa «Cerrando motores locales…» y espera al drenaje, sin afirmar liberación completa prematura. La página actualiza este estado durante un máximo de30s con un temporizador solo de UI, sin audio; se cancela al descargar la página. Si dura más, el siguiente toque reconsulta el estado. El temporizador del detector sigue retirado en OFF.
- «Mi perfil · guardado» sustituye la invitación permanente a crearlo. Una consulta de perfil fallida o la ausencia del modelo de comparación bloquean el inicio, sin degradar silenciosamente a modo sin perfil. El botón de inicio no descarga modelos; las rutas explícitas existentes de modelos siguen en Opciones/guía.

«Conversación candidata» se mantiene como indicio provisional. La UI añade «no confirman participación ni voz en vivo». No se modifica el clasificador, umbrales, modelos, segmentación ni perfil. ASR y comparación permanecen locales e independientes de Hermes.

## Verificación y artefactos

- **42 pruebas Node** centradas en coordinador, decisiones de inicio, estados y cableado de la pantalla: correctas. Incluyen comparación sin ASR, error→OFF, preparación de ambos motores, bloqueo mientras drenan y finalización del sondeo de UI. No se repitieron las46Node/22Kotlin de G3.2 como batería; Kotlin permanece sin cambios.
- TypeScript, oxlint con tipos y XML principal correctos; webpack de producción, `assembleRelease` offline y `lintVitalRelease` correctos. AAR existente reutilizado; sin nuevos tests Kotlin ni instalación.
- En este PC falta la CLI NativeScript. Se usó el webpack instalado y el proyecto Android generado. Después de webpack se restauró **solo `assets/app/package.json` desde la APK G3.2**, manteniendo identificador/entrada/configuración runtime originales, y se retiró `package` del manifest generado para AGP; el manifest fuente no cambia. Un artefacto provisional con identificador genérico fue sustituido antes de distribución. Para reproducir: webpack Android/producción, restaurar configuración runtime y ejecutar Gradle `--offline assembleRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`. Con CLI disponible, usar preparación normal del proyecto.
- Verificados paquete `com.faceclaw.app`, código805, versión `0.8.1-es.5-conversation.g3.3` y certificado original SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Inspección del APK final: `assets/app/package.json` idéntico a G3.2, bundle con las funciones nuevas y siete bibliotecas nativas idénticas byte a byte. El artefacto provisional de paquete genérico no se conserva como entregable.
- Firmada: `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g3.3.apk`, SHA256 `3d28c55ed790fadd1617c918d4a99d845dd7392e1c748bdf72b471e9acefe940`.
- Sin firma: `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g3.3-unsigned.apk`, SHA256 `02310617cd7a68c552cd0498f1d51329edf2e0366e7cef179c632ccefa612f8f`.

La app instalada y sus33ajustes no se modificaron ni exportaron hoy. Conservados por ausencia de escritura al móvil: Hermes, firma original, bloqueo desactivado y GPS instalado/confirmado funcionando. Sin cambios de firmware, otros proyectos o proveedor; sin grabaciones, perfiles de terceros, audio experimental en red o perfil en NAS.

## Trabajo pendiente concreto

El flujo integrado en el móvil puede usar el perfil existente y distinguir sus estados; estas mejoras de G3.3 están verificadas en software, **aún no observadas en el Pixel**. La instalación queda pendiente por la instrucción actual, sin convertirla en otra ronda de confirmaciones o ensayo. No volver a registrar el perfil cuando se actualice.

Todavía falta una entrada propia del modo conversación en el menú de las gafas y visualización de estado/texto en las lentes. No se añade en este incremento. No están acreditadas precisión del perfil, participación real, rechazo de TV/replay/mezclas ni rendimiento bilingüe general. Corregir futuras incidencias concretas durante uso normal; solo si es imprescindible, un único ensayo breve y justificado, sin consultar UI durante ON y cerrando OFF.

Siguen abiertos los huecos/pérdidas históricos (492ms/siete descartes y lectura posterior UI1046ms/21 `pcmDeliveryDrops`); los tramos posteriores limpios no los resuelven. G4 añade complejidad solo con errores y mejora demostrada; aquí no se incorpora un modelo nuevo. G5: estabilidad/autonomía prolongadas pendientes. G6: semántica/acciones requiere decisión posterior; **no conectar este audio/texto experimental a Hermes**.

Continuidad y artefactos de código/APK se comparten en GitHub/NAS; **nunca se incluye el perfil propio**.
