# Encargo a Claude: Hermes manual, identidad opcional

Trabaja en `D:\Proyectos\Faceclaw_spanish`, rama `codex/conversation-detection-g0`, HEAD comprobado `038eae0`, sobre el árbol actual con cambios locales. El usuario te encarga implementar el cambio acordado y preparar una entrega completa para revisión breve de Codex, porque queda poca cuota. No te limites a proponer un diseño: entrega código, pruebas y, si dispones del entorno, APK candidata firmada y puente candidato compatible.

Este encargo sustituye el reparto del antiguo prompt de UI: puedes editar lógica, controller, protocolo, servidor, UI, pruebas y notas cuando sea necesario para este cambio. Codex no hará cambios simultáneos durante tu trabajo. Conserva toda la implementación anterior, incluida tu propia UI ya integrada.

## Decisión de producto confirmada

El inicio es **manual**: un único ON/OFF desde gafas o móvil. ON basta para escuchar y evaluar el contenido con Hermes. No se necesita detectar el inicio, reconocer al portador, solicitar una frase ni seleccionar una voz. La identificación mediante el perfil existente es **opcional**: mejora la atribución cuando hay evidencia, pero su ausencia, incertidumbre o fallo no impiden candidatos/respuestas de Hermes.

Soniox sigue transcribiendo y separando hablantes. Mantén las etiquetas anónimas y `relation: desconocido` cuando no se pueda atribuir una voz. No conviertas automáticamente al primer hablante en portador ni a toda voz diferente en «otro» verificado. Hermes debe poder valorar un tema con identidad desconocida; tampoco imponer dos voces, alternancia o saludo como nueva puerta obligatoria. Un turno comprensible puede ofrecer contexto suficiente; que pase validación no obliga al modelo a aportar algo.

Hermes decide entre tema/cortesía/incertidumbre y mensaje/abstención. Para responder sobre el tema no necesita saber quién es Dani. Cuando no hay atribución, el prompt debe evitar asumir que una frase la dijo el usuario o personalizar basándose en esa suposición. Conserva tono breve, espontáneo, ingenioso, irónico y ligeramente sarcástico cuando encaje, sin chistes forzados. No introducir memoria ni herramientas para consultar el perfil personal: reconocimiento opcional aquí significa atribución de voz con el mecanismo existente.

Conservar: máximo20min desde ON; OFF tras **más de**5min sin actividad de voz; español y catalán/valenciano automáticos en el modo manual; candidata15s, cierre de episodio30s sin turnos,12turnos/6000caracteres RAM; máximo80solicitudes por sesión manual, mínimo5s entre solicitudes salvo asistencia inmediata tras evaluación de tema, espera de2s sin nuevos turnos, timeout cliente5s. No confundir cierre de episodio con apagar captura. No añadir escucha automática ni grabaciones ni cambiar filtros de TV/modelos/umbrales para resolver este bloqueo.

Lentes apagadas mientras escucha; únicamente aportaciones finales válidas de Hermes, TTL8s. Sin transcripción, «pensando», veredictos ni errores técnicos en lentes. Chat/Hey Even/PTT/teclado/gestos mantienen prioridad. OFF, suspensión, nuevo contexto y respuestas tardías invalidan el mensaje. La transcripción y las conversaciones continúan solo en RAM con los límites existentes.

## Lee y comprueba primero

- `AGENTS.md`, `notes/continuidad-entre-pcs.md` y las entradas más recientes de `notes/modo-manual-hermes-perfil-2026-10-05.md`; los estados históricos inferiores no reemplazan las decisiones de este prompt.
- `app/conversation-detection/conversation-episodes.ts`, `conversation-hermes.ts`, `conversation-turns.ts`, `coordinator.ts`, `wearer-identity.ts`, `profile-speaker-matcher.ts`.
- `app/assistant/conversation-channel.ts`, `bridge-client.ts`, `app/native/soniox-conversation.ts`, `app/g2/dashboard-controller.ts`.
- `integrations/hermes/conversation.py`, `prepare_bridge.py`, tests y README. El README contiene historia de preparación: el puente ya está desplegado.
- UI actual `app/ui/shell/conversation-hermes-ui.ts`, `conversation-hermes-layer.ts`, `shell.ts`, `app/phone-ui/main-view-model.ts` y `main-page.xml`.

Ejecuta `git -c safe.directory=D:/Proyectos/Faceclaw_spanish status --short` antes de editar. Hay numerosos cambios sin commit de Codex/Claude: no reset/clean/stash/pull/cambio de rama ni reemplazos masivos. No commit/push en este encargo. Si no tienes terminal o acceso al árbol real, dilo y entrega un parche contra las versiones actuales; no presentes compilaciones o instalación como realizadas y no sobrescribas copias antiguas desde la nube.

## Estado real: no repetir trabajo acreditado

Instalada S2.5 `0.8.2-es.5-conversation.s2.5-manual`/805, SHA256 `f8c704ff600d49de13ea9dc24651e989ccc09e1c15d0c980e8c6972ec67ff840`, firma original,34ajustes idénticos y perfil conservado. Última observación detector/HermesOFF. La pausa del móvil fue revocada, pero **este encargo prepara candidatos: no instala ni activa audio ni hace pruebas físicas ni despliega en producción**; Codex revisará el resultado y coordinará actualización. No reenrolar ni leer perfiles, ajustes exportados o conversaciones reales.

Prueba del bar:35,95s, Soniox108mensajes/85tokens finales/7turnos/2hablantes,0errores/fallback/invalidez, backlog5110ms; comparador local4comparaciones/0abstenciones/0descartes. Identidad final sin-identificar, source=null,1intento de frase fallido y0selecciones manuales. La ausencia de asociación bloquea los candidatos actuales. No está demostrada la causa exacta del matcher ni abstención semántica de Hermes. El usuario ahora no tiene otro interlocutor: no pedir otra conversación ni identificación.

Último cambio local de Codex, **no incluido en S2.5 instalada**: corregido que el matcher marcara como aplicada una publicación rechazada durante identificación por frase; ahora reintenta con progreso final, sin votos ficticios y con caducidad90s. Añadidos `ProfileMatcherSummary` sin texto/etiquetas/puntuaciones/vectores al resumen Soniox tras OFF y recuento de solicitudes Hermes en métricas. Regresión fallaba antes;15/15 del incremento, TypeScript app/pruebas y oxlint pasan. Conserva estos cambios; no los confundes con el cambio de identidad opcional, que todavía falta.

## Implementación requerida: sigue el recorrido completo

1. **Representa explícitamente la modalidad manual con identidad opcional** desde el ON del controller hasta episodios y solicitudes. El estado se captura por sesión, RAM/OFF por defecto; ningún render/restore/reconnect debe activarlo. Mantén la modalidad diagnóstica/legada y su comportamiento por defecto si se usa. La ausencia de perfil tampoco debe impedir ON manual: revisa la puerta `hasOwnProfile()` y haz que falta/error del comparador opcional no corte Soniox+Hermes.
2. En `ConversationEpisodeTracker.accept()` está la puerta `!this.wearer`; `eligible()` exige portador+otro. Adáptalas para manual sin fabricar relaciones. Revisa inicio del tracker/evento inicial con asociaciónVersion0, y los turnos antes de cualquier identificación. Un perfil que aparece/cambia puede invalidar contexto previo y empezar contexto nuevo como ahora; nunca reetiquetes turnos emitidos ni recuperes respuestas viejas.
3. **No basta modificar el tracker.** `conversation-channel.ts` valida finalmente portador+otro; el validador de `integrations/hermes/conversation.py` también lo exige, y su prompt de assessment solo permite tema con portador+otro. Adapta cliente, contrato y servidor de forma consistente. Usa una modalidad explícita y validada, preservando compatibilidad de solicitudes antiguas/default estricto. Asegura que el cliente no dé por disponible el nuevo comportamiento con un servidor antiguo que lo rechaza: acuerda capacidad o versión compatible y prueba ambos extremos.
4. Conserva validación de estructura/tamaño/tiempos/orden, referencias sesión/stream/versión/episodio/revisión/requestId, un solo vuelo, cancelación y rechazo de respuestas tardías. «Identidad opcional» no significa desactivar esos controles. Conserva aislamiento `conv`, sin enviar conversaciones por `utterance`, sin herramientas/historial/memoria y sin alterar el chat normal.
5. En UI manual comunica de forma breve que reconocer la voz es opcional. No exigir acciones antiguas de identificación en el flujo principal ni mostrar falsas confirmaciones. Diagnóstico debe poder distinguir ON/turnos/candidatos/solicitudes/resultados/abstenciones/error agregado sin guardar o imprimir contenido. No rehagas toda la UI ni toques prioridad/sleep ya resueltos salvo defecto demostrado del cambio.

## Verificación enfocada

Añade regresiones significativas que fallen sobre la implementación previa. Comprueba integración de módulos reales desde ON manual y turnos anónimos hasta solicitud `assess`, respuesta tema y aportación final sintética; no solo mocks del método cuya condición quitaste. Casos:

- Perfil ausente, matcher incierto/error y0acciones de identificación: escucha y evaluación siguen disponibles.
- Una y dos voces sin identidad personal; relaciones desconocidas preservadas, sin atribución inventada.
- Cortesía/incierto/nada: silencio visual, sin aportar por obligación.
- Perfil reconocido después, cambio de versión, suspensión, nueva revisión, OFF, cierre y reconexión: viejas respuestas descartadas.
- Cliente y servidor aceptan el nuevo contexto manual y rechazan modalidad inválida, payload malformado/tardío/excesivo y atribuciones contradictorias; compatibilidad antigua comprobada.
- Máximo20min, silencio>5min, límites RAM/solicitudes y prioridades conservados.

Ejecuta `node node_modules/typescript/bin/tsc -p tests/tsconfig.json`, suites afectadas (episodios/channel/runtime/bridge/perfil/UI/integración), `tsc --noEmit`, oxlint sobre TS editado y tests Python del puente. No repetir auditoría completa G0/G1/G2 ni suites nativas si no cambias código nativo. Usa texto/audio/resultados sintéticos, sin llamadas reales a proveedores por defecto. Diferencia siempre comprobación software de precisión/óptica física.

## Candidatos y entrega para Codex

Si tienes entorno completo, prepara candidata con versión nueva, sugerida `0.8.2-es.5-conversation.s2.6-manual-context`, código805 conservado y firma original. Antes de firmar exige ambos `.tools/signing/faceclaw-es.jks` y `.tools/signing/store.password`; nunca generar firma alternativa. Actualiza sufijo y validador del helper si procede. No muestres contraseñas/claves/tokens/ajustes ni los incluyas en Git. Original certificado SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Verifica firma, hash, zipalign16KB y que nativas/runtime ajenos al cambio se conservan. Reutiliza el proceso de build documentado/excluido de S2.5; no fuentes `.tools/build-environment.ps1` que repurpose HOME, no reconstruyas nativas/NDK por rutina.

Prepara también el puente candidato y sus tests/instrucciones de despliegue reversible. Estamos en PC del trabajo, fuera de LAN; Hermes solo por Tailscale100.65.212.74, NAS100.64.237.87. Puente producción `/home/dani/faceclaw-hermes-bridge/`: `bridge.py` SHA256 `2563695d3166ef7206d7553f92c1fe189bcfe0cfd0a76510206faeb9aa91676e`, `conversation.py` `3b6809182c87018cabb27f3258e6d30d9a1e1bcbaf1c08f04a3a801934ab0d2f`. `FACECLAW_CONVERSATION=1` ya habilitado. No tocar servicio/gateway/configuración privada/modelo/token ni ejecutar el helper anterior como si producción aún tuviera el bridge original. No hacer probes autenticados contra producción: pueden desplazar la conexión del móvil.

Entrega `notes/informe-claude-hermes-manual-contexto-2026-10-05.md` con archivos cambiados, contrato exacto/modalidad/capacidad, pruebas y resultados reales, hash/versión/ruta APK si existe, candidato servidor y pasos reversibles. Explica qué falta y qué NO se ejecutó. Actualiza continuidad local con estado comprobado, sin declarar instalada/desplegada/validada físicamente la candidata. No sobrescribir el espejo NAS hasta revisión. Codex debe poder revisar el delta y actualizar app/puente sin rehacer tu trabajo.
