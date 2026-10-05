# Informe Claude: Hermes manual con identidad opcional, 05-10-2026

Encargo: [prompt](prompt-claude-hermes-manual-sin-bloqueo-identidad-2026-10-05.md). Rama `codex/conversation-detection-g0`, árbol local con cambios previos de Codex conservados. **Sin commit, push, APK, instalación, despliegue ni prueba física.** Pendiente de revisión Codex.

## Entorno real de este trabajo

Esta sesión no tenía terminal en el PC. Leí y escribí la carpeta mediante el puente de archivos de la app y ejecuté compilación/pruebas en una copia Linux en la nube (Node 22.22, TypeScript 5.4.5, oxlint 1.86, Python 3.13, websockets 17.2). Por eso **no ejecuté `git status`** en el árbol real: las sobrescrituras usaron guarda de fecha de modificación (`expectedMtimeMs`), ninguna se rechazó, así que nadie había tocado esos archivos desde la lectura. Codex debe repetir las pruebas en Windows antes de compilar. El usuario eligió dejar la APK a Codex.

## Decisión implementada

Una modalidad explícita por sesión, capturada en el ON y en RAM:

- `identidad-requerida`: comportamiento anterior y por defecto (diagnóstico/legado). Solo candidatos portador+otro.
- `identidad-opcional`: ON manual con puente `conv/2`. Cualquier turno válido y comprensible puede evaluarse. Relaciones `desconocido` honestas, `associationVersion` 0 antes de cualquier asociación. Un perfil que aparece o cambia retira el contexto anterior y abre otro (nunca reetiqueta turnos emitidos ni recupera respuestas viejas).

Sin perfil, con perfil fallido o lento (más de 10 s cargando), con comparador incierto y con cero acciones de identificación, Soniox+Hermes siguen. El perfil solo mejora la atribución.

## Archivos cambiados

| Archivo | Cambio |
| --- | --- |
| `app/conversation-detection/conversation-episodes.ts` | `EpisodeModality`, `start(..., modality)`, `accept()` sin puerta de portador en opcional, relaciones coherentes con la asociación viva, un hablante = una relación por contexto, `eligible()` por modalidad, `modality` en contexto y snapshot. |
| `app/assistant/conversation-channel.ts` | Capacidad `conv/2`, `supportsOptionalIdentity()`, validación por modalidad (versión 0 solo opcional, contradicciones rechazadas en ambas), frame opcional con `modality` explícito, frame requerido idéntico a conv/1, contadores agregados sin contenido. |
| `app/assistant/bridge-client.ts` | El hello del móvil anuncia también `conv/2`. |
| `app/conversation-detection/conversation-hermes.ts` | `begin(maxRequests, modality)` rechaza opcional sin `conv/2`, pasa la modalidad al tracker, `diagnostics()` con recuentos (turnos aceptados/ignorados, candidatas, assess/assist, temas, abstenciones, mensajes, entregados, fallos) y estadísticas del canal. |
| `app/conversation-detection/coordinator.ts` | `SessionOptions.optionalProfile`, `voiceProfile` (`no-aplica`/`sin-perfil`/`cargando`/`activo`/`no-disponible`), degradación sin perfil en vez de OFF solo en opcional, `OPTIONAL_PROFILE_LOAD_MS`=10 s, sin enviar PCM al perfil liberado. Modo requerido sin cambios. |
| `app/g2/dashboard-controller.ts` | ON manual: con `conv/2` no exige perfil, participación `conversation` si existe perfil y `off` si no, modalidad opcional. Con puente conv/1 conserva el requisito de perfil y la modalidad requerida. |
| `app/conversation-detection/conversation-ui.ts` | `manualHermesStatus()`: «reconocer tu voz es opcional», aviso de puente anterior y estado de voz sin falsas confirmaciones (solo «reconocida por tu perfil» con asociación viva de perfil). |
| `app/phone-ui/main-view-model.ts` | Usa `manualHermesStatus()`. Métricas tras OFF muestran recuentos Hermes sin texto. |
| `integrations/hermes/conversation.py` | `CAPABILITIES`, validación de `modality`, versión 0 solo opcional, contradicciones, prompt con reglas de atribución y tono, `identity` en la carga al modelo. |
| `integrations/hermes/prepare_bridge.py`, `upgrade_bridge.py` (nuevo) | Capacidades desde `conversation.CAPABILITIES`. `upgrade_bridge.py` transforma el puente desplegado. |
| `integrations/hermes/test_conversation.py`, `test_conversation_bridge.py`, `README.md` | Pruebas nuevas y estado. |
| `tests/conversation-manual-identity.test.cjs` (nuevo) | 20 regresiones. |
| `tests/conversation-hermes-ui.test.cjs`, `tests/conversation-presence.test.cjs` | Arneses con `supportsOptionalIdentity` y propietario Hermes. |
| `App_Resources/Android/app.gradle`, `scripts/install-conversation-g0.ps1` | versionName `0.8.2-es.5-conversation.s2.6-manual-context`, código 805 sin cambios, validador/default del helper. |
| `.tools/s2.6-check-apk.ps1` (nuevo, excluido) | Verificador de candidata: identidad, firma original, zipalign 16 KB, 7 `.so` idénticas a S2.5 y marcadores `conv/2`/`identidad-opcional`. |
| `.tools/deploy-hermes-conv2.py` (nuevo, excluido) y `dist/hermes-conv2-candidate-20261005/` | Puente candidato y despliegue reversible. |

No se tocó código nativo, filtros TV, modelos, umbrales, prioridades, sleep ni lentes.

## Contrato `conv/2`

Capacidad del hello-ack: `["chat","mcp","conv/1","conv/2"]` con conversación activa. El móvil solo usa opcional si ve **ambas**. Petición opcional:

```json
{"v":1,"chan":"conv","type":"assess|assist","requestId":"c1-1","modality":"identidad-opcional","timeoutMs":5000,
 "ref":{"sessionId":"…","streamId":1,"associationVersion":0,"episodeId":1,"revision":1},
 "turns":[{"seq":1,"speaker":"1","relation":"desconocido","text":"…","startMs":200,"endMs":3200}]}
```

- Sin `modality` = `identidad-requerida` = conv/1 exacto. El cliente no añade el campo en modo requerido, así que un puente conv/1 recibe los mismos frames que hoy.
- `modality` distinto de los dos valores, nulo o no cadena: rechazado.
- `associationVersion` 0 solo en opcional. Cancelaciones aceptan versión 0.
- Ambos modos: 1-40 turnos, seq creciente, texto no vacío, ≤6000 caracteres, tiempos finitos 0≤inicio≤fin, timeout 1-30000 ms, referencias completas. Rechazo de atribuciones contradictorias: un hablante con dos relaciones, portador sin etiqueta, dos portadores, portador también «otro». En requerido sigue exigiéndose portador+otro.
- Respuesta sin cambios: `verdict` tema/cortesia/incierto o `kind` mensaje/nada. Un solo vuelo, cancelación selectiva, rechazo de tardías en cliente y servidor.
- Prompt: en opcional, `tema` si el habla comprensible trata un asunto sustantivo aunque haya una voz o solo `desconocido`. No exige dos voces, alternancia ni saludo. Hablar no obliga a aportar. Nunca supone quién dijo un turno `desconocido`, no lo trata como el usuario ni personaliza sobre esa suposición. Tono breve, espontáneo, ingenioso, irónico y ligeramente sarcástico cuando encaja, sin chistes forzados. Sin herramientas, memoria ni historial.

## Pruebas ejecutadas (software, copia en la nube)

- `tsc -p tests/tsconfig.json` y `tsc --noEmit -p tsconfig.json`: correctos.
- oxlint con `.oxlintrc.json` y `--type-aware` sobre los 8 TS editados: 0 avisos, 0 errores.
- Nuevo `conversation-manual-identity.test.cjs`: **20/20**. Sobre la implementación previa: **18 fallan**, las 2 restantes son compatibilidad (frame conv/1 idéntico, modo requerido falla cerrado y 20 min) y pasan en ambas.
- Suites afectadas (conversation-*, manual-hermes-profile, profile-speaker-matcher, soniox-*, wearer-identity, profile-guide): **254/254**.
- Suite completa `tests/*.test.cjs`: 328/333. Las 5 restantes fallan igual antes del cambio: 3 de `ai-chat` y `settings-panel` necesitan fuentes `.bdf` que no copié a la nube, y `local-vad` «snapshots are detached scalars» ya fallaba en el árbol recibido. Antes del cambio: 305/313. Arreglé 3 fallos previos de arneses (métricas tras OFF y presencia ×2).
- Python: `test_conversation` + `test_conversation_bridge` **23/23** (13 previas + 10 nuevas) y `test_bridge.py` PASS con la fuente original `c6fcbf81…` en carpeta aislada. Comprobado aparte: el `conversation.py` desplegado (`3b680918…`) **rechaza** los contextos anónimos y acepta frames requeridos con el campo `modality`, por eso el cliente nunca envía opcional a conv/1.
- Casos cubiertos: perfil ausente/fallido/lento, comparador incierto, cero acciones de identificación, una y dos voces, relaciones desconocidas conservadas, cortesía/incierto/nada/error sin lentes, perfil reconocido después, cambio de versión, suspensión, nueva revisión, OFF, cierre por 30 s, reconexión sin rearme, modalidad inválida, payload malformado/excesivo/tardío, contradicciones, 80 solicitudes, 5 s entre solicitudes, 2 s sin turnos, 20 min y modo requerido intacto. Integración con el módulo Soniox real y canal real, sin proveedores.

**No acreditado:** precisión física del reconocimiento, ruido real, lentes reales, autonomía de 20 min ni respuesta del modelo real de Hermes.

## Puente candidato

`dist/hermes-conv2-candidate-20261005/` con `SHA256SUMS`:

| Archivo | SHA-256 |
| --- | --- |
| `bridge.py` | `be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d` |
| `conversation.py` | `0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078` |

`prepare_bridge.py` antiguo sobre la fuente `c6fcbf81…` reproduce exactamente el `bridge.py` desplegado `2563695d…`. `upgrade_bridge.py` sobre `2563695d…` y `prepare_bridge.py` nuevo sobre `c6fcbf81…` producen el mismo `be530122…`. Diferencia con producción: dos líneas (importación de `CAPABILITIES` y lista de capacidades).

### Despliegue reversible (no ejecutado)

1. En Jarvis por Tailscale, crear `/home/dani/faceclaw-hermes-bridge/conversation-candidate-conv2-20261005/` y copiar `bridge.py` y `conversation.py` del candidato. Opcional: ejecutar allí las pruebas con la fuente original y `test_bridge.py`.
2. Copiar `deploy-hermes-conv2.py` y ejecutar `python3 deploy-hermes-conv2.py`. Exige `bridge.py` `2563695d…` y `conversation.py` `3b680918…` en vivo, hashes candidatos en la carpeta, drop-in `40-conversation.conf` presente y ausencia de `rollback-20261005-conv2/`. Respalda (700/600), sustituye de forma atómica, reinicia solo `faceclaw-hermes.service` y comprueba que ambos servicios siguen activos. Ante cualquier fallo restaura y reinicia.
3. Reversión manual: `python3 deploy-hermes-conv2.py --rollback`.
4. `--probe` lee el hello-ack por loopback con el token: **solo con el móvil desconectado**, puede desplazar su conexión. Por defecto no se hace.

No toca `private.json`, token, modelo, proveedor, drop-in ni `hermes-gateway.service`. Simulé despliegue, rechazo de segundo intento, reversión y fallo de reinicio con rutas temporales y `systemctl` simulado.

## APK (pendiente para Codex)

Versión preparada `0.8.2-es.5-conversation.s2.6-manual-context`, código 805. No compilada. Pasos: repetir pruebas en Windows, build del proceso S2.5 (Kotlin AAR solo si cambia, prepare/webpack Android producción, Gradle offline `assembleRelease lintVitalRelease`, sin NDK ni nativas nuevas), firmar con `scripts/sign-spanish.ps1` solo si existen **ambos** `.tools/signing/faceclaw-es.jks` y `store.password`, y verificar con `.tools/s2.6-check-apk.ps1` (certificado `57aaa887…`, zipalign 16 KB, 7 `.so` idénticas a S2.5, marcadores nuevos en el bundle).

**Orden de actualización:** el puente conv/2 es compatible con la APK S2.5 instalada (mismo contrato conv/1). Una APK s2.6 frente al puente actual sigue en modo requerido y exige perfil, igual que S2.5. Desplegar primero el puente y después instalar la APK evita cualquier ventana incompatible.

## Qué falta y qué NO se ejecutó

- No: `git status` en el PC, commit/push, build APK, firma, instalación, despliegue, probes autenticados, audio, captura, ensayo físico, lectura de perfiles/ajustes/conversaciones, espejo NAS.
- Falta: revisión Codex, pruebas en Windows, build/firma/verificación, despliegue del puente, instalación y un ensayo breve con el usuario.
- Riesgo conocido: la eligibilidad opcional permite evaluar con un único turno válido. La frecuencia sigue limitada por 80 solicitudes, 5 s y 2 s, y el filtro semántico lo decide Hermes. La TV o el ruido pueden producir turnos válidos: no cambié filtros, como pedía el encargo.
