# Prompt de continuidad — G3.3, cierre del 04-10-2026

Continúa Faceclaw desde este cierre. Lee el estado existente y avanza en la app; no reinicies la evaluación ni repitas el registro del perfil.

Proyecto: `E:\projects\faceclaw-es`.
Rama compartida: `codex/conversation-detection-g0`.
Base funcional publicada: `e8003bf`; consulta el último commit para las notas de cierre posteriores. La rama de integración `codex/faceclaw-0.8.2-conversation` conserva la fusión oficial, pero continúa en la rama compartida.

Lee primero:
- `AGENTS.md`.
- `notes/conversation-detection-g3.3-usage.md`.
- `notes/faceclaw-0.8.2-integration-2026-10-04.md`.
- `notes/faceclaw-wear-0.8.2-2026-10-04.md`.
- `notes/continuidad-entre-pcs.md`.
- `C:\Users\danie\.codex\memories\faceclaw.md`.
Consulta el informe G3 integrado y la hoja de ruta G0–G6 en `notes/auditoria-conversaciones-g2-2026-10-03.md` cuando corresponda. Prevalecen las entradas más recientes sobre estados históricos «sin perfil», «no instalada» o «firmware pendiente».

Estado actual:
- Pixel: `0.8.2-es.5-conversation.g3.3`, código805, firma española original. Actualización con datos conservados; los33ajustes son idénticos antes/después, incluidos Hermes y bloqueo desactivado. GPS instalado y previamente confirmado funcionando.
- Gafas: actualización a la revisión requerida `Faceclaw/36` completada por el usuario. Su mensaje de cierre: «Las gafas están actualizadas con el nuevo firmware y todo parece funcionar como antes». Es observación del usuario de funcionamiento general, no una nueva batería física ni una medición independiente del detector. El agente no modificó ni flasheó firmware. No volver a actualizarlo ni añadir parches propios.
- Pixel Watch4: Wear `0.8.2-es.1`, código3, mismo paquete/certificado que el móvil, datos conservados. Enlace comprobado por ACK real de consulta de estado `ok=true/jsReady=true`; no fue necesario volver a emparejar. No usar directamente la APK oficial de Wear: firma distinta. La fuente Wear oficial no cambió entre0.8.1/0.8.2.
- Perfil propio guardado en el móvil y mantenido después de actualizar. Observados «Conversación local · OFF» y «Mi perfil: guardado en este móvil». Cero wakelocks experimentales activos en la última comprobación correspondiente. Estos son estados anteriores a la actualización manual del firmware: no asumir una comprobación nueva de OFF o recursos al retomar. La precisión de comparación y participación real siguen sin acreditarse.

G3.3 ya implementa comparación/alternancia provisional con el perfil existente y ASR local opcional. «Texto local opcional: ON/OFF» permite comparación sin ASR y no cambia los ajustes persistentes. Espera a los motores elegidos antes de capturar; error termina OFF; distingue cierre manual/plazo/error, muestra tiempo restante y bloquea reinicio mientras drenan los motores. Tope120s, incluida preparación/esperas. Perfil guardado visible y errores de consulta sin degradación silenciosa. Una conversación candidata o alternancia provisional no confirma participación ni voz en vivo.

Siguiente trabajo: retoma el uso integrado de G3.3, revisa qué falta y completa funciones concretas y claridad de estados, corrigiendo incidencias reales. La interfaz de conversación sigue en el móvil: todavía faltan una entrada propia en el menú de las gafas y estado/texto en las lentes; considera esos pendientes al avanzar. No vuelvas a dedicar una sesión únicamente a diseñar subpruebas. Distingue código implementado, comprobaciones de software y resultados observados. G4: mejoras justificadas por errores concretos. G5: estabilidad/autonomía prolongadas pendientes. G6: semántica/acciones requiere una decisión posterior; no conectar audio o texto experimental a Hermes.

Conserva los33ajustes, Hermes, firma original, bloqueo desactivado y GPS. Un único perfil propio para castellano/valenciano: no repetir creación, leer/exportar el vector ni copiarlo al NAS. Sin grabaciones, perfiles de terceros, envío de audio experimental, descargas de modelos o cambios de umbrales por defecto. No tocar firmware ni otros proyectos. Actualizar la APK sí está autorizado cuando el avance lo requiera: firma existente, respaldo de APK/ajustes y `adb install -r`, nunca desinstalar ni borrar datos. No instalar otra vez la misma versión sin motivo.

Verificaciones ya realizadas:42Node específicas de G3.3; integración0.8.2 con782Node correctas/1omitida (archivo dependiente de shellPOSIX excluido en Windows),240Kotlin correctas, TypeScript, lint, webpack, AAR y build/lintVital Android. Wear release/lintVital correctos. No repetir sin cambios o fallos que lo justifiquen. Los huecos/pérdidas históricos de audio siguen abiertos (492ms/siete descartes; UI1046ms/21drops); tramos limpios posteriores y espera de motores no demuestran resolverlos.

No presupongas que el móvil o reloj siguen conectados: compruébalo y avisa si hace falta. Última conexión del reloj `192.168.0.38:45015`, susceptible de cambiar. Para cualquier consulta de UI del móvil, confirma conversaciónOFF; nunca consultar duranteON. Si es imprescindible un ensayo, que sea único, breve, guiado y justificado; terminar siempreOFF. Evita rondas repetidas de confirmaciones y baterías físicas. Actualiza GitHub y continuidad compartida/NAS con el avance, excluyendo perfil, audio, secretos y preferencias privadas del repositorio.
