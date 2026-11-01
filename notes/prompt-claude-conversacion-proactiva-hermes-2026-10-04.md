# Encargo a Claude: recuperar el objetivo de conversación proactiva — 04-10-2026

Continúa Faceclaw en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. El usuario mantiene el reparto: Claude desarrolla y prepara entregas; Codex revisa antes del siguiente encargo. Este encargo pide un diseño concreto basado en el código existente y un siguiente incremento listo para revisión. No implementes todavía el reintento ASR forzando castellano ni el envío de conversaciones a Hermes. No envíes mensajes a Codex ni crees otra conversación automáticamente: entrega al usuario el informe y el commit.

## Objetivo confirmado por el usuario

El producto debe detectar una conversación en la que participa el usuario, activar el contexto conversacional y enviar las intervenciones relevantes a Hermes Agent para que aporte respuestas, ideas o comentarios espontáneos en las lentes, sin pedir «Hey Even» cada vez. La transcripción es un componente de esa experiencia, no el resultado final.

La detección busca voz propia y una o varias voces diferentes intercambiando turnos. Oír al usuario solo, o varias voces ajenas sin su participación, no basta. No requiere voces simultáneas ni registrar la identidad de los interlocutores. El perfil propio sirve para estimar participación; no debe filtrar del contexto las intervenciones ajenas. Las categorías «otro» e «insuficiente» deben conservar sus límites: no coincidir con el perfil no demuestra por sí solo una segunda persona presencial.

Ejemplos de comportamiento deseado:

- Alguien pregunta durante el diálogo «¿Cuándo son las próximas Olimpiadas?». Hermes reconoce la pregunta, obtiene información actual si hace falta y muestra una respuesta breve en las lentes sin una invocación explícita adicional. No fijes una fecha en el diseño.
- Hermes aporta una idea o aclaración útil cuando el contexto lo merece, sin contestar a cada frase ni repetir lo ya dicho.
- El tono puede ser espontáneo, irónico y algo sarcástico, con humor ocasional. El usuario pone como ejemplos «menud@ pesad@» o «habla sin parar» ante un interlocutor muy hablador. Esto expresa una preferencia de estilo, no una orden de mostrar esos comentarios siempre. Diseña comentarios privados y breves en las lentes, control de frecuencia e intensidad y opción de silencio; no añadas salida hablada automática por defecto.
- Un fragmento incomprensible se deja pasar en silencio, sin avisos repetidos, texto inventado ni cortar el diálogo.

La conexión con Hermes es central al objetivo. La auditoría la aplazó a G6 como semántica opcional; esa etiqueta ya no describe el destino del producto. Planificarla está dentro de este encargo. Activar transporte real y cambiar servicios será un incremento posterior concreto revisado, no una consecuencia automática de este documento.

**Prioridad de idioma aclarada por el usuario:** centrarnos primero en castellano hasta que funcione bien con su voz y la del interlocutor. El soporte valenciano queda aplazado; no tiene que condicionar el primer incremento ni exige pruebas bilingües ahora. Diseña reconocimiento y respuestas de esta primera versión para castellano, sin traducción automática de otros idiomas. Puedes evaluar idioma fijo es como simplificación frente a autodetección/reintento; no está elegido ni implementado todavía, y debe justificar calidad, falsos textos y coste. Conserva el perfil propio existente sin recrearlo; aplazar valenciano no exige otro perfil ni borrar el actual. Documenta el alcance temporal y cómo recuperar soporte bilingüe más adelante, sin implementarlo ahora.

## Estado de partida y evidencia

HEAD comprobado por Codex antes de escribir este prompt: `6bbe362`, rama limpia y sincronizada. Comprueba el estado real, conserva cualquier cambio ajeno y no uses reset/clean ni cambies de rama a ciegas. El commit de este prompt será posterior.

- G3.4.1 fue revisada por Codex; revisión de build `5277dd7`.
- G3.4.2 está instalada según tu entrega: `0.8.2-es.5-conversation.g3.4.2`, código805, firma original, 33 ajustes idénticos y sesión terminada OFF. Commits `0161fdd`, `ab3d009`, `6bbe362`. Codex ha leído el informe, pero todavía no ha hecho una revisión completa ni aprobado G3.4.2.
- La corrección de pantalla mantiene las lentes encendidas durante la sesión manual ON. No la presentes como solución final para detección en segundo plano ni como prueba de autonomía.
- Observación vigente del usuario: **su voz se transcribe bastante bien; de la otra persona apenas aparecen algunas palabras**. Conserva esta formulación, que precisa el anterior «no aparece».
- Ensayo agregado: 74,1 s PCM, sin pérdidas/descartes nativos reportados; 29,84 s de posible voz, 14 decodificaciones, 9 entregadas en es, 4 rechazos por idioma y 1 invalidada. Comparación de perfil: 10 comparaciones, 4 abstenciones, estado final insuficiente.
- Los agregados no identifican qué fase o hablante produjo cada resultado. No prueban que los rechazos por idioma pertenezcan al interlocutor ni descartan que se pierda parte de su voz en VAD/segmentación. La captura continua no garantiza que el audio del interlocutor sea suficiente. El código puede demostrar que el perfil no filtra el ASR; eso es distinto de localizar el fallo del ensayo.
- Reintentar en castellano es una hipótesis sin aprobar ni implementar. Menos rechazos por idioma no acreditan por sí solos más texto correcto; considera alucinaciones, latencia y coste. El alcance ahora es castellano; no hace falta conservar autodetección bilingüe como requisito de esta primera versión.

## Lectura y comprobación del código

Lee `AGENTS.md`, `notes/continuidad-entre-pcs.md`, `notes/informe-claude-g3.4.2-2026-10-04.md`, `notes/revision-codex-build-g3.4.1-2026-10-04.md` y la memoria `C:\Users\danie\.codex\memories\faceclaw.md` si estás en este PC. Las entradas recientes prevalecen sobre resúmenes históricos.

Contrasta el objetivo con `notes/auditoria-conversaciones-g2-2026-10-03.md` (participación, lifecycle, presupuesto y G6), `notes/conversation-detection-g3-integrated.md`, `notes/conversation-detection-g3.3-usage.md` y `notes/voice-assistant-design.md`.

Inspecciona coordinador, controles, VAD, comparación, segmentación/ASR Kotlin, ventana de lentes, arbitraje del audio y rutas de asistente/proactividad. Puedes leer `E:\projects\faceclaw-hermes-bridge\bridge.py` y su README para diseñar el contrato, sin editarlos ni consultar secretos, historial o servicios remotos. Cita archivos y símbolos reales; distingue una capacidad existente de una propuesta. No presupongas que un ajuste de proactividad del asistente conecta ya el diálogo con Hermes.

## Trabajo que debes entregar ahora

1. **Mapa del desfase.** Explica brevemente qué está implementado, qué está instalado según evidencia previa, qué no está validado y qué falta hasta el objetivo completo. Verifica si la alternancia actual solo etiqueta una candidata o realmente activa algún consumidor. Reutiliza lo existente; no reinicies el proyecto ni propongas rehacerlo todo.
2. **Arquitectura completa.** Define controles y estados que separen habilitación de escucha, candidata, conversación activa, suspensión, silencio de comentarios y OFF. Indica qué motores trabajan en cada estado, cómo se obtiene evidencia antes de activar una conversación, cómo se termina y cómo se evita mantener las lentes encendidas para poder escuchar. Mantén prioridad Hey Even/PTT/asistente y cancelación de resultados caducados. El tope experimental actual de 120 s no se elimina en este encargo: explica cómo se revisaría para uso real con coste medido.
3. **Captación del interlocutor en castellano.** Traza dónde puede perderse su intervención: señal/calidad, VAD, segmentación, ASR, filtros y entrega. Propón el diagnóstico mínimo que permita distinguir etapas/fases sin grabar ni leer conversación privada. Si basta, usa en un futuro ensayo separado métricas por fase indicada por el usuario y material artificial conocido en castellano. No ejecutes el ensayo ahora ni conviertas la propuesta en otra batería general. Compara idioma fijo es, autodetección con reintento es y alternativas solo cuando la evidencia las justifique; no elijas cambios nativos por intuición ni mantengas complejidad bilingüe por inercia.
4. **Contrato con Hermes.** Propón texto local como primera opción de transporte, contexto temporal acotado, delimitación de intervenciones y atribución desconocida cuando corresponda. Define destino real, límites, caducidad, cola, cancelación/OFF, desconexión y prevención de respuestas a contexto antiguo. Explica qué historial/memoria persistiría Hermes con la ruta actual y cómo aislar o limitar este modo; no prometas ausencia de retención sin comprobar el código. El perfil/vector y audio bruto no forman parte del contrato. Distingue respuesta informativa/búsqueda de acciones que escriben, envían mensajes o cambian cosas: lo oído es contexto, no autorización para ejecutarlas.
5. **Política de intervención.** Describe cómo Hermes recibe contexto suficiente sin lanzar una consulta por palabra, cuándo contesta una pregunta o aporta algo, cuándo calla y cómo evita duplicados e interrupciones. Incluye el estilo de humor solicitado y límites ajustables de frecuencia sin imponer una cifra como medida validada. La pantalla debe permitir leer la ayuda sin obligar a seguir permanentemente toda la transcripción.
6. **Siguiente incremento concreto.** Ordena un camino corto hacia el producto en castellano y recomienda el primer cambio implementable con archivos/componentes, criterio de aceptación, comprobación mínima y reversión. Resolver la captación ajena es necesario también para Hermes y detección; no conviertas perfeccionar indefinidamente el modo manual en el objetivo. Separa lo que puede verificarse con texto sintético de lo que necesita observación física. Evita una nueva elección genérica «automático/manual/ambos»; el destino ya está aclarado. Valenciano se recuperará después de que el flujo en castellano sea útil y fiable.

No te limites a repetir intenciones: entrega contratos, transiciones y criterios revisables. Señala solo decisiones del usuario que realmente falten; usa supuestos explícitos para detalles rutinarios. No hagas implementación, build, instalación, nuevo ensayo, cambio de modelos/umbrales o conexión real en este encargo de diseño.

## Conservación y entrega

Conserva el perfil propio existente sin reenrolar, leer/exportar vector o copiarlo al NAS. Mantén firma original, 33 ajustes, Hermes habitual, bloqueo desactivado y GPS. Sin grabaciones, perfiles de terceros ni audio experimental en red. No consultes UI durante ON; para una consulta futura se exige conexión y OFF confirmado, no solo ausencia de wakelock. Este encargo no requiere consultar el móvil.

No toques firmware /36, Wear ya actualizado y desconectado, otros proyectos o servicios/configuración NAS/Jarvis. No repitas G0/G1/G2/GPS/Wear. Incidentes históricos 492 ms/siete descartes y UI1046 ms/21 drops, precisión, participación y autonomía siguen abiertos; un tramo limpio no los resuelve.

Guarda la entrega en `notes/diseno-claude-conversacion-proactiva-hermes-2026-10-04.md`. Actualiza continuidad y AGENTS con el objetivo aclarado y el estado G3.4.2 atribuido a su informe, preservando historial y sin afirmar revisión Codex pendiente como completada. Haz un commit de documentación en la rama compartida y publícalo según el flujo ya autorizado, sin secretos, PR ni fusiones. No necesitas repetir builds o suites por un documento. En la respuesta final indica commit final, ruta del diseño y primer incremento recomendado. Codex revisará la entrega antes de autorizar su implementación.
