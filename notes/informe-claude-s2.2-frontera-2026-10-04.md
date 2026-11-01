# S2.2: frontera F3 aplicada también a los tokens ya recibidos — informe Claude, 04-10-2026

Encargo: `notes/prompt-claude-corregir-frontera-s2.1-2026-10-04.md`. Revisión: `notes/revision-codex-s2.1-2026-10-04.md`.

**Estado: F3 completado, 12 regresiones nuevas, APK candidata `0.8.2-es.5-conversation.s2.2` firmada con el certificado original para revisión Codex. No instalada, sin captura, prueba física ni commit.** S1 sigue siendo lo instalado. S2 (`0613d273…`) y S2.1 (`3eb703c8…`) se conservan sin cambios.

- Rama `codex/conversation-detection-g0`, HEAD `ae55d83`, sin commits. Cambios locales previos conservados. Sin reset, clean ni stash.
- F1, F2, F4 y F5 no se tocan.
- Fuera de alcance y sin cambios: Hermes, filtros de TV, tope 120 s, perfil, Kotlin/AAR/nativas, firmware, Wear, configuración Soniox, `finalize` y endpoint. El worktree `.tools/s2fix/orig` y el diff `tracked-LOSSY-…-no-usar.diff` siguen intactos.

## Causa

`boundary(atMs)` cerraba el turno abierto y después registraba la frontera. El turno solo guardaba texto y extremos agregados, así que no se podía repartir. Con la tolerancia `end_ms <= sentMs + 100` del validador, un token ya aceptado puede quedar después del corte o cruzarlo. Además, un cierre por endpoint, cambio de hablante o límite podía emitir un turno con un token posterior al audio enviado, y un corte posterior caería dentro de ese turno ya emitido.

## Política S2.2 (`conversation-turns.ts`)

1. **Unidad: la palabra.** El turno guarda sus palabras, no un agregado. Una palabra es un token con espacio inicial (o el primero del turno) más los tokens siguientes del mismo hablante sin espacio inicial. Soniox puede entregar subpalabras: nunca se separa por dentro de una palabra. Los tiempos de la palabra son el mínimo y máximo reales de sus tokens válidos. Un token en blanco solo separa palabras.
2. **Colocación por tiempos propios**, igual que S2.1: palabra antes de la frontera si termina en ella o antes, después si empieza en ella o después, sola si la frontera queda estrictamente dentro. Palabra sin tiempos válidos: segmento fijado al recibirla (último segmento si el progreso final ya alcanzó la última frontera, si no, sola). Solo comparten turno palabras del mismo segmento numérico.
3. **Frontera nueva primero, después el reparto.** `boundary()` registra el corte y lo aplica a todo lo no emitido: el turno abierto y los turnos cerrados retenidos. Se dividen en tramos consecutivos sin tocar palabras ni tiempos. Una palabra sin tiempos conserva su segmento: llegó antes del corte, su audio es anterior.
4. **Retención en la tolerancia.** Un corte futuro siempre está en el audio enviado actual o después. Por tanto:
   - turno cerrado cuyas palabras terminan todas en el audio enviado o antes: definitivo, se emite al momento;
   - palabra sola que cruza un corte: definitiva;
   - turno con una palabra que termina después del audio enviado (solo posible dentro de los 100 ms): se retiene, en orden, hasta que el audio enviado la cubra (como mucho dos bloques de 50 ms), hasta que el siguiente corte lo reparta o hasta el fin de sesión, tras el que no hay más cortes.

   Todos los cierres pasan por esta regla: cambio de hablante, endpoint, `<fin>`, pausa, límite y frontera. Los turnos emitidos nunca se reescriben. Los retenidos conservan la relación y versión del momento del cierre. `clear()` (fallback/OFF) los descarta sin emitir, como antes.
5. **Pausa.** Su evidencia exige `progreso >= fin + 1500` y el progreso válido es `<= sentMs + 100`. El turno cerrado por pausa termina al menos 1400 ms antes del audio enviado: siempre definitivo. Una prueba lo comprueba.
6. **Límite de 600 caracteres.** Cierra en el siguiente límite de palabra, no en mitad de ella. Un turno puede superar el límite en una palabra.

El motor (`soniox-conversation.ts`, +3 líneas) informa a los turnos del mismo contador `sentMs` que usan las fronteras, al abrir el stream y tras cada bloque enviado. Sin esos avisos (uso puro del módulo) no se retiene nada y el reparto en la frontera funciona igual.

**Limitación declarada:** una subpalabra que llega después de que su palabra se haya cerrado empieza un turno nuevo. No se reescribe el turno emitido.

## Resultado en los dos casos Codex (coordinador y motor reales)

| Caso | S2.1 | S2.2 |
|---|---|---|
| `antes` 500–690, ` después` 1010–1090, corte 1000 | `antes después` 500–1090 | `antes` 500–690 (al corte) y `después` 1010–1090 (cuando el audio enviado llega a 1090, o al OFF) |
| `antes` 500–690, ` cruza` 900–1050, corte 1000 | `antes cruza` 500–1050 | `antes` 500–690 y `cruza` 900–1050 sola, ambos al corte |

`invalidTimingTokens = 0` en los dos. Ningún tiempo inventado ni recortado.

## Regresiones (`tests/soniox-s2-boundary.test.cjs`, 12 casos)

1. Caso Codex `después` integrado: separación, emisión diferida hasta cubrir 1090, resumen con 2 turnos y 0 tiempos inválidos.
2. Caso Codex `cruza` integrado.
3. OFF justo después del corte: el retenido sale tal cual, separado.
4. Endpoint antes del corte con token en la tolerancia: retenido, repartido por el corte. Control sin corte: un turno `antes después` 500–1090.
5. Cambio de hablante antes del corte: orden y `seq` conservados, reparto correcto.
6. Límite antes del corte: mismo tratamiento, sin partir palabras.
7. Pausa: siempre definitiva. Sin evidencia de pausa en el borde vivo.
8. Subpalabras ` des`+`pués` y ` cru`+`za`: la palabra que cruza queda entera y sola, también cuando la subpalabra llega tras un corte ya registrado.
9. Turno retenido repartido por un segundo corte (1000 y 1050). Frontera repetida sin efecto. Emitidos sin reescritura.
10. Límites exactos: terminar en el audio enviado es definitivo, terminar 1 ms después espera. Empezar justo en el corte va después.
11. Tiempo inválido recibido antes del corte: conserva su colocación, no se une al otro lado.
12. `<fin>` tardío no libera ni une. Relación y versión del cierre. `clear()` descarta lo retenido.

**Sobre el código S2.1** (`.tools/s2.2-check/prev`: build de pruebas actual con `conversation-turns.js` compilado desde la copia previa y sin las dos llamadas nuevas del motor): **11 de 12 fallan**. Pasa el control de pausa, que no debía cambiar. En los casos 10 y 12 parte del fallo es la ausencia de `audio()` en S2.1. Log `boundary-on-s2.1.log`.

## Verificación ejecutada (logs en `.tools/s2.2-logs/`)

| Comprobación | Resultado |
|---|---|
| `tsc -p tests/tsconfig.json` | 0 errores |
| Regresiones nuevas | **12/12** (`boundary-new.log`) |
| Área conversación: las 11 suites de la revisión Codex (incluida `unicode-class`) + la nueva | **152/152** (140 + 12) (`node-conversation.log`) |
| Sonda Codex `boundary-probe.cjs`, sin modificar | pasa, salida 0, dos turnos en cada caso (`codex-boundary-probe.log`) |
| Sonda Codex `bundle-probe.cjs` sobre el bundle de la APK S2.2 (copia en `.tools/s2.2-check/`, bundle extraído de la APK firmada) | pasa: `antes` / `después` (`bundle-probe-s2.2.log`) |
| La misma sonda sobre el bundle S2.1 de Codex | sigue fallando, salida 1 (`bundle-probe-s2.1-baseline.log`) |
| `tsc -p tsconfig.json --noEmit` | 0 errores |
| `oxlint` (495 archivos) | 0 avisos, 0 errores. Un aviso intermedio `no-unmodified-loop-condition` se corrigió reescribiendo el bucle de `flush` |

No ejecutado y por qué:

- Suite Node completa (871): no se repite por rutina. Los dos fallos previos conocidos (`local-vad snapshots` y `iOS config` por `python3`) no tocan módulos cambiados.
- Kotlin: sin cambios Kotlin, AAR ni nativas.
- Comparación 26/31 sobre el S2 reconstruido: no aplica a este ajuste.

## APK candidata S2.2

- Versión `0.8.2-es.5-conversation.s2.2`, código 805, `com.faceclaw.app`. Solo cambia el sufijo en `App_Resources/Android/app.gradle`. `scripts/install-conversation-g0.ps1` acepta `s2.2` y lo usa por defecto, y sigue aceptando `s2` y `s2.1`.
- Webpack producción Android (`webpack.log`). `assets/app/package.json` del runtime guardado y restaurado: `70f23257…`, igual que S1/S2/S2.1.
- Gradle offline `assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`, JDK 21 Microsoft: salida 0, `lintVitalRelease` ejecutado, `compileReleaseKotlin` UP-TO-DATE (`gradle.log`).
- Firma con el helper sin `-Install`. Antes se comprobó que existen `faceclaw-es.jks` y `store.password`. Ninguna clave generada, ningún secreto leído ni impreso.

| Archivo (`dist/conversation-g0/`) | Bytes | SHA-256 |
|---|---|---|
| `faceclaw-0.8.2-es.5-conversation.s2.2.apk` | 140 796 861 | `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa` |
| `faceclaw-0.8.2-es.5-conversation.s2.2-unsigned.apk` | 140 737 878 | `f86043dab452cbd48d3f8f72da62000a13021e08e5eee98f75dff426a3eaa2ba` |
| S2.1 `…s2.1.apk`, sustituida, conservada | 140 796 861 | `3eb703c8908dd5d40933a836f9f155ec2df86a0112c7e5aca6d99dbfd8f69932` |
| S2.1 `…s2.1-unsigned.apk`, conservada | 140 737 126 | `af31ba2a0df07b157ef0f7b8a4b663f08fc8b254ca8cbb65abe73e3960d94e96` |
| S2 `…s2.apk`, conservada | 140 796 861 | `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207` |
| S2 `…s2-unsigned.apk`, conservada | 140 736 442 | `00c9b7bf4d98365dc8e7f1c78bacc9237bf746f5b192d001189478a12a62be6f` |

Evidencia (`verify-apk.log`, `apk-check.log`, script `.tools/s2.2-check/apk-check.ps1`):

- `aapt`: `com.faceclaw.app`, 805, `0.8.2-es.5-conversation.s2.2`.
- `apksigner`: v2/v3 correctas, un firmante, `CN=Faceclaw Espanol`, certificado `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Comparación de las 565 entradas ZIP, sin metadata de firma: frente a S1 unsigned y frente a S2.1 solo cambian `assets/app/bundle.mjs` y `AndroidManifest.xml`. Siete `.so`, `classes.dex`, `classes2.dex`, `resources.arsc`, `runtime.mjs`, `vendor.mjs` y `package.json` idénticos a S1. Firmada y unsigned coinciden entrada a entrada.
- Bundle empaquetado `7cae006abc74eb72f4d46b1ea10afa16c762da9f2637020aabde68093fe539e2`, igual al generado en `platforms`. Contiene `turnLog.audio(this.stats.sentMs)` (2), `turnLog.boundary(this.stats.sentMs)`, la colocación nueva, `normalizeForPhrase` y `wearerActionRef` (`bundle-check.log`).
- Nada copiado al NAS.

## Copias y artefactos

- Antes de editar: `.tools/backup-pre-s2.2-20261004/` con `conversation-turns.ts`, `soniox-conversation.ts`, `app.gradle`, `install-conversation-g0.ps1`, `AGENTS.md` y `continuidad-entre-pcs.md` (copias byte a byte).
- `.tools/s2.2-check/`: verificación de APK, copia de la sonda de bundle, bundle S2.2 extraído y árbol `prev` para reproducir los fallos sobre S2.1. Nada contacta dispositivos ni proveedores.
- Las sondas y logs de `.tools/codex-s2.1-review/` no se han modificado.

## Limitaciones

- Sin móvil, lentes ni Soniox real. El origen común de `start_ms`/`end_ms`, `final_audio_proc_ms` y `sentMs` sigue sin verificar en dispositivo.
- La retención retrasa la emisión de un turno como mucho hasta que el audio enviado cubre su final (≤ 100 ms de audio) o hasta el siguiente corte u OFF.
- La política es conservadora: puede fragmentar una intervención real en el corte, nunca une los dos lados.
- Sin precisión humana acreditada. Prueba física pendiente, como en S2.

## Para la revisión Codex

1. Diff de `conversation-turns.ts`, `soniox-conversation.ts` y la suite nueva.
2. `tsc -p tests/tsconfig.json`, área conversación (152) y las dos sondas.
3. Opcional: `node --test .tools/s2.2-check/prev/tests/soniox-s2-boundary.test.cjs` (11 fallos esperados).
4. APK `072e14be…`: firma, componentes y bundle.

No instalar hasta su validación.
