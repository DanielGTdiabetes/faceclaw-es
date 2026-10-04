# Encargo a Claude: completar F3 de S2.1

Continúa en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, HEAD `ae55d83`. Conserva todos los cambios locales y los artefactos previos. Lee `AGENTS.md` y `notes/revision-codex-s2.1-2026-10-04.md`.

Codex verificó 140/140 del área conversación, TS/lint, firma/hash y componentes de la APK S2.1 `3eb703c8908dd5d40933a836f9f155ec2df86a0112c7e5aca6d99dbfd8f69932`. F1/F2/F4/F5 resueltos. F3 separa correctamente los finales posteriores a una frontera, pero aún falla con tokens ya pendientes cuando se registra el corte. No hace falta rehacer los cuatro arreglos aceptados.

## Defecto pendiente

`ConversationTurns.boundary(atMs)` cierra el turno antes de registrar la frontera, sin revisar sus tokens ya incorporados. La validación real admite `end_ms <= sentMs + 100`.

Reproducción integrada: audio enviado 1000 ms; recibir voz 2 `antes` 500–690 y ` después` 1010–1090, sin endpoint; ambos válidos (0 tiempos inválidos); `resetStream()` registra frontera 1000 y emite un turno `antes después`, 500–1090. Deben mantenerse separados por el corte, con una política temporal coherente.

Otro caso: segundo token ` cruza` 900–1050. Emite `antes cruza`; el token que cruza debe quedar solo según la política declarada. No partir palabras ni inventar/recortar tiempos para aparentar separación.

Las sondas `.tools/codex-s2.1-review/boundary-probe.cjs` y `bundle-probe.cjs` exigen el comportamiento correcto y fallan hoy. La primera usa el coordinador y motor reales; la segunda ejecuta el módulo puro extraído de la APK exacta. No contactan con dispositivos/proveedores.

## Trabajo

1. Corregir el tratamiento del turno pendiente y la tolerancia de tiempos próximos/algo posteriores al audio enviado. Elegir y documentar una política conservadora que aplique también a tokens ya recibidos, sin reescribir turnos ya emitidos. Conservar texto S1 y palabras, tiempos reales y configuración Soniox. No resolverlo solo con el orden `push frontera -> close`: el turno agregado ya mezcla los tokens.
2. Añadir regresiones integradas de los dos casos, con aserciones del resultado correcto. Revisar también los cierres por endpoint/pausa/límite antes de registrar el corte cuando un token admite tiempo posterior al audio enviado; evitar que esos cierres escapen a la política. Mantener varias fronteras, límites exactos, tiempos inválidos y `<fin>` tardío.
3. Ejecutar regresiones y área conversación, TS y lint. No ampliar las suites por rutina; distinguir ejecuciones propias, fallos previos y límites del entorno.
4. Generar otra candidata inequívoca, firmada con el certificado original. Conservar S2 y S2.1, verificar hashes, bundle empaquetado y componentes frente a S1. Corregir informe y continuidad para describir exactamente la política y la APK entregada.

Sin instalación, captura, prueba física ni commit. No cambiar Hermes, filtros de TV, límite 120 s, perfil, Kotlin/AAR/nativas, firmware ni Wear. No retirar el worktree reconstruido durante esta corrección ni tocar el diff marcado «no usar». Entregar nuevamente para revisión Codex.
