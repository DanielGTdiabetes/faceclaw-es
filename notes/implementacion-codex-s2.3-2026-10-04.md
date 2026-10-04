# S2.3 — relevo en implementación y correcciones tras la prueba S2.2

04-10-2026. Codex toma el relevo en **código**, conforme a la autorización del usuario tras la sesión de Claude. Base: `codex/conversation-detection-g0`, HEAD `ae55d83`, todos los cambios locales S2/S2.1/S2.2 conservados. Sin commit/reset/clean/stash/cambio de rama. Copias previas de los archivos editados en `.tools/codex-pre-s2.3-20261004/`; evidencia nueva en `.tools/codex-s2.3/`. No se consultaron dispositivos, capturó audio ni repitió la prueba humana.

**S2.3 implementada, compilada y firmada; no instalada. S2.2 sigue siendo la última instalada documentada.** No sobrescritas las candidatas anteriores, las sondas de Codex ni `.tools/s2fix/orig`.

## Evidencia humana que se conserva

[Informe de Claude](informe-claude-prueba-breve-s2.2-2026-10-04.md): prueba guiada 18:56, unos 51 s, **cero intentos de frase y una asignación manual**. El usuario no encontró la opción de frase. Dos voces con la misma etiqueta antes de elegir; «Yo» y otra etiqueta después, observados en el móvil. Soniox estable, primer token 6129 ms, backlog al parar 5660 ms, invalidez 0/0. OFF sin recursos experimentales activos. No acredita frase ni precisión general; lentes no observadas.

Sesión libre 18:43 aparte: error `envio-audio` tras 66000 ms enviados, fallback local y backlog 30480 ms; usuario observó «Yo», pero el resumen registra intentos/manuales 0/0. No cuenta como prueba guiada ni se atribuye al agente el inicio de esa sesión.

## Cambios concretos

### Frase accesible desde el móvil

`main-page.xml` y `main-view-model.ts`: botón directo **«Identificar mi voz (frase)»**, visible durante la sesión Soniox, junto a la línea de portador y al botón existente «Mi voz · identificar o corregir». No hace falta localizarlo dentro de una lista de etiquetas. Durante la ventana cambia a **«Listo, ya la he dicho»**; mientras espera resultado ofrece cancelar. Usa las acciones y referencias de sesión/intento existentes. No inicia captura, no asigna voz automáticamente y no reabre un intento tras OFF/fallback.

La opción anterior sí existía en el código; no se ha demostrado por qué no la encontró el usuario. El cambio reduce la dependencia de ese menú. La vista física del nuevo botón aún no se ha observado.

### Diagnóstico tras STOP

Se encontró **una instantánea tomada antes de STOP en dos capas**, no evidencia de que el motor nativo olvidase cambiar la bandera:

- `coordinator.release()` guardaba `lease.diagnostics()` antes de `lease.stop()`.
- El cierre de la concesión en `voice-control.ts` también conservaba el diagnóstico del controlador antes de pararlo.

Ahora ambas lecturas se hacen después de STOP. La concesión guarda esa instantánea y un STOP antiguo no la sustituye por el estado del siguiente propietario. Los contadores originales se conservan y `capturing` representa el estado posterior a la parada. No se cambia `VoiceCaptureSession.kt`, el AAR ni el pipeline nativo. Las pruebas cubren OFF y cesión a otro propietario.

### Texto e identidad al pasar a Whisper

Antes se guardaba el texto renderizado de Soniox, incluidas las etiquetas «Yo», y después se borraba la asociación viva. Eso permite ver una etiqueta histórica aunque la identidad actual ya no esté disponible.

Ahora se conserva el texto Soniox con etiquetas numéricas y encabezado **«Texto anterior · Soniox»**. El texto nuevo de Whisper se distingue con **«Local · sin identificación»**. El fallback no conserva una etiqueta «Yo» generada por la asociación anterior. La procedencia de una asociación que sí ocurrió permanece en el resumen (por ejemplo, manual y su contador).

**La incidencia concreta de «Yo» con 0/0 no está reproducida ni explicada.** El código sin asociación no genera el prefijo «Yo:» y Whisper no añade etiquetas de hablante. Regresiones comprueban la ruta sin identificación, el fallback y otra sesión. Un «yo» que forme parte del texto reconocido es contenido, no prueba de identificación. No se afirma que esa distinción explique lo que vio el usuario.

### Fallo de transporte Soniox

- Envío binario rechazado o excepción nativa: una sola transición a Whisper, sin propagar la excepción fuera del motor. El chunk rechazado se entrega una vez al fallback local y no incrementa el contador Soniox.
- `finalize` y `keepalive` rechazados/excepciones durante la sesión: fallback con categoría `envio-control`, en vez de ignorar el fallo. La finalización de OFF sigue siendo de mejor esfuerzo y nunca inicia un worker local al cerrar.
- El wrapper Android expone estado de socket, bytes en cola, categoría de fallo (`none/timeout/tls/network/other`) y código de cierre. Se recoge como `transportFailure` antes de cerrar la conexión y se conserva en el resumen sin texto, audio, cabeceras, URL, motivo remoto ni mensaje de excepción.

**La causa del rechazo real a los 66 s sigue abierta.** El informe anterior solo recoge un booleano de envío fallido; no distingue cierre remoto, fallo de red o cola. No se modifican timeouts, modelos ni configuración Soniox para ocultarlo, ni se reconecta automáticamente. El diagnóstico nuevo permite acotarlo si vuelve a suceder en uso posterior.

## Validación realizada sobre los cambios

- **163/163** en las 13 suites del área afectada: 152 existentes y 11 regresiones nuevas. No es repetición de la revisión S2.2: verifica los cambios nuevos de UI, STOP, texto/fallback y transporte. Log `conversation.log`.
- Compilación TypeScript de pruebas y aplicación, y oxlint con advertencias rechazadas: correctos.
- Webpack Android producción: correcto. `package.json` del runtime restaurado; hash `70f23257…` conservado.
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`: salida 0, compilación Kotlin Android y lintVital correctos. SDK original `C:\Users\danie\AppData\Local\Android\Sdk`, JDK Microsoft 21. Los primeros intentos usaron el SDK `E:\android-sdk`, que carece de Build Tools 35; no se instalaron herramientas ni se alteró el SDK.
- APK: versión/package/code y certificado comprobados por el helper; 565 entradas sin metadata de firma idénticas entre signed/unsigned. Siete `.so` idénticas a S2.2. Cambian manifest, bundle, `classes.dex`, metadata NativeScript y perfiles dexopt, coherentes con el método Android añadido. Bundle contiene botón, diagnóstico y encabezados nuevos. Script/log `apk-check.ps1` / `apk-check.log`.
- Sin nueva suite completa, pruebas Kotlin del AAR ni pruebas físicas. Los dos fallos históricos ajenos de local-vad/iOS siguen abiertos.

## Candidata separada

| Elemento | Valor |
| --- | --- |
| Paquete / versión / código | `com.faceclaw.app` / `0.8.2-es.5-conversation.s2.3` / 805 |
| Firmada | `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.3.apk` |
| SHA-256 firmada | `2e10ee16a1b5d7bf8cea76a08d23b011b6b5c6b4e7f0383cc92cc4cc498657bf` |
| SHA-256 unsigned | `459a46e1de7d59a0e68a86271fd783d530d2bd0126fc72e909bc30ba73c34629` |
| Certificado original | `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` |
| Bundle | `7e2b8553abdbcf2f33a498a4e65ce9dede0c6c8623a991e456f0044123eb7c55` |

Firma original mediante helper **sin `-Install`**. El helper acepta S2.3 y mantiene las versiones anteriores. No se exportaron ajustes, perfil, audio ni datos del teléfono; no se copiaron artefactos al NAS en este trabajo.

## Continuación

Para que las correcciones lleguen al móvil hará falta actualizar a esta candidata distinta, comprobando estado actual conectado/OFF, respaldo fresco y conservación de los ajustes con el procedimiento existente. No reinstalar S2.2. La prueba anterior queda cerrada; cualquier nuevo intento humano de frase se coordina expresamente, sin repetirlo por defecto.

Después se retoma el diseño de episodios y proactividad Hermes. **Producto final conservado y pendiente:** lentes apagadas durante escucha, sin conversación/transcripción visible, y únicamente mensajes de Hermes cuando intervenga. S2.3 todavía mantiene la interfaz diagnóstica. TV, Soniox/Whisper, castellano actual, perfil, GPS/bloqueo, límite absoluto de 120 s y ausencia de envío conversacional a Hermes intactos. Sin firmware ni Wear.
