# Informe Claude — instalación C1, 04-10-2026

Encargo `notes/prompt-claude-instalar-c1-2026-10-04.md`, tras la revisión Codex `notes/revision-codex-c1-2026-10-04.md` (sin hallazgos que bloqueen instalar). **C1 instalado y comprobado en OFF. No ensayado.** Pendiente de revisión Codex.

## Base

Rama `codex/conversation-detection-g0`, HEAD `fb9bcb8` (revisión Codex, local, publicada junto con este informe). Árbol limpio. Sin rebuild, AAR, suites ni nueva firma.

## Artefacto exacto

`dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.c1.apk`, recomprobado antes de instalar:

- SHA256 `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6`.
- `aapt`: `com.faceclaw.app`, versionCode 805, versionName `0.8.2-es.5-conversation.c1`.
- `apksigner`: certificado `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

## Precondición

- ADB: un único dispositivo, `61161FDCG0013L`, Pixel 10 Pro Fold (`rango`), comprobado y seleccionado con `-s`.
- El usuario confirmó Conversación local en OFF y móvil desbloqueado antes de cualquier consulta de UI. Después se verificó: Faceclaw en primer plano, «Conversación local · OFF», versión instalada G3.4.2, `Wake Locks: size=1` sin ninguno de Faceclaw.

## Respaldo fresco

- APK realmente instalada extraída con `pm path` + `adb pull` a `dist/conversation-g0/before-update-c1.apk`: SHA256 `990a10f1c22a2ef995ef87169336d6c3dc917bd1ec7d607e0736d33fbd84b5f8`, **idéntico a la G3.4.2 firmada documentada**, certificado original, `0.8.2-es.5-conversation.g3.4.2`/805.
- Ajustes privados con el método anterior (`.tools/c1-export-settings.ps1`, copia del de G3.4.2 con directorio `c1-private`, ACL usuario/SYSTEM). El archivo temporal del móvil se borra tras copiarlo. Sin perfil, vector, audio ni `noBackupFilesDir`. No se imprimieron valores.

## Instalación

`adb -s 61161FDCG0013L install -r` de la APK firmada exacta → `Success`. Sin desinstalar ni borrar datos. No se usó el helper de firma.

- Instalada: `0.8.2-es.5-conversation.c1`, versionCode 805.
- La `base.apk` instalada, extraída de nuevo, tiene SHA256 `de2115f8…`, igual al artefacto revisado.
- **Ajustes: 33 antes, 33 después, comparación canónica idéntica**, incluidos Hermes y bloqueo.

## Observación en dispositivo (OFF)

Proceso nuevo tras la instalación (lo inició el receptor de exportación de ajustes). App abierta con el lanzador, sin pulsar nada. Volcado de UI:

- «Conectado», «Conversación local · OFF».
- «Mi perfil: guardado en este móvil» y «Mi perfil · guardado» (estado, sin leer el perfil).
- «Texto local opcional: ON · tocar para cambiar» (selección anterior, RAM).
- **Nuevos:** «Idioma del texto: automático · tocar para cambiar» y «Diagnóstico por fases: OFF · tocar para cambiar», ambos habilitados en OFF. Defaults `auto` / diagnóstico OFF en proceso nuevo.
- **Fila de marcas de fase oculta** (sin «Otra persona/Yo/Referencia/Fin»), como corresponde a OFF.
- «Iniciar conversación local (2 min máx.)» presente, **no pulsado**.
- `Wake Locks: size=0` tras abrir, ninguno de Faceclaw. Sin captura experimental.

La vista de gafas figura como «Display off» en el móvil: **no se observó la app en las lentes**. No se activaron modelo, captura ni marcas.

## NAS

- `apk-builds/0.8.2-conversation-c1/before-update-c1.apk`: SHA256 `990a10f1…`, igual al local, 600, carpeta 700. Junto a la APK C1 firmada, unsigned y fuente subidas en la entrega anterior.
- `connection-backups/2026-10-04-c1/before.xml` y `after.xml`: hashes iguales a los locales (no impresos), 600, carpeta 700.
- Notas (este informe, `AGENTS.md`, continuidad) copiadas a `/volume1/home/Dani/Faceclaw/` con respaldo `.before-c1-install-20261004` de las anteriores.

## Reversión

`adb -s 61161FDCG0013L install -r dist/conversation-g0/before-update-c1.apk` (G3.4.2 exacta, firma original, datos conservados). Copia también en el NAS.

## Separación

- **Instalado y observado en OFF:** versión, hash instalado, 33 ajustes idénticos, UI móvil nueva con defaults, controles de fase ocultos, cero wakelocks.
- **No ensayado:** sin sesión ON, sin voz, sin marcas. Valor real de `result.lang` con `es` y mejora del interlocutor **no medidos**. App en lentes no observada.
- El ensayo de §13 se acota con el usuario. No se lanzan las cuatro sesiones automáticamente ni se recogen muestras de perfil.
- Perfil, Hermes habitual, GPS, bloqueo, firmware /36 y Wear desconectado sin tocar. Sin servicios de Jarvis.
- Precisión, participación, autonomía e incidentes históricos (492 ms/siete descartes, UI 1046 ms/21 drops) siguen abiertos. G3.4.2 no queda aprobada retroactivamente.
