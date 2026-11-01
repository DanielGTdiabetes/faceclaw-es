# Encargo a Claude: una única prueba breve S2.2 de portador y tiempos Soniox

**Preparado por Codex el 04-10-2026; no ejecutado.** El usuario pasará este encargo cuando quiera realizar la prueba. Prepararlo no inicia captura. S2.2 está instalada según el usuario y el informe de Claude; la revisión de software está aprobada. No reinstalar, recompilar, repetir suites ni reabrir esa revisión.

Lee `AGENTS.md`, `notes/prompt-continuidad-codex-s2.2-2026-10-04.md`, `notes/informe-claude-instalacion-s2.2-2026-10-04.md` y este protocolo. Repositorio `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, HEAD de referencia `ae55d83`. Conserva todos los cambios locales, candidatas, sondas/logs y `.tools/s2fix/orig`. No reset/clean/stash/cambio de rama, commit ni mensajes a otros chats.

## Alcance y precondición

Una sesión humana de unos **45–60 s**, dos personas presentes: portador y otra persona. Un solo intento de frase y, si hace falta, una elección manual dentro de esa misma sesión. No batería de casos, segunda sesión ni repetición automática si algo falla. Máximo actual: 120 s absolutos desde ON, incluidos silencios.

Antes de empezar, coordina con el usuario que está listo con la otra persona y que la conversación está OFF. El OFF del informe de instalación es histórico. Si ya escucha, espera a que el usuario cierre y confirme OFF antes de consultar UI. Mientras está OFF, comprueba conexión y ausencia de recursos experimentales activos; después observa OFF, Soniox seleccionado, texto habilitado y castellano forzado. La versión esperada es `0.8.2-es.5-conversation.s2.2`/805; no extraigas de nuevo APK/ajustes/NAS por rutina. Si una precondición falta, resuélvela con el usuario antes de ON; no reinstales ni pidas la clave Soniox, ya configurada.

Pixel `61161FDCG0013L`, ADB `E:\android-sdk\platform-tools\adb.exe`. No leer/exportar el perfil, reenrolar, cambiar modelos/umbrales/clave/token/GPS/bloqueo, firmware ni Wear. TV como está, sin filtros ni prueba especial. Esta sesión usa la ruta Soniox existente, que envía audio a Soniox; no se envía conversación a Hermes.

**El usuario maneja los controles y observa las etiquetas. Durante ON no consultes UI con herramientas, no hagas volcados/capturas de pantalla, logcat general ni grabaciones.** No pulses ON automáticamente. No abras métricas durante captura: el control está diseñado para después de OFF.

## Guion para el usuario

1. Pulsa **«Iniciar conversación local (2 min máx.)»**. Cuando esté disponible **«Mi voz · identificar o corregir»**, ábrelo y elige **«Identificar mi voz (frase)»**. La otra persona guarda silencio durante la frase y su comprobación.
2. Cuando aparezca **«Di: Soy yo quien lleva las gafas»**, di una sola vez, con ritmo normal y enseguida: **«Soy yo quien lleva las gafas»**. No añadas otra frase dentro de esa ventana. Deja que se cierre sola: hasta 5 s de audio, con límite de 8 s de reloj; después puede esperar hasta 6 s a resultados. No hace falta usar «Listo» ni repetir la frase. Observa si aparece **«Portador: Yo = voz … (frase)»** o el motivo del intento fallido.
3. Sin solaparse, el portador dice **«Mañana voy a preparar la comida en casa»**; pausa aproximada de 3 s. La otra persona dice **«Yo pasaré después y llevaré el pan»**; pausa de 3 s. Observad si la primera intervención corresponde a **«Yo»** y la segunda a otra etiqueta. Estas frases solo sirven para reconocer quién habló; no se guarda la transcripción en el informe.
4. **Solo si la frase falló o la etiqueta es incorrecta:** en «Mi voz · identificar o corregir», elige una sola vez **«Soy la voz …»** correspondiente al portador, usando la vista previa de su frase. No adivines una etiqueta por el número. Si no se distingue, deja sin identificar y registra la limitación. No vuelvas a intentar la frase. Después, tanto con identificación por frase como manual, el portador dice **«De acuerdo, nos vemos mañana»** y la otra persona **«Perfecto, hasta mañana»**, con una pausa de 3 s entre ambas. Observad de nuevo «Yo» y la otra etiqueta.
5. Deja unos **5 s de silencio final** para que lleguen finales y progreso; pulsa **«Detener (OFF)»** y confirma OFF. Si surge un error, fallback local o interrupción, cierra esa misma sesión, anota lo ocurrido y no reinicies. No usar Hey Even/PTT ni forzar cortes de transporte para ampliar la prueba.

Las duraciones son orientativas; no hay que mantener ON para cumplirlas. La observación de etiquetas es diagnóstica y provisional. Si la app muestra texto en las lentes, no se considera implementado el producto final ni se cambia la app dentro de este encargo.

## Recogida después de OFF

Solo tras confirmación humana de OFF, comprueba el cierre: captura deshabilitada, lease/timer inactivos, buffers vacíos y sin wakelock experimental. Espera el drenaje de worker/busy si existe; vuelve a abrir métricas después del drenaje, sin iniciar otra sesión. En el móvil, toca la etiqueta **«Conversación local · OFF»** para abrir **«Métricas locales»**, que contiene **«Última sesión Soniox (sin texto)»**.

Conserva exclusivamente ese resumen agregado y los datos agregados de cierre necesarios. No exportes audio, transcripción, vistas previas, tokens individuales ni ajustes privados. No abras una nueva sesión ni reinicies el proceso antes de recoger el resumen: se conserva en RAM hasta el siguiente inicio aceptado. Si no está disponible, registra «no obtenido», sin fabricar ceros ni repetir el ensayo.

Campos del resumen que interesan:

| Campo | Uso y límite |
| --- | --- |
| `identity.state`, `source`, `lastOutcome`, `attempts`, `manualAssignments` | Resultado de asociación cooperativa, por frase o manual; no biometría. Registrar también la observación humana antes/después de cualquier corrección. |
| `engineFinal`, `fallbacks`, `errors`, `lastErrorCategory` | Saber si se mantuvo Soniox o hubo fallback/error. Si terminó local, no dar por acreditada identificación Soniox estable. |
| `sentAudioMs`, `finalAudioProcMs`, `totalAudioProcMs` | Audio enviado y progreso comunicado. `totalAudioProcMs` se conserva como dato reportado; no pasa el mismo validador del progreso final. No equivale a duración de reloj. |
| `backlogAtStopMs` | `max(0, sentAudioMs - finalAudioProcMs)` si hay progreso; se fotografía al parar, sin garantizar el drenaje final del servidor. No es latencia completa de voz ni de Hermes. |
| `firstTokenAfterMs`, `firstFinalAfterMs` | Milisegundos de reloj monotónico del móvil desde el primer envío de audio hasta recibir el primer token/final. Incluyen el silencio inicial, red y espera del servicio; no se miden desde el final de la frase. |
| `messages`, `finalTokens`, `turns`, `speakersSeen` | Evidencia agregada de actividad; etiquetas de diarización no prueban el número real de personas y pueden incluir TV. |
| `invalidTimingTokens`, `invalidProgress`, `endedBy` | Invalidez temporal y causa de cierre. Usar este resumen, no los contadores vivos reiniciados tras OFF. |

Comprobar coherencia básica del progreso final recibido: finito, no negativo y como máximo `sentAudioMs + 100`. Registrar los contadores de invalidez y los valores nulos como tales. Cero invalidez y una asociación por frase aceptada aportan evidencia de compatibilidad con las ventanas temporales de esta sesión; **no demuestran el origen común exacto de `start_ms`/`end_ms`, progreso Soniox y contador enviado**. El resumen no guarda tiempos por palabra ni historial de progreso: si esa verificación requiere más instrumentación, déjala pendiente, sin modificar/reinstalar la app ni abrir otro ensayo en este encargo.

## Criterio y entrega

La comprobación humana es satisfactoria en esta sesión si el intento único asocia al portador, sus frases posteriores aparecen como «Yo», la otra voz permanece distinta y se cierra OFF sin recursos experimentales activos. Si hubo corrección manual, separa claramente **resultado de frase fallido/incorrecto** de **resultado manual observado**; el manual no convierte la frase en aprobada. No convertir una sesión satisfactoria en precisión general demostrada.

Escribe `notes/informe-claude-prueba-breve-s2.2-2026-10-04.md` con hora Europe/Madrid, duración aproximada, observaciones humanas sin transcripción, intento/corrección, resumen agregado, cierre observado y límites. Distingue lo dicho por el usuario de lo comprobado por herramientas. Si las lentes se observaron físicamente, registra quién lo observó; el espejo móvil no lo acredita. Actualiza continuidad conservando el historial; no declares realizada la prueba antes de ejecutarla. Si no llega a ON, entrega «no realizada» y la precondición faltante.

Tras esta observación se retomará **el diseño**, con `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md` y `notes/aclaracion-activacion-hermes-conversacion-2026-10-04.md`: episodios frente a saludos, duración/coste, contexto frente a respuesta visible y rutas que no cancelen el agente por todas las voces. No implementar ni enviar contexto a Hermes dentro de esta prueba.

**Decisión final del producto conservada:** pantallas de las gafas apagadas durante la escucha, sin conversación ni transcripción visible; encenderlas únicamente para mostrar los mensajes de Hermes cuando intervenga. S2.2 sigue siendo una interfaz diagnóstica provisional y no implementa todavía ese comportamiento.
