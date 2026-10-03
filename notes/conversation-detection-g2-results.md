# G2.1: VAD local provisional

Continuación del cierre del **03-10-2026**, Europe/Madrid, desde `b0002cf`, rama `codex/conversation-detection-g0`. La batería breve G0/G1 ya está completada: [resultados y límites](conversation-detection-g0-results.md). Este incremento no repite aquella instalación ni los ensayos físicos.

## Alcance

`LocalEnergyVad` procesa en el teléfono el PCM mono 16 kHz S16LE recibido por la concesión experimental existente. Es un **VAD por energía provisional**, sin modelo de reconocimiento de habla. Informa actividad compatible con posible voz; una señal continua, TV, música o ruido pueden activar el mismo resultado. No distingue al usuario de otra persona ni confirma participación en una conversación. No identifica idiomas, entiende frases ni activa al asistente.

- Cada chunk de 50 ms se analiza en cinco ventanas de 10 ms. Se resta el componente continuo de cada ventana antes de calcular RMS normalizado. Se abstiene en ventanas con dos o más muestras saturadas de 160.
- Piso inicial 0,0015, mínimo 0,001. El fondo se adapta al 1 % por ventana solo por debajo del umbral, fuera de candidatos y de la cola de actividad. No se conserva entre capturas.
- Inicio: umbral `max(0,003, fondo × 3)` durante 150 ms consecutivos. Mantenimiento: `max(0,002, fondo × 1,8)`. Fin tras 600 ms sin actividad suficiente. Parámetros iniciales de ingeniería, **sin calibración acústica con las G2**. Puede omitir voz baja o discontinua y aceptar ruido sostenido.
- Estados visibles solo en el teléfono: inactivo, sin actividad, candidato, posible voz y pausa. El estado de captura sigue siendo desactivado/escuchando/suspendido/error. «Escuchando» acredita PCM, no voz confirmada.
- Solo contadores agregados en RAM: ventanas, milisegundos por encima del umbral, episodios provisionales, finalizados por silencio e interrumpidos, último RMS/fondo/umbral. Los milisegundos positivos incluyen candidatos no confirmados; no representan duración de conversación. No hay una cronología de eventos ni buffers PCM en el VAD.
- OFF, cesión, desconexión, retirada y fallo borran la actividad actual y el fondo. Un hueco de entrega mayor de 250 ms interrumpe la continuidad; no se contabiliza como silencio ni une candidatos. El tick de 500 ms retira estados acústicos obsoletos antes del watchdog de captura de 2 s.
- Se mantienen prioridad de Hey Even/PTT/asistente/apps raw, presencia real aun con bloqueo desactivado, OFF al arrancar y límite global de 120 s, también durante suspensión. PCM y preparación tardíos comprueban además la caducidad antes de seguir procesando o adquirir audio.

No se añaden grabaciones, perfiles de voz, ASR, transcripciones, red, envíos a Hermes, modelos descargados, ajustes persistentes, firmware o configuración multicanal. El asistente normal conserva su propia ruta. Hermes y `display.lockScreenEnabled=false` quedan intactos. La versión preparada es **`0.8.1-es.5-conversation.g2.1`**, paquete `com.faceclaw.app`, código **805** para conservar la reversión con firma original y datos.

## Validación de software

- 35 pruebas específicas pasan: VAD, captura, prioridades, presencia con bloqueo desactivado y caducidad. Fixtures sintéticos generados en memoria, sin grabaciones humanas.
- Suite Node compatible con Windows: **729 pasan, 1 omitida, 0 fallos**. Se excluye únicamente `ios-config-scripts.test.cjs`, el ensayo POSIX ya documentado como ajeno a Windows.
- TypeScript completo y oxlint con análisis de tipos: correctos.
- NativeScript prepare release y Gradle assembleRelease unsigned: correctos. JDK 21, SDK/build-tools 35, arm64-v8a. La comprobación previa de NativeScript rechazó el entorno por la instalación de emulador; tras comprobar SDK/JDK disponibles se utilizó `NS_SKIP_ENV_CHECK=1` solo en el proceso de preparación. El build real de Gradle completó correctamente.

Los fixtures verifican silencio, DC, saturación, impulsos, inicio/fin/histéresis, adaptación, cesión, huecos, caducidad y ausencia de PCM retenido. No acreditan precisión con voz real, latencia en el Pixel, batería, Doze profundo o convivencia física con el firmware. No se modifica código Kotlin de producción en este incremento.

## Dispositivo y próximo ensayo

El usuario informó de que el Pixel estaba conectado. Se actualizó **a G2.1** mediante `adb install -r`, código 805 y certificado original verificado por el helper seguro. No se repitió la instalación G0.2 ni su batería física. Respaldo fresco G0.2 extraído antes de actualizar: `dist/conversation-g0/before-install-20261003-140029.apk`; su SHA-256 coincide con el G0.2 instalado documentado. **Los 33 ajustes son idénticos antes/después**, mediante comparación completa de exportaciones privadas restringidas al usuario/SYSTEM, retiradas del almacenamiento compartido del Pixel tras la copia. Incluyen Hermes y bloqueo desactivado. No se activó el ensayo automáticamente.

Manifest instalado: `com.faceclaw.app`, `0.8.1-es.5-conversation.g2.1`, código 805. Tras arrancar la actividad no hay wakelock `Faceclaw:ConversationG0` activo. La primera inspección UI encontró el Pixel bloqueado (`com.android.systemui`); posteriormente el usuario desbloqueó el Pixel y confirmó OFF visible y gafas puestas. La conexión real de Hermes después de la actualización aún no se ha comprobado; la ruta y todos sus ajustes se conservan.

| Artefacto | SHA-256 | Ubicación local |
| --- | --- | --- |
| G2.1 firmada | `8505f5639d41b33abd4cb6bf3e48b21e68544a9bececb93eccad63666ae28c34` | `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g2.1.apk` |
| G2.1 sin firma | `7aa8c6d006a00a02c34f24711981d0bb6ea92dfe3bc8c83d385248f97699c421` | `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk` |
| G0.2 extraída, reversión | `e5c518b9e8f1127a174f2364d688b86cb59dd769b116a5fc054b47d026495de6` | `dist/conversation-g0/before-install-20261003-140029.apk` |

Certificado público original SHA-256: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. El helper acepta G0.1/G0.2/G2.1 y su versión predeterminada pasa a G2.1; indicar `-ExpectedVersion` explícito para artefactos anteriores. Reversión conservando datos, tras OFF y con la firma verificada: `adb -s 61161FDCG0013L install -r dist/conversation-g0/before-install-20261003-140029.apk`.

Las APK firmada y sin firma se copiaron a `/volume1/home/Dani/Faceclaw/apk-builds/conversation-g2.1/` con los mismos nombres (carpeta 700, archivos 600). El respaldo nuevo está en `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-g0.2-before-g2.1.apk` (600). Los tres SHA-256 remotos coinciden con la tabla. No se han copiado claves ni exportaciones privadas a Git.

## Primeros ensayos físicos G2.1

**Silencio:** el usuario confirmó «sin actividad durante el silencio». La lectura posterior de la interfaz mostró OFF, actividad inactiva, **0 episodios**, **434 chunks / 21,7 s PCM**, hueco máximo **70 ms** y 0 cesiones. No se conservó una lectura de RMS/fondo/umbral durante ese tramo ni una ventana nativa detallada; no deducir de ello ausencia de candidatos breves o una tasa de falsos positivos general. Es un ensayo breve del entorno concreto, sin grabación de audio. El histórico de power registra liberación del wakelock tras el ensayo; se separará del listado activo al comprobar el cierre final.

**Voz del usuario y pausas:** el usuario confirmó «posible voz al hablar y luego pausa/sin actividad», y observó que detecta enseguida cuando deja de hablar. La pausa visible aparece en la primera ventana de baja energía; el episodio cierra después de 600 ms continuos. No se han ajustado los parámetros por esa observación. Se obtuvieron dos lecturas UI separadas, ambas OFF/inactivo/0 cesiones: **570 chunks / 28,5 s / 5 episodios / hueco máximo 81 ms**, y posteriormente **277 chunks / 13,8 s / 2 episodios / hueco máximo 75 ms**. Los contadores cambiaron entre lecturas, compatibles con un ON nuevo: no sumar ni atribuir ambas al mismo ensayo o convertir el número de episodios en turnos de conversación. No se obtuvo el JSON completo del VAD ni cronología de onset/offset. La confirmación perceptiva acredita respuesta a la voz y al silencio en este entorno, sin tasa de precisión general.

**Reproducción externa:** el usuario pidió voz «por aquí» para el siguiente ensayo. Se generó localmente un WAV con `Microsoft Helena Desktop` (español), mediante `System.Speech`, sin servicio de voz en red. Es una señal sintética de referencia, no una grabación del usuario o del audio experimental. Archivo local ignorado por Git: `dist/conversation-g0/g2-external-voice-es.wav`, con una pausa breve y cinco segundos finales de silencio. El usuario confirmó que la reproducción por altavoces, sin hablar él, mostró posible voz y después silencio. **El VAD acepta replay como actividad acústica: no confirma participación.** No sustituye un interlocutor real ni una TV y no acredita rechazo de replay.

La lectura posterior al ensayo externo mostró **2.382 chunks / 119,1 s PCM**, 1 inicio, 0 cesiones, 0 clipping, hueco UI máximo **435 ms**. VAD: **11.910 ventanas**, **11.640 ms** sobre umbral, **5 episodios**, 5 completados y 0 interrumpidos. El contador describe un ensayo global cercano al límite de dos minutos, no la duración del WAV ni un intervalo aislado de reproducción. RMS final del último chunk: 0,0007173; el fondo/umbral del VAD tras OFF son los valores reiniciados y no sirven como medición acústica del tramo.

Diagnóstico nativo anterior al STOP: **2.390 paquetes** de 205 B, mono 16 kHz, PCM1600 B, hueco máximo **95 ms**, cero pérdidas, duplicados, malformed, stale, queue drops o errores de decodificación; **7 `pcmDeliveryDrops`** en la entrega main acotada. No confundirlos con pérdidas BLE ni atribuirlos al VAD o a las consultas UI sin una comparación controlada. La diferencia de ocho chunks entre contador nativo/UI incluye descartes y posibles entregas al cerrar, no una pérdida BLE demostrada. `capturing=true` pertenece a la instantánea previa al STOP, no al estado actual.

Cierre comprobado en JSON: `enabled=false`, desactivado, VAD inactivo, `lease=false`, `timer=false`, `bufferedBytes=0`. **Cero wakelocks experimentales en la sección activa** de `dumpsys power`, separada del histórico ACQ/REL. Por los siete descartes se solicitó una repetición breve de la señal sintética sin consultas UI durante la captura.

**Repetición sin consultas UI durante captura:** el usuario confirmó reproducción terminada y OFF visible. Lectura solo después del cierre: **540 chunks / 27,0 s / 432.000 muestras**, **540 paquetes nativos**, 1 inicio y 0 cesiones, hueco máximo UI/nativo **108 ms**, cero clipping, pérdidas, duplicados, malformed, stale, errores de decodificación, queue drops y **`pcmDeliveryDrops=0`**. VAD: 2.700 ventanas, 11.670 ms sobre umbral, 5 episodios completados y 0 interrumpidos. Sin consultas UI mientras ON en esta repetición; lectura técnica y modal abiertas después de OFF. Es un tramo breve limpio, no una demostración de que la instrumentación causara los siete descartes anteriores o de estabilidad prolongada.

**Cierre final:** el usuario confirmó OFF; JSON `enabled=false`, desactivado, VAD inactivo, `lease=false`, `timer=false`, `bufferedBytes=0`, y **0 wakelocks experimentales activos**. Las pruebas G2 realizadas cubren silencio, voz/pausas del usuario y reproducción sintética por altavoz, incluida una repetición controlada motivada por los descartes. No se reinstaló G0.2 ni se repitió su batería completa. Interlocutor real, TV/ruido variado, convivencia física específica del VAD con Hey Even/PTT y estabilidad prolongada siguen sin validar en G2. No se han medido autonomía ni Doze profundo y no se ha añadido ASR.

## Continuación desde `7b82cd6`: alternancia con la voz de ChatGPT

**03-10-2026, Europe/Madrid.** Rama y commit comprobados al retomar, árbol inicialmente limpio y Pixel conectado con G2.1/código 805. No se reinstaló ni cambió código, Hermes, ajustes, firma o firmware. El usuario propuso conversar con una IA con voz casi humana y aclaró después que era **la voz de ChatGPT**; el escenario se registra como **voz propia alternada con voz sintética de ChatGPT reproducida por altavoz**, no como interlocutor humano ni como validación de participación.

Tras indicar que había terminado, el usuario confirmó «Sí, con ambas voces y vuelta al silencio»: observó posible voz con su intervención y con la respuesta de la IA, y pausa/sin actividad en los silencios. Las consultas UI de esta continuación se hicieron después de OFF. La lectura conservada corresponde al ensayo global: **1.741 chunks y paquetes / 1.392.800 muestras / 87,05 s PCM**, no a un intervalo aislado de respuesta ni a los 20–30 s propuestos. Un inicio, cero cesiones y clipping, hueco máximo UI/nativo **78 ms**. Diagnóstico nativo: paquetes de 205 B, mono 16 kHz y PCM de 1.600 B; cero pérdidas, duplicados, malformed, stale, errores de decodificación, queue drops y **pcmDeliveryDrops=0**.

VAD: **8.705 ventanas**, **53.960 ms** positivos, **16 episodios provisionales**, **15 completados por silencio y 1 interrumpido**. No equiparar episodios a turnos ni milisegundos positivos a conversación. No se obtuvo cronología; no atribuir la interrupción a un instante o causa concretos. El último RMS de captura fue 0,0239555; fondo/umbral/frameRms del VAD leídos después de OFF están reiniciados y no describen el fondo del ensayo. La observación del usuario acredita respuesta percibida a ambas fuentes y al silencio en este entorno, sin precisión general ni separación de hablantes.

Cierre nuevo confirmado por interfaz/JSON: **enabled=false**, desactivado, VAD inactivo, **lease=false, timer=false, bufferedBytes=0** y **0 wakelocks experimentales activos**. El `capturing=true` nativo pertenece a la instantánea anterior a STOP, no al estado actual. No se guardó contenido ni audio experimental. Este tramo limpio no demuestra que los siete descartes del ensayo previo estén definitivamente resueltos.

## Ensayo de TV a un metro

**03-10-2026, Europe/Madrid**, continuación de `e3635af`. El usuario completó el protocolo propuesto de TV con voces sin hablar él, seguido de silencio y OFF. Confirmó **«No detectó las voces de la TV»** y distancia aproximada de **un metro**. No se obtuvo una confirmación adicional de volumen, inteligibilidad desde las gafas o contenido del programa; no suponer calibración acústica.

Lecturas UI realizadas después de OFF: **924 chunks y paquetes / 739.200 muestras / 46,2 s PCM**, 1 inicio, 0 cesiones y clipping. Hueco máximo **UI 89 ms / nativo 88 ms**. Paquetes de 205 B, PCM de 1.600 B, mono 16 kHz; cero pérdidas, duplicados, malformed, stale, errores de decodificación, queue drops y **pcmDeliveryDrops=0**. El contador describe el ensayo global, no únicamente el intervalo con TV encendida.

VAD: **4.620 ventanas**, **2.210 ms** por encima del umbral, **0 episodios**, 0 completados y 0 interrumpidos. Los milisegundos positivos no confirman habla ni episodios; no hay cronología para situarlos antes o después de silenciar la TV. Coincide con la no detección percibida. **La TV de este ensayo no activó episodios; esto no demuestra rechazo general de TV/ruido ni separación entre fuentes.** No se modifican los umbrales a partir de un solo escenario. RMS del último chunk 0,0007780; fondo/umbral/frameRms del VAD posteriores a OFF están reiniciados y no describen el tramo.

Cierre nuevo: **enabled=false**, desactivado, VAD inactivo, **lease=false, timer=false, bufferedBytes=0**, **0 wakelocks experimentales activos**. El diagnóstico nativo `capturing=true` sigue siendo la instantánea anterior a STOP. No se reinstaló ni cambió código, firma, ajustes, Hermes o firmware; no se guardó ni envió audio experimental. Los siete descartes históricos siguen sin causa atribuida y no se consideran definitivamente resueltos.

## Convivencia física G2.1 con Hey Even

**03-10-2026, Europe/Madrid**, continuación de `3cf51e3`. Ensayo específico nuevo del VAD activo con Hey Even; no repetición de la batería G0/G1. El usuario confirmó **«Sí, ocurrió todo y terminé con OFF»** ante la comprobación de suspensión del VAD, respuesta normal del asistente, retorno a escuchando al cerrar el diálogo y después sin actividad mientras permanecía callado.

Lecturas UI solo después de OFF: **431 chunks / 344.800 muestras / 21,55 s PCM acumulados**, **2 inicios y 1 cesión**, hueco máximo de entrega **77 ms**, clipping 0. La duración PCM excluye el tiempo suspendido; el máximo de entrega tampoco mide la duración de la cesión, porque se reinicia la continuidad al liberar. VAD: **2.155 ventanas / 3.340 ms positivos / 3 episodios provisionales**, 2 completados por silencio y 1 interrumpido. No se obtuvo cronología acústica para atribuir ese episodio interrumpido a un instante concreto ni identificar hablantes.

El diagnóstico nativo conservado corresponde **solo al último tramo reanudado**, con **316 paquetes / 252.800 muestras / 15,8 s PCM**, paquetes de 205 B y PCM de 1.600 B, mono 16 kHz. Hueco máximo nativo **69 ms**; cero pérdidas, duplicados, malformed, stale, errores de decodificación, queue drops y **pcmDeliveryDrops=0 en ese tramo**. No se conservó el diagnóstico completo del primer tramo: no extender los ceros a todo el ensayo ni tratar la diferencia respecto a los 431 chunks acumulados como pérdida.

La observación del usuario y los dos inicios/una cesión acreditan **convivencia breve del VAD G2.1 con Hey Even, cesión y retorno sin actividad arrastrada percibida**. No valida PTT en G2.1 ni estabilidad prolongada. El cierre está confirmado por UI/JSON: **enabled=false**, desactivado, VAD inactivo, **lease=false, timer=false, bufferedBytes=0**, **0 wakelocks experimentales activos**. `capturing=true` nativo es la instantánea previa a STOP. Sin reinstalación ni cambios de código, firma, ajustes, Hermes o firmware; sin audio experimental guardado/enviado. Los siete descartes históricos mantienen su incertidumbre.

## Convivencia física G2.1 con PTT y hueco de entrega pendiente

**03-10-2026, Europe/Madrid**, continuación de `dc690c2`. El usuario confirmó **«Sí, ocurrió todo y terminé con OFF»**: suspensión del VAD durante PTT, respuesta normal del asistente, retorno a escuchando al cerrar el diálogo y después sin actividad estando callado. Esto acredita convivencia breve de PTT con el VAD, no ausencia de incidencias de entrega ni estabilidad prolongada.

Lecturas UI solo después de OFF: **450 chunks / 360.000 muestras / 22,5 s PCM acumulados**, **3 inicios y 2 cesiones**, clipping 0. No se obtuvo cronología para explicar las dos cesiones o asignarlas a acciones concretas. **Hueco máximo de entrega 492 ms**, superior al umbral de 250 ms de interrupción de continuidad del VAD. No confundirlo con la duración de una cesión: `release()` reinicia `lastPcm`. No se conoce su instante, tramo o causa; no atribuirlo a BLE, PTT, VAD o instrumentación. En esta continuación no se hicieron consultas UI durante ON. VAD: **2.250 ventanas / 4.760 ms positivos / 5 episodios**, 4 completados por silencio y 1 interrumpido; no atribuir ese episodio a una cesión o al hueco sin cronología.

El diagnóstico nativo conservado cubre **solo el último tramo reanudado**: **178 paquetes / 142.400 muestras / 8,9 s PCM**, hueco nativo **76 ms**, paquetes de 205 B, PCM de 1.600 B, mono 16 kHz; cero pérdidas, duplicados, malformed, stale, errores de decodificación, queue drops y **pcmDeliveryDrops=0 en ese tramo**. No extrapolar esos ceros a los tramos anteriores ni interpretar la diferencia respecto a 450 chunks acumulados como pérdida. No se recuperaron estadísticas adicionales con el filtro técnico de logcat posterior; no se guardó contenido de conversación.

Cierre confirmado por UI/JSON: **enabled=false**, desactivado, VAD inactivo, **lease=false, timer=false, bufferedBytes=0**, **0 wakelocks experimentales activos**. `capturing=true` nativo es la instantánea previa a STOP. Sin reinstalación ni cambios de código, firma, ajustes, Hermes o firmware; sin audio experimental guardado/enviado. Los siete descartes históricos siguen sin causa atribuida ni resolución definitiva.

El hueco de 492 ms justifica **un ensayo nuevo de continuidad cercano al límite**, distinto de repetir la batería PTT: unos 100 s de captura, sin Hey Even/PTT/Chat ni consultas UI durante ON, con observación de voz/pausas al principio y más adelante, seguido de OFF y lectura técnica. Conserva el límite global de 120 s. Aunque resultase limpio, no resolvería la causa del hueco previo ni validaría funcionamiento prolongado, autonomía o Doze profundo.

La validación física específica de G2 está **iniciada, no completada**. Silencio, voz propia/pausas, reproducción sintética, alternancia con ChatGPT, TV a un metro y convivencia breve con Hey Even/PTT están ensayados; no repetirlos por defecto. Con G2.1 instalada, guiar ensayos nuevos pendientes, uno por uno, sin grabar ni enviar el audio experimental:

| Escenario nuevo | Observar sin conservar contenido |
| --- | --- |
| Interlocutor, 20–30 s | Actividad posible, sin atribuir identidad o participación |
| Otro ruido/fondo, si se necesita ampliar cobertura | Actividad espuria y límites del método por energía; la TV a un metro ya está ensayada |
| Continuidad cerca del límite, unos 100 s | Sin consultas UI ni asistente durante ON; motivado por hueco de entrega de 492 ms del ensayo PTT, sin atribuir su causa |
| Cierre | OFF y recursos experimentales retirados, sin cortar captura ajena |

Mantener los ensayos limitados a dos minutos, sin cambios de Hermes/bloqueo. No usar estas pruebas para dar por validadas autonomía o Doze profundo: siguen pendientes de protocolos propios. Para el ASR futuro permanecen español, valenciano y alternancia entre y dentro de frases, conservando el idioma y absteniéndose silenciosamente ante contenido incomprensible.
