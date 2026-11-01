# Cierre del 03-10-2026

El usuario pidió dejar el trabajo por hoy. No continuar desarrollo ni ensayos hasta que lo retome.

## Estado conservado

- Rama `codex/conversation-detection-g0`. Código G2.3: `b92f18a`; cierre de instalación/ensayo: `a1ac7f9`; aclaración sobre perfiles: `821286d`, publicados.
- Pixel con `0.8.1-es.5-conversation.g2.3`, código 805, firma original, GPS vigente, 33 ajustes conservados, Hermes y bloqueo desactivado intactos.
- Último cierre experimental comprobado: OFF, recursos/buffers vacíos, ASR terminado, cero wakelocks experimentales; modal cerrado. No se ha iniciado otro ensayo después.
- Usuario valoró el ensayo casi perfecto, con algunas palabras valencianas castellanizadas que considera poco importantes. No generalizar esa valoración ni atribuirla a los contadores.
- Incidencias anteriores de entrega (21 descartes/hueco UI 1046 ms y anteriores siete/492 ms) registradas, sin causa ni resolución definitiva.
- APKs, reversión, ajustes privados, código y notas respaldados según el informe G2.3. No mostrar secretos ni exportaciones.

## Corrección de enfoque para retomar

El usuario considera que las rondas por fases y subpruebas están frenando el avance. Quiere completar una versión integrada del modo conversación, hacer las comprobaciones de software necesarias al final y corregir problemas cuando aparezcan en uso. No convertir cada pendiente en un requisito para repetir G2 ni pedir pruebas físicas por cada pieza.

El usuario cuestiona haber excluido perfiles: recuerda pedir adelantar pruebas. No tratar la exclusión histórica como un veto permanente ni imponer la alternativa manual como único camino. El perfil propio local vuelve a ser una opción de G3; su creación/persistencia necesita una decisión explícita e informada del usuario en el flujo correspondiente. No se ha recogido perfil alguno.

Se anunció como próximo trabajo integrar perfil propio opcional, detección provisional de participación, transcripción local y cierre, respetando la prioridad del asistente. **Solo se leyeron los adaptadores, la interfaz y el código actual para prepararlo: no se escribió ni instaló G3.** Ese flujo no está completado ni validado. Al retomar, avanzar con la implementación integrada, sin otra auditoría completa o batería repetida por defecto. No confundir detectar voz, verificar similitud de voz y confirmar participación real.

Conservar firma/Hermes/ajustes/GPS/firmware y demás proyectos. Mantener el tope experimental de 120 s mientras no se cambie expresamente. Sin grabaciones ni envío de audio experimental. Un perfil opcional sería solo vector propio protegido localmente, con borrado explícito y exclusión de backups; no guardar muestras ni perfiles de terceros.

Referencias: [estado G2.3](conversation-detection-g2-asr-diagnostics.md), [continuidad](continuidad-entre-pcs.md), [plan original G0–G6](auditoria-conversaciones-g2-2026-10-03.md).
