# Faceclaw Wear 0.8.4 — 18-10-2026

Instalada en Pixel Watch 4 (ADB `192.168.0.38:45403`) a petición del usuario: `com.faceclaw.app`, versión `0.8.4`, código 5, `adb install -r`: Success. App abierta desde el launcher.

## Aviso: mismo código que 0.8.3

La APK aportada `D:\Descargas\Faceclaw-Wear-0.8.4.apk` es **idéntica byte a byte** a `Faceclaw-Wear-0.8.3.apk` (SHA256 `a62f63c7047bd99d847034e1a98f162489dd113fedd69c77bf31cebd709de595`, versión interna 1.0.0/código 1, certificado del autor `c1efe42d…382ad`). Su `classes.dex` (`9be75b2f…8f47`) coincide con el de la 0.8.3 ya instalada. El usuario, informado, pidió instalarla igualmente como 0.8.4/código 5: **el cambio es solo de etiqueta, sin cambio funcional en el reloj.** El Wear oficial 0.8.4 no aportó cambios respecto a 0.8.3 o la descarga no es la correcta.

## Preparación

Mismo método que en 0.8.3 (`prepare_update.py`): solo se ajustan `versionName` a 0.8.4 y `versionCode` a 5 en el manifiesto binario, se retiran firmas, `zipalign -p 4` y firma con `.tools/signing/faceclaw-es.jks` (contraseña leída desde fichero, no impresa). Resto del payload comparado byte a byte con la APK aportada: igual. Certificado resultante `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`, el mismo del móvil.

## Verificación

- APK candidata y APK extraída del reloj: SHA256 `458c7b67b5da023eeebdf2c7a606b044ac93fcbed2d4050d2fa754dbcddc19f7`, idénticas.
- Datos conservados: `firstInstallTime=2026-10-02 10:11:36`, `ceDataInode=19943`, `deDataInode=17672` iguales antes y después.
- No se ensayaron PTT, micrófono ni enlace con el móvil (el código no cambia respecto a 0.8.3).

## Reversión y artefactos

`C:\Users\danie\OneDrive\Documents\ChatGPT\openclaw\artifacts\faceclaw-wear-0.8.4\`: APK compatible, `installed-verified.apk`, `prepare_update.py` y `before-update.apk` (0.8.3/código 4, SHA256 `78fbb865…59c91`). Volver a 0.8.3 exige desinstalar (código inferior); no hace falta, pues el código es el mismo. Sin copia NAS en esta operación. Móvil, Hermes y firmware no tocados.
