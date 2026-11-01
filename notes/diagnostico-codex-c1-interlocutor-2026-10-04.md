# C1: interlocutor y prueba poco utilizable — 04-10-2026

El usuario informa que su voz se transcribe mucho mejor y la otra persona apenas aparece; durante este intento dice que no reconoce ninguna palabra del interlocutor. Considera la prueba por fases poco intuitiva y demasiado difícil. **C1 no queda aceptada como solución física.** Su revisión de código/artefacto sigue siendo válida, pero C1 añade diagnóstico, no mejora por sí sola el reconocimiento.

## Comprobación posterior a OFF

Usuario confirmó OFF antes de las consultas y volvió a escribir «Off» después del intento. Pixel `61161FDCG0013L`, C1 instalada: `base.apk` SHA256 `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6`, igual a la APK revisada. No se reinstaló ni compiló. La instalación anterior y sus 33 ajustes idénticos constan en el informe Claude; esta consulta no repite esa comparación.

Última sesión, época 12, parada manual:

| Medida | Resultado |
|---|---|
| PCM entregado al coordinador | 1806 chunks, 90,3 s |
| Hueco máximo UI / nativo | 475 / 97 ms |
| Transporte | 1818 paquetes; 0 paquetes perdidos, duplicados, errores de decodificación o descartes de cola; 12 `pcmDeliveryDrops` |
| VAD | 6,99 s positivos; 4 episodios completados; 0 interrumpidos |
| ASR | 4 decodificaciones, 10,2 s de audio; 1,908 s de cómputo total |
| Resultados | 2 entregados, 2 rechazados por idioma; 0 errores o descartes de entrega |
| Idioma efectivo registrado | `auto`, 0 resultados forzados |
| Comparación de voz propia | 2 comparaciones, 2 abstenciones; evidencia insuficiente |
| Cierre | enabled/lease/timer false, buffers 0, workers/busy false; 0 wakelocks experimentales actuales |

Dos lecturas posteriores del diagnóstico fueron iguales. El `capturing:true` del bloque de transporte es una instantánea conservada antes de STOP, no evidencia de captura actual. No se guardaron audio ni transcripciones; solo agregados locales ignorados por Git.

## Límites de la atribución

La fase «Otra persona» tiene **0 chunks/0 ms**. Las otras fases recibieron: sin marcar 8,55 s; Yo 3,05 s; Referencia 12,05 s; Fin 66,65 s. Referencia contiene actividad VAD y dos resultados rechazados por idioma; no permite afirmar quién hablaba. El tramo Fin no abrió segmentos, pero no tenemos confirmación fiable de quién hablaba durante él. La interfaz y la guía fallaron en producir una medición atribuible; no convertirlo en una conclusión sobre el usuario o el interlocutor.

Aunque el usuario había indicado castellano forzado, el diagnóstico registra **automático** en coordinador y motor durante esta sesión. Tras OFF se seleccionó y observó «castellano (forzado)» en la pantalla. No hubo otra sesión para comprobar qué idioma devuelve el motor. La causa de la discrepancia de selección no está demostrada. Última UI legible: OFF, castellano forzado y diagnóstico ON; un intento posterior de ocultar diagnóstico no quedó confirmado porque la siguiente lectura no mostraba la pantalla de Faceclaw.

## Qué implica el código

`app/conversation-detection/local-vad.ts` decide actividad por energía; `LocalTranscriptBuffer` en `native/kotlin/shared/src/commonMain/kotlin/com/faceclaw/app/audio/LocalTranscriptSession.kt` solo abre el segmento con «posible voz». La ruta de `FaceclawLocalTranscriber.kt` usa Whisper multilingüe y no consulta el perfil de hablante. La comparación con el perfil funciona aparte: **no hay un filtro «solo mi voz» delante del ASR de Conversación local**.

Esto descarta ese filtro concreto como explicación en el código revisado. No demuestra que la captación acústica sea suficiente: la señal, el VAD, la segmentación y el idioma siguen siendo candidatos. Tampoco demuestra que los 12 descartes expliquen la falta de texto. Los incidentes históricos de entrega no quedan resueltos por esta lectura.

## Continuación

No repetir ahora la prueba manual por fases. Priorizar castellano y reconocimiento de ambas voces antes de activar Hermes. Ver [análisis de referencias](analisis-codex-referencias-g2-2026-10-04.md) y [encargo propuesto a Claude](prompt-claude-captacion-interlocutor-2026-10-04.md). Mantener perfil, firma, preferencias, firmware y audio local; sin grabaciones ni transmisión experimental.
