---
title: "Faceclaw: parada controlada de integración selectiva sobre R4"
tags: [faceclaw, continuidad, bluetooth, notificaciones]
status: draft
created: 2026-11-02
---

Parada solicitada por Dani antes de las 17:00 Europe/Madrid. Continuar en casa cuando lo indique. Integración incompleta: REVIEW OBLIGATORIA; no candidata Android comprobada ni instalación nueva.

Issue: buzz://issue?id=7f26a24f4cef932140794d2e067f1faa7de0da35924c13919cce44e3440e7aa7&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

## Estado portable

- Repo: https://github.com/DanielGTdiabetes/faceclaw-es.git
- Worktree de trabajo: `D:\Proyectos\Faceclaw_spanish-selectivo-r4-20261102`.
- Rama publicada: `feat/7f26a24f`, código `1d8d07171dc4b6c51a64457777f1961de7d69d60`.
- Base R4: `041620a1f385e59d9a645104ff26e199bb220ab4`, rama `feat/tick-inmediato-pregunta-20261101`. Revisar contra esta base, no incorporar el tip R5/R6 de `feat/ventana-pausa-evo-20261101` ni fusionar con main por rutina.
- Checkout original conservado; no sobrescribir sus cambios previos.
- `3fa1fd0b`: port LE 2M, autor upstream James Babcock, committer Claude, atribución a `71bccd2c1c6dbed157fcae8e949e9510e1ed6db4`.
- `ab3f6eea`: test FakeLink por brazo/conexión; `c8e8240d`: recuperación listener/estado/dedupe, atribución a `bf2addd287a427e44f07fb006d92641adbf9b547`; `1d8d0717`: corrige test para usar `disconnect()` real. Estos tres commits son de Codex.
- Imágenes pendientes de evaluación aparte; diseños 0.8.6 fuera. Tiempo/Open-Meteo, GPS y R4 ASR no modificados por este diff.

## Evidencia ejecutada sobre 1d8d0717

HEAD confirmado en el mismo shell antes de cada ejecución:

- `npm.cmd test`: 1366 tests, 1364 correctos, 2 omitidos, 0 fallos, salida 0.
- `bash scripts/test-kotlin.sh`: BUILD SUCCESSFUL; XML de `tests/kotlin/build/test-results/testAndroidHostTest/TEST-*.xml`: 366 tests, 0 fallos, 0 errores, 0 omitidos. Es suite de código compartido; no compila el listener de App_Resources.
- `bash lint.sh`: salida 0, aviso de deprecación de Builder en `app/native/evo-alert-notification.ts:33`.
- `node_modules/.bin/tsc.cmd --noEmit`: salida 0.
- `git diff --check 041620a1 HEAD`: sin incidencias.
- `git diff --name-only 041620a1...HEAD`: sin LocalTranscriptSession.kt, LocalWhisperRunConfig.kt ni LocalSpeakerAttributionTest.kt.
- `git push -u origin feat/7f26a24f`: publicación correcta. Atribución de todos los commits salientes inspeccionada antes del push.

Fallo corregido: primera suite Kotlin no compilaba por `s.core.stop()` inexistente; segunda ejecución completa correcta tras usar `disconnect()`. La suite Node anterior a los últimos tests no se usa para acreditar el estado final.

Logs locales desechables: `.scratch/FACECLAW_NODE_FINAL.log`, `FACECLAW_KOTLIN_FINAL.log`, `FACECLAW_LINT_FINAL.log`, `FACECLAW_TYPES_FINAL.log`. La evidencia portable está resumida aquí, no depender de esos logs en casa.

## Ficheros de código y pruebas

```text
App_Resources/Android/src/main/java/com/faceclaw/app/AndroidSessionLink.kt
App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawBleManager.kt
App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawMediaNotificationListenerService.kt
app/apps/developer/bandwidth-benchmark.ts
app/g2/dashboard-controller.ts
app/native/bandwidth-benchmark.ts
app/native/notification-access.ios.ts
app/native/notification-access.ts
app/native/notification-icons.ts
native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/g2protocol/session/GlassesSessionCore.kt
native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/g2protocol/session/SessionPorts.kt
tests/kotlin/src/commonTest/kotlin/com/faceclaw/app/GlassesSessionCoreTest.kt
tests/notification-channel.test.cjs
tests/notification-listener-binding.test.cjs
```

## Reanudar

1. Fetch y recuperar `feat/7f26a24f` en worktree propio, conservando cambios ajenos. Leer AGENTS.md y `notes/continuidad-entre-pcs.md` del PC de casa. Comprobar HEAD y diff contra R4.
2. Claude revisa listener y estado; Deepseek contrasta BLE/concurrencia/dedupe. El commit de PHY ya lo aplicó Claude: esa parte necesita contraste independiente de Deepseek/Codex. Nadie aprueba su propio código.
3. Compilar Android completo y sus checks requeridos. Las pruebas compartidas no validan APIs Android del listener ni el adaptador BLE. No afirmar estos checks verdes aún.
4. Verificar flujo real: binding perdido, permiso revocado, post/remove en hueco y ausencia de duplicados; reconexión de ambos brazos y PHY real. No se han ejecutado estas pruebas ni se midió 2M.
5. Solo después: candidata firmada con clave original, SHA-256, retorno R4 comprobado y OFF actual. Existe autorización previa de Dani para actualizar, pero no se ha consumado ninguna instalación en este cierre. No iniciar capturas automáticamente.

En el shell de este PC, Bash es `C:\Program Files\Git\bin\bash.exe`; JAVA_HOME=`D:/Proyectos/Faceclaw_spanish/.tools/jdk-21.0.12.1+1`, ANDROID_HOME=`D:/Proyectos/Faceclaw_spanish/.tools/android-sdk`, GRADLE_USER_HOME=`D:/Proyectos/Faceclaw_spanish/.gradle-local`. Adaptar rutas en casa; no copiar secretos. Node_modules de esta worktree reutiliza dependencias locales: no asumir que existen en casa.
