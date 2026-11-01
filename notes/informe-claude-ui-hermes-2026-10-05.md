# Informe Claude: UI de «Hermes en conversación» (05-10-2026)

Entrega para revisión de Codex. Rama declarada `codex/conversation-detection-g0`, checkout `D:\Proyectos\Faceclaw_spanish`. Sin commit, push, build, firma, instalación, móvil, red ni proveedor. **No se afirma integración completa ni pantallas físicas observadas.**

**Revisión posterior Codex, 05-10:** [revisión e integración](revision-codex-ui-hermes-2026-10-05.md) completada en el PC. Binding conectado al controller, corregido repintado inmediato de una aportación retirada bajo alerta y etiqueta móvil que afirmaba apagado sin conocerlo. 81/81, TS/lint correctos. Sin APK/instalación/prueba física/despliegue. Las secciones inferiores describen la entrega original de Claude.

## Límite de esta sesión: sin shell en el PC

La sesión solo tenía acceso a ficheros de la carpeta (listar, copiar a la nube, escribir), sin terminal en el PC. Por eso **no se ejecutó `git status`** ni se vio el estado Git real. Se copió el árbol `app/` y `tests/` a un entorno aislado, se trabajó allí y solo se escribieron de vuelta los ficheros listados abajo, comprobando antes que su fecha de modificación no había cambiado desde la copia. No se tocó nada de Codex. Durante el trabajo Codex modificó `dashboard-controller.ts` (deduplicación de `emitConversationHermes`, mensaje idéntico ignorado) y `conversation-hermes.ts` (`outputRef`, limpieza al cambiar de estado). Se recopiaron ambos y todo se volvió a verificar contra esa versión.

Dependencias instaladas solo en el entorno aislado, con las versiones de `package-lock.json`: typescript 5.4.5, @nativescript/core 9.0.18, types/types-android/types-ios 9.0.0, @types/node 25.6.0, oxlint 1.85.0 y oxlint-tsgolint 7.0.2003. Nada instalado en el PC.

## Archivos

Nuevos:

- `app/ui/shell/conversation-hermes-ui.ts`: presentador deduplicado, binding, registro del modo para la app de conversación y utilidades puras del móvil.
- `app/ui/shell/conversation-hermes-layer.ts`: `HermesContributionLayer`, capa propia del shell para una aportación final.
- `tests/conversation-hermes-ui.test.cjs`: 19 pruebas.
- `notes/informe-claude-ui-hermes-2026-10-05.md`: este informe.

Editados (CRLF conservado):

- `app/ui/shell/shell.ts`: +98/−0.
- `app/apps/local-conversation/local-conversation-app.ts`: +33/−4.
- `app/phone-ui/main-view-model.ts`: +40/−0.
- `app/phone-ui/main-page.xml`: +2/−0.

No se editaron `dashboard-controller.ts`, `conversation-detection/*`, `bridge-client.ts`, `conversation-channel.ts`, `integrations/hermes/*`, `tests/tsconfig.json`, AGENTS ni las notas principales.

## Diseño

### Presentación en lentes

- **Escucha con Hermes armado:** la primera vez que `conversationHermes.snapshot()` pasa a `enabled && listening` en una sesión armada, se llama una sola vez a `Shell.blankForIndependentListening()`. Usa el `sleep()` real, que dispara `onScreenStateChanged(false)` → `setScreenBlanked(true)` + `setG2ScreenOn(false)` en el controller. No se pinta negro para simular apagado. Si hay una interacción explícita abierta, no apaga.
- **Mensaje final:** solo cuenta `conversationHermesMessage` no vacío, con `enabled && listening`. El presentador empuja una única `HermesContributionLayer` mediante `Shell.presentIndependentOverlay()`, que despierta con el `wake()` real si la pantalla estaba apagada. La capa **no guarda texto**. En cada pintado vuelve a leer el mensaje validado del controller y devuelve "" si la escucha no está activa. Saneado: sin controles C0/C1 ni U+2028/2029, espacios colapsados, máximo 1200 caracteres. Rellena con valor 1 (negro opaco) para ocultar ventanas debajo. Eso es pintura, no apagado.
- **Retirada:** cuando el mensaje se vacía (8 s del controller, nuevo turno o identidad, borrado), con escucha suspendida o con OFF, se quita la capa. Si la había despertado el presentador y no se abrió nada explícito entretanto, vuelve a `sleep()`. Si algo explícito está encima, la capa queda transparente y el shell la elimina cuando aflora, sin reapagar.
- **Prioridad explícita:** long-press, toque-y-mantener, wakeword (con acción distinta de `off`), `startKeyboardInput()` y `sendToAssistant()` retiran antes la capa (`yieldIndependentOverlay`) y siguen con su flujo normal. El mensaje se descarta en el controller. Con voz, teclado, capa del asistente, turno en curso, PTT, prioridad de audio del asistente o el chat enfocado en pantalla, presentar y apagar se rechazan.
- **Gestos sobre la capa:** toque o doble toque descarta mediante `dismissConversationHermesMessage()` y vuelve a oscuro. La rueda pagina un texto largo.
- **Deduplicación:** el presentador recuerda el último mensaje tratado (mostrado, rechazado o descartado). Emisiones repetidas, ticks del runtime, veredictos, `nada` o errores no despiertan ni pintan. Un mensaje nuevo distinto reemplaza el texto de la misma capa sin otro `wake`. Sin temporizadores propios para reabrir escucha.
- **Reconexión y restauración:** el binding marca como tratado el mensaje existente al enlazar. Nunca selecciona Hermes ni inicia audio, captura o canal.

### App «Conversación local»

Con Hermes armado (`hermesConversationPresentation()`):

- No lee ni pinta `transcriptText()`. Muestra estado, segundos, línea de identificación y una línea fija.
- `keepsScreenOn` pasa a false, así la captura no retiene la pantalla y el timeout normal vuelve a apagar si el usuario la despertó.
- Repinta solo cuando cambian época, estado, segundo visible o línea de identificación.

Menú, identificación de voz y OFF/doble toque se conservan. Fuera del modo Hermes el comportamiento no cambia. La consulta del modo está protegida con `try/catch`: si falta el módulo, se usa la vista clásica. Por eso `tests/conversation-lenses.test.cjs` pasa sin tocarlo.

### Móvil

- Botón **«Hermes en conversación: OFF/ON»** bajo el botón del detector, más una línea de estado solo de diagnóstico.
- El toque llama a `setConversationHermesSelected(!actual)`. Si devuelve false, el botón sigue en el estado real del controller y aparece un aviso breve: «No disponible: el puente no anuncia conv/1. Sigue OFF.» o «Cambia solo con la conversación OFF.».
- Suscripciones a `onConversationHermesChange`, `assistantBridge.onStateChange` y al detector, retiradas en `dispose()`.
- Solo notifica etiquetas que cambian. Los ticks de 500 ms no saturan el binding.
- No llama a `setEnabled`, `request` ni `cancel` del canal, ni inicia audio. El texto «Seleccionado» aclara que no implica que el servidor haya recibido nada.

## API e integración pendiente para Codex

```ts
import { bindHermesConversationUi } from "../ui/shell/conversation-hermes-ui";
// Al final del constructor de DashboardController, después de shell.configure({...}).
// Los campos conversationHermes/conversationDetector ya existen (inicializadores de propiedad).
this.releaseHermesUi = bindHermesConversationUi(this);
```

- **Firma:** `bindHermesConversationUi(controller: HermesConversationSource, display?, createLayer?): () => void`. Contrato estructural: `conversationHermesMessage`, `dismissConversationHermesMessage()`, `onConversationHermesChange()` y `conversationHermes.snapshot(): {enabled, listening}`. Comprobado con `tsc` contra el tipo real de `dashboardController` en un fichero temporal ya borrado.
- **Liberación:** el controller vive todo el proceso, así que en producción no hace falta liberar. Llamar a la función devuelta solo en un desmontaje o prueba: retira la suscripción y la capa sin reapagar. Un segundo `bind` sustituye al primero.
- **Sin ciclo:** el módulo no importa el controller. Importa `shell` y la capa, que ya carga el controller.
- **Métodos nuevos de Shell:** `blankForIndependentListening()`, `presentIndependentOverlay(layer, onYield)`, `repaintIndependentOverlay(layer)` y `retireIndependentOverlay(layer, restoreSleep)`, más los privados `independentDisplayBlocked()`, `yieldIndependentOverlay()` y `sweepRetiredOverlays()`. El barrido corre en `requestShellRender` y al final de `receiveInput`. `sleep()` olvida la referencia a la capa.
- **`tests/tsconfig.json`:** no hace falta cambiarlo. La prueba nueva transpila al vuelo y `npm test` la recoge por `tests/*.test.cjs`.
- **Delta opcional del controller:** ninguno imprescindible.

## Verificación ejecutada (salidas reales, entorno aislado)

- `tsc -p tsconfig.json --noEmit` (app completa): base sin cambios con salida 0 y árbol modificado con salida 0, también tras recopiar el controller y el runtime nuevos de Codex.
- `tsc` estricto filtrado a los ficheros tocados: ningún error nuevo. En `main-view-model.ts` y `shell.ts` solo aparecen los mismos errores preexistentes que ya da la base (TS7053, `global`, TS7006).
- `tsc -p tests/tsconfig.json`: salida 0.
- `oxlint` sobre los cinco `.ts` tocados o nuevos: salida 0, sin avisos. Dos avisos iniciales `no-unnecessary-boolean-literal-compare` corregidos.
- `node --test tests/conversation-hermes-ui.test.cjs`: **19/19**.
- Con las tres pruebas existentes directamente afectadas (`conversation-lenses`, `conversation-phone-ui`, `conversation-ui`): **42/42**. Esas 23 existentes también dan 23/23 en la base.
- No se repitieron las suites G0/G1/G2, builds, GPS, firma ni la revisión S2.2.

Las 19 pruebas (Shell real con `LayerStack`, `voice-activity` y `audio-priority` reales, y hojas de UI simuladas) cubren:

1. Selección solo en RAM, sin captura. Rechazo sin conv/1 o con ON mantiene el estado real.
2. El binding no selecciona, no inicia audio y no muestra un mensaje previo (restauración o reconexión).
3. Escucha armada: un único `sleep` real. Ticks, veredictos, `nada` y errores no despiertan.
4. Aportación final: un `wake`, una capa. Emisiones repetidas no la multiplican. Al caducar vuelve a `sleep`.
5. Un mensaje nuevo reemplaza el texto sin segundo `wake`.
6. Borrado por nuevo turno o identidad, suspensión y OFF la retiran. Tras la suspensión no reaparece.
7. Sin armado o con escucha suspendida nunca se muestra.
8. Toque descarta y vuelve a oscuro. La rueda pagina.
9. La caducidad con el teclado abierto no cierra el teclado ni apaga.
10. Wakeword y long-press retiran la capa y abren su flujo, sin reapagar.
11. PTT, chat enfocado o teclado abierto rechazan presentar y apagar.
12. El `sleep` por inactividad elimina la capa y el evento no vuelve.
13. Una capa enterrada se elimina al cerrarse la alerta superior, sin reapagar.
14. La capa no expone setter ni guarda texto. Saneado. Un payload crudo con escucha suspendida no se pinta.
15. `dispose` libera la suscripción y la capa.
16. App local con Hermes: sin leer transcripción, `keepsScreenOn` false, repintado deduplicado, cierre solo OFF y suscripciones liberadas.
17. App local sin Hermes: vista clásica.
18. Móvil: etiquetas, toque y `dispose`.
19. Móvil: aviso sin conv/1 o con sesión ON.

## Limitaciones y riesgos pendientes

- **Nada físico verificado.** Que `sleep()` deje las lentes realmente apagadas depende de `setScreenBlanked`/`setG2ScreenOn` del controller y del firmware. Falta la observación en las gafas.
- **Efecto del `sleep` real:** programa `scheduleEvenHubSuspend`, que según el código vigente aplaza la suspensión mientras `conversationDetector.holdsSession()`. Tras OFF a los 120 s, la pantalla sigue apagada y la suspensión EvenHub sigue su curso normal. Codex debe confirmarlo en dispositivo.
- **Otras apps no cambian:** una notificación, una alerta del sistema, la Glanceboard o un doble toque del usuario siguen encendiendo la pantalla como siempre durante la escucha. Tras la interacción manda el timeout normal. No hay re-apagado forzado al reanudar la escucha tras chat, PTT o teclado: decisión deliberada para no imponer la escucha sobre el chat.
- **Chat enfocado:** si `ai-chat` está en primer plano y enfocado con la pantalla encendida, la aportación no se muestra y caduca en el controller.
- **Bloqueo de gafas y Glanceboard:** sin lógica nueva. `wake()` cierra la Glanceboard como cualquier despertar. No se probó con bloqueo activo.
- **Negro opaco:** rellenar con valor 1 se apoya en que el compositor deja la superficie del shell encima de las ventanas, como ya hace `ShellAlertLayer`. Falta comprobarlo en las lentes.
- **iOS:** sin cambios específicos. `main-view-model.ts` es compartido, pero el modo Hermes depende del detector Android.
