# Smart Turn para Conversación: candidato de integración

Issue Hermes `7c9c58dad7cd3805492f1e09230b38bfbdfe0e8e5f3e02e201b78e232ffec4b8`.
Base cliente `96e8eeef1eba8237e244fb65927271fb5ffad592`. Rama `feat/7c9c58da`.
**REVIEW OBLIGATORIA. Sin instalar ni activar servicios.**

El coordinador ofrece un tap síncrono del PCM nativo solo en Conversación manual. El cliente
Smart Turn usa otro WebSocket al mismo EVO configurado (18776), con la clave ASR existente y
sin guardar/retransmitir audio. La transcripción, atribución, activación y Parakeet conservan su recorrido.
Conversación no requiere nombrar a Hermes; no se añade una palabra de activación.

El servicio de `hermes-agent-proactive/preparacion-evo-x2/asr/smart-turn-g2` reutiliza `TurnEnd`
de `34f8ef5` con sus umbrales, solo prosodia en esta primera entrega. El veredicto acelera únicamente
la espera desde el último texto aceptado y debe corresponder al intervalo de audio de ese texto.
No elimina la latencia ASR ni el mínimo entre peticiones. Las preguntas mantienen su atajo anterior.

OFF del servicio EVO es el retorno persistente: la APK conserva los mismos 700/2000 ms si no
llega un veredicto válido, incluso con el selector local encendido. No se necesita reinstalar EVO.
El menú Voces ofrece además «Usar la espera habitual» para la siguiente sesión.
La telemetría añade `directPending` antes de consumirlo, modo/probabilidad y una observación posterior de actividad acústica; es un proxy,
no una etiqueta de corte semántico. El puente acepta la observación solo tras negociar su capacidad.
Base A: esta misma APK, servicio EVO apagado; B: servicio encendido. `off` incluye canal no disponible;
`fallback` indica canal listo sin veredicto válido. `directPending` separa las esperas aplicadas sin inferir
preguntas a partir de texto en el servidor. La prueba de canal realizada es solo loopback en un candidato
aislado del EVO, con modelos reales; no es una prueba en el Pixel ni contra el puente de producción.

Validado: `npm test` completo, 1381 correctas / 2 omitidas / 0 fallos; `tsc --noEmit` y `oxlint`
correctos (una advertencia previa de Builder de notificaciones). Bundle Android compilado con webpack.
Versión candidata `0.8.4-es.19-conversation.s2.28-smart-turn`/805. Pruebas cubren selector OFF,
fallback, preguntas a 700 ms, cadencia, huecos, timestamps, congestión, callbacks antiguos y envío
de la observación. Flujo físico pendiente de revisión e instalación.

## APK candidata verificada

`OUTBOX/HERMES_SMART_TURN_7C9C58DA/FACECLAW_S228_SMART_TURN.apk` en Buzz Nest,
141509934 bytes, SHA256 `ac2f8783fc48700987305c1a572f60c5d55d3a16b88edf9bc91c0cf64276dd86`.
`apksigner verify` verifica v2/v3 y certificado original
`57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`;
`aapt2 dump badging` verifica S2.28/código 805; `zipalign -c -P 16 4` correcto.
Los ocho `.so` coinciden por SHA256 con la APK extraída del Pixel; bundle incluye el canal y la telemetría.

Construcción: `ns prepare android --release --env.production --env.compileSnapshot=false`,
seguido de `gradlew.bat :app:assembleRelease :app:lintVitalRelease -Prelease -PfaceclawUnsigned
-x :app:prepareFaceclawLlama -x :app:prepareFaceclawNativeLibs -x :app:prepareFaceclawVad`.
El SDK del PC no tiene NDK/CMake: se copiaron del retorno verificado las cinco bibliotecas de esas
tareas a `platforms/android/app/src/main/jniLibs/arm64-v8a`, sin cambiar los nativos fuente.
Las otras tres proceden del runtime/dependencias y también coinciden. Kotlin/Java y metadatos release
sí se compilaron. Primer empaquetado falló por firma ausente; se usó el modo unsigned previsto
por el repo y firma posterior con archivo de contraseña, sin exponerlo. Se corrigió la selección
de variante de NativeScript con `-Prelease` tras un fallo de `buildMetadata`.
Log final: `.scratch/SMART_TURN_ANDROID_ASSEMBLE_RELEASE.log`, salida 0, `lintVitalRelease` correcto.

## Pixel y retorno

Comprobado el 03/11 desde el PC del trabajo con ADB: serial `61161FDCG0013L`, Pixel 10 Pro Fold.
Instalada `0.8.4-es.18-conversation.s2.27-imagenes-notificaciones`, código 805, actualización
02/11/2026 18:02:04. Su bundle contiene `HERMES_DIRECT_SETTLE_MS` exportado como `b=700`,
la rama `isQuestion || mentionsHermes` y `directPending` saltándose el mínimo de 5 s: acredita
el comportamiento de `040bbdb`, no la identidad completa del commit de compilación.

APK extraída con `pm path` + `adb pull` a
`C:/Users/Usuario/.buzz/OUTBOX/HERMES_SMART_TURN_7C9C58DA/PIXEL_BEFORE_20261103.apk`, 141829422 bytes,
SHA256 `b247d4975132a6a35b4cc1f3020b756b8096e667aa40e01d465adebe6411f6f1`.
La copia persistente tiene el mismo hash que la extracción temporal original en `.scratch`.
No se exportaron ajustes ni credenciales. El usuario puede desconectar mientras se revisa.

Antes de instalar: revisión del SHA por Claude, APK nueva firmada con el certificado original,
OFF comprobado, copia de retorno preservada y `adb install -r`, sin desinstalar ni borrar datos.
Cuando haga falta reconectar, un único aviso por Telegram del gateway Hermes si está `connected`
y mención en Buzz; sin cambiar token ni reiniciar/reemplazar el gateway. Ensayo normal de Dani después.
