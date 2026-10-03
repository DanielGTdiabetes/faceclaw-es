# Prototipo conversacional G2: resultados y continuación desde el trabajo

Fecha: **03-10-2026**, Europe/Madrid. Proyecto `E:\projects\faceclaw-es`, repositorio [DanielGTdiabetes/faceclaw-es](https://github.com/DanielGTdiabetes/faceclaw-es), rama **`codex/conversation-detection-g0`**, base `5c5e6e60d39c7603a47ea8c52006d5e97331a259` de `spanish-0.8.1`.

**Estado para continuar:** implementación G0/G1 y compilación Android terminadas; **instalación y pruebas físicas NO realizadas** por falta de la firma original en este PC y el NAS. G0/G1 no están superadas. No avanzar a G2/VAD hasta probar audio, Hey Even, apagado y ciclo de vida en las gafas. El usuario se traslada al PC del trabajo, donde afirma que están los archivos de firma; comprobarlos allí. La petición vigente ya autoriza compilar, instalar con la identidad original conservando datos y realizar ensayos breves guiados. No repetir la auditoría completa ni pedir de nuevo esa autorización.

## Lo implementado

- Versión Android **`0.8.1-es.5-conversation.g0.1`**, `com.faceclaw.app`, **versionCode 805**. Se mantiene 805 deliberadamente para poder volver a la APK anterior con la misma firma mediante `adb install -r`.
- Control visible en la pantalla principal del teléfono. ON inicia un ensayo de **máximo 120 s**, incluyendo tiempo suspendido; OFF es el estado inicial y tras reiniciar el proceso. No se persiste una preferencia que reinicie la escucha al arrancar. Tocar el texto del estado muestra únicamente métricas técnicas.
- Estados **desactivado, escuchando, suspendido, error**. «Escuchando» solo aparece tras un chunk PCM válido; no significa VAD ni conversación detectada. Sin flujo durante más de 2 s, error enclavado y liberación, sin bucle de reinicios. Reintento mediante OFF/ON.
- Ruta mono existente: BLE → `VoiceCaptureSession` → decoder LC3 de Faceclaw. Contrato de código: paquetes de **205 B**, cinco frames de **10 ms / 40 B**, PCM **mono 16 kHz S16LE, 800 muestras / 1600 B / 50 ms**. El formato recibido físicamente **todavía no se ha observado con esta APK**. Las métricas nativas permiten contrastar tamaños mínimos/máximos recibidos, errores, muestras, pérdidas y huecos.
- Concesión experimental exclusiva de prioridad baja. Hey Even se cede antes de la barrera de despertar; PTT/STT, modales, teclado, turnos y overlay del asistente, apps raw y Micrófonos tienen prioridad. Se retira el consumidor experimental antes de detener su captura. Una liberación obsoleta no puede detener una captura nueva/ajena. Los consumidores raw normales tienen propietarios separados y se libera la captura al retirar el último.
- PCM y estados experimentales usan canales distintos de los del asistente: los callbacks tardíos de STT no llegan al detector. Se invalidan épocas al parar, ceder o perder disponibilidad. Se exige conectado, firmware compatible, worn nuevo positivo, fuera de carga y permiso ya concedido; no se usa el micrófono del teléfono como sustituto.
- Cola experimental nativa: máximo cinco paquetes; descarta paquetes de más de 250 ms. Entrega al main: un chunk pendiente reemplazable, descarte a los 250 ms, borrado de su buffer al liberar y cierre del decoder/cola al finalizar. El coordinator no retiene PCM. No se añade modelo ni trabajo de inferencia.
- El detector retiene la **sesión interna del protocolo** mientras prepara/captura, pero no enciende ni desblankea pantallas. Wakelock parcial propio con caducidad de 125 s, retirado por STOP. No se cambian ajustes de suspensión, optimización, firmware ni configuración multicanal. **Esto es implementación, no prueba de funcionamiento bloqueado/Doze ni autonomía.**
- Procesamiento local, sin ASR, grabaciones, transcripciones, perfiles, red ni envío al agente desde el detector. Solo contadores técnicos en RAM (chunks, duración, bytes, RMS/clipping, huecos, inicios/cesiones y diagnósticos nativos); la última instantánea nativa se obtiene antes de liberar. Los ajustes/ruta de voz del asistente normal conservan su comportamiento propio.
- Se corrigió la invocación de clang para compilar liblc3 en Windows: `clang.exe --target=aarch64-linux-android24`, equivalente al wrapper de otros sistemas.

**Requisito añadido por el usuario:** si una palabra, frase o pregunta no se entiende, dejarla pasar sin avisos repetidos ni interrumpir la conversación. El prototipo no entiende palabras y no produce alertas por incomprensión. Sus fallos técnicos se muestran en el teléfono sin popups automáticos. El incremento semántico futuro deberá abstenerse silenciosamente ante contenido incomprensible; no cambiar el asistente actual para simular esa función.

## Evidencia de software y dispositivo

| Comprobación realizada | Resultado |
| --- | --- |
| `npx tsc --noEmit` | Correcto |
| oxlint con `--type-aware` en todos los archivos TypeScript modificados | Correcto |
| Suite Node adecuada a Windows, excluyendo únicamente `ios-config-scripts.test.cjs` | **711 pasan, 1 omitida, 0 fallos** (712 casos) |
| `npm test` completo antes de la última actualización del fixture de shell | 711 pasan, 1 omitida, 1 fallo ajeno: test POSIX de configuración iOS en Windows (`PermissionError` al reemplazar un temporal abierto; además requiere chmod 600). No se modificó ese componente |
| Pruebas específicas de detector, prioridad, finalización y sesiones | 50 pasaron; la suite posterior incluye también la integración de shell |
| Kotlin `testAndroidHostTest` sobre fuentes de producción | **209 pasan, 0 fallos/errores/omitidas** |
| NativeScript prepare release y Gradle Android assembleRelease unsigned | Correctos, incluyendo nativo Kotlin, JNI, DEX, metadata y lint vital |
| Manifest de APK nueva | Paquete/versiones anteriores, minSdk 24, target/compile 35, arm64-v8a |
| Pixel por USB | Pixel 10 Pro Fold, serie `61161FDCG0013L`, sigue instalado `0.8.1-es.5`, código 805 |
| Respaldo extraído de la APK realmente instalada | SHA-256 coincide con el respaldo histórico y firma original comprobada con apksigner |
| Firma local / carpeta NAS de firma | `.tools/signing` no existe en casa; carpeta NAS vacía al comprobarla de nuevo |
| Script seguro de firma/instalación, sin claves | Rechaza por ausencia de ambos archivos originales antes de crear carpetas o tocar el dispositivo |

Tests relevantes: OFF sin recursos, formato PCM inválido, watchdog sin primer PCM/con flujo, error enclavado, reintento explícito, desconexión/unwear, preparación BLE tardía tras OFF/reconexión, cesión y callbacks tardíos, límite de 2 minutos, propietarios raw compartidos, STOP obsoleto, PTT y prioridad de sesiones hasta respuesta/cancel/error. Kotlin verifica canal PCM experimental separado sin transcripción/recording, framing y buffer/dispatcher acotado con entrega lenta, antigüedad y borrado. Fixtures sintéticos: **no acreditan acústica, firmware/wakeword, batería ni latencias físicas**.

No se ha modificado la APK instalada, los datos/ajustes del Pixel, Hermes, servidores, proveedor, firmware ni proyectos G2 Companion/G1/Rokid. Se conservaron y se publican las notas locales previas de continuidad, Hermes y auditoría.

## Archivos compartidos en el NAS

NAS por LAN **`192.168.0.110`** y, desde el exterior/PC del trabajo, por Tailscale **`100.64.237.87`**, SSH/SCP **`Dani`**. Los comandos siguientes usan Tailscale según indicación del usuario; el PC del trabajo debe estar conectado a la tailnet. Ambas direcciones corresponden al mismo NAS y a las mismas rutas. Raíz privada ya existente **`/volume1/home/Dani/Faceclaw/`** (700). No usar Obsidian, GitHub o carpetas públicas para la firma ni ajustes secretos.

| Archivo | Ruta NAS / ruta local |
| --- | --- |
| Clave original | `/volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks` → `.tools/signing/faceclaw-es.jks` en cada PC |
| Contraseña de esa clave | `/volume1/home/Dani/Faceclaw/signing/store.password` → `.tools/signing/store.password` en cada PC |
| APK nueva **sin firma** | `/volume1/home/Dani/Faceclaw/apk-builds/conversation-g0.1/faceclaw-g0-unsigned.apk`; local `dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g0.1-unsigned.apk` |
| APK anterior firmada, reversión | `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-before-conversation-g0.apk`; local `dist/conversation-g0/faceclaw-before-g0.apk` |
| Informe de continuación | `/volume1/home/Dani/Faceclaw/conversation-detection-g0-results.md` |
| Guía de continuidad | `/volume1/home/Dani/Faceclaw/continuidad-entre-pcs.md`; Git `notes/continuidad-entre-pcs.md` |

**Desde el PC del trabajo**, en la raíz de su checkout, comprobar los dos originales y copiarlos juntos a la carpeta que ya se creó:

```powershell
Test-Path .tools/signing/faceclaw-es.jks
Test-Path .tools/signing/store.password
# Ambos deben devolver True. No ejecutar sign-spanish.ps1 si falta alguno.
scp .tools/signing/faceclaw-es.jks .tools/signing/store.password Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/signing/
ssh Dani@100.64.237.87 'chmod 700 /volume1/home/Dani/Faceclaw/signing; chmod 600 /volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks /volume1/home/Dani/Faceclaw/signing/store.password; ls -l /volume1/home/Dani/Faceclaw/signing/'
```

Si el PC del trabajo no tiene acceso SSH, File Station permite depositar los dos archivos en esa misma carpeta privada; verificar propietario y permisos. No sobrescribir una clave existente distinta sin comparar su certificado. No imprimir/leernos el contenido de la contraseña ni la clave. La presencia de archivos no prueba su identidad: comprobar el certificado de la APK firmada antes de instalar. Después actualizar el estado de estas notas y su copia NAS a «firma copiada y verificada» con la evidencia correspondiente.

**Para recuperar en otro PC sin firma local existente**, en su checkout:

```powershell
New-Item -ItemType Directory -Force .tools/signing | Out-Null
scp Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks .tools/signing/
scp Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/signing/store.password .tools/signing/
```

La firma privada queda fuera de Git mediante `.gitignore`. Cada PC requiere acceso de red y autenticación propia al NAS; no asumir la del PC de casa.

## Continuar en el PC del trabajo

1. Leer AGENTS.md, este informe y las notas de continuidad/Hermes. Comprobar `git status` y conservar sus cambios locales antes de cambiar de rama. Con árbol limpio: `git fetch origin`, `git switch --track origin/codex/conversation-detection-g0` (si no existe localmente), o `git switch codex/conversation-detection-g0` y `git pull --ff-only` si ya existe. No mezclar/resetear cambios del trabajo ni volver por defecto a spanish para este incremento.
2. Comprobar originales de firma y respaldarlos en el NAS como arriba. **La identidad esperada pública** es SHA-256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`, CN Faceclaw Espanol.
3. Descargar la APK sin firma y la reversión. No hace falta recompilar para probar el mismo artefacto:

```powershell
New-Item -ItemType Directory -Force dist/conversation-g0 | Out-Null
scp Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/apk-builds/conversation-g0.1/faceclaw-g0-unsigned.apk dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g0.1-unsigned.apk
scp Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-before-conversation-g0.apk dist/conversation-g0/faceclaw-before-g0.apk
Get-FileHash dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g0.1-unsigned.apk
Get-FileHash dist/conversation-g0/faceclaw-before-g0.apk
```

4. Firma/instalación segura: `scripts/install-conversation-g0.ps1` nunca genera una clave, valida paquete/versión, comprueba la huella, extrae un respaldo fresco del teléfono y usa únicamente instalación de actualización. Sin `-Install` solo firma. Con el Pixel conectado y autorizado:

```powershell
powershell -NoProfile -File scripts/install-conversation-g0.ps1 -InputApk dist/conversation-g0/faceclaw-0.8.1-es.5-conversation.g0.1-unsigned.apk -Install -Serial 61161FDCG0013L
```

Usar `-AndroidSdk <ruta-sdk>` y `-JavaDirectory <ruta-jdk-21>` si ANDROID_HOME/JAVA_HOME no están configurados. En el PC del trabajo podrían estar dentro de `.tools`; comprobar rutas. No desinstalar ni usar `pm clear`, firma de debug u otra clave si la actualización falla. Verificar APK instalada y que los ajustes/conexión Hermes sigan iguales sin exportar secretos. El script completo con firma no pudo ensayarse aquí: confirmar salida de apksigner y de ADB allí.

5. Si se recompila: JDK 21, SDK/build-tools 35, NDK 27.2.12479018 y CMake 3.22.1. `npx nativescript@9.1.2 prepare android --release`; después `platforms/android/gradlew.bat -p platforms/android assembleRelease -Prelease -PfaceclawUnsigned "-Dorg.gradle.jvmargs=-Xmx4g" --console=plain`. APK en `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk`. No ejecutar un helper antiguo que pueda generar claves. Repetir comprobaciones si cambia el código/artefacto.

## Pruebas físicas: todas pendientes, con usuario presente

No pedir ponerse las gafas hasta que la APK esté instalada y arranque correctamente. Ensayos iniciales de 20–40 s, separados; ON tiene tope de dos minutos. Guiar cada acción y esperar la confirmación del usuario. No contar una prueba física como realizada por el mero hecho de ejecutar ADB.

| Ensayo | Acción guiada y evidencia pendiente |
| --- | --- |
| Referencia OFF | Ponerse G2 y confirmar conexión/firmware en UI; detector desactivado. Decir Hey Even y una pregunta inocua; respuesta normal. PTT y respuesta. Registrar éxitos, tiempos técnicos, batería/CPU/memoria de referencia, sin contenido |
| Captura ON | Tocar Activar ensayo local; esperar «escuchando» y crecimiento de chunks. Contrastar paquetes observados 205 B y PCM1600 B; muestras/tiempo y errores. Sin guardar audio |
| Hey Even durante ON | Pronunciar y confirmar evento/diálogo/respuesta; ver suspendido mientras interacción activa; cerrar overlay y comprobar vuelta con una nueva concesión y PCM nuevo. Comparar con OFF; si el evento del firmware desaparece, parar y no avanzar a VAD |
| PTT durante ON | Mantener, esperar escuchando del asistente, hablar, soltar; respuesta y cierre. Detector cede y vuelve. OFF del detector durante el PTT no debe cortar audio del asistente |
| OFF y recursos | Desactivar durante captura; estado OFF sin nueva entrega y timer/lease del coordinator false. Comprobar captura/worker/decoder propios detenidos, ausencia del wakelock `Faceclaw:ConversationG0` en `dumpsys power`, y recursos estabilizados; sin apagar audio ajeno. Los diagnósticos del último tramo son una instantánea anterior al STOP |
| Pantallas apagadas | Apagar G2 por gesto normal y bloquear Pixel por separado y juntos, confirmar físicamente. Audio continúa y contadores crecen o aparece suspensión/error explícito. No encender pantallas ni cambiar optimización para maquillar el resultado; distinguir efecto de consultar la UI para leer después |
| Segundo plano | Salir de Faceclaw normalmente y volver tras 20–40 s; comprobar continuidad/estado, gaps y recursos. No matar servicios de Hermes ni otros proyectos |
| Desconexión/reconexión | Usuario pone gafas en estuche/retira o corta/reanuda conexión de forma acordada. Suspender sin buffers/audio, pedir worn nuevo al volver y nueva concesión si sigue ON. No prometer continuidad hasta observarla |
| Fin | Desactivar y comprobar OFF, sin concesión/timer/wakelock propios. Registrar resultado observado, versión APK/CFW de ambas patillas, duraciones, contadores y limitaciones |

No se han hecho ensayos de silencio/voz propia/interlocutor/TV: corresponden a G2/VAD, condicionado a que G0/G1 pasen. USB cargando no sirve para medir autonomía. No reconocer persistente la voz, crear perfiles o enviar contexto semántico en este incremento. Cualquier voz/candidato posterior será provisional; voz presente no demuestra participación.

Hermes queda en `100.65.212.74:8791`, proveedor externo existente, token conservado. No cambiar servidor, proveedor, firmware ni ajustes multicanal. G2 Companion y G1/Rokid quedan fuera.

## Reversión

Primero OFF; el detector no persiste ON. Comprobar que no detiene el consumidor normal activo. Si se necesita volver a la APK anterior, usar la copia firmada original y la misma identidad:

```powershell
adb -s 61161FDCG0013L install -r dist/conversation-g0/faceclaw-before-g0.apk
```

Ambas usan código 805; no es necesario `-d`. No desinstalar ni borrar datos. El prototipo no introduce tablas ni perfiles nuevos. La APK anterior es `0.8.1-es.5`, SHA-256 **`13a50b420c57d7fb790ca7b35e3fa45dd78522d9b1457173d1e9f6918cf9c2f0`**. Verificar su firma con apksigner antes de la vuelta y confirmar después ajustes/Hermes.

## Artefacto y publicación

La APK sin firma y la de reversión se respaldan en las rutas NAS anteriores con permisos 600. La firma todavía no se ha copiado: esa acción corresponde al PC del trabajo. El código, README y notas de continuidad se publican en la rama GitHub indicada, conservando los cambios locales previos de documentación. No se fusiona main/spanish ni se publican secretos/APK en Git.

SHA-256 de APK sin firma, compilación final: **`bdd15382af3d3ffde1648b65d85edd7f2237fc942e8a0964dcb1f8c435dfa60a`**. Si se recompila, documentar el nuevo hash y repetir la validación; mismo nombre/versión no garantiza mismo binario.
