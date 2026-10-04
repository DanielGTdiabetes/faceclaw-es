# Informe Claude — prueba breve S2.2, 04-10-2026

Encargo `notes/prompt-claude-prueba-breve-s2.2-2026-10-04.md`. **Prueba guiada hecha a las 18:56 CEST: frase no intentada, porque el usuario no encontró la opción. Asignación manual aplicada. Soniox se mantuvo toda la sesión.** Antes hubo una sesión libre (18:43), fuera del guion. Se recogió su resumen como dato aparte. No cuenta como la prueba.

## Base

Rama `codex/conversation-detection-g0`, HEAD `ae55d83`, 44 entradas en `git status --short`, cambios locales conservados. Sin reinstalación, rebuild, suites, commit, reset ni cambio de rama. Perfil sin leer ni exportar. Sin envío a Hermes. Instalada `0.8.2-es.5-conversation.s2.2`/805, comprobado con `dumpsys package`. Pixel `61161FDCG0013L`, único dispositivo ADB.

Método de lectura: el volcado de accesibilidad devuelve vacío el texto del cuadro «Métricas locales». Por eso se leyó con capturas recortadas de ese cuadro, tomadas solo en OFF y ya borradas del PC y del móvil. Durante ON no hubo consultas, capturas ni logcat. No se guardaron audio, transcripción, vistas previas ni tokens.

## Sesión libre previa (18:43:54–18:45:35, fuera del guion)

Al coordinar, el usuario confirmó OFF y que estaba listo. La comprobación en OFF (18:46:03) dio `Wake Locks: size=0` y ningún cliente de Faceclaw en audio. El historial de `dumpsys power` mostraba una sesión `Faceclaw:ConversationG0` ya cerrada. El usuario la llamó primero «la prueba». Después aclaró que **no había visto que había que seguir un guion**. Se trata como sesión libre.

- Duración unos 101 s. `samples` 1 601 600 = 100,1 s.
- Usuario: sin intento de frase. Vio «Yo» y otra etiqueta distinta en el móvil. No señaló avisos de error.
- Resumen: `engineFinal` `local (sin red)`, `sentAudioMs` 66000, `finalAudioProcMs` 35520, `totalAudioProcMs` 38040, `backlogAtStopMs` 30480, `firstTokenAfterMs` 12866, `firstFinalAfterMs` 14344, `messages` 117, `finalTokens` 106, `turns` 8, `speakersSeen` 3, invalidez 0/0, `fallbacks` 1, `errors` 1, `lastErrorCategory` `envio-audio`, identidad `sin-identificar`/`null`/`motor-local`, intentos 0, manuales 0, `endedBy` `manual`.
- Lectura: unos 66 s llegaron a Soniox y después hubo un error de envío y paso a motor local. Al parar, el progreso iba 30,5 s por detrás. Sin historial no se distingue entre retraso creciente y progreso congelado tras el fallo. El «Yo» que vio el usuario no está respaldado por ninguna identificación en el resumen. Queda pendiente aclarar en el código de dónde sale esa etiqueta.

## Prueba guiada (18:56:06–18:56:57)

Claude pasó al usuario el guion de cinco pasos. El usuario pulsó ON y OFF. Claude no tocó el móvil mientras escuchaba.

### Duración (por herramientas)

`Faceclaw:ConversationG0` ACQ 18:56:06.235 y REL 18:56:57.324, unos **51 s**. `samples` 814 400 = 50,9 s. `stopReason: manual`. Dentro de los 45–60 s previstos.

### Observación humana (dicha por el usuario, sin transcripción)

- **Frase:** no encontró la opción «Identificar mi voz (frase)». No hubo intento.
- **Antes de la corrección** («Mañana voy a preparar…» / «Yo pasaré después…»): las dos voces salieron con **la misma etiqueta**.
- **Corrección manual:** eligió «Soy la voz …».
- **Después de la corrección** («De acuerdo, nos vemos mañana» / «Perfecto, hasta mañana»): **«Yo» para su voz y otra etiqueta distinta para la otra persona**.
- Observado **en el móvil**. Las lentes no se observaron. El espejo móvil no acredita lo que mostraron las gafas.

### Resumen «Última sesión Soniox (sin texto)»

| Campo | Valor |
| --- | --- |
| `engineFinal` | `soniox` |
| `sentAudioMs` | 50900 |
| `finalAudioProcMs` | 45240 |
| `totalAudioProcMs` | 50520 |
| `backlogAtStopMs` | 5660 |
| `firstTokenAfterMs` | 6129 |
| `firstFinalAfterMs` | 7548 |
| `messages` / `finalTokens` / `turns` / `speakersSeen` | 81 / 51 / 6 / 2 |
| `invalidTimingTokens` / `invalidProgress` | 0 / 0 |
| `fallbacks` / `errors` / `lastErrorCategory` | 0 / 0 / `null` |
| `identity.state` / `source` / `lastOutcome` | `identificado` / `manual` / `ninguno` |
| `identity.attempts` / `manualAssignments` | 0 / 1 |
| `endedBy` | `manual` |

Coherencia del progreso: 45240 y 50520 son finitos, no negativos y menores que `sentAudioMs + 100` (51000). `backlogAtStopMs` = 50900 − 45240 = 5660, cuadra.

Lectura, con sus límites:

- Soniox se mantuvo toda la sesión, sin errores ni fallback.
- `attempts: 0` confirma lo que dijo el usuario: no hubo intento de frase. La identificación vino de la asignación manual.
- Al parar, el progreso final iba 5,7 s por detrás del audio enviado. Es una foto al parar, sin el drenaje final, y no es latencia de voz ni de Hermes.
- Primer token a 6,1 s y primer final a 7,5 s desde el primer envío. Incluyen el silencio inicial (apertura de «Mi voz»), la red y la espera del servicio.
- `speakersSeen: 2` coincide con las dos personas, pero no lo demuestra. La TV podría contar.
- Cero invalidez temporal es compatible con las ventanas de esta sesión. **No demuestra el origen común exacto** de `start_ms`/`end_ms`, progreso y contador enviado.

## Cierre observado (tras OFF, por herramientas)

- 18:57:23: ningún wakelock de Faceclaw (solo uno ajeno del sistema). `ConversationG0` liberado a las 18:56:57. Sin cliente de Faceclaw en `dumpsys audio` ni en `audio_flinger`. UI «Conversación local · OFF».
- Métricas en vivo: `enabled: false`, `state: desactivado`, «OFF: concesión, suscripciones y temporizadores retirados.», `lease: false`, `timer: false`, `bufferedBytes: 0`. Transcripción y participación con `worker: false`, `busy: false`, `inputBufferedBytes: 0`. VAD `inactivo`.
- 18:59:37: sin wakelocks de Faceclaw.
- **Bandera nativa:** el bloque «Nativo» sigue marcando `"capturing": true` tras OFF, igual que en la sesión libre. Al reabrir las métricas unos 1,5 min después, los contadores no habían cambiado (`packets` 1018, `samples` 814 400), sin grabación del sistema. Parece una bandera sin reiniciar al parar, no una captura activa. Queda como hallazgo para revisión, sin cambiar la app en este encargo.
- Nativo, además: decode/missing/duplicates/malformed/stale/queueDrops 0, `pcmDeliveryDrops` 0, `maxPacketGapMs` 92.

## Criterio

**No satisfactoria según el criterio del encargo.** No hubo intento de frase, así que el portador no se asoció por frase.

- **Frase:** no realizada, porque el usuario no encontró la opción. No es un fallo del reconocimiento de la frase.
- **Manual (observado):** tras la elección, «Yo» para el portador y otra etiqueta para la otra persona, en el móvil. El resumen confirma `identificado`/`manual`. Esto no aprueba la frase.
- Antes de la corrección, las dos voces compartieron etiqueta. Es una limitación observada de la diarización en esta sesión.
- Cierre en OFF sin lease, temporizador, buffers ni wakelock experimental. Queda la bandera nativa `capturing` sin reiniciar.
- Esto no demuestra precisión general.

## Pendiente

- Averiguar por qué el usuario no encontró «Identificar mi voz (frase)» dentro de «Mi voz · identificar o corregir»: ubicación, texto o momento en que aparece. Es candidata a mejora de la interfaz.
- Si se quiere validar la frase, hace falta un encargo nuevo con un intento único.
- Error `envio-audio` y fallback local en la sesión libre (~66 s), con un progreso 30,5 s por detrás.
- Etiqueta «Yo» sin identificación en la sesión libre.
- `capturing: true` del nativo tras OFF.
- Después, retomar el diseño Hermes con `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md` y `notes/aclaracion-activacion-hermes-conversacion-2026-10-04.md`. Decisión del producto sin cambios: lentes apagadas durante la escucha y solo mensajes de Hermes visibles. S2.2 sigue siendo diagnóstica y no lo implementa.
