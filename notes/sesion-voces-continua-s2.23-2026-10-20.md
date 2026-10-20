# S2.23: la sesión de voces del EVO sobrevive a los huecos de PCM — 20/10/2026 (Claude, fase 2)

**`0.8.4-es.15-conversation.s2.23-sesion-continua`/805, sobre S2.22 «presentación discreta» (`ab5b9f0`, Codex).
Se preparó primero como S2.22 sobre S2.21; al ir a instalar, el Pixel ya tenía la S2.22 de presentación
(`eed2cfda…`), así que el commit se rebasó encima y se renumeró como S2.23 para no perderla.**

## Causa

En Conversación, `app/conversation-detection/coordinator.ts` llama a `resetAcousticStream()` ante cualquier hueco
de PCM >250 ms, y ese hueco aparece tras cada respuesta mostrada en las G2. En S2.21,
`LocalTranscriptSession.resetStream()` regeneraba `streamId` y ponía `streamSeq = 0`; el EVO (`sesion_voz.py`) usa
ese id como sesión y, al cambiar, borra los grupos de hablantes. Prueba de las 18:42 del 20/10: 7 sesiones en
8 minutos, el portador casi siempre `desconocido` y la primera pregunta corta de cada sesión perdida.

## Cambio

- `resetStream()` conserva `streamId` y la secuencia sigue creciendo; solo descarta `pendingReport` (el informe de
  la ventana invalidada). El resto del reset no cambia: generación nueva, búfer vacío, decodificación en curso
  invalidada.
- Solo `start()` (ON) genera un id nuevo con secuencia 1, y `stop()` (OFF) lo borra.
- Tiempos monótonos verificados en el código: `start_ms`/`end_ms` = `startChunk*50`/`endChunk*50`, y `endChunk` es
  `inputChunks`, que solo se pone a cero en `start()`. `buffer.reset()` vacía audio y pre-roll pero no toca ese
  contador, así que la ventana posterior a un reset empieza en o después del fin de la anterior (coincide con los
  registros del EVO: cd7a8ab1 desde 35750 ms, addfa154 desde 190400 ms). El reloj es de muestras PCM recibidas, no
  de pared: el hueco no avanza el reloj.
- El atribuidor del móvil (`voz-N`) vive todo el worker y no se reinicia con el reset, así que las etiquetas
  siguen alineadas con los grupos del EVO.
- No se toca el coordinador, el puente `faceclaw-hermes` ni el EVO.

Archivos: `native/kotlin/shared/.../audio/LocalTranscriptSession.kt`,
`tests/kotlin/.../LocalEvoSessionContractTest.kt`, `App_Resources/Android/app.gradle` (versión),
`scripts/install-conversation-g0.ps1` (versión admitida).

## Pruebas

- Kotlin 365/365 (363 + 2 nuevas): tras uno y dos resets, el id es el mismo, la secuencia es 3 y 4 y
  `startMs >= endMs` anterior; tras OFF/ON, id nuevo de 32 hex, secuencia 1 y sin informe pendiente. La prueba
  S2.21 que exigía id nuevo tras reset se ha sustituido por estas.
- Node 1335/0 fallos/1 omitida (incluye las pruebas de presentación discreta); TypeScript de la app y de las
  pruebas correcto. Mismos resultados que antes del rebase, más las pruebas nuevas de S2.22.

## APK

Receta `.tools/s2.23-build.ps1` (copia de la de S2.21): release sin firmar, las 8 nativas de la S2.22 instalada,
extraída del Pixel (`.tools/install-s2.23/before.apk`, `eed2cfda…`) y firma original con `scripts/install-conversation-g0.ps1`, sin
instalar. Registro en `.tools/install-s2.23/build.log`.

- APK: `dist/conversation-g0/faceclaw-0.8.4-es.15-conversation.s2.23-sesion-continua.apk`
- SHA-256: `232fe249939bbe41fa289b33ddd0e98cad91134e86b88d44dbf99be9dca77798`

## Instalación (OK de Dani el 20/10, con Conversación en OFF)

```powershell
adb -s 61161FDCG0013L install -r dist/conversation-g0/faceclaw-0.8.4-es.15-conversation.s2.23-sesion-continua.apk
```

**Instalada el 20/10/2026 a las 19:27** con el OK de Dani: Conversación en OFF (sin wakelock `ConversationG0` ni
captura), `install -r` correcto, APK extraída idéntica (`232fe249…`), versión `0.8.4-es.15-conversation.s2.23-sesion-continua`/805,
primera instalación conservada (`2026-10-02 09:39:05`), 48 ajustes idénticos antes y después
(`.tools/s2.23-export-settings.ps1`), arranque estable sin fallos y sin captura. Falta la prueba real en las G2.

## Retorno a S2.22 «presentación» (y a S2.21)

Mismo código de versión (805) y misma firma, así que basta con `install -r`. Retorno inmediato, a la S2.22
instalada antes (`eed2cfda5b7fe7316ec94a8cef985371bf11fefe25327ca75dd8a967151b2278`, también en el NAS en
`/mnt/evo-backup/faceclaw-s2.22-presentacion-20261020/`):

```powershell
adb -s 61161FDCG0013L install -r .tools/install-s2.23/before.apk
```

Retorno a S2.21 (0.8.4-es.13-conversation.s2.21-sesion-voces/805, `a4896dc5bfba327172779cd51033c14a076727ea887d62cc8d06825427d61a11`;
copia en el NAS, `/mnt/evo-backup/faceclaw-s2.21-sesion-voces-20261019/`):

```powershell
adb -s 61161FDCG0013L install -r dist/conversation-g0/faceclaw-0.8.4-es.13-conversation.s2.21-sesion-voces.apk
```

## Qué observar en la prueba

En el EVO, una sola sesión por ON de Conversación (la secuencia sigue creciendo tras cada respuesta de Hermes) y
grupos de hablantes que no se vacían. Si el EVO todavía no tiene la vía rápida del portador (fase 1), la primera
pregunta de la conversación puede seguir perdiéndose, pero ya no la primera tras cada respuesta.
