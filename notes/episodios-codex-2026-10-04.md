# Episodios: base implementada y cierre para mañana, 04-10-2026

El usuario pide actualizar GitHub y continuar mañana desde el PC del trabajo. Codex ya asume implementación. Rama `codex/conversation-detection-g0`; publicación anterior S2–S2.3: `e995946`. Conservar todos los cambios y decisiones. Este avance añade código de episodios, sin nueva APK, instalación ni consulta del móvil.

## Código y verificación

`app/conversation-detection/conversation-episodes.ts` añade `ConversationEpisodeTracker`, un componente aislado, sin importación en el coordinador de ejecución. Consume turnos e identidad vigentes y mantiene contexto limitado en RAM. Estados OFF, esperando, candidata y activa. La presencia del portador y otro hablante permite solicitar una evaluación; por sí sola no confirma un tema. Un endpoint de Soniox tampoco lo confirma.

La evaluación explícita admite `tema`, `cortesia` o `incierto`. Cortesía/incertidumbre vacían el contexto sin producir asistencia. El componente no implementa un clasificador: las pruebas suministran los veredictos. No existe todavía transporte de conversaciones a Hermes ni visualización de respuestas.

Cambio de identidad, frontera/interrupción, OFF, caducidad o silencio invalidan el contexto correspondiente y las respuestas tardías. Una respuesta debe corresponder a sesión, stream, versión de asociación, episodio y revisión de texto actuales. OFF y fin de sesión dejan el gestor apagado. Cada API comprueba los plazos; no hay temporizadores propios ni cambios en la captura.

Se descartan turnos con tiempos no válidos, identidad incoherente o secuencia antigua. Las voces desconocidas pueden conservarse como contexto, pero no acreditan un interlocutor. No hay filtro de TV/origen. Se limitan caracteres y turnos completos; las copias devueltas no permiten modificar el buffer. Los diagnósticos son contadores/estado sin texto.

La política es obligatoria y se copia al construir el gestor. **15 s de candidata, 30 s de silencio, 12 turnos y 6000 caracteres son valores de pruebas, no decisiones aprobadas ni ajustes instalados.** El tope absoluto de escucha de 120 s continúa intacto; ningún episodio reinicia captura.

Verificado: 13/13 pruebas nuevas (`tests/conversation-episodes.test.cjs`), compilación TypeScript de pruebas y app, oxlint sin advertencias. Cubren veredictos, invalidación de respuestas, identidad, plazos, límites y copias del contexto. La compilación de pruebas incluye el nuevo módulo. Las 163 pruebas S2.3 anteriores siguen documentadas en su informe; no se suman como una batería conjunta repetida. No se ha construido Android porque este módulo no está conectado a la app.

## Próximo trabajo

1. Resolver la pregunta ya presentada sobre evaluación semántica: ¿puede Hermes recibir el texto de un intercambio candidato para decidir quedarse callado, o solo después de una confirmación local? **Sin respuesta al cierre; no asumir autorización por silencio.** El acceso al contexto del gestor no constituye permiso para transmitirlo. Si se exige confirmación local, concretar cómo se obtiene sin confundir alternancia con tema.
2. Definir la política de episodios y un contrato propio del canal de conversación, separado del `utterance` normal que cancela el agente. Prioridad del chat habitual, cancelación del episodio y rechazo de resultados tardíos.
3. Integrar gradualmente el gestor y la intervención Hermes. Producto final: gafas apagadas durante escucha, sin transcripción/conversación visible; mostrar únicamente mensajes de Hermes cuando intervenga. Este avance y S2.3 no implementan aún ese resultado visual.

S2.2 sigue instalada; S2.3 firmada local, no instalada ni copiada al NAS según el último informe. La prueba guiada ya terminó y la frase no se intentó: no repetirla automáticamente. Error real de envío y «Yo» con identificación 0/0 siguen sin causa demostrada. Avisar al usuario antes de necesitar el móvil; no acceder durante posible ON. Mantener firma, ajustes, perfil, TV, GPS, bloqueo, Wear y firmware. APK, claves y copias privadas permanecen fuera de Git.

Para retomar: leer este documento, `AGENTS.md` y `notes/prompt-continuidad-codex-s2.3-2026-10-04.md`; comprobar rama/estado/HEAD remoto y recuperar con fast-forward solo si es compatible con los cambios locales, sin reset/clean/stash automático. No repetir revisión S2.2 ni reinstalarla.
