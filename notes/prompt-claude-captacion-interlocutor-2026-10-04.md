# Encargo propuesto a Claude: recuperar el interlocutor — 04-10-2026

Continúa en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. Lee AGENTS y continuidad recientes, `notes/diagnostico-codex-c1-interlocutor-2026-10-04.md` y `notes/analisis-codex-referencias-g2-2026-10-04.md`. El usuario necesita texto de las otras personas y una interacción sencilla; C1 no resuelve ese problema. No repitas otro diseño general o la prueba manual por fases.

Este prompt queda preparado para que el usuario lo entregue; Codex no lo ha enviado ni iniciado su implementación.

## Correcciones al análisis de repositorios

Upstream oficial 0.8.2 ya está integrado. Microphones, Diarizer y ConversationStore existen: no volver a fusionarlos. Conversación local ya usa Whisper multilingüe. El perfil propio no veta segmentos ASR; no reenrolarlo ni importar perfiles de Microphones. La idea útil de Cue/toolkit es entregar audio al ASR antes de decidir a quién pertenece; no copiar su STT remoto.

## Incremento acotado para preparar y revisar

1. Prioriza castellano en Conversación local. Haz inequívoca la selección efectiva antes de iniciar y durante ON; no confundas selección solicitada, configuración de una sesión anterior o idioma detectado. Revisa por qué el usuario creyó seleccionar `es` y la época 12 terminó con `auto`, sin dar por demostrado un bug. Conserva el contrato de inicio aceptado y los starts rechazados. Si cambias el valor inicial a `es`, documenta ese cambio deliberado; no alteres ajustes generales del asistente.
2. Prepara un control local optativo y explícito que permita comprobar si el VAD está impidiendo llegar al ASR a señal débil. Usa el Whisper y PCM actuales, segmentos de tamaño acotado, sin gate por identidad o actividad VAD. Evita doble ASR simultáneo y backlog sin límite; cuenta cualquier descarte. Fija y justifica duración/tamaño/carga antes de implementarlo, conservando el máximo global de 120 s. VAD y participación mantienen su significado independiente. Texto de este control debe identificarse como experimental: silencio/ruido puede producir invenciones y no confirma conversación.
3. El control debe poder usarse con una sola acción visible de inicio y una de OFF, sin localizar botones Referencia/Otra persona/Yo/Fin durante la charla. No iniciar captura al abrir. No sustituir silenciosamente la ruta normal, bajar umbrales ni añadir normalización o modelos en el mismo cambio: necesitamos aislar qué varía.
4. Pruebas focalizadas: señal PCM sintética bajo umbral llega al decoder falso únicamente en control; silencio no confirma voz/participación; idioma capturado por inicio aceptado; worker lento sin acumulación; OFF/plazo/cesión al asistente drenan y no publican resultados tardíos; regreso a modo normal conserva su gate. No usar grabaciones ni enviar muestras a terceros. No prometer calidad real con mocks.

Entrega código y pruebas, informe breve con parámetros/carga/límites y APK firmada preparada si la implementación queda completa. No instalar, consultar móvil ni ensayar: la revisión Codex precede al próximo uso físico. No ejecutar el ensayo anterior por fases. No conectar audio/texto a Hermes ni otros proveedores, crear perfiles, cambiar firmware, guardar conversaciones o tocar otros servicios. Conserva firma original, 33 ajustes, GPS y prioridad Hey Even/PTT. Comprueba y conserva cambios locales antes de trabajar; publica sin force-push y con los commits existentes intactos según el flujo habitual.

El resultado de software no se presentará como mejora demostrada. El siguiente ensayo, si resulta necesario después de revisión, será breve y sencillo, con interlocutor real y cierre OFF; se acuerda entonces con el usuario.
