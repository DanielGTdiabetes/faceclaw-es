# Corrección Hermes en lentes: límite 64 KiB del shell

05-10-2026. Claude (Cowork, nube con acceso a archivos del PC, sin shell local). Relevo de [prompt-claude-relevo-hermes-pantallas-2026-10-05.md](prompt-claude-relevo-hermes-pantallas-2026-10-05.md).

## Estados separados

| Estado | Resultado |
| --- | --- |
| Implementado | Sí, en este checkout (`app/`, `tests/`). Copia de trabajo en la nube sobre `origin/codex/conversation-detection-g0` @ `44ff5b5` + cambios locales sin commit del relevo. |
| Probado | Sí, en la nube (Linux, Node 22). Ver abajo. **Sin repetir en Windows.** |
| Compilado (APK) | **No.** Requiere la firma original y el SDK del PC. |
| Instalado | **No.** S2.6.1/805 `923c4c08…` sigue en el Pixel. |
| Observado en lentes | **No.** |
| Commit/push | **No.** Hacerlo desde el PC (credenciales GitHub locales). |
| Puente BMAX/NAS | Sin tocar. |

## Causa reproducida con la capa real

`HermesContributionLayer.paint()` rellenaba 640×480 con valor 1. `encodeShellScene` recorta por píxeles no nulos y rechaza `5 + ceil(w/2)·h > 65536`: la superficie completa necesita 153 605 bytes. Con la capa real, `LayerStack` real y codificador real: `Shell surface 3 exceeds 64 KiB (640×480)`.

Quitar solo el relleno **no basta**: con un texto que llena la banda la misma prueba falla con `Shell surface 3 exceeds 64 KiB (568×240)`. El texto de la banda (576×288 útil) supera por sí solo un recurso.

`requestShellRender()` captura el error y llama a `appendLog`, silencioso sin `VERBOSE_CONTROLLER_LOG`. Toda la renderización del shell fallaba mientras la capa estaba arriba, sin rastro en logcat. Encaja con 8 mensajes aceptados y 8 entregas sin nada visible, pero la óptica real sigue sin validar.

## Corrección

`app/ui/shell/conversation-hermes-layer.ts`:

- La capa ya no pinta un ráster de pantalla completa. Retiene una lista de visualización (`drawDisplayList`) con `CLEAR` color 0 **sin clip**, que en `DisplayListRenderer` llena todo el destino e ignora la profundidad estéreo (ninguna franja lateral sin cubrir en ninguna lente), y después el texto como tiras `IMAGE` transparentes.
- `hermesTextStrips()` corta el ráster de la banda en tiras horizontales que caben cada una en un recurso (≤65 536 bytes) y recorta cada tira a su tinta. Banda llena: 2 tiras.
- Un píxel ancla de valor 1 en (0,0) mantiene el plano: `encodeShellScene` descarta planos con ráster vacío junto con sus presentaciones. `CLEAR` lo tapa en el mismo frame.
- Texto vacío (escucha suspendida): solo `CLEAR`, opaco igual que antes.
- Conservados: lectura del texto validado en cada pintura, retirada, desplazamiento, tap para descartar, prioridades del Shell y oscuridad durante la escucha (sin cambios en presenter/Shell).
- Con una capa atenuante encima, `dimDisplayList` deja `CLEAR 0` en 0: sigue opaco.

Diagnóstico agregado, solo recuentos:

- `app/graphics/shell-scene.ts`: `ShellResourceLimitError` (mismo mensaje, solo tamaños).
- `app/g2/dashboard-controller.ts`: `shellRenderDiagnostics()` con `total`/`resourceLimit`. Fallo de render del shell siempre en logcat con `console.warn`, solo clase de error o tamaño de superficie, nunca contenido.
- `app/ui/shell/conversation-hermes-ui.ts`: recuentos del presenter (`presented`, `woke`, `replaced`, `refused`, `retired`, `released`), reiniciados al armar. `presented` = overlay apilado y render pedido, no frame recibido ni visto.
- `app/phone-ui/main-view-model.ts`: «Métricas tras OFF» añade `Lentes Hermes (recuentos, sin texto)` con lo anterior.

## Pruebas ejecutadas (nube)

- Nuevo `tests/conversation-hermes-lens.test.cjs`, 7/7: capa real → `LayerStack.paintUndimmed()` → `encodeShellScene` real → decodificación con `readPresentation`/`readDisplayList` reales → composición por software en el orden de `ShellScene.calls` sobre una pantalla de ventanas a nivel 80. Comprueba recurso ≤64 KiB por capa y por tira, tiras dentro de banda e insets, `CLEAR` sin clip, cero píxeles fuera de banda, cero píxeles de ventana visibles, texto pintado, texto vacío, desplazamiento, retirada y el divisor de tiras.
- Contra la capa de `HEAD`, la nueva suite falla con `exceeds 64 KiB (640×480)`. Sin el relleno, con `(568×240)`.
- `tests/conversation-hermes-ui.test.cjs` 23/23 (FakeImage ampliada, recuentos del presenter con Shell real). `tests/conversation-phone-ui.test.cjs` 6/6 (línea de métricas sin texto).
- `npm test` completo: 993/998. Los 3 fallos (`press is observed before routing…`, `raw debug observer…`, `no input buffer or history survives accept…`) fallan igual en `HEAD` sin estos cambios en el mismo entorno: preexistentes, no tocados.
- `tsc --noEmit -p tsconfig.json` (app) y `./lint.sh` (oxlint completo) sin errores.

No validado: firmware real con `CLEAR` sin clip dentro de una presentación del shell (el renderizador Kotlin y el preview lo soportan, `icon-grid`/`chrome-layer` ya usan `CLEAR` con clip), ancho de banda BLE de ~75 KB por mensaje largo, óptica.

## Siguiente paso (sesión local en el PC)

1. `git status`, `git diff --check`. Repetir en Windows: `npx tsc -p tests/tsconfig.json`, `node --test tests/conversation-hermes-lens.test.cjs tests/conversation-hermes-ui.test.cjs tests/conversation-phone-ui.test.cjs`, `./lint.sh` o equivalente.
2. Commit con rutas explícitas (código, pruebas, notas, helper y `integrations/hermes/*` pendientes del relevo) y push a `origin codex/conversation-detection-g0`. Comprobar HEAD remoto.
3. APK nueva solo por esta corrección: versión siguiente de S2.6.1, código 805, firma original, sin reconstruir nativas (no cambian: solo TS). Comprobar certificado `57aaa887…`, zipalign y 7 `.so` iguales a S2.6.1.
4. Respaldo fresco de ajustes, OFF comprobado, `adb install -r`, nunca desinstalar. Hash extraído igual al local.
5. Una sola comprobación óptica coordinada con el usuario, final OFF. Leer «Métricas tras OFF»: `Lentes Hermes` debe mostrar `presented>0` y `shellRenderFailures.total` 0. Si `presented>0` sin nada visible y sin fallos, investigar wake/unblank/transmisión (`waitForFrameFinished`, `FRAME_TRANSMIT_BACKPRESSURE_TIMEOUT_MS`).
6. Copia NAS de APK/reversión en carpeta propia 700/600 con hashes verificados. Actualizar continuidad con lo realmente observado.
