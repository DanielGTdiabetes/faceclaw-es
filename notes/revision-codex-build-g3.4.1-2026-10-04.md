# Revisión Codex del build G3.4.1 — 04-10-2026

Revisada la entrega de Claude documentada en `notes/informe-claude-build-g3.4.1-2026-10-04.md`, sobre la base `f56ab37`, con los commits `73ff47c` (versión/helper) y `2c7cba7` (informe y continuidad). El árbol está limpio y la rama está sincronizada con `origin`; los cambios de build locales quedaron conservados en `73ff47c`.

No hay hallazgos accionables en el cambio funcional revisado anteriormente (`5f35bc1`). El commit de build solo cambia el sufijo de versión a `0.8.2-es.5-conversation.g3.4.1` y añade esa versión a la validación/default del helper; mantiene `versionCode` 805, paquete, motores, runtime y nativas.

Comprobaciones independientes de esta revisión:

- Los SHA-256 locales de la APK firmada, unsigned, reversión y fuente coinciden con el informe: `9029bb89853269ba57671cd774941afcf7eececb7f0107430aabad0f64780f0e`, `906cdc29921fa3a6042dcdd8b84030e76abc8d2fe71082955ca230e94ce2b953`, `b9c69767fdb58a22d0b3c351228582075a01f6a42fe9cd6622c9d078c9c86332` y `92b3ea6f0962e0dbf521a721cadb17e6ac655c9a18a37dc28bb83edb59f5eea9`.
- La APK de reversión coincide byte a byte con `faceclaw-0.8.2-es.5-conversation.g3.4.apk`.
- Las siete bibliotecas `lib/arm64-v8a/*` y `assets/app/package.json` de G3.4.1 son idénticos a G3.4. El bundle web es el único contenido runtime distinto esperado por las correcciones de lentes.
- Los logs locales terminan con Webpack compilado correctamente y Gradle `assembleRelease lintVitalRelease` completado; no se repitieron suites sin cambios funcionales nuevos.

La instalación `adb install -r`, la firma original, los 33 ajustes idénticos, la UI móvil OFF/perfil guardado y los cero wakelocks actuales quedan respaldados por el informe de Claude y sus copias NAS. No se vuelven a atribuir aquí como una medición independiente de Codex. La observación de la ventana Conversación local en las lentes sigue pendiente y no se realizó escucha, captura, registro ni ensayo. En esta sesión la consulta ADB directa quedó bloqueada por el sandbox/uso agotado, por lo que no se fuerza una nueva consulta de UI.

Conclusión: build y entrega aceptados para continuidad, sin corrección adicional. Mantener pendiente una única observación visual de la app en lentes con el móvil confirmado OFF; no iniciar conversación, reenrolar, repetir batería ni modificar Wear, firmware, Hermes o audio experimental.
