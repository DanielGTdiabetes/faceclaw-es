# Informe Claude — instalación S2.2, 04-10-2026

Encargo `notes/prompt-claude-instalar-s2.2-2026-10-04.md`, tras la [revisión Codex S2.2](revision-codex-s2.2-2026-10-04.md) (sin hallazgos bloqueantes). **S2.2 instalada y comprobada en OFF. No ensayada.**

## Base

Rama `codex/conversation-detection-g0`, HEAD `ae55d83`, cambios locales conservados sin commit. Sin rebuild, AAR, suites ni nueva firma. Candidatas S2/S2.1/S2.2 y worktrees conservados.

## Artefacto exacto

`dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.2.apk`, recomprobado antes de instalar (build-tools 36.0.0):

- SHA-256 `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa`.
- `aapt`: `com.faceclaw.app`, versionCode 805, versionName `0.8.2-es.5-conversation.s2.2`.
- `apksigner`: verifica, v2/v3, un firmante, certificado `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

## Precondición (18:31 CEST)

- ADB `E:\android-sdk\platform-tools\adb.exe`: un único dispositivo, `61161FDCG0013L`, Pixel 10 Pro Fold (`rango`), seleccionado con `-s`.
- Antes de consultar la UI: `Wake Locks: size=0`, sin wakelock `Faceclaw:ConversationG0`, sin grabación activa de Faceclaw en `dumpsys audio`. Pantalla encendida, sin bloqueo, Faceclaw en primer plano.
- UI observada: «Conectado», «Conversación local · OFF», «Mi perfil: guardado en este móvil», «Idioma del texto: castellano (forzado)», vista de gafas «Display off». Instalada `0.8.2-es.5-conversation.s1`/805.

## Respaldo fresco

- APK instalada extraída con `pm path` + `adb pull` a `dist/conversation-g0/before-update-s2.2.apk`: SHA-256 `f09e57c5ab531f2d92219521116d00880d1ec335b621e4f928a58709840b1b1c`, **idéntica a la S1 firmada documentada**.
- Ajustes privados con el método establecido: `.tools/s2.2-export-settings.ps1` (copia de `s1-export-settings.ps1` con directorio `s2.2-private` y ADB de `E:`), ACL solo usuario/SYSTEM, archivo temporal del móvil borrado tras copiarlo. Sin perfil, vector, audio ni `noBackupFilesDir`. No se imprimieron valores.
- **34 entradas**, las mismas claves que el respaldo posterior a S1. Incluyen Soniox (`voice.provider`, `voice.sonioxApiKey`), Hermes (`assistant.*`, token incluido), bloqueo (`display.lockScreenEnabled`) y GPS (`compass.declination.*`). El recuento histórico de 33 queda superado: la entrada adicional ya estaba en S1.

## Instalación

Nueva comprobación de `Wake Locks: size=0` sin wakelock de conversación justo antes. `adb -s 61161FDCG0013L install -r` de la APK firmada exacta → `Success`. Sin desinstalar, borrar datos ni regenerar firma.

- Instalada: `0.8.2-es.5-conversation.s2.2`, versionCode 805, `lastUpdateTime` 18:31:54.
- `base.apk` instalada, extraída de nuevo: SHA-256 `072e14be…`, igual al artefacto revisado.
- **Ajustes: 34 antes, 34 después, comparación canónica idéntica** (todas las entradas, incluidos Soniox, Hermes/token, bloqueo y GPS).

## Observación posterior (OFF)

Proceso nuevo tras la instalación (iniciado por el receptor de exportación de ajustes). App abierta con el lanzador, sin pulsar nada. Volcado de UI:

- «Conectado», «Conversación local · OFF».
- «Mi perfil: guardado en este móvil» y «Mi perfil guardado · texto local castellano (forzado) de todas las voces, sin filtro por perfil» (estado, sin leer el perfil).
- «Idioma del texto: castellano (forzado)», selección conservada.
- «Iniciar conversación local (2 min máx.)» presente, **no pulsado**.
- La vista de gafas en el móvil muestra ahora «Conversación local» en lugar de «Display off». Es el espejo del móvil: **no se observaron las lentes**.
- `Wake Locks: size=0`, sin wakelock de conversación. Sin grabación de Faceclaw en `dumpsys audio` ni cliente de entrada de Faceclaw en `audio_flinger`. Solo el servicio en primer plano habitual de conexión (`FaceclawForegroundService`, canal `faceclaw-connection`) y el de notificaciones multimedia.

Los controles de identificación del portador de S2.2 no aparecen en OFF. No se activaron captura, Soniox, Whisper, identificación ni marcas.

## NAS

- `apk-builds/0.8.2-conversation-s2.2/`: `before-update-s2.2.apk` (`f09e57c5…`) y la APK S2.2 firmada (`072e14be…`), hashes iguales a los locales, 600, carpeta 700.
- `connection-backups/2026-10-04-s2.2/before.xml` y `after.xml`: hashes iguales a los locales (no documentados), 600, carpeta 700.

## Reversión

`adb -s 61161FDCG0013L install -r dist/conversation-g0/before-update-s2.2.apk` (S1 exacta, firma original, datos conservados). Copia en el NAS.

## Separación

- **Instalado y observado en OFF:** versión, hash instalado, 34 ajustes idénticos, conexión, perfil guardado sin leer, idioma forzado conservado, cero wakelocks y sin captura.
- **No ensayado:** sin sesión ON, sin voz, sin identificación del portador. Tiempos Soniox reales y precisión humana **no medidos**. Lentes no observadas.
- Requisito final (pantallas de gafas apagadas durante la escucha, solo mensajes de Hermes) **no implementado**: S2.2 conserva la vista diagnóstica provisional. TV como está y tope de 120 s sin cambios.
- Perfil sin leer/exportar/reenrolar. Sin modelos, firmware, Wear ni envío a Hermes. Sin commit.
- La prueba breve de identificación queda para su encargo separado.