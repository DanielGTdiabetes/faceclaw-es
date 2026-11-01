# Revisión e integración Codex de la UI Hermes

05-10-2026, PC del trabajo, `codex/conversation-detection-g0`. Revisión sobre los archivos locales entregados por Claude, conservando cambios previos de ambos. Código integrado y validado como software; sin commit/push, APK, firma, instalación, captura, acceso nuevo al móvil ni despliegue del puente.

## Resultado

Se conecta `bindHermesConversationUi(this)` al final del constructor de `DashboardController`, después de configurar shell y terminar sus inicializadores. El controller conserva la función de liberación para desmontaje/pruebas; el binding vive el proceso. El selector comienza OFF en RAM y no inicia audio. Móvil informa capacidad, selección y estado; lentes reciben exclusivamente la aportación validada del controller en su propia capa, sin historial/chat ni llamadas de herramientas.

Confirmados en código: sleep usa la ruta existente de blank del compositor y apagado de G2; la suspensión EvenHub se aplaza mientras el detector mantiene sesión. Chat, voz, PTT y teclado bloquean la aportación y el apagado automático de este presentador. ON escucha apaga una vez, emisiones repetidas no despiertan; caducidad/OFF/cambio de turno/identidad/suspensión retiran el mensaje. La app local no lee ni pinta transcripción con Hermes armado y deja de retener pantalla; fuera de Hermes mantiene el comportamiento anterior. Notificaciones/alertas/gestos explícitos conservan sus rutas normales.

Esto acredita rutas de software, **no apagado físico, continuidad del micrófono ni utilidad semántica en las gafas**. No se inicia ni reinicia escucha automáticamente; tope120s y límites aprobados15s/30s/12turnos/6000caracteres permanecen.

## Correcciones de revisión

1. `retireIndependentOverlay`: cuando una alerta cubría una aportación, se marcaba retirada sin pedir nuevo frame. Una alerta transparente podía conservar el texto ya caducado hasta su próximo repintado/cierre. Ahora se recompone inmediatamente manteniendo intacta la alerta y sin volver a apagar la pantalla. Se amplió la prueba del overlay enterrado para exigir ese repintado.
2. Estado móvil: «escuchando» ya no afirma «lentes apagadas». Un chat, alerta o interacción explícita pueden haber encendido la pantalla con prioridad, y el estado del runtime no acredita el apagado físico.
3. Se añadió el binding al controller; Claude había entregado el módulo preparado para enlazar, todavía sin uso en producción.

## Verificación independiente en este PC

- Entrega original: **42/42** pruebas de UI y sus tres suites afectadas reproducidas.
- Tras correcciones/binding: **81/81** en ocho suites del incremento: episodes, channel, bridge, hermes runtime, hermes UI, lenses, phone UI, conversation UI.
- TypeScript de pruebas y app: salida0. Oxlint con tipos y avisos prohibidos en seis TS de UI/controller: salida0.
- Sin repetir suites G0/G1/G2 completas ni compilar Android/firmar/instalar. Las13 pruebas del servidor y dos inferencias sintéticas reales de la nota del canal son evidencia anterior; no se repitieron aquí.

## Continuación

Preparar build de la candidata, verificar firma original y conservación de ajustes antes de instalar. Coordinar despliegue reversible del puente `conv/1` todavía aislado, sin alterar token/configuración privada ni gateway. Ensayo breve guiado: lentes físicamente apagadas en escucha, captura viva pese a sleep, aportación sola, retirada por nuevo turno/caducidad, prioridad Hey Even/PTT/teclado/notificación/doble toque, OFF final y recursos liberados. No repetir la auditoría ni considerar resueltas las incidencias históricas de envío o «Yo» sin identidad por estas pruebas de UI.

S2.2/805 continúa siendo la versión instalada comprobada. Cambios/notas sin publicar ni copia nueva al NAS; conservar el árbol local para la siguiente fase.
