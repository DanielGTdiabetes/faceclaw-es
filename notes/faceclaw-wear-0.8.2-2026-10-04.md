# Faceclaw Wear 0.8.2 — 04-10-2026

**Instalada `0.8.2-es.1`, código3, con nuestra firma original, mediante `adb install -r` (`Success`).** El usuario pidió actualizar el Pixel Watch 4 por ADB en `192.168.0.38:45015` y aportó `D:\Descargas\Faceclaw-Wear-0.8.2.apk`. No se toca el móvil, que el usuario había desconectado para actualizar el firmware de las gafas; ese proceso estaba pendiente al instalar Wear. Cierre posterior: el usuario confirma gafas actualizadas y funcionamiento general como antes; ver el prompt de continuidad G3.3.

## Compatibilidad con nuestra app del móvil

Wearable Data Layer exige el mismo paquete y certificado en ambas apps. Nuestro móvil y el reloj instalado utilizan `com.faceclaw.app` y el certificado español SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

La APK aportada contiene `com.faceclaw.app`, versión interna `1.0.0`, código1 y certificado del autor SHA256 `c1efe42d74f3fc4e9a13bcfc8c99e018344a55525e5b300fa960c89431e382ad`. SHA256 del archivo: `65ed3935719304ee8be0465c29ac30dad975e62000742c4831382ec8444c6e45`. No se instala directamente: firma distinta y código inferior al instalado. No se altera el archivo de Descargas.

El reloj tenía `1.0.0-es`, código2, con nuestra firma. Se extrajo solo su APK como reversión: `dist/wear-update-0.8.2/before-update.apk`, SHA256 `318c33d84a2e41f7506d06cb10c5360bba06b9d6b2b109b844e8ab4ecacde37b`. Batería observada99%.

## Preparación

La fuente Wear no cambió entre los tags oficiales0.8.1/0.8.2; la diferencia local previa era la versión española/código2. Se compila desde la fuente integrada en nuestra rama, con versión `0.8.2-es.1`/código3 y firma original compartida con el móvil. No se añaden funciones ni se atribuyen al reloj las correcciones del móvil0.8.2.

El build offline inicial no tenía el plugin Kotlin2.1.10 en caché. Se resolvieron las dependencias de compilación desde los repositorios Gradle configurados; no son modelos de audio. No se ejecutan otra vez las baterías Node/Kotlin del móvil por este cambio de metadatos Wear.

Build release y lintVital correctos. Verificados paquete `com.faceclaw.app`, versión `0.8.2-es.1`, código3 y certificado original antes de instalar. Instalación `Success`, sin desinstalar ni borrar datos; comprobados versión instalada, misma fecha de primera instalación y mismos inodos de datos `ceDataInode=19943`/`deDataInode=17672`, directorio `/data/user/0/com.faceclaw.app`. No se exportan preferencias privadas ni se afirma una comparación de todos sus valores.

Se abrió la app del reloj, que muestra estado «Settings» en su pantalla ambiente. Además, en el proceso nuevo de Wear se observó respuesta real del móvil a `/faceclaw/state/request`: ACK correspondiente con `ok=true` y `jsReady=true`. Confirma comunicación app→app después de instalar; no hizo falta volver a emparejar. Solo se imprimieron esos campos, no mensajes ni eventos del asistente. No se activaron micrófono, PTT, bloqueo ni comandos en las gafas. No acredita todos los controles ni la revisión de firmware instalada.

## Artefactos

- Firmada: `dist/wear-update-0.8.2/faceclaw-wear-0.8.2-es.1.apk`, SHA256 `6520ec36778d5907eae5ce0340395ba64807fcc2d9b2989e03d7e0f18312ea37`.
- Sin firma: mismo nombre con `-unsigned.apk`, SHA256 `a6c25f7d19d9c8d293565ac8cc41a46dac0ee7c719aba013af0ce84c156fd429`.
- Reversión: `before-update.apk`, hash indicado arriba. Copias privadas NAS en `/volume1/home/Dani/Faceclaw/apk-builds/wear-0.8.2-es.1/`, carpeta700/archivos600 y los tres hashes coincidentes.
