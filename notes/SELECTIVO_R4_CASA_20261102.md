---
title: "Faceclaw S2.26: integración selectiva R4 instalada en casa"
tags: [faceclaw, continuidad, bluetooth, notificaciones]
status: active
created: 2026-11-02
---

S2.26 instalada el 02/11/2026 a las 17:39:31 CET con autorización de Dani en el hilo
`5d03c745fec5bffb863a900fd10959450b274aeb1af77ee38b470a3aefa739ef`. Prevalece sobre la parada del trabajo.

## Decisiones y base

| Mejora | Decisión | Límite |
|---|---|---|
| LE 2M al conectar | Adoptada, atribuida a upstream 71bccd2 | Ambas conexiones negociaron 2M; no se midió latencia/audio |
| Recuperación de notificaciones | Adaptada, atribuida a bf2addd | Watchdog/backoff/estado/reconciliación; recuperación real tras hueco pendiente |
| Imágenes | Fuera de S2.26; preparar aparte | Claude verificó bajo acoplamiento; útiles para gráficas Dexcom, sin diseños 0.8.6 |
| Firmware | Conservado Faceclaw/37 | No se sube a /38 ni se ha flasheado |

Rama `feat/7f26a24f`; base R4 `041620a1f385e59d9a645104ff26e199bb220ab4`.
Código integrado `1d8d07171dc4b6c51a64457777f1961de7d69d60`; fuente del artefacto
`a0ac233c1e312fc0cde1ba2ecf82d22c24e9b298`. La diferencia desde c3aae62 es solo versionName.
Sin LocalTranscriptSession.kt, LocalWhisperRunConfig.kt ni LocalSpeakerAttributionTest.kt en el diff contra R4;
R5/R6 rechazadas no se recuperan. Tiempo/Open-Meteo, GPS, Hermes, ASR, modelos y perfiles conservados.

Worktree de casa: `E:\projects\faceclaw-selectivo-r4-20261102`. El checkout
`E:\projects\faceclaw-es` sigue en su rama previa, limpio; no desarrollarlo como si fuese S2.26.

## Artefactos y comprobaciones

- APK: `0.8.4-es.17-conversation.s2.26-selectivo-2m-listener`, código 805, release arm64-v8a.
- SHA256 candidata y base.apk extraída después: `e7fa8a076bcec6c9f535e45d730f784bbe3d98aa6c75c514865b925aec90f2f9`.
- Retorno fresco R4: `f3e5b11bbf1f7774d13ecb030631e6b86da6e1fc03d8756ee68b6a9828163e57`.
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Ocho bibliotecas nativas idénticas a R4; DEX y bundle incorporan los cambios.
- Local: `C:\Users\danie\.buzz\OUTBOX\FACECLAW_SELECTIVO_20261102\` (APK, retorno y recibos).
- `npm test` sobre a0ac233: 1366 pruebas, 1365 correctas, una omitida, cero fallos.
- `tsc --noEmit` y `bash lint.sh`: salida 0; aviso previo Builder obsoleto en evo-alert-notification.ts:33.
- Kotlin completo sobre código 1d8d0717 en el PC del trabajo: 366/366; no se repitió por cambiar versionName.
- En casa: preparación NativeScript release y AAR compartida correctas; Android
  `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`
  con `-x prepareFaceclawNativeLibs -x prepareFaceclawLlama -x prepareFaceclawVad`, salida 0.
  Este build sí compiló el listener y adaptador Android. Después se conservaron las ocho nativas R4 y se firmó.
- Deepseek verificó además `apksigner`, `aapt`, `zipalign -c -P 16 4`, contenido y retorno.
- `adb install -r`: correcto; hash extraído idéntico, 48 ajustes idénticos, firstInstallTime
  `2026-10-02 09:39:05` conservado, proceso estable durante los cinco segundos iniciales.
- UI observada: entrada literal «Conversación», que main-view-model.ts:301-302 corresponde a
  detector.enabled=false (en ON diría «Conversación · escuchando»). Cero wakelocks actuales de Conversación.
  Las gafas aparecían cargando en estuche; no atribuir «Conectado» a esa pantalla.
- Log retenido del arranque: 4 callbacks PHY; 2 enlaces con
  txPhy=2/rxPhy=2/status=0; Faceclaw en la lista de listeners vivos de Android.

Revisión de código Claude: evento `e094670f` sobre c3aae62, sin bloqueantes, condicionada a build Android.
Artefacto Deepseek: `8185be1d`; verificación postinstalación independiente: `f281614f`.
No se iniciaron escucha/captura, avisos sintéticos, cambios de permisos, reconexiones forzadas, firmware ni emparejamientos.

## Entorno, continuidad y pendientes

C: se llenó durante la preparación. Los enlaces de dependencias entre discos produjeron una ruta inválida;
la preparación también modificó paquetes compartidos. Se retiraron solo los temporales propios,
se restauraron las dependencias originales mediante `npm ci --offline --ignore-scripts` desde su lockfile
y se instaló una copia independiente en el worktree de E:. Código original y lockfiles quedaron limpios.
Gradle se copió a `.gradle-local` de ese worktree, excluyendo locks activos. SDK y JDK locales reutilizados.
No se atribuyen a defectos del código estos fallos de entorno.

La instalación no demuestra recuperación real del binding tras caída ni ausencia de duplicados tras un hueco.
Propuesta pendiente de coordinar: aviso sintético único, pérdida/restauración del binding y un solo aviso por clave.
No se ejecutó automáticamente. Tampoco se midió mejora de latencia ni autonomía.

Retorno conservando datos:
`adb -s 61161FDCG0013L install -r C:\Users\danie\.buzz\OUTBOX\FACECLAW_SELECTIVO_20261102\RETORNO_R4.apk`
(no ejecutado en este cierre). Comprobar OFF y respaldo actual antes de una reversión.

Recibos públicos en `notes/evidence/SELECTIVO_S2_26_{ARTIFACT,INSTALLED,PASSIVE}.json`.
Ajustes privados solo en `.scratch/FACECLAW_SELECTIVO_PRIVATE`, excluidos de Git y NAS. No se exportó el perfil ni audio.

NAS completado y verificado: `/volume1/home/Dani/Faceclaw/apk-builds/s2.26-selectivo-20261102/`.
APK, retorno, recibos y continuidad con hashes idénticos; carpeta 700 y archivos 600. Recibo NAS local incluido.

Evaluación de imágenes Claude: evento `2b69ee73`; upstream 40082b3 toca nueve ficheros, +332/-13.
Vista de detalle bajo demanda, fallback vacío si falta listener/imagen, sin alterar popup, dedupe ni Hermes.
Helpers de render ya presentes; el test de aplicación solo encuentra CHANGELOG como diferencia.
Riesgos pendientes para candidata aparte: coste síncrono de decodificar/escalar imágenes grandes y heurística
de inversión de fondo. No incorporar diseños personalizados, firmware ni notificaciones clínicas reales para pruebas.

Issue: buzz://issue?id=7f26a24f4cef932140794d2e067f1faa7de0da35924c13919cce44e3440e7aa7&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

PR: buzz://pr?id=914636056f0bec871075c74a34b8c3e441f1612c6ad61153ee0de41316886079&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es
