# Continuidad de Faceclaw entre ordenadores

Antes de preparar una APK, firmar, instalar o continuar la adaptación española, leer [notes/continuidad-entre-pcs.md](notes/continuidad-entre-pcs.md). Es la referencia compartida del proyecto: contiene las rutas del NAS, las APK disponibles, la huella pública de firma y los pasos pendientes. No depender de la memoria local de un único PC.

- La adaptación española y la corrección de ubicación están en `spanish-0.8.1`. Comprobar la rama y sincronizar sin descartar cambios locales antes de continuar.
- Este trabajo corresponde a Android y las gafas Even Realities G2.
- Comprobar el estado actual del NAS y del teléfono antes de asumir que los pasos pendientes de la nota ya se completaron.
- Reutilizar la firma original de móvil y reloj. Antes de ejecutar `scripts/sign-spanish.ps1`, comprobar que existen tanto `.tools/signing/faceclaw-es.jks` como `.tools/signing/store.password`: el script puede crear una clave si falta. No generar una firma sustitutiva ni desinstalar las apps para actualizar.
- No leer en voz alta, imprimir, incluir en notas, subir a Git ni pegar en el chat claves privadas, contraseñas, tokens o ajustes exportados. Las rutas y la huella pública del certificado sí se pueden documentar.
- Al completar la copia de firma o instalar la actualización, actualizar la nota compartida y su copia del NAS con el estado comprobado.
