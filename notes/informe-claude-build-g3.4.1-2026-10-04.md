# Informe Claude — build e instalación G3.4.1, 04-10-2026

Encargo `notes/prompt-claude-build-g3.4.1-2026-10-04.md`, tras la revisión de Codex `notes/revision-codex-g3.4.1-2026-10-04.md`. Pendiente de revisión por Codex.

## Base, commits y rama

- Rama `codex/conversation-detection-g0`. Base `f56ab37`, sincronizada con `origin`, árbol limpio. Sin cambios ajenos.
- `73ff47c` — versión `0.8.2-es.5-conversation.g3.4.1` en `App_Resources/Android/app.gradle` y validación/default de `scripts/install-conversation-g0.ps1`. Código funcional sin cambios desde `5f35bc1` (revisado por Codex).
- Commit de documentación posterior con este informe, `AGENTS.md` y `notes/continuidad-entre-pcs.md`. Publicado en la rama, sin PR ni fusiones.

## Build y artefacto

- Webpack producción Android (`webpack.js --env android --env production`): correcto, log `.tools/g3.4.1-logs/webpack.log`. `platforms/android/app/src/main/assets/app/package.json` guardado antes y restaurado después; hash igual al guardado.
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`, Java 21 y SDK documentados: salida 0, `lintVitalRelease` completado. Log `.tools/g3.4.1-logs/gradle.log`. AAR y puentes reutilizados, sin regenerar.
- Inspección del APK frente a G3.4 unsigned: **siete bibliotecas nativas `lib/arm64-v8a/*` idénticas** (mismas rutas y SHA256), **`assets/app/package.json` idéntico** (runtime original), `assets/app/bundle.mjs` distinto y contiene las cadenas nuevas («sesión en curso»).
- No se repitieron 70/782 Node ni 240 Kotlin: sin cambios funcionales desde la revisión de Codex.

## Metadatos, firma y hashes

`com.faceclaw.app`, versionCode 805, versionName `0.8.2-es.5-conversation.g3.4.1`. Firma con el helper seguro, primero sin `-Install`, tras comprobar que existen `.tools/signing/faceclaw-es.jks` y `store.password`. No se generó clave ni se mostró ningún secreto. Certificado SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

| Archivo (`dist/conversation-g0/`) | SHA256 |
| --- | --- |
| `faceclaw-0.8.2-es.5-conversation.g3.4.1.apk` | `9029bb89853269ba57671cd774941afcf7eececb7f0107430aabad0f64780f0e` |
| `faceclaw-0.8.2-es.5-conversation.g3.4.1-unsigned.apk` | `906cdc29921fa3a6042dcdd8b84030e76abc8d2fe71082955ca230e94ce2b953` |
| `before-update-g3.4.1.apk` (reversión, G3.4 extraída del Pixel) | `b9c69767fdb58a22d0b3c351228582075a01f6a42fe9cd6622c9d078c9c86332` |
| `faceclaw-0.8.2-g3.4.1-source-73ff47c.zip` (`git archive`, solo archivos versionados) | `92b3ea6f0962e0dbf521a721cadb17e6ac655c9a18a37dc28bb83edb59f5eea9` |

La reversión coincide byte a byte con la APK G3.4 firmada documentada. Reversión: `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-update-g3.4.1.apk`.

## Instalación

- ADB: `61161FDCG0013L`, Pixel 10 Pro Fold. Antes: G3.4/805, Pixel bloqueado, `Wake Locks: size=3` sin el uid de Faceclaw (Doze/sistema/GMS). El usuario había confirmado conexión y OFF.
- Preferencias privadas exportadas con `.tools/g3.4.1-export-settings.ps1` (copia de la G3.4 con directorio `g3.4.1-private`, ACL usuario/SYSTEM; ajustado a Windows PowerShell 5.1 para que el progreso de adb en stderr no aborte). **33 entradas antes**. El archivo temporal del móvil se borra tras copiarlo. Sin perfil, vector, audio ni `noBackupFilesDir`.
- Helper `-Install`: respaldo de la APK instalada con firma original verificada, `adb install -r` → `Success`. Sin desinstalar ni borrar datos.
- Después: versionName `0.8.2-es.5-conversation.g3.4.1`, versionCode 805. **33 entradas después, comparación canónica idéntica**, incluidos Hermes y bloqueo desactivado. No se imprimieron valores.

## Observación en dispositivo

Tras desbloquear el usuario, con Faceclaw en primer plano y OFF confirmado por él:

- UI móvil: «Conectado», «Conversación local · OFF», «Mi perfil: guardado en este móvil», «Texto local opcional: ON · tocar para cambiar», botón «Iniciar conversación local (2 min máx.)». No se pulsó.
- `dumpsys power`, sección actual: `Wake Locks: size=0`, `PowerManagerService.WakeLocks ref count=0`. El historial no se usa como evidencia.
- La UI marca «Display off» para la vista de las gafas. **No se abrió ni se observó la app Conversación local en las lentes.** Queda pendiente, sin ensayo de escucha.

No se inició captura, registro ni sesión ON. Perfil existente sin tocar ni exportar. Se mantienen el máximo de 120 s y la prioridad del asistente.

## NAS

`/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-g3.4.1/`: APK firmada, unsigned, reversión y fuente. `connection-backups/2026-10-04-g3.4.1/`: preferencias antes/después. **Seis archivos con SHA256 iguales a los locales**, sin imprimir los de preferencias. Carpetas 700, archivos 600. Informe, `AGENTS.md`, continuidad, `LEEME.md` y la nota Obsidian actualizados, conservando el historial.

## Separación

- **Implementado:** versión G3.4.1 sobre las tres correcciones de `5f35bc1`.
- **Comprobado en software:** webpack, Gradle, lintVital, identidad, firma y contenido del APK.
- **Observado en dispositivo:** instalación, versión, 33 ajustes idénticos, UI móvil OFF/perfil guardado y cero wakelocks actuales.
- **Pendiente:** ver la ventana en las lentes estando OFF. Las correcciones son de interfaz: no acreditan reconocimiento, participación, autonomía ni resuelven los incidentes 492 ms/siete descartes y UI 1046 ms/21 drops.

Reloj: desconectado, no se tocó. Firmware /36: no se tocó.
