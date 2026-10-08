# Hermes disponible durante todo el ON manual — S2.6.9, 08-10-2026

El usuario cuestiona que Soniox siga transcribiendo tras agotar las 80 consultas Hermes y autoriza aplicar el cambio. [Diagnóstico anterior](revision-ultima-conversacion-2026-10-08.md): límite agotado a las 10:24:38 mientras la sesión siguió hasta su máximo de veinte minutos. El móvil estaba conectado; tras observarlo bloqueado, el usuario lo desbloquea y confirma «listo» para instalar con Faceclaw abierta y OFF. Circuito Codex–Claude comprobado desactivado; trabajo directo, cambios locales anteriores conservados.

## Cambio

- `ConversationHermesRuntime.begin()` acepta un presupuesto `null` que sigue la duración de la captura. El controller usa `null` en ON manual, con identidad opcional o requerida según el puente. La solicitud 80, una abstención o una cancelación no agotan la posibilidad de nuevas evaluaciones manuales.
- Los modos de diagnóstico conservan ocho consultas por defecto y los presupuestos finitos explícitos anteriores. `null` es explícito; un valor numérico inválido sigue recurriendo al presupuesto conservador.
- Siguen vigentes una sola petición pendiente, dos segundos sin un turno nuevo y cinco segundos entre solicitudes, con el par inmediato clasificación/asistencia ya existente. Sin reintento de la misma referencia ni cambios de plazo por petición (15 s), episodio, contexto, privacidad o prioridades.
- ON manual mantiene su máximo de veinte minutos y cierre tras más de cinco minutos sin voz; OFF detiene captura, Soniox y Hermes y rechaza respuestas tardías. No cambia el tono ni obliga al agente a intervenir. Retirar el corte permite más consultas Hermes dentro de una misma sesión; no modifica la duración máxima de Soniox ni promete más aportaciones.
- Solo app: no cambia código del puente, proveedor, memoria ACK, modelos, VAD, Soniox, suspensión EvenHub ni ajustes.

## Verificación

Typecheck de app y pruebas, oxlint, webpack/prepare, Android assembleRelease y lintVitalRelease correctos. **195/195 pruebas de conversación**, más la integración perfil→Soniox→Hermes (**una prueba adicional**). Ejecución final focalizada de ambos recorridos manuales: **22/22**. Estas cifras se solapan y no deben sumarse como suites independientes.

Nueva regresión: 81 abstenciones de asistencia, 82 consultas, aportación posterior al antiguo límite y rechazo de una respuesta pendiente tras OFF; comprueba espera sin turno nuevo, una sola petición en curso, retirada visual y borrado del historial al OFF. Las pruebas existentes comprueban los cinco segundos entre solicitudes y el cierre real del coordinador a veinte minutos con liberación de recursos. El test nuevo falla al reintroducir el presupuesto de 80 en una copia temporal de `.test-build` (80 frente a la consulta 81 esperada); la copia se restaura y el test pasa otra vez. No se envía audio ni texto sintético a proveedores reales.

APK firmada y extraída: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.9-manual-context.apk`, código **805**, SHA-256 **`d0d65331b46c1792bcdf04b6b54fe22a259f8ae58624bddba518c9a03fe481ce`**. Certificado original `57aaa887…`, zipalign 16 KB correcto; **7/7 bibliotecas nativas y `assets/app/package.json` idénticos a S2.6.8**. Se comprueba en el bundle firmado la llamada manual `begin(...manualConversation?null:8,...)`.

## Instalación comprobada

Instalación con `adb install -r` tras dos guardas de Faceclaw en primer plano y conversación OFF. APK anterior extraída antes de instalar y verificada como S2.6.8 exacta `1b2caa1b250ea45b36c41013fd1a283659dfa69d03cecbd9522ee3ee63fb07f3`. Los **35 ajustes son idénticos byte a byte** antes/después; SHA-256 de ambas exportaciones `1af839ec9a995b5a5d1d0083ed992a86b987d6fd31dfe888fd7a6343e0351942`. Firma/datos conservados; no se leen ni publican sus valores privados.

APK base extraída después: mismo hash que la candidata. `dumpsys package` confirma S2.6.9/805; proceso relanzado PID 6841. A las **11:13:40 CEST** se observa **Conectado / Display off / Hermes en conversación OFF / Mi perfil guardado**. No se activa una conversación ni se hace un ensayo físico; la disponibilidad tras más de ochenta solicitudes queda probada con escenarios sintéticos, no ópticamente.

Jarvis: ambos servicios activos; `bridge.py` `ae97e5acf9f4283a6a257193bec8db041323c0e5affebf3cf9540b2bd7c88886` y `conversation.py` `4a2e23e8b60416948b3c1ac122efc99cf94d8ed7ac6ed77c8d09813f4ee37246` conservados. Catálogo de **34 herramientas** reconectado a 11:12:48 CEST; mismo proceso del puente, sin despliegue ni reinicio de servicios. Sin nuevas evaluaciones conversacionales en el journal inspeccionado desde 11:08.

## Reversión y continuidad

Reversión móvil: `dist/conversation-g0/before-update-s2.6.9-manual-context.apk` (S2.6.8 exacta anterior). Se puede volver con `adb install -r` conservando firma y datos, con conversación OFF; recuperaría el corte a 80. El puente no necesita reversión por este cambio.

Receta ignorada `.tools/s2.6.9-run.ps1`, logs `.tools/s2.6.9-logs/`, comprobador `.tools/s2.6.9-check-apk.py`, instalador `.tools/install-s2.6.9-manual-lifetime.ps1`. Copias privadas y evidencia en `.tools/manual-lifetime-20261008-private/`, ACL Usuario/SYSTEM. Se eliminan temporales del móvil. Los helpers públicos de firma/comprobación aceptan la versión S2.6.9.

Final OFF. Sin nueva captura, llamadas a modelos, pruebas ópticas, cambios de suspensión, despliegue de puente, reinicio de servicios, commit/push ni NAS. No repetir build/instalación ni ensayos por rutina. Mantener los cambios locales previos.
