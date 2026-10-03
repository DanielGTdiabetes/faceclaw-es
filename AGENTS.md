# Continuidad de Faceclaw entre ordenadores

**Incremento activo desde 03-10-2026:** captura experimental G2 en `codex/conversation-detection-g0`. Antes de continuar, leer [notes/conversation-detection-g0-results.md](notes/conversation-detection-g0-results.md). Hay implementación G0/G1 y APK instalada; la validación física está en curso. No considerar superadas las puertas G0/G1 ni añadir VAD G2 hasta probarlas. La petición vigente autoriza firma original, instalación con `adb install -r` y ensayos breves guiados, conservando datos/Hermes/firmware. No repetir la auditoría completa. Dejar el detector OFF al finalizar. Dejar pasar palabras/frases incomprensibles sin avisos repetidos ni interrupciones; el prototipo actual no tiene ASR ni semántica.

**Continuación desde casa:** leer primero [notes/continuacion-pc-casa-2026-10-03.md](notes/continuacion-pc-casa-2026-10-03.md). APK G0 instalada con firma original y 32 ajustes conservados; firma respaldada y verificada en el NAS. Se probaron captura, formato PCM, cesión/reanudación con Hey Even y Chat y continuidad con Pixel bloqueado. El ensayo terminó por el límite de dos minutos y sin wakelock propio. Aún faltan otras pruebas G0/G1: no añadir VAD ni repetir la auditoría completa. Requisito nuevo español/valenciano, con alternancia de idiomas, todavía pendiente de implementación y validación en ASR.

**Caducidad de esta continuidad:** el usuario pidió eliminar el documento temporal al completar el trabajo retomado en casa. Primero actualizar las notas permanentes con el estado real; después borrar el archivo temporal en GitHub/NAS y retirar todos sus enlaces e instrucciones de continuación pendiente, incluido este bloque. No conservarlo como una tarea futura ni recrearlo para otra sesión.

Antes de preparar una APK, firmar, instalar o continuar la adaptación española, leer [notes/continuidad-entre-pcs.md](notes/continuidad-entre-pcs.md). Es la referencia compartida del proyecto: contiene las rutas del NAS, las APK disponibles, la huella pública de firma y los pasos pendientes. No depender de la memoria local de un único PC.

- La adaptación española y la corrección de ubicación están en `spanish-0.8.1`. Comprobar la rama y sincronizar sin descartar cambios locales antes de continuar.
- Este trabajo corresponde a Android y las gafas Even Realities G2.
- Comprobar el estado actual del NAS y del teléfono antes de asumir que los pasos pendientes de la nota ya se completaron.
- Reutilizar la firma original de móvil y reloj. Antes de ejecutar `scripts/sign-spanish.ps1`, comprobar que existen tanto `.tools/signing/faceclaw-es.jks` como `.tools/signing/store.password`: el script puede crear una clave si falta. No generar una firma sustitutiva ni desinstalar las apps para actualizar.
- No leer en voz alta, imprimir, incluir en notas, subir a Git ni pegar en el chat claves privadas, contraseñas, tokens o ajustes exportados. Las rutas y la huella pública del certificado sí se pueden documentar.
- Al completar la copia de firma o instalar la actualización, actualizar la nota compartida y su copia del NAS con el estado comprobado.
