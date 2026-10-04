# Continuar Faceclaw con Codex tras la instalación S2.2 — 04-10-2026

**Actualización posterior: prueba S2.2 realizada y relevo en código completado.** Leer primero [prueba Claude](informe-claude-prueba-breve-s2.2-2026-10-04.md) y [implementación Codex S2.3](implementacion-codex-s2.3-2026-10-04.md), junto con las nuevas cabeceras de AGENTS/continuidad. S2.3 compilada y firmada (`2e10ee16…`), no instalada; S2.2 sigue instalada. La frase no se intentó, manual 1/intentos 0, dos incidentes reales abiertos. Codex está autorizado por el usuario a implementar y verificar: supera el reparto inferior de solo revisar/preparar prompts para Claude. No repetir la prueba física, la instalación S2.2 ni la revisión aprobada. El resto de este prompt conserva el estado anterior como historia; no volver a tratar la prueba como «no realizada».

Retoma Faceclaw en español conservando las decisiones y todos los cambios locales. El usuario encarga implementación a Claude y trae sus entregas a Codex para revisión independiente. Prepara prompts para que el usuario los pase; no envíes mensajes a otros chats por tu cuenta. S2.2 ya está instalada según la confirmación del usuario y el informe de Claude. El siguiente trabajo es preparar la prueba breve de identificación, sin reinstalar ni reiniciar la revisión de software.

## Leer primero

- `E:\projects\faceclaw-es\AGENTS.md`.
- `E:\projects\faceclaw-es\notes\continuidad-entre-pcs.md`.
- `C:\Users\danie\.codex\memories\faceclaw.md`: firma/NAS; su encabezado G3.4 es histórico frente a las notas S2.2.
- `notes/revision-codex-s2.2-2026-10-04.md`: revisión aprobada y límites.
- `notes/informe-claude-s2.2-frontera-2026-10-04.md`: entrega contrastada.
- `notes/prompt-claude-instalar-s2.2-2026-10-04.md`: requisitos del encargo de instalación, para contrastarlos con lo que Claude haya ejecutado.
- `notes/informe-claude-instalacion-s2.2-2026-10-04.md`: entrega de instalación disponible y leída por Codex para actualizar este prompt; no confundirla con el informe de build/frontera.

Repositorio `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, HEAD comprobado `ae55d83`. Cambios locales S2, pruebas y notas sin commit: no reset, clean, cambio de rama ni sustitución del árbol por HEAD. Conservar S2/S2.1/S2.2, sondas/logs de Codex y el worktree `.tools/s2fix/orig`. El diff marcado «no usar» es una copia con pérdida de tildes, no una referencia fiel.

## Estado vigente

**S2.2 instalada y en OFF según la confirmación del usuario y el informe de instalación de Claude. No reinstalar.** Codex leyó ese informe y lo incorporó al prompt; no hizo una nueva comprobación del dispositivo, de los ajustes privados ni del NAS en esta actualización. Distinguir los resultados de instalación observados por Claude de las comprobaciones de software/APK ejecutadas antes por Codex. Las entradas inferiores «S1 instalada», «S2.2 no instalada» y «informe no disponible» son históricas. No se consultó el teléfono ni se instaló/capturó/hizo prueba física/commit durante esta preparación del prompt.

- APK: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.2.apk`.
- SHA-256 firmada: `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa`.
- SHA-256 unsigned: `f86043dab452cbd48d3f8f72da62000a13021e08e5eee98f75dff426a3eaa2ba`.
- Paquete `com.faceclaw.app`, versión `0.8.2-es.5-conversation.s2.2`, código 805.
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Bundle: `7cae006abc74eb72f4d46b1ea10afa16c762da9f2637020aabde68093fe539e2`.

Instalación documentada por Claude:

- `adb install -r` de la candidata exacta, sin rebuild ni firma nueva; `base.apk` instalada con el mismo hash `072e14be…`.
- **34 ajustes idénticos antes/después**, incluidos Soniox, Hermes/token, bloqueo y GPS. La entrada adicional ya estaba con S1; el recuento histórico 33 queda superado. No volver a pedir configurar la clave ni imprimir valores privados.
- Antes y después: móvil conectado, conversación OFF, perfil guardado sin leer, castellano forzado, cero wakelocks y sin grabación de Faceclaw. No hubo sesión ON ni ensayo de identificación.
- La vista de gafas en el móvil pasó de «Display off» a «Conversación local». Es una observación del espejo del móvil; **las lentes no se observaron directamente**. No afirmar que las pantallas físicas estaban apagadas ni que ya se cumple el producto final.
- Reversión fresca S1 exacta: `dist/conversation-g0/before-update-s2.2.apk`, SHA-256 `f09e57c5ab531f2d92219521116d00880d1ec335b621e4f928a58709840b1b1c`.
- Ajustes privados en `.tools/s2.2-private`, ACL usuario/SYSTEM. NAS: `apk-builds/0.8.2-conversation-s2.2/` (APK S2.2 y reversión) y `connection-backups/2026-10-04-s2.2/` (antes/después), hashes coincidentes y permisos 700/600 según el informe. Sin perfil ni audio copiados. No ejecutar la reversión por defecto.

Codex ejecutó 152/152 del área conversación, TS y lint, sondas integradas y módulo del bundle firmado. Comparación de 565 entradas ZIP: frente a S1 solo bundle y manifest distintos; siete nativas, dex, recursos y runtime iguales. F1/F2/F4/F5 resueltos, y F3 adicional corregido repartiendo palabras antes de emitir y reteniendo tiempos dentro de +100 ms. No reiniciar esta revisión ni repetir suites completas por rutina. Los dos fallos históricos de local-vad e iOS/python3 no se han resuelto y la suite completa no se presenta como totalmente correcta.

S2 identifica cooperativamente al portador por frase completa «Soy yo quien lleva las gafas» (y dos variantes cerradas) o elección manual. No es biometría. Turnos/eventos en RAM; resumen sin texto después de OFF. No hay conversaciones enviadas a Hermes. Precisión humana y origen común de los tiempos Soniox/contador enviado siguen pendientes.

## Siguiente paso

**Preparación completada, prueba todavía no realizada:** [encargo único de 45–60 s](prompt-claude-prueba-breve-s2.2-2026-10-04.md), con un intento de frase, corrección manual solo si hace falta, alternancia breve y diagnóstico agregado después de OFF. Preparado sin consultar dispositivos, iniciar captura ni repetir revisión. El usuario lo pasará a Claude para su ejecución coordinada. El resumen permite coherencia temporal básica, no acredita por sí solo el origen común exacto de todos los tiempos Soniox.

1. **Preparar una prueba humana breve de identificación**, dentro del encargo que acuerde el usuario: una sesión, frase y comprobación de «Yo»/otra voz, corrección manual si hace falta, y cierre OFF. Confirmar el estado actual antes de empezar, porque el OFF documentado es el de la instalación. Usar diagnósticos agregados para observar tiempos e invalidez. No iniciar captura ni ensayos automáticamente al retomar, ni consultar UI durante la escucha. No repetir registro de perfil, pruebas S1/TV ni baterías históricas.
2. La entrega de instalación ya está disponible: leerla para mantener su evidencia, no repetir toda la instalación/exportación/verificación por rutina. Si aparece una discrepancia concreta, contrastar solo esa comprobación faltante sin reiniciar el proceso. Conservar el reparto de evidencias Claude/Codex.
3. **Tras esa observación, diseñar episodios y proactividad Hermes con el usuario.** Leer `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md` y `notes/aclaracion-activacion-hermes-conversacion-2026-10-04.md`. Distinguir saludo breve de conversación sobre un tema. Separar análisis de contexto y respuesta visible; si un LLM clasifica el texto, ese análisis ya implica envío. El `utterance` habitual cancela el turno del agente: no reutilizarlo para todas las voces. No implementar esta fase por una mera pregunta o por este prompt de continuidad.

Pixel conocido `61161FDCG0013L`; ADB `E:\android-sdk\platform-tools\adb.exe`. No leer/exportar/copiar el vector de perfil ni imprimir secretos Soniox/Hermes/ajustes. Conservar configuración/GPS/bloqueo/firma y respaldos privados. No firmware ni reconexión/actualización Wear por defecto.

## Decisiones del producto final que deben conservarse

**Durante la escucha, las pantallas de las gafas estarán apagadas. No mostrarán conversación ni transcripción. Se encenderán para mostrar únicamente los mensajes de Hermes cuando intervenga.** La vista S2.2 es diagnóstica y provisional; la aprobación S2.2 no implica que ese comportamiento final esté implementado.

Soniox por defecto (castellano, diarización, endpoint, keepalive/finalize) y Whisper de reserva. S1 funcionó en la prueba humana ya aceptada: dos personas y TV, transcripción/retraso aceptables. **Dejar la televisión como está, sin filtrarla.** Clave Soniox ya configurada y funcionando; no pedirla de nuevo por el estado del Playground. No reenrolar ni leer perfil.

Los 120 s actuales son absolutos desde ON e incluyen silencios; no se reinician ni reactivan automáticamente después de OFF. El futuro modo continuo exige diseñar por separado sesión/stream/identidad y episodios; no hacer un parche de reinicios cada 120 s. Soniox puede ayudar con diarización, tiempos y endpoints, pero un endpoint no confirma un tema ni el fin de toda la conversación. El presupuesto de duración y coste sigue pendiente del diseño posterior.
