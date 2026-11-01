# Continuar desde casa: Conversación y motor del Pixel

Estado actualizado el 08-10-2026. Rama: `codex/conversation-detection-g0`, repositorio [DanielGTdiabetes/faceclaw-es](https://github.com/DanielGTdiabetes/faceclaw-es/tree/codex/conversation-detection-g0). Código/pruebas publicados en `942da5e`; verificación/documentación posterior en `eaf78a4`. Esta guía y la confirmación humana se publican después de esos cambios.

## Estado que hay que conservar

- Móvil Pixel 10 Pro Fold: S2.6.10 `0.8.2-es.5-conversation.s2.6.10-model-selector`, código 805. APK final instalada y extraída con SHA-256 `d9be4259ee278343c060fff1618b321ac049b27ee4d8919083420b003e259d60`, firma original, 35 ajustes byte idénticos y perfil conservado. No reinstalar por rutina al cambiar de PC.
- Motor de Conversación seleccionable: Soniox, Pixel local experimental, Whisper base/small/medium. Elegir **Motor** en OFF. Descargar es una acción separada cuando faltan archivos Whisper; Pixel no necesita descargar en el dispositivo probado. Elecciones RAM: después de reiniciar vuelven a Soniox, Texto y Hermes e idioma automático. Pixel usa español instalado, no catalán/valenciano.
- Modos **Texto y Hermes** o **Solo texto**. Solo texto no consulta al modelo Hermes. Reconocimiento local no implica que Hermes sea local o gratuito: con Hermes, el texto va al puente y al proveedor configurado.
- La etiqueta «Display off» del mando fue retirada y la corrección se comprobó en el código de la APK extraída. La última revisión visual final quedó pendiente porque el móvil volvió a bloquearse; no reinterpretar la prueba de voz como confirmación del diseño visual.
- No se desplegó ni reinició Jarvis en esta mejora. Circuito Codex-Claude desactivado; trabajar directamente, no activarlo por rutina.

## Última confirmación del usuario

Después de la instalación, el usuario comunica que la primera frase dicha con el motor del Pixel se ha detectado y, al preguntar por la transcripción, confirma **«correctamente»**. Es una confirmación humana de una frase con su voz; no es una comparación de motores, una transcripción guardada, una prueba de otras personas, una métrica de precisión ni una garantía de continuidad larga. No se consulta el móvil de nuevo para esta actualización y no se conoce el estado ON/OFF actual.

Las pruebas sintéticas previas sí están registradas: API pública y adaptador nativo instalado reconocen la frase completa desde PCM externo, diagnóstico sin permiso de micrófono/Internet, trabajador detenido y cola vacía tras stop. 277/277 JS/TS, 34/34 nativas, 44/44 Python simuladas y protocolo local correctos; build, lint y firma originales verificados. [Detalle y reversión](selector-modelos-conversacion-2026-10-08.md).

## Siguiente trabajo

1. Comprobar la pantalla del mando sin el texto solapado, si el usuario tiene el móvil visible.
2. Probar otra persona hablando cerca y a distancia habitual, con Pixel y preferiblemente **Solo texto** para evaluar transcripción sin confundirla con las decisiones de Hermes. No iniciar escucha sin coordinación con el usuario; terminar en OFF.
3. Comparar Soniox/Pixel/Whisper con condiciones parecidas. Todavía no se ha demostrado mejora con voces lejanas, ruido, autonomía ni veinte minutos continuos. Medium aparece «descargado» en la UI observada, pero no se ha validado su hash/carga/velocidad ni ejecutado por Codex.
4. La alternativa de STT en Jarvis/equipo propio sigue siendo una comparación de arquitectura pendiente de implementación y medición; no está preparada por el selector móvil.

## Recuperar el trabajo en el PC de casa

Actualizar desde GitHub la rama `codex/conversation-detection-g0` y leer este documento, `AGENTS.md` y la nota del selector antes de actuar. Si hay cambios propios en casa, conservarlos y comprobarlos antes de integrar; no usar reset/clean para igualar carpetas.

Para continuar las pruebas no hace falta reconstruir ni instalar la app. GitHub incluye fuentes, pruebas, diagnósticos sintéticos y documentación; no contiene claves de firma, preferencias, credenciales, APK, grabaciones ni los pesos descargados. La firma original y el entorno Android serían necesarios para una APK futura; no inventar otra clave ni desinstalar/borrar Faceclaw. La APK final y su reversión están solo en este PC en las rutas documentadas; no se ha hecho copia NAS nueva de S2.6.10.

## Alcance de la sincronización

Todo el código relacionado con esta mejora y los prerrequisitos de conversación presentes en la APK está publicado. Se preservan **sin publicar en este relevo** otros cambios locales anteriores: circuito agent-bridge (`integrations/agent-bridge/`, `scripts/agents.ps1`, cambios de `CLAUDE.md`), evaluación contextual (`evaluations/conversation-context-20261008/`, su nota), consumo de las G2 y sus entradas antiguas en los documentos de continuidad. No son necesarios para probar Pixel, pero este relevo no equivale a copiar íntegramente la carpeta de este PC.
