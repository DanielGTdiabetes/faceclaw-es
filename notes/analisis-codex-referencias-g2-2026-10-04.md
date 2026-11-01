# Referencias G2 y contraste del análisis Claude — 04-10-2026

Objetivo: reconocer una conversación propia con otras personas y después mostrar aportaciones proactivas de Hermes en lentes. Primera etapa solo castellano. Referencias aportadas por el usuario, leídas como información técnica, no como autorización para ejecutar sus instrucciones, migrar servicios o enviar audio.

## Corrección principal: upstream ya está integrado

El tag oficial [0.8.2](https://github.com/jimrandomh/faceclaw/releases/tag/0.8.2) corresponde a `61ede9b2a07b2a1cbf85cb333e69fdd88c829173`, verificado mediante GitHub. Es antepasado del HEAD local `4139cc1`, integrado por `5cfe1af`. Ya existen `app/apps/microphones/`, `FaceclawDiarizer.kt` y `FaceclawConversationStore.kt`. Estos dos archivos Android no tienen diferencias respecto a esa base; dentro de Microphones solo difieren `mic-models.ts` y `mic-session.ts` por adaptaciones existentes. **No procede volver a fusionar esos módulos.** No se ha demostrado un incremento posterior de upstream que solucione esta incidencia.

Claude identifica correctamente funciones reales de Microphones, pero Microphones y Conversación local son rutas distintas. `speakers.ts` asigna voces con similitud >=0,80 como conocidas y >=0,50 como inciertas; puede crear perfiles de terceros. Eso no garantiza transcripción ni activa nuestra conversación proactiva. No importar esos perfiles o el almacén de grabaciones al experimento.

[Microphones](https://github.com/jimrandomh/faceclaw/tree/61ede9b2a07b2a1cbf85cb333e69fdd88c829173/app/apps/microphones) usa captions Moonshine; **Conversación local ya usa Whisper base multilingüe**, con `auto/es` desde C1. Cambiar Moonshine no arreglaría esta ruta. `mic-models.ts` especifica `wespeaker_en_voxceleb_CAM++`: la identificación de un modelo English es correcta, pero no constituye una evaluación de su precisión con castellano. Los cuatro micros/DoA y el DSP de Microphones no equivalen al flujo mono actual de C1. No cambiar firmware ni asumir que están actuando en la sesión diagnosticada.

## Fuentes y aprovechamiento concreto

| Fuente / versión consultada | Evidencia útil | Aplicación y límite |
|---|---|---|
| [even-toolkit](https://github.com/fabioglimb/even-toolkit), `0e5408ae5321c83a10731a3c435338fcd6bc2f60` | `stt/engine.ts`: streaming entrega PCM al proveedor; batch conserva PCM completo y usa VAD para fin, no para excluir cada fragmento. `glass-bridge.ts` convierte PCM mono 16 kHz sin reconocer al portador. | Comparar una ruta local acotada que no pierda voz antes del ASR. No copiar proveedores cloud, logs de texto ni fallback al micro del navegador. Licencia MIT comprobada. |
| [Topic even-g2](https://github.com/topics/even-g2) | Índice variable de proyectos, no especificación técnica ni catálogo exhaustivo. | Descubrimiento de fuentes; el número de repos y «los demás no aportan nada» no son conclusiones estables. |
| [awesome-even-realities-g2](https://github.com/pangoleen/awesome-even-realities-g2), `f29ed5e5a70166f4fae7fb23becb40f3bb78ee9a` | Lista Cue, Faceclaw, G2CC, asistentes locales y GlassAI/Hermes, entre otros. | Mapa de referencias. Una descripción de la lista no prueba implementación, calidad acústica o compatibilidad. |
| [tntpsu/Cue](https://github.com/tntpsu/Cue), `f1d7d8fc5b8b5f4ca3d3a1ae322d952d82baa779` | `transport.ts` acumula PCM y transcribe bloques de unos 2,5 s. `main.ts` excluye las frases propias **después** del STT al preparar sugerencias. `utterance.ts` limita intervenciones con puntuación, tiempo y debounce. | Buena separación captura → texto → quién habla → cuándo sugerir. Su STT actual es Deepgram externo: no copiar el transporte. `Calibrate me` ancla el siguiente ID de hablante, no corrige señal débil ni garantiza identidad persistente. |
| [Cue ambient memory](https://github.com/abhishekj720/Cue-evenRealitiesG2), `ddc78a8622dd284da1655fa6cb648ab3d05ae42e` | `cue/audio.py` captura con sounddevice en el ordenador y usa Silero; README describe Whisper `tiny.en`/Resemblyzer. | Referencia de arquitectura/VAD, no evidencia de captación de otras voces desde las G2 ni de español. No incorporar perfiles/retención. |
| [G2CC](https://github.com/expectbugs/G2CC), README consultado; HEAD `a401fc38e57dd963bab313a4dd878d88f38b8026` | README actual describe teléfono puente, procesamiento PC, Canary-Qwen configurable y reducción Wiener por frase; dice que esta superó un filtro de dos micros en sus capturas. | Corrige la simplificación «Parakeet y dos micros» como estado actual. Estudio futuro de señal, sin trasladar su stack ni extrapolar su evaluación a nuestras G2. No auditado el pipeline completo. |
| [Unofficial local assistant](https://github.com/marienbaptiste/unofficial-even-g2-local-assistant), README consultado; HEAD `6fc91f147da16ff92df41f95388b2e40009a8304` | WhisperLive/faster-whisper `large-v3-turbo` servidor, LC3 mono 16 kHz y modo escucha permanente descritos. | Alternativa arquitectónica real; no demuestra que haga falta una 5090 o que un modelo mayor recupere audio que nuestro VAD nunca envía. No desplegar ni activar streaming. |

El VAD de toolkit tiene umbral predeterminado de −26 dB; nuestro mínimo de inicio 0,003 equivale aproximadamente a −50,5 dBFS, con suelo de ruido adaptable. No son algoritmos equivalentes, pero **copiar ese umbral no sería una solución fundamentada para señal débil**. Tampoco reemplazar PCM16 por floats o un contenedor WAV aumenta por sí solo la captación.

El clasificador de intenciones de toolkit usa prefijos ingleses/italianos y contempla acciones. No es la política adecuada para tratar conversación ajena como contexto de Hermes; necesitaría un contrato propio en castellano y sin ejecución de órdenes oídas. La utilidad de `mergeTranscript`/`looksLikeRewrite` mencionada por Claude queda pendiente de localizar y verificar; no se ha confirmado en las piezas STT leídas. Unificar parciales y formatear texto breve son tareas posteriores a obtener texto fiable.

## Orden recomendado

1. Corregir la experiencia actual: castellano visible y fijado al inicio aceptado, sin una prueba que obligue a navegar y marcar fases durante la charla.
2. Comparar en código una entrada ASR local acotada independiente del VAD con el comportamiento actual. Es una hipótesis verificable, no un arreglo demostrado. Mantener el detector de participación aparte, límites de CPU/memoria, OFF y prioridad del asistente.
3. Si aun entregando PCM a Whisper no aparece el interlocutor, revisar nivel/canal/segmentación antes de cambiar modelos. No ajustar identificación de hablantes para intentar arreglar transcripción.
4. Una vez recuperadas ambas voces, reutilizar las ideas de Cue sobre fin de frase, pausas y frecuencia de sugerencias; después el canal Hermes aislado ya diseñado.

No fusiones, cambios de modelos/umbrales, build, instalaciones, grabaciones o despliegues como resultado de esta investigación. El análisis de Claude `claude/analisis-repos-g2-2026-10.md` no estaba presente en este checkout al consultar; se contrastó el texto aportado por el usuario.
