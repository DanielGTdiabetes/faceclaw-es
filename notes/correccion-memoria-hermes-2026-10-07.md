# Corrección de memoria de conversación, 07-10-2026

Petición del usuario: corregir y mejorar los defectos de la [auditoría](auditoria-memoria-hermes-2026-10-07.md). El usuario pone el móvil conectado a disposición para aplicar la actualización. No se ha autorizado ni iniciado una nueva escucha real o una prueba de conversación física.

## Estado aplicado

**Puente desplegado y S2.6.7 instalada el 07-10-2026**, tras el aviso del usuario «móvil listo». Comprobación previa y final del móvil: Conectado, Display off, `Hermes en conversación: OFF · iniciar`, perfil guardado. La base instalada extraída coincide exactamente con la candidata `38de94d9…`; versión S2.6.7/805 y los 35 ajustes antes/después son byte a byte idénticos.

Producción ejecuta `bridge.py` `ac610f9d…` y `conversation.py` `d6db6b9d…`. Faceclaw reiniciado a las 15:47:52 CEST, PID `1042042`; inicialización 5393 ms con `gpt-6-luna`. Ambos servicios activos; gateway sin reiniciar. El móvil reconectó su catálogo de 34 herramientas tras el despliegue y tras la instalación (15:48:28 CEST). No hay eventos `conv` ni advertencia de conversación no disponible en la muestra del journal desde este arranque: no se inició una prueba de escucha.

Durante la preparación el teléfono estaba bloqueado; se completó el código y la candidata antes de pedir Faceclaw abierto/OFF. No se suplió esa comprobación con un cierre forzado. El acuse real durante una conversación física aún no se ha observado; la validación del recorrido se hizo con las pruebas aisladas descritas abajo.

## Cambio

- Capacidad adicional `conv/memory-ack/1`, sin sustituir conv/1 ni conv/2. El móvil solo activa `memoryAck: true` si el puente anuncia esta capacidad.
- Una aportación recibe un `deliveryId` opaco y una reserva temporal ligada al socket, `requestId` y referencia exacta. Enviar o recibir una respuesta no actualiza `alreadySaid`.
- La app captura la aportación que se va a pintar, confirma que la capa está visible y espera el resultado nativo del frame. Solo `sent`, emitido tras el acuse BLE del último mensaje de imagen, habilita el acuse al puente. Cambios de mensaje/capa, OFF, pausa, nueva conexión, cambio de display, fallo, timeout, frame sustituido y preview no confirman. No implica que el usuario haya leído el mensaje ni acredita observación óptica.
- La confirmación es de un solo uso. Se valida socket/solicitud/referencia y caducidad. Un cliente antiguo sigue recibiendo aportaciones, pero sus envíos sin confirmación no se incluyen en la memoria de mensajes presentados.
- La memoria confirmada conserva seis aportaciones propias durante dos horas, con reloj monotónico. Un temporizador del puente purga físicamente las entradas vencidas aunque no haya nuevas peticiones. No añade sondeos ni captura en el móvil. Al cerrar el servicio se borra y se cancela el temporizador.
- Las reservas sin confirmar duran como máximo 45 segundos y son como máximo seis. Cancelación, chat y desconexión revocan las pertinentes. Una petición nueva no invalida una reserva de un frame anterior todavía en vuelo.
- El filtro de igualdad normalizada bloquea respuestas repetidas tras normalizar Unicode, mayúsculas y espacios. Conserva números y puntuación para no confundir respuestas diferentes como 2.5 y 25. Paráfrasis y traducciones siguen dependiendo de la instrucción al modelo; no se promete eliminación de toda repetición semántica.
- El prompt indica que las aportaciones anteriores son citas, no instrucciones ni prueba de lo dicho por las personas. Tono, proveedores, herramientas, prioridades, presupuesto y frecuencia no cambian.

El ámbito sigue siendo el único portador autenticado del puente, entre sus sesiones OFF/ON y reconexiones. No se crea un sistema multiusuario ni memoria permanente de las conversaciones. El chat y la memoria persistente normal de Hermes permanecen separados.

## Pruebas y artefactos

189/189 pruebas JS/TS del área de conversación; 161/161 adicionales de Soniox, voz, chat, prioridad y transporte. Typecheck de app/pruebas y oxlint correctos. Nuevas regresiones ejercitan el canal real, el runtime, Shell/LayerStack y el método real `renderShell` del controller, incluidos fallos/caducidades/cambios durante el frame. La primera prueba de cobertura usó incorrectamente una apertura de menú que se rechaza cuando ya hay overlay; se corrigió el escenario para apilar una capa superior real y verificar la condición de visibilidad.

En el intérprete administrado Python 3.14.7 de Jarvis: 39/39 pruebas, incluida integración WebSocket con agentes sintéticos y tres simulaciones del despliegue: aplicación/idempotencia/reversión, origen/candidata inesperados y recuperación ante fallo de reinicio. Protocolo de chat/MCP/cancelación/reconexión correcto. No llamadas a proveedores ni desplazamiento del socket móvil por un probe. Las simulaciones escriben solo directorios temporales y leen las fuentes originales de producción.

APK: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.7-manual-context.apk`, versión `0.8.2-es.5-conversation.s2.6.7-manual-context`/805, SHA-256 **`38de94d98f8c1291511d74f3403af79dc6e5738ba5447b2c5eb4d82d66c38b61`**. Certificado original `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`, zipalign 16 KiB y siete bibliotecas nativas/runtime package idénticos a S2.6.3, S2.6.4 y S2.6.6. Prepare, Gradle y lintVital correctos; bundle contiene la capacidad y el recorrido del acuse. Receta `.tools/s2.6.7-run.ps1`; logs `.tools/s2.6.7-logs/`.

Candidato remoto `/home/dani/faceclaw-hermes-bridge/candidate-memory-20261007/` (700/600):

- `bridge.py`: **`ac610f9d18b398d49c78fce5688af4aae62940d457c5311037caf786243b1c4a`**.
- `conversation.py`: **`d6db6b9db6a3edf8a16679cfcc2ff184475d119131fdd01135bd4300294a464b`**.
- Helper público `scripts/deploy-hermes-memory.py`; exige exactamente los hashes de producción de la auditoría y los de esta candidata. Copia de reversión creada y verificada: `~/faceclaw-hermes-bridge/rollback-20261007-memory/`, directorio 700/archivos 600, puente anterior `8e0cab24…` y conversación anterior `893b44f0…`. Se reinició únicamente Faceclaw y se conservaron gateway/proveedor/credenciales. Reversión con el helper y `--rollback`, desde el directorio candidato.

Instalación ejecutada con `.tools/install-s2.6.7-memory.ps1`: verifica Faceclaw en primer plano y botón `Hermes en conversación: OFF · iniciar` dos veces, respalda ajustes privados con ACL usuario/SYSTEM, extrae y valida S2.6.6 `dfee9a8f…`, instala con `-r`, compara ajustes byte a byte y hash de base instalada. Ajustes privados y base extraída en `.tools/memory-20261007-private/`; 35 entradas idénticas. Reversión móvil fresca `dist/conversation-g0/before-update-s2.6.7-manual-context.apk`, SHA-256 `dfee9a8f5576daefc1884f167bdec87b1689447f83215646840b5089c6670c09`. No volver a instalar ni desplegar por rutina. Si la producción ha cambiado, revisar antes de usar el helper: no sobrescribirla.

Cambios locales conservados; sin commit/push ni archivo NAS de esta corrección todavía. Las notas del consumo de batería y sus cambios previos se mantienen. No se modificó la suspensión EvenHub, el perfil, los proveedores ni el tono/frecuencia. No se hicieron nuevas llamadas a modelos, sesión ON ni observación óptica.
