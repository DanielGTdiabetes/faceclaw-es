# Encargo paralelo para Claude: interfaz del modo conversación Hermes

Trabaja en `D:\Proyectos\Faceclaw_spanish`, rama **`codex/conversation-detection-g0`**, sobre el árbol actual con cambios locales de Codex. Este prompt lo solicita el usuario para adelantar una parte mientras Codex implementa la lógica. Entrega código y pruebas para revisión de Codex. No reinicialices el proyecto ni reconstruyas la rama desde notas históricas.

## Primero lee

- `AGENTS.md`, priorizando las entradas del 05-10 sobre las históricas.
- `notes/conversation-hermes-channel-2026-10-05.md`.
- `app/assistant/conversation-channel.ts` y `app/conversation-detection/conversation-hermes.ts` para entender los estados; son propiedad de Codex, no los edites.
- Las APIs nuevas en `app/g2/dashboard-controller.ts`, propiedad de Codex.
- La implementación actual de `Shell.sleep()`, `Shell.wake()`, pila de overlays, prioridad del asistente y app `local-conversation`.

Comprueba `git status` al empezar. **Conserva todos los cambios de otros agentes**. No fetch/pull/reset/clean/stash/cambio de rama, no commit/push ni instalación por tu cuenta: Codex coordina la integración y publicación. No copies ni leas credenciales, ajustes exportados, perfiles/noBackup ni conversaciones reales.

## Estado real y decisiones vigentes

Pixel conectado, ADB comprobado por Codex: `0.8.2-es.5-conversation.s2.2`/805, no S2.3 ni el canal nuevo. No acceder al móvil en este encargo ni iniciar captura/perfil/pruebas físicas. Jarvis se reinició con autorización del usuario y volvió por Tailscale con kernel7.0.0-34, ambos servicios Hermes activos. Puente activo aún sin modificar. Codex prepara el servidor en una candidata aislada; no tocar Jarvis/NAS/servicios/firmware/Wear/APKs.

El usuario autoriza **enviar texto de intercambios candidatos a Hermes para evaluación semántica**, permitiéndole quedarse callado. Una conversación **no necesita saludo**: puede empezar directamente por una pregunta o un tema. Un saludo/cortesía no obliga a intervenir. Identificación del portador sigue siendo la declaración cooperativa por frase/manual de S2, no reconocimiento biométrico acreditado.

Límites iniciales confirmados hoy por el usuario: candidata15s, cierre por30s sin nuevos turnos,12turnos/6000caracteres en RAM; tope de escucha120s absoluto, OFF sin reactivación automática. No cambies estos valores ni Soniox/Whisper/español/valenciano/GPS/bloqueo/perfil.

**Producto: pantallas de las gafas apagadas durante escucha; sin conversación ni transcripción visible. Solo mostrar las aportaciones finales de Hermes cuando interviene.** La interfaz móvil puede seguir ofreciendo diagnóstico y controles. No muestres «pensando», herramientas, veredictos semánticos, cortesía/incertidumbre ni errores técnicos en las lentes. El chat normal/Hey Even/PTT conserva prioridad y su interfaz habitual.

## División de trabajo para evitar solapamientos

Claude puede editar:

- `app/phone-ui/main-page.xml`, `app/phone-ui/main-view-model.ts` (solo controles/estado de esta función).
- `app/apps/local-conversation/local-conversation-app.ts` (presentación durante el modo Hermes; conservar controles/diagnóstico de otros modos).
- `app/ui/shell/shell.ts` (métodos mínimos de presentación/retirada de una aportación independiente del chat).
- Archivos nuevos de UI específicos, por ejemplo `app/ui/shell/conversation-hermes-ui.ts` y un layer propio.
- Pruebas nuevas de UI y una nota de entrega `notes/informe-claude-ui-hermes-2026-10-05.md`.

Codex edita `app/g2/dashboard-controller.ts`, `app/conversation-detection/*`, `app/assistant/bridge-client.ts`, `app/assistant/conversation-channel.ts`, `integrations/hermes/*`, `tests/tsconfig.json`, AGENTS y las notas principales. No edites esos archivos. Si necesitas otro método/delta del controller o cambiar la inclusión de pruebas, descríbelo precisamente en tu informe: Codex lo aplica. No deshagas cambios ajenos al verlos durante tu trabajo.

## Contrato del controller ya disponible

```ts
dashboardController.conversationHermesSelected(): boolean;
dashboardController.setConversationHermesSelected(enabled: boolean): boolean;
dashboardController.conversationHermesMessage: string;
dashboardController.dismissConversationHermesMessage(): void;
dashboardController.onConversationHermesChange(listener: () => void): () => void;
dashboardController.conversationHermes.snapshot(): {
  enabled: boolean; busy: boolean; requests: number; listening: boolean;
  episode: {state: "off" | "esperando" | "candidata" | "activa"; /* otros escalares */};
};
```

La selección es solo RAM, OFF por defecto. Se cambia únicamente con el detector OFF; activar se rechaza si el puente no anuncia `conv/1`. Devuelve false sin iniciar captura si no puede cambiar. No persiste un ajuste nuevo. `assistantBridge.conversation.isSupported()` permite distinguir soporte de conexión; no llames `setEnabled/request/cancel` desde la UI. Codex arma el runtime al ON explícito del detector cuando Hermes está seleccionado, texto Soniox activado y modo distinto de enrolamiento. ON experimental nunca se inicia por paint/restore/binding ni por recibir un mensaje.

`conversationHermesMessage` es la única aportación válida entregada por la lógica; vacía significa no mostrar nada. Se borra con OFF/suspensión/cambio de contexto y a los8s como límite provisional de presentación. El controller nunca escribe ese texto en historial ni ajustes. Un resultado no vacío ya pasó correlación/vigencia; la UI aun debe evitar mostrarlo si la escucha está suspendida o hay interacción explícita de prioridad superior.

Los listeners del runtime no significan por sí solos que una pantalla deba encenderse. Deduplica efectos de presentación; no llames sleep/wake/repaint por cada chunk/métrica ni uses un temporizador para reabrir la escucha. Un mensaje repetido por un mismo evento no debe multiplicar overlays o temporizadores.

## Implementa

1. Control móvil **«Hermes en conversación: OFF/ON»** que no inicia audio. En OFF del detector permite cambiar la selección; si falta capacidad, mostrar un estado breve en el móvil y conservar OFF. No mostrar un falso ON si `setConversationHermesSelected` devuelve false. Suscribirse correctamente a cambios del controller/puente y retirar las suscripciones al cerrar la vista. La selección activa no significa que el servidor ya haya recibido una conversación.
2. Presentación de lentes independiente del `AssistantSession`/`utterance`: no enviar el texto recibido de vuelta al agente, no guardarlo en el historial del chat, no activar herramientas ni audio. Un layer propio para una aportación final y su retirada. Cuando la aportación termina/caduca/se invalida, volver a escucha con las pantallas apagadas, respetando el chat/voz/teclado abierto entretanto.
3. En modo Hermes activo, la app de conversación no debe mostrar la transcripción en las lentes ni mantenerlas encendidas por captura. Usar el mecanismo real de sleep/blank existente: pintar negro **no acredita** apagado físico. No cambiar suspensión BLE, prioridades, presencia, bloqueo global ni apagado de otras apps. Al invocar el chat normal no apagar ni cerrar su interfaz para imponer la escucha. Abrir un menú/control explícito debe seguir siendo posible.
4. Exporta un binding claro, por ejemplo `bindHermesConversationUi(controller): () => void`, con contrato estructural o imports de tipo para evitar un ciclo de inicialización entre shell/controller. Codex lo llamará en el punto de arranque después de revisar. No edites el controller para añadir ese enlace. Documenta exactamente dónde llamarlo y cuándo liberar el binding. También puedes añadir métodos estrechos en Shell si simplifican una propiedad de display bien delimitada.

No simules «pantallas apagadas» ni precisión física a partir de tests. No silencies todas las notificaciones o el chat normal globalmente para cumplir la vista de este modo; limita la propiedad al contexto explícito de conversación. No desactives presencia ni tope120s.

## Verificación y entrega

Pruebas significativas de transición: seleccionado OFF no inicia captura, falta de capacidad no activa, escucha activa sin mensaje no muestra transcripción, veredicto/nada/error no despiertan, mensaje final se muestra una vez, nueva identidad/turno/suspensión/OFF lo retiran, caducidad no apaga el chat abierto entretanto, Hey Even/PTT/teclado tienen prioridad, reconexión no activa modo ni muestra respuesta vieja, cierre/restore de app no inicia captura. Puede ser fixture sintético con shell real o mocks de sus efectos públicos, sin móvil/red/proveedor.

Ejecuta TypeScript/lint de lo editado y esas pruebas. No repitas las suites G0/G1/G2, builds completos, GPS, firma o revisión S2.2 por rutina. No construir/firmar/instalar todavía: esta entrega se revisa primero. Mantén los límites del contrato y verifica que un payload de red/crudo no puede saltarse la lógica de vigencia entrando directamente en el layer.

En `notes/informe-claude-ui-hermes-2026-10-05.md` indica cambios, pruebas y salidas reales, archivos editados, API/punto de binding que debe integrar Codex, y limitaciones pendientes. No afirmar integración completa ni pantallas físicas observadas. Deja todos los cambios disponibles y avisa al usuario de que el código está listo para revisión de Codex.
