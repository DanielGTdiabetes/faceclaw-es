# Conversación A2: texto independiente del VAD — 04-10-2026

Encargo: [prompt vigente](prompt-astra-interlocutor-2026-10-04.md). Base real `b96c295`, rama `codex/conversation-detection-g0`, árbol inicialmente limpio. Implementación `33234e7`. No había un build de este proyecto en ejecución; los procesos Java encontrados eran daemons Gradle/Kotlin. No se descartó trabajo ni se cambió de rama.

**Software implementado, probado y APK A2 firmada/verificada. La captación útil del interlocutor todavía no está demostrada físicamente.** Este cambio sustituye la entrada ASR condicionada por energía por ventanas de toda la señal; no es otro control de diagnóstico que haya que activar o una prueba manual por fases. La comparación con Mi perfil continúa en paralelo y conserva sus límites.

## Revisión causal

Se revisó captura → LC3/PCM → coordinador → segmentación → Whisper → entrega y UI, y por separado el recorrido del perfil.

1. `voice-control.beginRawCapture` borra expresamente los estados retenidos de micrófono del teléfono, grabación, endpointing, supresión espectral, filtro direccional y verificación de hablante. `VoiceCaptureSession` usa el flujo G2 mono 16 kHz, cinco tramas LC3 por paquete / 800 muestras PCM cada 50 ms. La ruta experimental decodifica en modo cloud **sin cliente cloud** y entrega únicamente al consumidor local. No se encontró un filtro por perfil anterior al PCM o al ASR. El habilitado stock de EvenHub no configura desde aquí un haz propio del portador. El procesamiento interno del firmware y la relación señal/ruido real no quedan acreditados por inspeccionar este código.
2. El VAD de energía exige 150 ms consecutivos sobre `max(0,003, 3 × suelo de ruido)` para abrir. Señal variable débil puede quedar siempre por debajo y alimentar el suelo de ruido sin abrir un segmento. El buffer anterior solo conservaba 200 ms previos y exigía 300 ms etiquetados «posible voz» para entregar a Whisper. **Ese mecanismo puede excluir audio antes del reconocimiento, independientemente de quién habla.** Una entrada sintética muy débil reproduce la exclusión y ahora llega íntegra al decoder falso.
3. Esto no identifica la causa física de la sesión época12: no existen sus muestras, ni atribución fiable de interlocutor, ni una sesión efectiva `es`. Los 12 `pcmDeliveryDrops` y los huecos históricos tampoco quedan explicados o resueltos por este cambio.
4. La selección anterior era RAM con valor inicial `auto`; reiniciar el proceso restablecía automático. Es un comportamiento comprobado del código, **no prueba de que hubiera un reinicio ni explicación demostrada de la discrepancia de época12**. A2 establece `es` por defecto en selección compartida, coordinador y wrapper Android. `auto` sigue siendo una elección explícita solo en OFF. El inicio aceptado mantiene idioma inmutable y la UI muestra el de la sesión mientras está ON.
5. Upstream 0.8.2, Microphones/Diarizer/Store y Whisper multilingüe ya estaban integrados. No se vuelven a importar. Las referencias externas y sus límites constan en [el análisis previo](analisis-codex-referencias-g2-2026-10-04.md); no se reutilizó código de terceros ni se desplegaron proveedores.

## Recorrido implementado

```text
Inicio explícito → captura G2 mono / LC3 → PCM 16 kHz
                                           ├─ ventanas ASR → Whisper es → texto temporal móvil/lentes
                                           └─ VAD existente → perfil propio / indicios de participación
OFF / cesión / desconexión / hueco / plazo → invalidación, borrado y liberación
```

- Android selecciona `LocalTranscriptSegmentation.WINDOWS`. Cada ventana contiene **6 s / 96.000 muestras**, con **1 s / 16.000 muestras de solape**, y sale una cada 5 s después de la primera. No abre ni cierra por VAD y no necesita identidad, alternancia ni un perfil compatible para admitir muestras en el buffer ASR. La coordinación general con el perfil sigue siendo la existente cuando se inicia en modo conversación.
- Solo se omite una ventana cuyas muestras son todas idénticas: silencio digital, DC o saturación constante. Una señal variable de 8 LSB, aproximadamente −72 dBFS, pasa sin ganancia ni normalización. **Esto no es detección de voz**: ruido variable también llega a Whisper, que puede inventar texto. Se muestra como provisional y no alimenta participación, órdenes o Hermes.
- Un único worker, un trabajo pendiente/en vuelo, sin cola de segmentos detrás de JNI. Si está ocupado se borra la nueva ventana y cuenta `dropped`. Se siguen recogiendo las siguientes ventanas en el buffer acotado. El solape no permite crecer el historial. El tope global sigue siendo **120 s**, incluidas esperas; como máximo 23 ventanas completas en una captura de esa duración sin interrupciones, antes de descontar cargas y descartes.
- Arrays de entrada ASR: aproximadamente **0,84 MB** como límite conservador de reservas PCM16/float, excluidos pesos y memoria interna del modelo. El buffer común conserva su reserva de 8 s y 200 ms previos para compatibilidad con participación; A2 usa solo 6 s y solape. Un texto previo de hasta 600 caracteres permite quitar solapes literales; la UI mantiene las tres últimas entregas. Todo es RAM y se borra al parar o invalidar.
- Se quita únicamente un prefijo de al menos dos palabras enteras igual al sufijo del resultado **entregado** de la ventana contigua, como máximo 12 palabras, normalizando mayúsculas/puntuación. No se elimina una palabra aislada. Un reset, ventana omitida, descarte o salto rompe esa unión. Es una heurística textual: puede conservar duplicados si Whisper reformula y puede confundir una repetición real con el solape; no asigna voces. Un resultado compuesto solo por el solape no genera otra entrega visible.
- OFF/plazo/cesión/desconexión/hueco no decodifican el fragmento incompleto: se borra. Por tanto, parar justo al terminar una frase puede descartar hasta 5 s de audio nuevo pendiente. En la comprobación humana se dejan unos 7 s de silencio antes de OFF. JNI no se interrumpe a mitad de inferencia: se invalida el resultado y se drena; no se permite otro worker mientras tanto.
- `decodedAudioMs`/`submittedAudioMs` incluyen el solape, **no son tiempo único de conversación**. Los contadores por fase heredados siguen siendo origen marcado, nunca identidad. `segmentation: windows` y `constantWindows` permiten distinguir el recorrido nuevo sin guardar texto/audio.
- Participación y registro conservan su buffer VAD anterior, modelo, umbrales y almacenamiento. No se lee, exporta o recrea el perfil. No se cambia captura, señal, pesos ASR, Hermes habitual, GPS, bloqueo, firmware o Wear.

### Experiencia

Castellano forzado y texto ON por defecto al abrir un proceso nuevo. La pantalla principal mantiene estado, perfil, idioma visible, **Iniciar / OFF**, texto y Opciones. Mi perfil, texto ON/OFF y diagnóstico pasan a Opciones; las marcas siguen ocultas por defecto. Abrir/restaurar no inicia captura. Las lentes muestran el idioma efectivo y el texto; toque para OFF, doble toque para OFF y salir. Se avisa de la primera ventana de unos 6 s (más inferencia/carga) y de posibles errores con ruido.

La transcripción ya no depende de que se confirme participación, pero **la activación automática y la proactividad aún no están implementadas**. No hay una base física fiable de ambas voces para conectar Hermes conforme al encargo. El envío real de terceros sigue desactivado y no se modificó Jarvis. El avance entregado es el recorrido de texto y su uso sencillo; no se presenta el objetivo de producto completo como alcanzado.

## Validación

| Comprobación | Resultado y alcance |
|---|---|
| Kotlin nuevo `LocalTranscriptWindowsTest` | **8/8**: PCM débil pese a VAD negativo; contenido del solape y fase en origen; silencio/DC/saturación constante; vuelta a VAD; fragmentos/reset/formato inválido; worker lento sin cola; idioma rechazado inmutable; OFF/plazo/callback tardío; deduplicación solo contigua; borrado de floats; métricas sin texto |
| Kotlin regresión | **34/34**: 12 sesión ASR, 12 fases, 10 participación. Total **42**, cero fallos/errores en XML |
| Node conversación | **64/64** efectivos: detección, fases, lentes, UI móvil, UI y presencia; 63 pasaron en la primera ejecución, una expectativa antigua de `auto` se corrigió y las 8 de fases volvieron a pasar. Cubre prioridad/cesión, desconexión, deadline, apertura OFF y selección congelada |
| TypeScript app/pruebas y oxlint | Correctos |
| AAR | Regenerado desde la fuente modificada con JDK21 Microsoft / SDK existente |
| Webpack | Producción Android correcta; `package.json` runtime guardado/restaurado con hash idéntico |
| Android | `assembleRelease lintVitalRelease` offline, salida0; `compileReleaseKotlin`, DEX, assets y lint ejecutados |
| Artefacto final | Paquete/versión/certificado correctos; siete `.so` y runtime package idénticos a C1; bundle idéntico al generado; símbolos nuevos en DEX; `javap` del puente compilado confirma la llamada explícita con `WINDOWS` |

Entradas sintéticas y dobles de decoder **no miden precisión humana, identificación de hablante, alucinaciones de Whisper en ruido real, batería, Doze o comodidad física de lentes**. No se realizó captura por el agente ni se guardó conversación. No se repitieron las suites completas históricas ni baterías físicas.

## Artefactos y dispositivo

Versión `0.8.2-es.5-conversation.a2`, código805, `com.faceclaw.app`. Certificado original SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`; ambos archivos de firma originales comprobados antes de usar el helper. Nunca se generó otra clave.

| Archivo local | SHA256 |
|---|---|
| `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.a2.apk` | `14fd97e508ac3471a44a7400bad6b0a5a2c4ac2fcb1eaea3b8fb48082dacc618` |
| `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.a2-unsigned.apk` | `22db7840b20a572f1939534960bf646dcd3e627719c84a7d1e116d9b2d736cc2` |
| `native/kotlin/plugin/platforms/android/faceclaw-shared.aar` | `217a2498bd89367f3e3728642b0156523a6494c0aef30655cf8d1b995f1a4e4a` |

**Instalación pendiente al redactar:** Pixel conectado y autorizado, usuario confirma OFF. Comprobación actual de wakelocks sin Faceclaw experimental, pero pantalla bloqueada (`Keyguard showing=true`); se pidió desbloquear y dejar Faceclaw en OFF. No se instaló a ciegas ni se desbloqueó por el agente. Última instalada documentada C1. Falta respaldo fresco APK/preferencias y comparación posterior antes de declarar instalación. El respaldo C1/G3.4.2 histórico no se presenta como respaldo fresco A2.

Reversión preparada por artefacto: C1 firmada `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6`, conservando datos mediante `adb install -r`; se extraerá además la APK realmente presente antes de actualizar. Reversión de fuente: revertir `33234e7`, regenerar AAR/bundle/APK y firmar con la misma clave.

## Única comprobación humana pendiente

Tras instalar y comprobar OFF: pulsar **Iniciar conversación local**, esperar que indique escucha, conversar normalmente en castellano con otra persona durante unos **30 s**, sin botones de fases; dejar unos **7 s** para que aparezca el último texto y pulsar **OFF**. Solo se necesita saber si aparece texto útil de **la otra persona**, no copiar palabras privadas. No se asocia esa identidad a contadores automáticos ni se toma una pregunta propia como éxito del interlocutor.

Si sigue sin aparecer: tras confirmar OFF se consultan únicamente agregados `segmentation`, idioma efectivo, ventanas/cómputo/rechazos/drops y cierre. Si las ventanas llegan al decoder pero el interlocutor no se entiende, la siguiente incertidumbre es señal/acústica/modelo, no el perfil. Si no llegan, se investiga transporte/estado con esos datos. No se empieza otra prueba de múltiples fases, no se reenrola y no se activa Hermes como sustituto del texto útil.
