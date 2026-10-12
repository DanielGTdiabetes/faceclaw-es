# Faceclaw Wear 0.8.3 — 11-10-2026

Instalada y verificada en Pixel Watch 4, ADB 192.168.0.38:45925: `com.faceclaw.app`, versión `0.8.3`, código 4. Emparejamiento ADB autorizado por el usuario. Instalación mediante `adb install -r`: Success. La app se abrió desde su launcher.

## APK y firma

APK proporcionada: `D:\Descargas\Faceclaw-Wear-0.8.3.apk`, SHA256 `a62f63c7047bd99d847034e1a98f162489dd113fedd69c77bf31cebd709de595`. Sus metadatos originales son versión 1.0.0/código 1 y certificado del autor `c1efe42d74f3fc4e9a13bcfc8c99e018344a55525e5b300fa960c89431e382ad`.

Para actualizar la instalación personalizada existente sin borrar datos, se preparó una copia: únicamente se ajustaron versionName a 0.8.3 y versionCode a 4 en el manifiesto binario, se retiraron las firmas anteriores, se alineó y se firmó con la clave original existente. Todos los demás archivos de la APK, incluido classes.dex y los recursos, se compararon byte a byte con la APK aportada y coinciden. No se recompiló ni modificó el código. El archivo original de Descargas permanece intacto.

Certificado verificado en la APK anterior y nueva: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Las credenciales de firma no se imprimieron ni copiaron a estos artefactos.

APK instalada y extraída del reloj: SHA256 `78fbb865c26a1d3e1e908b983826e08c923ca2fa04b525599f048bf934259c91`, idéntico al candidato firmado. Se conservan primera instalación `2026-10-02 10:11:36`, directorio `/data/user/0/com.faceclaw.app`, ceDataInode 19943 y deDataInode 17672. No se exportaron ajustes privados. No se ensayaron PTT, micrófono ni órdenes a gafas, ni se afirma una verificación funcional del enlace con el móvil.

## Reversión y archivos

Respaldo fresco de la APK anterior 0.8.2-es.1/código 3: `before-update.apk`, SHA256 `6520ec36778d5907eae5ce0340395ba64807fcc2d9b2989e03d7e0f18312ea37`. Una eventual reversión debe tener en cuenta que su código 3 es inferior al nuevo 4; no desinstalar ni borrar datos.

Artefactos locales: `C:\Users\danie\OneDrive\Documents\ChatGPT\openclaw\artifacts\faceclaw-wear-0.8.3\`. Incluye la APK compatible, el respaldo, la APK extraída y el script reproducible de preparación. Copia NAS completada en `/volume1/home/Dani/Faceclaw/apk-builds/wear-0.8.3-compatible-20261011/`: APK nueva, reversión, informe, script y nota de continuidad. Hashes de ambas APK comprobados idénticos local/NAS; directorio 700 y archivos 600.

Esta operación corresponde únicamente al reloj. Los estados del móvil, Hermes y firmware documentados en las notas compartidas se conservan como antecedentes y no se han vuelto a verificar aquí.
