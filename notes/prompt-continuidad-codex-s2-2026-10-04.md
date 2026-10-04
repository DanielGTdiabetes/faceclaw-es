# Continuar Faceclaw con Codex — 04-10-2026

**Actualización posterior: el usuario confirma que Claude ya instaló S2.2.** Usar `notes/prompt-continuidad-codex-s2.2-2026-10-04.md`. No reinstalar por defecto. Pendiente revisar la entrega de instalación y preparar prueba breve de identificación; software exacto ya validado por Codex. Las indicaciones inferiores de instalación pendiente son históricas. Conservar el requisito del producto final: gafas apagadas durante escucha, mostrando solo mensajes de Hermes cuando intervenga.

**Estado posterior vigente: S2.2 validada por Codex como software, apta para instalación exacta; aún no instalada.** Leer primero `notes/revision-codex-s2.2-2026-10-04.md` y `notes/prompt-claude-instalar-s2.2-2026-10-04.md`. F3 adicional resuelto; 152/152/TS/lint/sondas integradas y del bundle/APK/firma/componentes verificados. Firmada `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa`, bundle `7cae006abc74eb72f4d46b1ea10afa16c762da9f2637020aabde68093fe539e2`, original/805. S1 última instalada documentada. Sin cambios de app/instalación/captura/commit por esta revisión, sin consulta nueva del móvil. Encargo de instalación sin ensayo preparado para el usuario, no enviado ni ejecutado. Conservar cambios/candidatas/worktree; observación humana y tiempos Soniox reales pendientes. **Producto final aclarado por el usuario: pantallas de gafas apagadas durante escucha, sin conversación ni transcripción visible; mostrar mensajes de Hermes cuando intervenga.** Vista S2.2 provisional de diagnóstico, aún sin integración conversacional Hermes. Esta entrada supera los pendientes F3 y cinco defectos inferiores; demás decisiones conservadas.

**Actualización posterior: S2.1 ya revisada, pendiente de un caso adicional F3.** Leer primero `notes/revision-codex-s2.1-2026-10-04.md` y `notes/prompt-claude-corregir-frontera-s2.1-2026-10-04.md`. F1/F2/F4/F5 resueltos, 140/140/TS/lint/APK/firma/componentes verificados. Candidata nueva `0.8.2-es.5-conversation.s2.1`, firmada `3eb703c8908dd5d40933a836f9f155ec2df86a0112c7e5aca6d99dbfd8f69932`, no validada para instalar: al registrar corte en 1000, tokens ya abiertos `antes` 500–690 y `después` 1010–1090 aceptados por +100 ms salen unidos. También un token 900–1050 cruza sin quedar solo. Sondas propias integradas y del módulo de la APK en `.tools/codex-s2.1-review/`, con aserciones correctas que fallan. Encargo acotado preparado para que el usuario lo pase a Claude, no enviado. S1 última instalada documentada; sin cambios de app/instalación/captura/commit. Conservar todos los cambios locales, candidatas y worktree `.tools/s2fix/orig`. Las secciones inferiores sobre cinco correcciones pendientes y ausencia de entrega son históricas; demás decisiones continúan vigentes.

Continúa este trabajo manteniendo las decisiones y resultados siguientes. Estamos trabajando en español. El usuario pasa encargos a Claude y trae sus entregas a Codex para revisión independiente. No reinicies el diagnóstico ni repitas pruebas físicas ya aceptadas. Consulta el estado real antes de asumir que Claude terminó las correcciones.

## Proyecto y referencias

- Repositorio: `E:\projects\faceclaw-es`.
- Rama comprobada: `codex/conversation-detection-g0`; último HEAD comprobado: `ae55d83`.
- Hay cambios locales de S2 y notas sin commit: conservarlos todos. No resetear, limpiar ni sustituir el árbol por HEAD.
- Leer `AGENTS.md`, `notes/continuidad-entre-pcs.md` y `C:\Users\danie\.codex\memories\faceclaw.md`. La memoria contiene rutas de firma/NAS, pero su encabezado G3.4 es anterior a S1/S2; prevalecen las entradas recientes del repositorio y esta conversación.
- Firma original Android: certificado SHA-256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Nunca regenerar claves ni desinstalar para actualizar. No imprimir secretos, claves Soniox/Hermes, ajustes privados ni vectores de perfil.
- Teléfono conocido: Pixel 10 Pro Fold, ADB serial `61161FDCG0013L`; ADB `E:\android-sdk\platform-tools\adb.exe`. USB fue autorizado por el usuario. Comprobar conexión/estado si hace falta; no arrancar captura por una revisión.

## Lo que ya funciona: S1

Última versión instalada documentada: `0.8.2-es.5-conversation.s1`, código 805. Soniox por defecto (`stt-rt-v5`, castellano, diarización, endpoint detection, keepalive y finalize), Whisper local como reserva si falta clave o falla la red.

El usuario hizo una prueba con dos personas y la televisión. Soniox reconoció las personas y una tercera voz de la tele; el usuario confirmó que transcripción y retraso son aceptables. **Decisión explícita: dejar la televisión como está, sin intentar filtrarla.** La clave Soniox fue aceptada y la transcripción funcionó: no volver a pedir configurar cuenta/clave basándose en que el Playground no tenga opciones marcadas.

La identificación automática por perfil local no está validada. No repetir registro, leer/exportar perfil, cambiar firmware o reconectar/actualizar Wear por defecto. Con Soniox el audio de todas las voces se envía al proveedor; esto ya se explicó y se eligió este motor.

## S2: implementación de Claude y revisión actual

S2 identifica explícitamente al portador por sesión de Soniox:

- «Identificar mi voz»: frase completa y ordenada «Soy yo quien lleva las gafas» o variantes cerradas «soy yo el que lleva las gafas» / «soy yo la que lleva las gafas». Tokens finales de una sola voz, tiempos y ventana válidos; no coincidencia aproximada. Es una declaración cooperativa, no identificación biométrica.
- «Soy la voz N» / «No soy ninguna»: elección/corrección manual.
- Transcripción `Yo:` para la etiqueta asociada, controles en móvil y lentes; turnos/eventos en RAM y resumen agregado sin texto tras OFF.
- `portador` para la etiqueta elegida; `otro` solo para etiquetas válidas observadas antes de asociar; etiquetas nuevas o `speaker: null` quedan `desconocido` hasta nueva asociación.
- Conserva configuración Soniox, reserva Whisper, perfil y límite de 120 s. **No envía conversaciones a Hermes.**

Claude entregó candidata S2 firmada, no instalada. Codex verificó 109/109 pruebas del área conversación, compilación TS de pruebas, `tsc --noEmit`, oxlint, firma y hashes. Siete `.so`, ambos dex y configuración runtime son iguales a S1; cambia el bundle JavaScript.

**La candidata aún requiere cinco correcciones; no está validada para instalar:**

1. `progress()` acepta resultados después del plazo de 6 s si el callback del socket llega antes del temporizador retrasado. Comprobar reloj en las rutas de resolución; revisar también los 8 s de escucha.
2. Las acciones «Identificar», «Listo» y «Cancelar» no llevan referencias de sesión/intento. «Listo» antiguo cierra un intento nuevo y «Cancelar» antiguo cancela tras OFF/ON. Las elecciones manuales sí tienen protección de sesión.
3. `resetStream()` no conserva frontera temporal para finales pendientes: tokens recibidos después pueden unir texto de antes/después de un corte en una misma intervención.
4. `prepareStop()` borra la identidad antes de cerrar el último turno, que pierde `portador` y sale `desconocido` pese a estar identificado al apagar.
5. Fuente y APK siguen usando `String.normalize("NFD")`, aunque el informe dice que se eliminó. Falta plegado explícito independiente de ICU y su prueba adecuada. No se afirma que la frase canónica sin acentos falle.

Referencias que debes leer antes de revisar una reparación:

- `notes/revision-codex-implementacion-s2-2026-10-04.md`: hallazgos, ubicaciones, reproducciones y verificación independiente.
- `notes/prompt-claude-corregir-implementacion-s2-2026-10-04.md`: encargo de corrección preparado para el usuario. **No consta todavía que lo haya enviado ni que Claude haya reparado nada.**
- `notes/informe-claude-s2-identificar-portador-2026-10-04.md`: entrega de Claude; sus afirmaciones deben contrastarse con código/APK.
- `notes/revision-claude-s2-identificar-portador-2026-10-04.md`: diseño corregido.
- `notes/validacion-codex-s2-corregido-2026-10-04.md`: precisiones de implementación previas.
- `.tools/codex-s2-review/reproduce.cjs` y `reproduce.log`: seis sondas para los cinco defectos. Sus aserciones comprueban el fallo actual; **que sigan pasando no valida una reparación**. Convertirlas en regresiones con el resultado correcto.

Candidata revisada: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.apk`, SHA-256 `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207`. Una reparación debe entregar otra APK inequívocamente identificada.

Claude declaró suite completa 837/840 (dos fallos previos, una omitida). Codex no repitió toda la suite ni Android build: reprodujo el fallo previo de `local-vad snapshots` con módulo/prueba idénticos a HEAD; el test iOS quedó bloqueado al lanzar `python3` con `EPERM`, así que no confirmó su lógica ni el mismo motivo de fallo que Claude. No presentar la suite completa como totalmente correcta.

Conservar estas precisiones ya aceptadas: fallback mantiene texto S1 hasta OFF y elimina identidad/turnos; resumen toma identidad antes de release/reset; consumir todo el mensaje antes de evaluar por progreso; cerrar turnos por evidencia de audio, no por retraso del socket. El turno de la propia frase puede quedar desconocido si se cerró antes de identificar; esto es distinto del defecto del último turno al OFF.

## Siguiente fase: conversación sostenida y Hermes

El usuario preguntó cuándo empieza el envío a Hermes y cómo distinguir «buenos días» + respuesta al cruzarse de hablar/discutir sobre un tema. También preguntó si los dos minutos se reinician tras silencios.

Respuesta sobre el código actual: ON explícito, límite absoluto de 120 s desde ON, incluyendo silencios/pausas; no se reinicia por silencio ni vuelve a ON automáticamente. S1/S2 no transmiten conversaciones a Hermes. El indicio local «conversación candidata» por alternancia de voces es provisional y no distingue saludos de temas.

Se investigó documentación oficial de Soniox por su MCP `https://soniox.com/docs/api/mcp/mcp`. Leer `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md`, con fuentes, y `notes/aclaracion-activacion-hermes-conversacion-2026-10-04.md` (sus referencias a S2 aún no implementada son históricas).

Hallazgos para aprovechar en el diseño posterior:

- Soniox entrega diarización, tiempos y `<end>` semántico de intervención. Un endpoint no confirma un tema ni el fin de toda la conversación.
- Keepalive conserva stream/contexto; la documentación consultada admite hasta 300 minutos por stream. Los 120 s son un límite de Faceclaw, no de Soniox. Keepalive/pausas se facturan por duración del stream: no asumir ahorro por silencio.
- SDK Node `RealtimeUtteranceBuffer` es referencia útil, sin asumir compatibilidad directa con NativeScript/Android.
- No se encontró API STT documentada para identificar voces conocidas, clasificar saludo frente a tema o cerrar episodios completos. Es una conclusión limitada a las fuentes consultadas.
- Hermes requiere un canal separado para contexto conversacional. El mensaje actual `utterance` cancela el turno del agente y trata la intervención como dirigida al asistente: no reutilizarlo para todas las voces.
- Si Hermes/otro LLM decide si hay un tema, recibe texto antes de confirmarlo. Separar análisis de contexto y respuestas visibles; no prometer ausencia de envío previo usando Hermes para esa decisión.
- Un modo continuo debe separar sesión/identidad del stream y episodios conversacionales. No parchearlo reiniciando cada 120 s ni reactivando después de OFF explícito. Duraciones/umbrales aún por diseñar, no medidos ni instalados.

## Cómo continuar

Primero revisar las correcciones F1–F5 cuando el usuario traiga la entrega de Claude: examinar cambios, regresiones y APK, sin dar por válidas sus afirmaciones. El encargo actual prepara candidata para revisión: **sin instalación, captura, prueba física ni commit**. Si el usuario da nuevas instrucciones, seguir su alcance y no pedir de nuevo autorizaciones que ya haya dado.

Una vez S2 esté validada, preparar la prueba física breve de identificación y tiempos Soniox dentro del alcance autorizado; después diseñar con el usuario los episodios y la proactividad Hermes aprovechando lo investigado. No implementar esa fase ni cambiar el tope por una mera pregunta. No mandar mensajes a Claude/otras conversaciones: preparar prompts para que el usuario los pase, salvo autorización explícita de envío.
