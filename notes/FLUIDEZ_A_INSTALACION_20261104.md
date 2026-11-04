# Fluidez A instalada — 04/11/2026

Claude aprobó el ejecutable `fd079d09518f1dd0d518591131f437d3d49eace9` y el puente
`bbdb518c9d2ad4f3fe4604cc7bbbb592d24a04e4`. Dani confirmó OFF (`bf456951`) y autorizó
explícitamente instalar (`4be700d4`). Se instaló primero el puente a las 16:26:17 CET,
después la APK con `adb install -r`, actualizada a las 16:26:50 CET.

- APK extraída del Pixel: `84922b2d7c80466bcda645fc0b251254ff0a528640b1826d1dd13afd139bdb18`,
  idéntica a la aprobada. Conserva deliberadamente la etiqueta S2.28.2/código 805;
  distinguir esta revisión por SHA. Firma original verificada antes de instalar.
- 48 ajustes antes/después, todos idénticos. Respaldo privado local con ACL; no se publica.
  Primera instalación conservada: 02/10/2026 09:39:05. Arranque Android `Status: ok`, PID 16093,
  sin coincidencias del paquete/FATAL en el buffer crash desde la instalación.
- No se inició captura. Pixel bloqueado: el volcado de UI no permite confirmar visualmente
  OFF. OFF lo declara Dani; lectura posterior sin wakelocks de captura (solo doze/Bluetooth)
  y cero actividad de Conversación en el puente. No se desbloqueó ni se cambió el modo.
- EVO: HEAD exacto `bbdb518`, árbol limpio, `faceclaw-hermes` activo/running, PID 716486,
  NRestarts 0, ready 16:26:21.061, teléfono reconectado 16:26:49.430. Cero líneas
  ERROR/Traceback desde el reinicio. `hermes-gateway` conserva PID 642183 e inicio 12:24:41;
  config, `citas.py` y parser mantienen sus hashes. Ninguna escritura en Calendar.

## Retorno

- Pixel: `OUTBOX/HERMES_FLUIDEZ_0F41D278/RETORNO_PIXEL_S2282.apk`,
  SHA `90f0b6d1ef1e5c03bdcdceda6c26086b3ccac4e5ed147d374504d58bffc3af94`.
  Volver con OFF y `adb install -r`, sin desinstalar ni restaurar ajustes antiguos.
- EVO: `/home/dani/fluidez-retorno-0f41d278-6vyuf6a6/revert.py`, compilado, no ejecutado.
  Exige HEAD objetivo limpio y vuelve a `da0a010`, reiniciando solo `faceclaw-hermes`.
- Archivo NAS: `/mnt/evo-backup/faceclaw-fluidez-a-0f41d278-20261104/`.
  Incluye APK, retorno, fuentes exactas y recibos; verificar `NAS_ARCHIVE_RECEIPT.json`
  en el OUTBOX para la comprobación posterior de hashes. No contiene ajustes ni perfil.

## Verificación y siguiente paso

Suite completa sobre `fd079d09`: 1406 pruebas, 1404 correctas, 2 omitidas, 0 fallos;
tipos y oxlint correctos con aviso previo de Builder. Negativa sobre `beff1a17` con
tests candidatos: ocho fallos. Puente sin cambios posteriores a su validación aislada:
72 pruebas, seis fallos previos, sin errores/omisiones; las 32 de citas pasan.
No se repiten pruebas por esta nota documental. No hubo reconstrucción nativa Gradle/Kotlin:
se conservaron dos DEX, ocho bibliotecas, recursos y manifiesto de la APK instalada anterior.

Falta verificación independiente de la instalación y valoración en uso normal. Dani confirmó
ON activo a las 16:31 CET (`447fa45b`); no se consulta UI ni se reinicia durante su uso.
Textos normales: 4–30 s según longitud desde ACK; ofertas: mínimo 12/máximo 30 s.
Una oferta no canjeable se descarta, sin regenerarla. B/interrupción y el suelo de 5 s entre
peticiones no cambian. No crear citas para una prueba ni duplicar la cita real existente.

Recibos públicos: `OUTBOX/HERMES_FLUIDEZ_0F41D278/INSTALLATION_RECEIPT.json`,
`BRIDGE_INSTALLATION_MANIFEST.json`, `ARTIFACT_FD079D09_VERIFIED.json`.
La instalación no implica merge: la app sigue apilada sobre `826b5381`.
