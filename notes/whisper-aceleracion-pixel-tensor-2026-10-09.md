# Whisper en Pixel/Tensor: viabilidad y próximo incremento

**Actualización posterior al estudio:** S2.6.12 instalada y [revisada por Codex](revision-codex-whisper-s2.6.12-2026-10-09.md). Base pasa a cuatro hilos; small/medium siguen en cuatro. Las secciones inferiores describen el estado previo a las mediciones. Banco e informe final en la rama `claude/whisper-perf-bench-2026-10-09` @ `342154c`.

**Hardware observado por ADB en este Pixel:** ro.soc.model = Tensor G5; fabricante Google; SDK Android 37; CPU presentes 0–7 (ocho). Son propiedades del dispositivo conectado, sin inferencia ni benchmark de aceleración. No deducir el nivel de compilación de sherpa a partir del SDK del teléfono.

Fecha: 09-10-2026. Estudio de código, binarios instalados y documentación oficial; sin cambios de motor, nuevas descargas ni benchmark de inferencia. El usuario descarta GPU en el BMAX y propone aprovechar el Pixel 10 Pro Fold.

## Conclusión

Merece la pena estudiar el Pixel antes de introducir un servidor STT. Hay dos trabajos distintos: optimizar el Whisper actual en CPU y explorar un adaptador para la TPU del Tensor. La aceleración reduce tiempo/carga y podría permitir un modelo mayor o menos ventanas perdidas; no recupera por sí sola una voz ausente o enmascarada en el audio.

No basta con cambiar un booleano. El modelo actual está en ONNX/sherpa; la vía TPU oficial usa otro runtime y un modelo compilado compatible. No se ha demostrado aquí que el Whisper descargado pueda ejecutarse completo en la TPU ni que mejore tiempo, precisión o consumo.

## Estado comprobado en Faceclaw

- [FaceclawLocalTranscriber](../App_Resources/Android/src/main/java/com/faceclaw/app/FaceclawLocalTranscriber.kt) usa base/small/medium int8, un hilo para base y cuatro para small/medium. Carga y valida exactamente el modelo elegido.
- [AndroidSpeechEngines](../App_Resources/Android/src/main/java/com/faceclaw/app/AndroidSpeechEngines.kt:28) configura número de hilos y Whisper; no selecciona un proveedor TPU/GPU. La ruta actual utiliza el proveedor predeterminado de sherpa, sin integración de Tensor SDK/LiteRT.
- Ventanas de seis segundos con salto de tres, acondicionamiento de nivel y un decode activo. Para sostener ese solape hay que procesar cada ventana en menos de tres segundos, incluyendo el resto del trabajo. Un RTF inferior a uno no basta: con este salto, la inferencia debe quedar por debajo de aproximadamente 0,5 de forma sostenida, con margen para colas y variación.
- El build fija sherpa-onnx 1.13.0. En la biblioteca JNI extraída de la APK instalada aparece el mensaje de NNAPI no disponible por nivel de compilación inferior a 27, y no aparece el mensaje de uso de NNAPI. Es un indicio fuerte de que cambiar el proveedor a nnapi en esta distribución terminaría en CPU; no se ejecutó una prueba del proveedor ni se perfiló delegación real.

La [implementación de sesión de sherpa 1.13.0](https://github.com/k2-fsa/sherpa-onnx/blob/v1.13.0/sherpa-onnx/csrc/session.cc) protege NNAPI con el nivel Android con el que se compiló la biblioteca, no simplemente el del teléfono. XNNPACK también requiere estar disponible en el binario; no asumir que cambiar una cadena lo habilita. Esta inspección no demuestra qué nodos de un modelo se delegarían.

## Opciones

| Vía | Alcance y decisión |
| --- | --- |
| CPU actual | Primera candidata. Medir base/small con 1/2/4 hilos manteniendo modelo, audio y segmentación. Más hilos no garantizan más rendimiento sostenido. |
| XNNPACK/otro build ONNX | Solo si el paquete lo soporta y el grafo se beneficia. Puede requerir biblioteca nueva. Comparar end-to-end y no solo una multiplicación. |
| NNAPI | Exploración puntual, no apuesta principal: Android lo deprecó en Android 15 y el binario actual presenta la limitación de compilación indicada. [Android NDK](https://developer.android.com/ndk/guides/neuralnetworks). |
| Google Tensor SDK + LiteRT | Vía oficial de acceso a la TPU para investigar. Adaptador/modelo separado, con conversión y validación. No sustituir el motor estable antes de medir. |
| GPU móvil/LiteRT | Alternativa posterior; también requiere modelo/runtime compatibles. No confundir GPU del teléfono con GPU del BMAX. |

Google documenta [Tensor SDK en beta](https://developers.google.com/edge/litert/next/tensor-sdk), con Tensor G5/G6 soportados, acceso a TPU y compilación a formatos compatibles. El entorno de desarrollo especificado es Linux x86_64/Ubuntu, con requisitos de RAM; el acceso al SDK se ofrece mediante registro. Esto acredita una vía técnica oficial, no compatibilidad demostrada de Whisper. No se han creado cuentas, aceptado licencias, instalado SDK ni contratado recursos.

[LiteRT para NPU](https://developers.google.com/edge/litert/next/npu) documenta Tensor con compilación anticipada (AOT) y CompiledModel; la compilación JIT en el dispositivo no está soportada actualmente por Tensor SDK. Hay que verificar operaciones, formas, precisión numérica y distribución del runtime para una APK instalada por ADB. No copiar pesos ONNX al selector y llamarlos acelerados.

ONNX Runtime advierte que una [partición excesiva entre acelerador y CPU](https://onnxruntime.ai/docs/tutorials/mobile/) puede empeorar el rendimiento. El criterio es la latencia total con transferencias y decodificación, no que el proveedor se inicialice.

## Prueba pequeña propuesta

1. Harness aislado, sin micrófono ni red, con PCM sintético o consentido en RAM y referencias conocidas. Mantener separados los ensayos de acústica real a dos metros.
2. Medir inicialización, encoder/decoder si el runtime lo permite, latencia total p50/p95, RTF, memoria, ventanas descartadas y temperatura. Comparar primero 1/2/4 hilos de CPU con el mismo modelo y señal; comprobar estabilidad más allá de la primera inferencia.
3. Revisar compatibilidad de un modelo pequeño con Tensor SDK. Si el encoder resulta viable, valorar una prueba de encoder acelerado y decoder CPU antes de migrar todo. Es una hipótesis de implementación, no una ruta ya disponible.
4. Confirmar ejecución efectiva en acelerador mediante profiling; rechazar fallbacks silenciosos a CPU. Validar texto español/valenciano y números después de conversión/cuantización.
5. Integrar únicamente una opción experimental si mejora las medidas sin degradar el reconocimiento. Conservar selector y reversión. La entrega S2.6.11 no contiene esta aceleración.

## Evidencia de la prueba humana posterior al despliegue

Usuario: Whisper small, Texto y Hermes, memoria 24 h activa; conversación de unos 82 segundos. Móvil/servidor coinciden: 17 turnos aceptados, dos assess (cortesía y tema), diez assist con nada, cero mensajes, errores, caducidades o fallbacks. Round-trip de assist medio 1.348 ms, máximo 1.624 ms. BLE: 1.634 paquetes, sin pérdidas, errores o pcmDeliveryDrops. Se verificó un resumen en SQLite, sin leer su contenido.

Esto demuestra circulación de texto y abstenciones válidas del protocolo, no exactitud de Whisper ni cobertura de la otra persona. La UI tras OFF reinicia parte del snapshot de transcripción y no proporciona aquí un tiempo fiable del decode local; no atribuir sus ceros o la etiqueta del motor reiniciada a la sesión previa.

El ejemplo aportado por el usuario fue una pregunta cotidiana sobre lo que iban a comer los demás. Por sí sola depende de planes privados que Hermes desconoce y puede justificar silencio. No se leyó ni reconstruyó la conversación completa; no se concluye que las diez abstenciones fueran correctas. Una próxima pregunta de cocina con ingredientes explícitos permite comprobar una ayuda sustentada y revisar a la vez el texto reconocido.
