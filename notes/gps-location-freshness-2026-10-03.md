# Ubicación de Hermes: acceso y renovación de caché

Estado del 03-10-2026. Trabajo independiente de la transcripción experimental G2.2.

## Fallos comprobados

1. Hermes negaba acceso al GPS sin usar herramientas. El usuario reprodujo «¿Qué hay cerca de mí?»; los turnos 22/23 del puente registraron cero llamadas. El móvil tenía permisos fino/aproximado y la herramienta `location.get_current`. Se corrigió el puente independiente de Jarvis con una entrada visible `glasses_get_location` e instrucciones de consulta/frescura. El usuario confirmó después que Hermes recibía una posición, aunque de más de cuatro minutos. La consulta real registró resultado correcto en 274 ms: ya accedía a los datos.
2. `FaceclawLocationProvider` aceptaba inmediatamente una caché de hasta diez minutos, mientras `location.get_current` marcaba antigua una posición de más de dos minutos. Esa diferencia impedía intentar renovarla durante la consulta observada.

## Cambio Android

Commit de implementación `c6cdedf`, sobre G2.2 `b6aa36c`. La caché aceptada inmediatamente pasa a dos minutos y se rechazan timestamps futuros. Si es más antigua, el proveedor existente solicita una actualización puntual y espera hasta 15 segundos. Si no consigue posición nueva, conserva el fallback antiguo con su timestamp real; Hermes debe comunicar que sigue antiguo. No se eleva el umbral del asistente ni se falsifican timestamps. Sin seguimiento continuo ni permisos nuevos.

Se conservan el proveedor de red/GPS existente, los controles de permisos y el límite de llamada MCP del teléfono. La consulta compartida de Weather también usa este umbral. Navegación continua y transcripción local no se modifican.

## Verificación e instalación

- Seis pruebas existentes `assistant-location.test.cjs`: correctas (MCP, metadatos, permisos, errores y prohibición fuera de conversación). Esas pruebas no simulan una adquisición GPS física.
- Compilación Android de producción e informe lint del build: correctos; compilación Kotlin y nueva APK completadas.
- Assets de la app G2.2 idénticos al build anterior. El cambio compilado afecta a código nativo y al perfil optimizado de arranque (`assets/dexopt/baseline.prof`).
- Firma original comprobada; el usuario confirmó captura experimental OFF antes de actualizar. Instalación con `adb install -r`, sin borrar datos.
- Los 33 ajustes son idénticos antes/después, incluidos Hermes y bloqueo. Permisos fino/aproximado siguen concedidos. Móvil reconectado a Hermes con 34 herramientas y `location=True`.
- Permanece la versión `0.8.1-es.5-conversation.g2.2`, código805. Distinguir este build GPS por nombre/hash; no confundirlo con la G2.2 original del trabajo de transcripción.
- La renovación física posterior está pendiente de la nueva consulta del usuario; no afirmar que Android siempre consigue una posición fresca.

## Artefactos y reversión

APK GPS firmada: `dist/gps-cache/faceclaw-g2.2-gps-freshness.apk`, SHA-256 `9e197c66981bdcee57dd3a91206c523170871c1a0c49f997244963988677b475`.

APK sin firmar del mismo build: SHA-256 `6ff19300218c5ee9c1afca115a892685b33c79f33b1c1b0a65484095c831f44d`.

Respaldo extraído inmediatamente antes: `dist/conversation-g0/before-install-20261003-171536.apk`, G2.2 original, SHA-256 `3c869665b7a28bdd283c0739122359f4e5b67aba57fa51a03f150720bb36ea2e`.

NAS: `/volume1/home/Dani/Faceclaw/apk-builds/gps-freshness/` para APKs nueva firmada/sin firmar; `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-g2.2-before-gps-freshness.apk` para reversión. Directorios privados700, archivos600. Ajustes privados locales en `.tools/gps-cache-private/`, no imprimir ni publicar. Los datos de firma originales no se modifican.

Reversión conservando datos: `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-install-20261003-171536.apk`.

El código y la operación del puente están en `E:\projects\faceclaw-hermes-bridge\README.md`; respaldo NAS `/volume1/home/Dani/Faceclaw/hermes-gps-20261003/`. Guardar Trabajo en la memoria Hermes no equivale a editar el destino de Navegar; la APK actual carece de esa herramienta de escritura.
