# Hermes: preguntas y mayor participación

05-10-2026. Usuario acepta que Hermes participe más con observaciones breves, irónicas o sarcásticas sobre el tema y añade: cuando detecte una pregunta, que intente responder si está en su mano.

## Cambio aplicado en Jarvis

Modificado exclusivamente `STYLE` de `integrations/hermes/conversation.py`. Ante una pregunta respondible desde el contexto o conocimiento general fiable, prioriza una respuesta breve sin invocación explícita de Hermes. Si no hay pregunta, permite una observación pertinente, conexión, sugerencia o comentario ingenioso; ya no exige que la aportación sea indispensable o resuelva un problema. Preferencia por una frase y máximo tres. Sin inventar datos, afirmar verificaciones actuales inexistentes ni prometer acciones externas. Conservados silencio ante incertidumbre/redundancia, tono respetuoso, atribución desconocida honesta, JSON final y aislamiento sin herramientas/historial.

No cambia frecuencia, timeout, cancelaciones por nueva revisión, límites de sesión/buffer, identidad opcional, APK ni ajustes. El cambio amplía el criterio semántico, no obliga a responder siempre.

Desplegado con `scripts/deploy-hermes-participation.py` en carpeta candidata separada `/home/dani/faceclaw-hermes-bridge/conversation-candidate-participation-20261005/`,700/600. Fuente activa `conversation.py` SHA-256 **a095e84eddb6040ba14a81805068b37ade85bec80b11e9eee35fae694263ad50**. `bridge.py` conserva **be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d**.

Respaldo del módulo anterior en `/home/dani/faceclaw-hermes-bridge/rollback-20261005-participation/conversation.py`, SHA-256 **0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078**, carpeta700/archivo600. Reversión: ejecutar en Jarvis como dani `python3 /home/dani/faceclaw-hermes-bridge/conversation-candidate-participation-20261005/deploy-hermes-participation.py --rollback`, con conversaciónOFF. No reutilizar el helper conv/2 antiguo sobre esta fuente.

Solo se reinició `faceclaw-hermes.service`. Comprobación posterior independiente de hashes fuente/puente/respaldo correcta; ambos servicios activos/habilitados y ningún aviso `conversation unavailable` en journal reciente. No se leyó configuración privada ni se hizo probe autenticado que desplazara al móvil. Credencial proporcionada por el usuario usada únicamente para autenticación interactiva, sin guardarla en archivos/notas/código.

## Verificación y límites

- 19/19 pruebas existentes del módulo, sintéticas y sin proveedor.
- Comparación AST con fuente anterior acredita que únicamente cambió `STYLE`; bytesLF y hashes revisados.
- Helper simulado en carpeta temporal: aplicación, idempotencia sin reinicio, reversión explícita y recuperación ante fallo de reinicio correctos; puente intacto en todos los casos.
- Sin prueba física o inferencia semántica nueva después del cambio. No afirmar éxito de respuesta ni presentación óptica por estas verificaciones. La [prueba anterior](diagnostico-hermes-sin-aportaciones-2026-10-05.md) acreditó tema/abstenciones, cero aportaciones y finalOFF; sigue siendo la última evidencia humana del canal.

Móvil S2.6.1 permanece instalado. Último OFF visible verificado antes del ajuste; después el móvil estaba bloqueado y no se inició captura desde Codex. La desconexión del puente no rearma conversación automáticamente.

## Revisión de encendido solicitada después

El usuario sospecha que las respuestas no despiertan las pantallas y confirma que todavía no ha probado tras el cambio de criterio. Revisada la ruta mensaje validado → presenter → `presentIndependentOverlay` → `Shell.wake` → `handleScreenStateChanged(true)` → `ensureEvenHubSessionActive`: solicita estado de pantalla, restaura EvenHub, desactiva el blank del compositor y espera disponibilidad. `setG2ScreenOn` nativo cambia el wakelock del teléfono; la restauración del contenido a las lentes se realiza mediante EvenHub/compositor, no por una orden del agente Hermes.

Tres pruebas existentes específicas pasan: apagado durante escucha, aportación final despierta/muestra/retira/vuelve a apagar, e interacción explícita rechaza la presentación. Son pruebas de software con efectos físicos simulados, no observación de lentes. Sin cambios de aplicación ni nueva captura. Intento de lectura ADB: móvil ya no conectado, sin métricas nuevas. No falta la llamada de despertar en el código, pero no se descarta un fallo físico/entrega. Próxima verificación, cuando el usuario pruebe: conservar OFF y contrastar mensajes/entregas y errores de wake/render; la prueba anterior tenía cero mensajes y no ejercitó el encendido por respuesta.
