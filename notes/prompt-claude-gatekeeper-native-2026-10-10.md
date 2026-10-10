# Encargo acotado: runner nativo del Gatekeeper

El usuario autoriza implantar todo el Gatekeeper y ofrece Claude para colaborar. Trabajas en
E:/projects/faceclaw-es junto con Codex. Lee AGENTS.md y la evaluación actualizada, pero limita
las escrituras a:

- App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawGatekeeperRunner.kt (nuevo)
- App_Resources/Android/src/main/native/llama/faceclaw_llama.cpp
- notes/claude-gatekeeper-native-2026-10-10.md (informe)

NO modifiques FaceclawLlamaRunner.kt existente ni ningún archivo TS/tests/build/Gradle/AGENTS.
NO ejecutes Git, builds, adb, descargas, red, otras herramientas/agentes, ni leas secretos o
.tools/signing, ajustes exportados, perfiles, audio/transcripciones privadas. Codex se encarga
de pruebas/build/dispositivo. Los cambios locales existentes son suyos; no los deshagas.

Implementa un runner independiente de baja prioridad y residente para el Gatekeeper, sin alterar
el contrato del asistente explícito actual. Reutiliza la biblioteca faceclaw_llama existente y añade
las entradas JNI que precise el nuevo runner. Disponible llama.cpp b10333; inspecciona sus headers
locales (build/downloads o .tools, excluyendo secretos) para confirmar APIs de abort y progress.

Contrato Kotlin requerido:

class FaceclawGatekeeperRunner
fun generate(modelPath: String?, nCtx: Int, nThreads: Int, prompt: String?, grammar: String?, maxTokens: Int, listener: FaceclawLlamaListener)
fun cancel() // cualquier hilo, cancela también cola/carga/prefill
fun unload() // cancela primero, free seguro en executor; no carreras JNI
fun isModelLoaded(): Boolean

generate carga si necesario, conserva pesos entre llamadas, genera JSON con GBNF OBLIGATORIA
desde el primer token (sin lazy ni fallback a texto libre); parámetros deterministas/greedy.
Si gramática/parsing nativo falla -> onError, nunca inferencia libre. maxTokens acotado.
No datos libres en logs; no log de prompts, tokens, rutas privadas o mensajes crudos de modelo.
Callbacks al Looper JS, eventos onToken/onDone/onError como FaceclawLlamaListener. Cancelación
con onDone("cancelled") y epochs/tickets para que un trabajo cancelado antes de entrar en JNI
no arranque por quedar en cola ni una generación nueva borre una cancelación durante carga.

Prioridad obligatoria: interacción explícita > Gatekeeper. Codex suscribirá assistantAudioPriority
para llamar cancel() inmediatamente. Necesitamos cancelación física por abort callback de llama.cpp
dentro del compute cuando exista, progress callback durante carga y batches pequeños de prefill
(p.ej. 32). Si una fase no puede interrumpirse, documenta la limitación exacta, no la ocultes.
Usar hilo Android THREAD_PRIORITY_BACKGROUND; nThreads de clasificación 1–2; no afinidad forzada
a todos los big cores ni consumo activo cuando está esperando. Evitar polling/spin de threadpool
residente si API lo permite. Liberación/lectura handle sincronizadas, sin use-after-free por cancel.
Destruir/invalidar KV tras abort parcial o comprobar su consistencia antes de reutilizar.

Prefiere un control JNI persistente creado antes de cargar para que cancel pueda marcar el flag
durante carga. Mantener el control válido mientras cancel pueda acceder; coordinar disposal.
No introducir una segunda copia del runtime ni nuevas dependencias. El código del asistente actual
y sus símbolos JNI deben conservar comportamiento. Si compartes helpers, comprueba que no cambias
el path legacy. No construyas ni instales APK: entrega informe con archivos, API, riesgos y checks
que Codex debe ejecutar. Si algo está bloqueado, explica sin inventar resultados.
