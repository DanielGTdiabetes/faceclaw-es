# S2.28.1: rearme de Smart Turn tras cierre del socket

03/11/2026, PC del trabajo. **Candidata; REVIEW OBLIGATORIA por Claude antes de instalar.**
S2.28 sigue siendo la última instalación acreditada. Dani deja el Pixel conectado y Conversación
OFF para cuando termine la revisión. No activar captura por sincronizar desde casa.

## Problema y comportamiento corregido

En S2.28 un cierre/error/congestión invalida el socket, pero el cliente conserva `started` y
`ConversationHermesRuntime` llama a `start()` una sola vez por sesión. Limpiar únicamente
ese booleano no rearma el canal. `started` representa ahora la sesión habilitada; la conexión
puede recuperarse al recibir PCM nuevo, sin que el runtime tenga que repetir `start()`.

- Tras un fallo, espera al menos 1 s antes de conectar otra vez. Sin PCM no reintenta.
- Un handshake sin `g2.ready` caduca a los 3 s al llegar PCM y entra en la misma recuperación.
- No almacena ni reproduce audio. El primer paquete tras `ready` crea una nueva base acústica.
- Las generaciones invalidan callbacks antiguos. OFF cierra y cancela la recuperación.
- Sin veredicto válido se mantienen 700/2000 ms; no cambia ASR, servidor ni umbrales.

## Publicación y continuación

Issue: buzz://issue?id=7c9c58dad7cd3805492f1e09230b38bfbdfe0e8e5f3e02e201b78e232ffec4b8&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=hermes-agent-proactive

PR cliente existente: buzz://pr?id=f656c2b5fbe03dce5ae87c63009d517309e63e58ae745d1d0c59eaa360addc66&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

Rama `feat/7c9c58da`; base real remota `main` = `96e8eeef1eba8237e244fb65927271fb5ffad592`.
Delta de este arreglo sobre `4baab6e0bd663fd3f16b93e171587d63dbb73ed2`.
Desde casa: recuperar esta rama de `https://github.com/DanielGTdiabetes/faceclaw-es.git` y leer
esta nota y el último contrato del hilo Hermes. No sustituir otro trabajo local al sincronizar.

## Evidencia de la candidata

Pruebas ejecutadas sobre HEAD `4baab6e0` más el delta documentado; manifiesto SHA256 local
`SMART_TURN_REARM_TESTED_FILES.json` registra los cuatro ficheros ejecutables verificados.

- `npm.cmd test` completo con Python temporal en PATH: 1387 pruebas, 1385 correctas, 2 omitidas,
  0 fallos. Cuatro regresiones nuevas fallan con el cliente previo y pasan con el arreglo,
  incluida cierre → PCM nuevo → reconexión → envío `smart` por `ConversationHermesRuntime`.
- `tsc --noEmit`: correcto. `oxlint`: correcto, advertencia previa de `Builder` en notificaciones.
- `wear/gradlew.bat -p tests/kotlin testAndroidHostTest --offline --console=plain`: 368/368.
  Primera ejecución simultánea a compilación: 1 fallo en
  `StockFlowsTest.promptDeclineTimeoutAndSkip:259` (espera de 80 ms, dos heartbeats).
  Repetición completa tras terminar la compilación: 0 fallos. Fuentes Kotlin sin cambios.
  Se conservan los dos resultados; posible sensibilidad a la planificación del host.
- `ns prepare android --release --env.production --env.compileSnapshot=false`: correcto.
- `gradlew.bat -p platforms/android :app:assembleRelease :app:lintVitalRelease -Prelease
  -PfaceclawUnsigned -x :app:prepareFaceclawLlama -x :app:prepareFaceclawNativeLibs
  -x :app:prepareFaceclawVad --offline --console=plain`: salida 0.
- APK firmada v2/v3 con certificado original `57aaa887…c435`, `zipalign -c -P 16 4` correcto,
  versión `0.8.4-es.19-conversation.s2.28.1-smart-turn-rearme`, código 805.
  Los ocho `.so` son idénticos por SHA256 a S2.28. Se reutilizan las bibliotecas nativas;
  no se afirma recompilación C/C++. Bundle contiene el rearme y `assets/app/package.json`.

APK: `OUTBOX/HERMES_SMART_TURN_REARME_7C9C58DA/FACECLAW_S2281_SMART_TURN_REARME.apk`
en Buzz Nest, 141509934 bytes, SHA256
`d16d05e197f9930d0b5868e9a7c22aa46a213e11f4f2ffbf3f848c5011712575`.
Recibo `ARTIFACT_VERIFICATION.json` en la misma carpeta. Logs `SMART_TURN_REARM_*` en `.scratch`
se copian al paquete de continuidad antes del traspaso.

## Retorno y pendientes

Tras revisión, comprobar OFF y versión instalada; `adb install -r` con la firma original,
conservando datos/ajustes y primera instalación. Retorno a S2.28:
`OUTBOX/HERMES_SMART_TURN_7C9C58DA/FACECLAW_S228_SMART_TURN.apk`,
SHA256 `ac2f8783fc48700987305c1a572f60c5d55d3a16b88edf9bc91c0cf64276dd86`.
No hay nueva instalación ni prueba física en esta entrega. Reconexión en Pixel/Tailscale,
consumo de los reintentos y calidad del corte quedan sin medir.

Dani autoriza 900 ms para el selector de recuerdo; Claude lleva esa intervención. No se cambia
en esta PR. Los 807–816 ms de los fallbacks previos son tiempo del timeout, y no demuestran
que el modelo termine antes de 900 ms. Medir los siguientes recuerdos sin afirmar 11/11.

Archivo previsto para casa: `/mnt/evo-backup/faceclaw-s2281-smart-turn-rearme-20261103/`.
El contrato final y el recibo del archivo acreditan si la copia ya se completó.
