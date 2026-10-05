# Candidata conv/1 + conv/2 para el puente Hermes

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
