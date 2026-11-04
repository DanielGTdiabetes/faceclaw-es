# S2.28.2: espera de respaldo de Smart Turn

Issue: buzz://issue?id=9bf8564ead37e9c9df339d9ba0ceff41f77d1588c9852bb6d4906f0bb81c65fd&owner=d9a7ebaf08d7d7b6a12cdb223d30f9be0db57d1ac660fa65d9d2456d3b95e6a2&d=hermes-agent-proactive

Dani autoriza parche directo y valoración por uso normal, sin fase previa de telemetría,
en evento Buzz `3f49ef4caf165ce29a3cd1f3e2783078eedec52b2f32033fb760235ba174c029`.
Spec actualizado de Claude: `2d42fd99641d0b85e47e0104b852bb7841081e7578946d48c5221d5a1a5dea7a`.
La propuesta de 700 ms de Deepseek no se aplica: se conserva el spec de 1.200 ms de Claude.

## Cambio

- Sin veredicto válido, Smart Turn habilitado y turno no directo: umbral 1.200 ms en lugar de 2.000.
- Selector «Usar la espera habitual»: conserva 2.000 ms, también como retorno local.
- Preguntas/nombre Hermes: 700 ms; veredicto válido: sin espera adicional, igual que antes.
- Se conservan el mínimo de 5 s entre peticiones no directas, la ventana acústica de observación
  de 2 s, ASR, modelo, prompt y servidor.
- El reloj periódico sigue a 500 ms: el umbral se atiende en el siguiente tick elegible, no es
  una garantía de envío exactamente a 1.200 ms. Tampoco evita el espaciado ni una petición en curso.

Riesgo: evaluar antes de terminar una idea con pausa larga. La ganancia solo afecta a esta
espera; no se promete ahorro fijo ni reducción de latencia del modelo. Dani valida usándolo.

## Fuente y validación

Rama `feat/9bf8564e` sobre `feat/7c9c58da` @ `192569c970936ef3189424fdbac94a94b47e00a3`,
correspondiente a la entrega anterior. `origin/main` observado tras fetch: `96e8eeef1eba8237e244fb65927271fb5ffad592`.
PR apilada: el delta nuevo debe revisarse contra `192569c9`; los cambios anteriores de Smart Turn
ya tienen su PR y aprobación documentadas.

Sobre esa base más el delta del parche:

- `npm.cmd test`: 1.387 pruebas, 1.385 correctas, 2 omitidas, 0 fallos.
- `node_modules/.bin/tsc.cmd --noEmit`: salida 0.
- `node_modules/.bin/oxlint.cmd app tests`: salida 0; advertencia previa `Builder` obsoleto
  en `app/native/evo-alert-notification.ts:33`.
- `ns prepare android --release --env.production --env.compileSnapshot=false`: salida 0.

No se añaden tests: se actualiza el existente para comprobar 1.199/1.200 ms, retorno a 2.000
y preguntas a 700 ms. La suite existente conserva las comprobaciones de espaciado, OFF y reconexión.
`assembleRelease` y `lintVitalRelease` terminan con salida 0. Se reutilizan las bibliotecas
nativas: las ocho `.so` y los DEX coinciden por SHA256 con el retorno fresco del Pixel.
APK S2.28.2/805, 141.509.934 bytes, firma original v2/v3 y alineación de 16 KB verificadas.
SHA256: `90f0b6d1ef1e5c03bdcdceda6c26086b3ccac4e5ed147d374504d58bffc3af94`.

Instalada mediante `adb install -r` a las **06:52:16 CET del 04/11/2026**, tras confirmación
OFF de Dani y comprobación de UI. APK extraída idéntica al artefacto; `am start -W` termina
con `Status: ok`, proceso 15773, UI Conectado/Conversación (OFF). No se inició captura.
Primera instalación conservada. 48 entradas de ajustes antes/después: 47 idénticas;
solo cambia `weather.cache`, que `app/native/weather.ts` actualiza como caché meteorológica.
No se restaura esa caché ni se muestran sus valores. La mejora percibida y los cortes no
se han medido: se validan por el uso normal de Dani.

PR: buzz://pr?id=c4209c1c2011d87511ad803e8ac79289b3f72812645bcadb6ea687c5a838d6e0&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

Artefactos y recibos en `OUTBOX/HERMES_SMART_ESPERA_9BF8564E/` de Buzz Nest.
Archivo NAS previsto: `/mnt/evo-backup/faceclaw-s2282-smart-espera-20261104/`;
`NAS_ARCHIVE_RECEIPT.json` acredita la copia y su comprobación una vez realizada.

## Retorno y datos

Antes de actualizar, se extrae la APK realmente instalada en el Pixel:
`OUTBOX/HERMES_SMART_ESPERA_9BF8564E/RETORNO_S2281.apk` en Buzz Nest,
SHA256 `d9eeb0005ba5c0ca6ea32e78e4fe3c112cd609afee11df09d74c2ac01e48495a`.
Versión S2.28.1/805, `lastUpdateTime=2026-11-03 16:06:24`, primera instalación
`2026-10-02 09:39:05`. No confundir este retorno fresco con el artefacto `d16d05e1…`
de la instalación anterior: sus APK no son idénticas. Los ajustes actuales (48 entradas)
se respaldan en carpeta privada con ACL restringida; no se copian a Git ni al archivo compartido.

Retorno sin reinstalar: Conversación OFF → Voces → «Usar la espera habitual» → siguiente ON.
Retorno completo: `adb -s 61161FDCG0013L install -r <ruta-al-RETORNO_S2281.apk>` con Conversación OFF.
No desinstalar ni borrar datos. La firma original y el código 805 se conservan.
