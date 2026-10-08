# Puente Faceclaw–Hermes

**Discreción y fallback secuencial desplegados, 08-10-2026:** [estado aplicado y reversión](../../notes/conversacion-discrecion-fallback-2026-10-08.md). Fuentes actuales `bridge.py` `ae97e5ac…`, `conversation.py` `4a2e23e8…`. Silencio por defecto/tono neutro; cancelación principal a 6 s y espera al cierre de su trabajador real antes de un único respaldo con el presupuesto restante. Abstenciones válidas no activan respaldo. Plazo móvil 15 s. Chat, herramientas, captura y memoria ACK conservados. Campo opcional `timing` con números/estados técnicos; métricas agregadas RAM, sin texto ni referencias. 44 pruebas Python+protocolo, tres simulaciones de deploy y 289 JS/TS correctas. Helper vigente [`deploy-hermes-discretion.py`](../../scripts/deploy-hermes-discretion.py), copia `rollback-20261008-discretion/` 700/600. APK S2.6.8 instalada y 35 ajustes intactos. No repetir despliegue ni pruebas físicas por rutina.

**Memoria corregida y desplegada, 07-10-2026:** [estado aplicado y reversión](../../notes/correccion-memoria-hermes-2026-10-07.md). Producción coincide con las fuentes de esta carpeta: `bridge.py` `ac610f9d…`, `conversation.py` `d6db6b9d…`. `conv/memory-ack/1`: solo un acuse correlacionado tras frame nativo `sent` actualiza las seis aportaciones propias/dos horas en RAM. Purga automática física y filtro de igualdad normalizada; reservas sin confirmar acotadas/45 s. Conv/1+conv/2 y chat conservados; clientes sin acuse mantienen las aportaciones sin afirmar presentación. 39 pruebas Python/protocolo y 350 JS/TS correctas. Helper reversible `scripts/deploy-hermes-memory.py`, respaldo 700/600 verificado. APK S2.6.7 instalada/extraída igual, 35 ajustes intactos y final Conectado/Display off/Conversación OFF/perfil guardado. Sin nueva escucha ni observación óptica del acuse.

**Estado previo de latencia, 07-10-2026:** las fuentes completas del puente están en `bridge.py`, `conversation.py` y `run_bridge.py`. Se conservaron conv/1+conv/2, herramientas, respaldo entre proveedores y memoria RAM `alreadySaid`. El chat usa razonamiento `low` por defecto (override `FACECLAW_CHAT_REASONING_EFFORT`) y pide aclaración si la frase actual está incompleta; el contexto no debe sustituirla. El modo conversación permite humor ocasional pertinente, sin exigir un chiste en cada intervención. [Auditoría y estado del proveedor](../../notes/auditoria-latencia-hermes-voz-2026-10-07.md).

Despliegue del código revisado: [`scripts/deploy-hermes-latency.py`](../../scripts/deploy-hermes-latency.py), con hashes de origen/destino, escritura atómica, copia de reversión y recuperación ante fallo. No modifica proveedor ni credenciales. Ejecutar únicamente con audio OFF y tras las pruebas aisladas. Se comprobó en el intérprete administrado de Hermes: 24 pruebas y `test_bridge.protocol_tests()` correctas, sin consultas reales al modelo. El wrapper `run_bridge.py` carga `hermes_bootstrap` desde `HERMES_ROOT` usando el runtime existente.

Los preparadores y despliegues anteriores fijan fuentes históricas: no usarlos sobre producción actual. Las entradas inferiores documentan esos estados anteriores.

## Historial de integración

**Criterio vigente desplegado, 05-10-2026:** [preguntas y participación](../../notes/hermes-preguntas-participacion-2026-10-05.md). `conversation.py` `a095e84e…` responde preguntas con información suficiente y permite comentarios breves pertinentes/ingeniosos; solo cambia el prompt. Puente intacto, reversión del módulo previo disponible y ambos servicios activos/habilitados. Helper específico [`scripts/deploy-hermes-participation.py`](../../scripts/deploy-hermes-participation.py), sin nueva APK ni ensayo físico posterior. Las fuentes/hashes conv/2 inferiores corresponden a la versión previa del criterio; no ejecutar el helper conv/2 antiguo sobre producción actual.

**Actualización ejecutada después de la revisión:** conv/2 desplegado en Jarvis con reversión conv/1, handshake autenticado conv/1+conv/2 y ambos servicios activos/habilitados. APK S2.6.1 instalada con controles unificados y datos conservados. [Continuidad vigente](../../notes/continuidad-s2.6-manual-context-2026-10-05.md). Las entradas de candidata sin desplegar inferiores describen la preparación anterior; no ejecutar de nuevo el helper sobre producción conv/2.

Revisión Codex en Windows completada, candidata todavía sin desplegar: [continuidad S2.6](../../notes/continuidad-s2.6-manual-context-2026-10-05.md).254/254 cliente,23/23 puente y compatibilidad chat pasan; ambos generadores escriben bytesUTF-8/LF idénticos entre PCs. Helper público de despliegue reversible: [`scripts/deploy-hermes-conv2.py`](../../scripts/deploy-hermes-conv2.py). La candidata ZIP y APK firmada se conservan fuera de Git en NAS; rutas/hashes en continuidad.

**Estado 05-10-2026 (Claude, candidata sin desplegar):** producción ejecuta `conv/1` (`bridge.py` `2563695d…`, `conversation.py` `3b680918…`). La candidata añade `conv/2`: campo explícito `modality` con `identidad-requerida` (por defecto si falta, contrato conv/1 exacto) o `identidad-opcional` (ON manual: relaciones `desconocido`, `associationVersion` 0, una sola voz válida). Validación de estructura, tamaño, tiempos, orden, referencias y atribuciones contradictorias en ambos modos. El hello-ack anuncia `conversation.CAPABILITIES` = `conv/1` + `conv/2`; el móvil solo envía contextos anónimos si ve `conv/2`.

- `upgrade_bridge.py BRIDGE_PRODUCCION SALIDA`: exige SHA-256 `2563695d…` y cambia solo la importación y la lista de capacidades. Su salida es idéntica byte a byte a `prepare_bridge.py` aplicado a la fuente original `c6fcbf81…`.
- Hashes candidatos: `bridge.py` `be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d`, `conversation.py` según `SHA256SUMS` de `dist/hermes-conv2-candidate-20261005/`.
- Pruebas: `python -m unittest -v test_conversation test_conversation_bridge` y `python test_bridge.py` con la fuente original en una carpeta aislada. Despliegue reversible: ver [informe](../../notes/informe-claude-hermes-manual-contexto-2026-10-05.md).

---

## Historia conv/1

Fuente base comprobada en Jarvis el 05-10-2026: `bridge.py` SHA-256 `c6fcbf814aa9afaed8878d62b07747c4790b48164133f741512e03252400a705`. Esta carpeta contiene únicamente el nuevo módulo, pruebas y un preparador para generar una candidata desde esa fuente. No contiene configuración, token ni credenciales.

El cliente Faceclaw está en `app/assistant/conversation-channel.ts`. El protocolo y estado de integración están en [la nota del incremento](../../notes/conversation-hermes-channel-2026-10-05.md).

## Preparación y pruebas aisladas

Copiar estos archivos y el `test_bridge.py` público del puente a una carpeta candidata. Con el intérprete existente de Hermes:

```sh
python prepare_bridge.py ../bridge.py bridge.py
python -m unittest -v test_conversation test_conversation_bridge
python test_bridge.py
```

`prepare_bridge.py` comprueba el SHA-256 de origen y cada punto de integración antes de escribir. La fuente activa y los servicios no se modifican. Los tests usan modelos/credenciales sintéticos y puertos loopback efímeros, sin conversaciones ni dispositivos reales.

La inicialización de `ConversationAgent` usa el proveedor/modelo ya configurados en el puente y bloquea herramientas en los cuatro puntos de dispatch de la clase real inspeccionada. En esta primera versión la allowlist está vacía: evaluación y aportaciones textuales sin búsqueda, GPS ni acciones. El chat habitual conserva sus herramientas.

`skip_memory=True`, `skip_context_files=True`, `skip_background_review=True`, `_persist_disabled=True`, ausencia de base de sesión y overrides de persistencia/JSON desactivan las rutas de sesión inspeccionadas. Cada solicitud proporciona un historial vacío y una ventana completa acotada. Esto no establece la retención del proveedor externo ni garantiza que ninguna dependencia del motor escriba metadatos. Los tests no registran contenido real. Las huellas de las cinco fuentes internas inspeccionadas están fijadas: una actualización incompatible deja `conv` sin anunciar y conserva el chat normal.

Una evaluación activa y una única petición pendiente reemplazable como máximo; cancelación interrumpe el agente y espera a que su hilo salga antes de reutilizarlo. Nuevos chats cancelan conv, sin compartir agente, historial, herramientas, cerrojo ni identificadores. No hay persistencia de contexto ni repetición tras reconexión. Los resultados caducados, cancelados o inválidos se descartan o abstienen sin mensajes técnicos en lentes.

## Activación pendiente

La candidata solo anuncia `conv/1` cuando se crea con una fábrica conversacional y esta se inicializa correctamente. El `main` generado requiere además `FACECLAW_CONVERSATION=1`. Por defecto conserva el funcionamiento anterior.

Todavía **no desplegada**. Antes de sustituir el adaptador activo: confirmar su hash, respaldar sus archivos de código y unidad, preparar reversión, usar escritura atómica y verificar el reinicio únicamente de `faceclaw-hermes.service`. No modificar `private.json`, el token ni `hermes-gateway.service`. Propietario móvil de episodios y activación RAM ya implementados/pruebas; falta integrar y revisar la presentación de mensajes antes de APK/despliegue. El canal por sí solo no acredita interfaz ni apagado físico de lentes.
