# Retirada de Hermes en 124 ms: instrumentación para localizar el disparador

03/11/2026. **REVIEW OBLIGATORIA por Claude. Diagnóstico, sin corrección funcional ni instalación.**

Issue: buzz://issue?id=9afe43faa31947d4421e802d6720b5352fae2ee4ada91e035d6e4401a0329c8d&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=hermes-agent-proactive

## Evidencia y límites

Fuente instalada S2.28.1: `192569c970936ef3189424fdbac94a94b47e00a3`
(ejecutable aprobado `06ab44dd3f20433fb76609d577e89c370179485d`).
El export existente del Pixel, copiado a Buzz Nest como
`.scratch/PIXEL_FRAME_TIMINGS_RETIRADA_20261103.txt`, muestra:

- `compositor:unblank` #434 a las 15:28:58.767 CET, ACK 58.978.
- `render:shell` #433 contiene `HermesContributionLayer`, ACK 15:28:59.167.
- #435 es `render:ai-chat`, descartado por superficie sin cambios; no envió el borrado.
- `compositor:blank` #436 comienza 59.186, ACK 59.291: 124 ms después del ACK del texto.
- No aparece Glanceboard en esa secuencia del export consultado.

Esto acredita entrega y borrado ordenado por el móvil, no la causa raíz ni una duración
óptica exacta. La falta de `conv presented` o del antiguo log de retirada no demuestra
que `capturePresentation()` devolviera null: la confirmación capturada también puede
invalidarse o quedar detrás de una barrera de wake fallida.

En `conversation-hermes-ui.ts`, `isReading()` devuelve true con `presentedAt=null`:
la protección del shell ya opera antes del ACK. No se cambia el plazo de 12/30 s ni
el arreglo del tiempo del puente. El incidente permanece abierto.

## Cambio observable

`FaceclawHermesUi` escribe directamente a logcat, incluso en release:

- `capture-skipped`: sin capa, entrada, texto visible o con capa oculta. Silencioso en reposo.
- `captured`: existe callback asociado a la entrada; no acredita entrega.
- `confirmation-skipped`: disposed, capa/entrada sustituida, sin texto o invisible.
- `confirmed`: comienza/conserva lectura; `valid` y `hasReceipt` describen elegibilidad,
  no prueban que el puente haya recibido el recibo.
- `withdrawn`: enabled/listening/revoked al retirar por suspensión/OFF/revocación.
- `retired`: razón, confirmación y edad desde selección, también sin ACK previo.

`FaceclawScreen` registra origen shell/glance de la transición, on/shellOn/overlay/glance,
`glance-hide`, resultado de frame y resultado de la barrera de wake, con frameId.
No incluye texto, identificadores de usuario, tokens, audio ni ajustes.

No usar `appendLog` para esta evidencia: depende de `VERBOSE_CONTROLLER_LOG`.
Tampoco añadir el resultado del envío solo con `frameTimings.logFrame`: el frame nativo
está cerrado tras `waitForFrameFinished` y `FrameTimingsCore.openFrameLocked` lo descarta.
La captura previa al paint queda anotada en el frame; su resultado usa logcat.

## Base y validación

Rama `feat/9afe43fa`, apilada sobre la instalada `feat/7c9c58da` @ `192569c9`.
Remoto comprobado con `git ls-remote --symref`: HEAD real `main` @ `96e8eeef`;
`feat/7c9c58da` @ `192569c9`. Revisar este delta contra la rama instalada,
sin atribuirle cambios heredados aún no fusionados en main.

Pruebas sobre HEAD `192569c9` más los cinco ficheros modificados; recibo de resultados
y hashes en el paquete de entrega de Buzz Nest. Suite raíz completa `npm.cmd test`,
`npx.cmd tsc --noEmit`, `npx.cmd oxlint` y `git diff --check`.
Resultado final: 1390 pruebas, 1388 correctas, 2 omitidas, 0 fallos; TypeScript y lint
salida 0. Lint conserva el aviso previo `Builder` obsoleto en `evo-alert-notification.ts:33`.
Las pruebas nuevas cubren contenido privado excluido, captura oculta frente a confirmación
rechazada, retirada sin confirmar, logcat que lanza excepción sin alterar lectura/recibos,
y evidencia del ACK/wake cuando el frame nativo ya está cerrado.

Sin cambios Kotlin, sin build release/APK, sin instalación, sin repetición hablada ni
reinicio de app/servicios. Esas comprobaciones no se presentan como ejecutadas.

## Continuación tras revisión

1. Claude revisa el delta observacional y la conservación de prioridades/privacidad.
2. Preparar APK con los logs conservados en bundle release y la firma original;
   seguir `notes/continuidad-entre-pcs.md`, conservar ajustes, datos y retorno S2.28.1.
   No sustituir una sesión ON: coordinar el cierre OFF antes de instalar.
3. Capturar `FaceclawHermesUi` y `FaceclawScreen` con marcas de logcat durante uso normal
   o tres preguntas cortas coordinadas. No activar captura por sincronizar.
4. Cruzar frameId/ACK/blank con captura, confirmación, retirada, estado shell y barrera wake;
   comprobar recibos del puente y lectura de al menos 12 s si no hubo retirada prioritaria.
5. Corregir únicamente el camino demostrado y añadir su regresión antes de cerrar el issue.

No revertir el arreglo del tiempo ni aumentar temporizadores basándose en la ausencia de logs.
