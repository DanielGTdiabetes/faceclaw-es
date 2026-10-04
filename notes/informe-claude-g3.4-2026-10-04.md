# Informe Claude — revisión G3.4, 04-10-2026

Relevo según `notes/prompt-claude-g3.4-2026-10-04.md`. Pendiente de revisión por Codex; no se ha revisado ni aprobado todavía.

## 1. Base, commits y rama

- Rama `codex/conversation-detection-g0`, sincronizada con `origin` al empezar. HEAD inicial `9b22724` (prompt de relevo), árbol limpio. Sin cambios ajenos que conservar.
- Commit de código: `5f35bc1` — `fix: lens conversation menu acts as labelled and countdown painted once (G3.4.1)`.
- Commit de documentación: el que añade este informe (consultar `git log -1`). Ambos publicados en GitHub en la misma rama. Sin PR ni fusiones.

## 2. Defectos encontrados y corregidos

Revisión de `local-conversation-app.ts`, `session-controls.ts`, `conversation-ui.ts`, `coordinator.ts`, enlace en `dashboard-controller.ts`, cambios del móvil y `in-process-window.ts`/`layers.ts` (entrada, render, gestos direccionales). Tres defectos concretos, demostrados con pruebas que fallan con `9b22724` y pasan con `5f35bc1`:

1. **Menú «Iniciar» retenido detenía una sesión ajena.** G3.4 protegió el caso «menú Detener abierto antes de expirar no reinicia». El caso simétrico seguía abierto: con la app OFF, abrir el menú (etiqueta «Iniciar…»), iniciar desde el móvil u otra entrada y después seleccionar «Iniciar» en las lentes llamaba a `toggleLensConversation`, que **detenía** la sesión recién iniciada. Ahora el menú actúa según su etiqueta al abrirse: si era «Iniciar» y la sesión ya está ON, no hace nada.
2. **Etiqueta «Texto local» del menú de lentes mostraba la selección, no el motor activo.** Es el mismo defecto que G3.4 corrigió en el móvil, pero el menú de las lentes no lo recibió. Si otra entrada iniciaba con un modo distinto, el menú decía «Texto local: ON» mientras la sesión iba sin texto (la cabecera de la ventana sí mostraba el valor activo, contradiciéndose). Ahora, estando ON, muestra el motor activo con «· sesión en curso» y seleccionarlo solo cierra el menú. En OFF conserva el comportamiento: alterna la selección compartida en RAM.
3. **Cuenta atrás duplicada en las lentes.** La ventana pinta su propia línea «N s restantes · máximo 2 min» y además `conversationDetail` añadía «N s restantes (máximo 2 min…)» al detalle. Con sesión ON la cuenta aparecía dos veces y consumía una línea que debía mostrar estado o texto. `conversationDetail` admite ahora `includeTime=false`. Las lentes lo pasan; el móvil mantiene el valor por defecto sin cambios.

Archivos: `app/apps/local-conversation/local-conversation-app.ts`, `app/conversation-detection/conversation-ui.ts`, `tests/conversation-lenses.test.cjs`, `tests/conversation-ui.test.cjs`. Sin cambios en coordinador, motores, Kotlin, modelos, umbrales, perfil, Hermes, firmware ni Wear.

Revisado sin defecto demostrable: OFF al abrir/restaurar/pintar, doble toque (OFF y cesión), cierre (OFF, suscripciones y sondeo retirados), sondeo de drenaje acotado a 60×500 ms, limpieza de texto en suspensión/error/expiración/OFF y por cambio de época, re-render tras rueda (lo hace `in-process-window` después de cada entrada), fallback de gestos direccionales del reloj (estándar del shell), cuenta atrás refrescada por el tick de 500 ms del coordinador y bloqueo durante drenaje.

Observaciones menores no corregidas, sin defecto claro: un toque en la vista espejo del móvil llega como `click` e inicia/detiene, igual que en el resto de apps del shell; el menú «Detener (OFF)» aparece también en OFF y es inocuo.

## 3. Comandos y resultados

Logs locales (ignorados por Git, sin datos privados): `.tools/g3.4.1-logs/tsc.log`, `node-tests.log`, `oxlint.log`.

- Pruebas nuevas contra el código original (`git stash` solo de `app/`, restaurado después): **4 fallos esperados** (7, 8, 9 y la de detalle en `conversation-ui`).
- `tsc --noEmit`: correcto. `tsc -p tests/tsconfig.json`: correcto.
- `node --test` lentes, móvil, UI, coordinador e host iOS: **70 correctas, 0 fallos** (67 previas + 3 nuevas, más aserciones nuevas en una existente).
- `oxlint --type-aware`: 0 avisos, 0 errores.

Omitido: webpack, `assembleRelease`, `lintVitalRelease` y firma. El cambio es TypeScript acotado y no se ha instalado, por lo que no hay APK nueva que verificar. Tampoco se repiten las suites completas 782 Node/240 Kotlin porque no hay cambios nativos ni en el coordinador.

## 4. Estado por categorías

- **Implementado:** las tres correcciones anteriores en `5f35bc1`.
- **Comprobado en software:** TypeScript, lint y 70 pruebas Node con harness de la ventana (viewport 480×264 y fuente grande simulada).
- **Observado en dispositivo:** nada nuevo en esta sesión. El usuario avisó de que el móvil estaba desconectado. No se consultó la UI ni ADB.
- **Pendiente:** compilar e instalar una APK con `5f35bc1` (código distribuible cambiado), observación física de la app en las lentes estando OFF y, solo con autorización, bajo escucha. Precisión de comparación/participación, rechazo TV/replay, estabilidad, autonomía y Doze siguen sin acreditar. Incidentes 492 ms/siete descartes y UI 1046 ms/21 drops siguen abiertos.

## 5. APK

Sin APK nueva ni instalación. El Pixel sigue con `0.8.2-es.5-conversation.g3.4`/código 805 según el último registro (no verificado en esta sesión). No se tocaron ajustes, perfil ni respaldos. No se inició captura ni registro. Estado OFF no comprobado por mí: el móvil estaba desconectado.

Para instalar `5f35bc1`: versión nueva (p. ej. `0.8.2-es.6-conversation.g3.4.1`, código 805 con firma original como en entregas anteriores), actualizar metadatos/validación de `scripts/install-conversation-g0.ps1`, webpack restaurando `platforms/android/app/src/main/assets/app/package.json`, `assembleRelease` offline, firma original, respaldo fresco de APK y 33 ajustes, `adb install -r` y comparación de ajustes.

## 6. Dispositivos y continuidad

- Pixel: desconectado por el usuario durante esta sesión. Sin consultas.
- Gafas: firmware /36 sin tocar. Reloj: desconectado deliberadamente, sin tocar.
- GitHub: rama actualizada con `5f35bc1` y este informe. NAS: no se ha copiado el informe (sin APK nueva que respaldar). Si Codex lo aprueba, copiarlo junto con la siguiente APK.
- Siguiente paso concreto: revisión de Codex de `5f35bc1`. Después, build e instalación G3.4.1 con el móvil conectado y OFF confirmado, y una observación de la ventana en las lentes estando OFF.
