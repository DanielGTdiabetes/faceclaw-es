# Instrumentación de retirada instalada — 03/11/2026

Claude aprobó el ejecutable `714be3988a4700ea4a36ca2849520792d3df9bf3`
en Buzz `5ddd783ea81ae5b24dd62e68aa72d74f6e04fbf7330bff487611f00f677722ee`.
Dani confirmó OFF en `add123d7f89bc5d4f233dc9a821c44889572a09fa38945cdcf3ba07caa9672a1`.

## Construcción y límites

`webpack --env android --env production --env compileSnapshot=false` terminó con
salida 0 sobre el SHA aprobado, sin cambios en el worktree. Se reemplazaron los
assets generados sobre la APK exacta extraída del Pixel y se alineó y firmó con la
clave original. Dos invocaciones anteriores fallaron antes de compilar por una ruta
incorrecta de NativeScript CLI; se cambió al empaquetado autónomo de webpack.
No se ejecutaron Gradle, Kotlin ni lintVital en este turno: se conservaron DEX,
manifiesto, paquete runtime y ocho bibliotecas nativas, comprobados por SHA256.
El comparador solo encontró cambios en 13 archivos JavaScript y metadatos de firma.
La advertencia de webpack por ausencia de la ruta CLI queda registrada; los assets
compilados, paquete runtime y arranque real se verificaron después.

El bundle contiene `FaceclawScreen`, `FaceclawHermesUi`, `capture-skipped`,
`confirmation-skipped`, `glance-hide`, `hermes-frame` y `hermes-wake`.
Todos los `.mjs` generados pasaron `node --check`. La suite completa previa sigue
siendo 1388 correctas, 2 omitidas, 0 fallos; no se repitió sin cambios ejecutables.

## Instalación comprobada

- Pixel USB `61161FDCG0013L`; `adb install -r` → `Success`.
- SHA256 candidata e instalada extraída:
  `d9eeb0005ba5c0ca6ea32e78e4fe3c112cd609afee11df09d74c2ac01e48495a`.
- Firma v2/v3 válida, certificado original
  `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- `zipalign -c -P 16 4` → 0.
- Conserva `0.8.4-es.19-conversation.s2.28.1-smart-turn-rearme` / código 805.
  Distinguir esta instrumentación por SHA256, no por versionName.
- `lastUpdateTime=2026-11-03 16:06:24` CET.
- `firstInstallTime=2026-10-02 09:39:05`, conservada.
- 48 ajustes privados comparados por entrada XML ordenada: cero diferencias.
- `am start -W` → `Status: ok`; PID 21430 vivo en lecturas posteriores.
- UI final observada tras despertar/dismiss-keyguard: Faceclaw / Conectado /
  Conversación, sin etiqueta de escucha. No se activó captura.
- Sin wakelock de captura antes de instalar ni en la comprobación posterior;
  los locks observados en reposo eran de Doze del sistema.
- Las últimas 100 líneas consultadas del buffer crash no incluyen el paquete.

Retorno fresco, S2.28.1 sin instrumentación:
`OUTBOX/HERMES_PANTALLA_9AFE43FA/PIXEL_BEFORE_DIAGNOSTICS_S2281.apk`, SHA256
`d16d05e197f9930d0b5868e9a7c22aa46a213e11f4f2ffbf3f848c5011712575`.
APK instalada y recibos en esa misma carpeta de Buzz Nest. Los ajustes privados
permanecen fuera del repositorio y del archivo compartido.

## Siguiente

Se comunicó a Dani que puede volver a ON en evento
`9cef0e416fc1c4df8f32d6cd126abd9e0fba9a6c48d52ebafe843f744342b60f`.
No se espera en bucle ni se inicia escucha. Uso normal; si reaparece la retirada,
leer `FaceclawScreen`/`FaceclawHermesUi` y cruzar frame/ACK/wake/blank con el puente.
No hay retirada nueva reproducida ni logs de Hermes nuevo observados en este turno.
El incidente sigue abierto; esta entrega solo instala observabilidad.

Issue: buzz://issue?id=9afe43faa31947d4421e802d6720b5352fae2ee4ada91e035d6e4401a0329c8d&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=hermes-agent-proactive

PR: buzz://pr?id=a3afada47e4f4a67fd2710a6d2d8784c6fbbd81abe576587f7bbb55f4f942744&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es
