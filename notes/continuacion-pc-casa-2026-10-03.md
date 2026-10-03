# Continuación desde casa: captura conversacional G2

**Reanudada en casa (03-10-2026):** este punto de partida G0.1 ya se ha consumido parcialmente. Prevalece [conversation-detection-g0-results.md](conversation-detection-g0-results.md): G0.2 instalada, dependencia del bloqueo corregida, 33 ajustes actuales conservados, pantallas G2 apagadas y segundo plano comprobados. Quedan ambas pantallas apagadas/bloqueadas, ciclo completo de estuche/reconexión con G0.2 y OFF durante captura ajena. No repetir instalación ni las pruebas ya hechas. El móvil se está usando para otra prueba; esperar disponibilidad antes de acciones físicas. Este archivo sigue pendiente de la limpieza final indicada abajo, sin recrearlo como otra tarea.

Estado del **3 de octubre de 2026**, al cerrar la sesión del PC del trabajo. El usuario pidió continuar el desarrollo desde casa y guardar esta continuidad en GitHub y el NAS.

**CONTINUIDAD TEMPORAL, DE UN SOLO USO.** No tratar este archivo como una nueva tarea ni como el estado vigente después de completarse esta continuación. Por petición explícita del usuario, al completar el trabajo que se retoma en casa:

1. Traspasar los resultados y pendientes reales a `notes/conversation-detection-g0-results.md`, `notes/continuidad-entre-pcs.md` y sus copias vigentes del NAS.
2. Eliminar **este archivo** de la rama GitHub y del NAS (`/volume1/home/Dani/Faceclaw/continuacion-pc-casa-2026-10-03.md`). Publicar la eliminación en GitHub.
3. Retirar sus enlaces y cualquier indicación de continuación pendiente en `AGENTS.md`, la continuidad general, el informe y los resúmenes del NAS/Obsidian. Conservar solo el estado comprobado y los pendientes que sigan existiendo.
4. No borrar la firma, las APK, los ajustes privados, los resultados permanentes ni el historial Git. No recrear este documento fechado para otra sesión.

Mientras se usa, comprobar siempre el estado real de repositorio/móvil/NAS: esta nota es una instantánea, no una orden permanente de repetir pruebas o instalaciones.

## Punto de partida

- Repositorio: https://github.com/DanielGTdiabetes/faceclaw-es.
- Rama activa: **`codex/conversation-detection-g0`**. Seguir esta rama; no volver por defecto a `spanish-0.8.1` ni fusionar el prototipo en main/spanish.
- PC del trabajo: `D:\Proyectos\Faceclaw_spanish`. PC de casa documentado: `E:\projects\faceclaw-es`.
- Implementación compilada: commit `fd1410b`, basada en `spanish-0.8.1` y su corrección de ubicación. Los commits posteriores de esta sesión actualizan documentación, no el binario.
- Pixel 10 Pro Fold, ADB `61161FDCG0013L`: instalada **`0.8.1-es.5-conversation.g0.1`**, paquete `com.faceclaw.app`, código 805. Se instaló con `adb install -r`, sin desinstalar ni borrar datos.
- APK instalada firmada, SHA-256: `27f0da44aa476c1a05633e18273f7dc9346ca79786de5f4ddf4765fdfb59d0c7`.
- Los **32 ajustes** exportados antes/después son idénticos. Hermes sigue en **`100.65.212.74:8791`**; no cambiar proveedor, token, modelo, firmware ni ajustes multicanal.
- El ensayo terminó automáticamente al alcanzar el límite de dos minutos: 2.391 paquetes / 119,6 s PCM y cero wakelocks experimentales activos. El siguiente arranque comienza OFF; no persiste ON.

## Firma y archivos disponibles desde casa

NAS: **`Dani@100.64.237.87`** por Tailscale; LAN `192.168.0.110`. SSH puerto 22 comprobado con herramientas PuTTY desde el trabajo. El acceso con OpenSSH falló intermitentemente antes de autenticar; PuTTY finalmente permitió SSH/SCP. Cada PC requiere su propia autenticación. No guardar la contraseña de acceso en estas notas ni en Git.

| Archivo | Ruta en el NAS | Estado |
| --- | --- | --- |
| Clave original | `/volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks` | Copiada desde el trabajo; hash igual al original, permisos 600 |
| Contraseña de firma | `/volume1/home/Dani/Faceclaw/signing/store.password` | Copiada y verificada, permisos 600; nunca imprimir su contenido |
| APK G0 sin firma | `/volume1/home/Dani/Faceclaw/apk-builds/conversation-g0.1/faceclaw-g0-unsigned.apk` | Descargada y comprobada antes de firmar |
| APK previa original es.5 | `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-before-conversation-g0.apk` | Reversión histórica, ya documentada por casa |
| APK estable con ubicación, firmada | `/volume1/home/Dani/Faceclaw/apk-builds/11ed6ac/faceclaw-location-signed.apk` | Copiada y hash comprobado desde el trabajo |
| Continuidad general | `/volume1/home/Dani/Faceclaw/continuidad-entre-pcs.md` | Copia compartida |
| Informe técnico G0 | `/volume1/home/Dani/Faceclaw/conversation-detection-g0-results.md` | Pruebas y limitaciones |
| Esta continuación | `/volume1/home/Dani/Faceclaw/continuacion-pc-casa-2026-10-03.md` | Punto para retomar esta sesión |
| Nota Obsidian | `/volume1/Docker/obsidian/vault/Proyectos/Faceclaw.md` | Resumen actualizado, texto anterior conservado |

La carpeta de firma tiene permisos 700. Se comprobó que la APK nueva y la instalada anteriormente tienen el mismo certificado público SHA-256: **`57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`**, CN Faceclaw Espanol. No generar una clave alternativa. Antes de sobrescribir una firma local de casa, comprobar su identidad; si no existe, recuperar ambos archivos juntos del NAS.

Hash de la APK G0 sin firma: `bdd15382af3d3ffde1648b65d85edd7f2237fc942e8a0964dcb1f8c435dfa60a`. Hash de la APK estable con ubicación, firmada: `ae1ed7ed27cc3560fd0e68ed28acf5e2ee930198d40aa6fe524be1b33d0c34ff`.

En el trabajo hay copia privada inicial de APK y ajustes en `backups/update-20261003/`, y respaldo fresco anterior a G0 en `dist/conversation-g0/before-install-20261003-080901.apk` (es.5 con ubicación). Los registros e imágenes técnicos están en `.tools/`, excluidos de Git; no depender de que existan en casa. Los resultados relevantes están resumidos en el informe compartido.

## Pruebas reales realizadas

1. **Referencia OFF:** el usuario confirmó respuesta normal a través de Hey Even. Un mensaje inicial de control de voz parado desapareció; no se demostró su causa ni se cambió código por él.
2. **Captura ON:** el usuario leyó un texto de prueba; se observó flujo de 1.856 chunks / 92,8 s, sin pérdidas ni errores nativos. Los chunks suben también en silencio: G0 transporta audio, aún no hay VAD, ASR ni detección de participación. No se guardó audio ni se enviaron contenidos del ensayo al agente.
3. **Formato físico:** métricas nativas mostraron paquetes mínimo/máximo de **205 B**, PCM mono **16 kHz**, chunks **1.600 B / 800 muestras**. Sin paquetes malformed/stale, pérdidas/duplicados, errores de decodificación ni descartes en la instantánea leída.
4. **Hey Even con ON:** el usuario confirmó apertura/respuesta y regreso a `escuchando` tras cerrar el diálogo. Métricas finales: **2 inicios / 1 cesión**, 2.072 chunks; último tramo reanudado, 785 paquetes sin pérdidas ni errores. OFF retiró concesión, temporizador y buffers.
5. **PTT en Chat con ON:** repetición controlada confirmó respuesta y reanudación al cerrar Chat. Logs: 64 paquetes / 3,2 s de voz de Chat, sin errores; captura experimental nueva y creciendo después. Pantalla: `escuchando`, 1.332 chunks / 66,6 s, una cesión y hueco máximo UI 314 ms. El resumen final se perdió al pulsar ON/OFF varias veces; no inventar un cierre medido para ese tramo ni asumir ausencia de descartes de todo el ensayo.
6. **Pixel bloqueado:** usuario confirmó el bloqueo; `dumpsys power` mostró `Dozing` al inicio y final de una medida de 20 s. El mismo flujo pasó de **1.200 a 1.600 paquetes**, sin pérdidas/errores. Continuó hasta el límite de dos minutos (2.391 paquetes, 119,6 s, 2 tardíos, hueco nativo máximo 200 ms), y se observó el STOP y **cero wakelocks activos** `Faceclaw:ConversationG0`. Esto no valida Doze profundo ni autonomía; USB estaba conectado.

Una prueba de PTT anterior fue inconclusa porque se había pulsado OFF antes de comprobar la reanudación. En otra observación, el firmware informó OFF_HEAD mientras el usuario decía llevar las gafas puestas; no se reprodujo como fallo confirmado de Chat. **No quitar el requisito de presencia ni el tope temporal para hacer pasar pruebas.**

## Qué sigue pendiente

**G0/G1 aún no están completamente superadas.** Continuar pruebas breves y guiadas antes de añadir VAD:

- Pantallas G2 apagadas, y después ambas pantallas apagadas/bloqueadas, con confirmación física del usuario. Ya se probó el Pixel bloqueado, pero no se confirmó por separado el apagado físico de las G2.
- Salir de Faceclaw al segundo plano durante 20–40 s y volver; medir continuidad/estado y recursos.
- Retirada/desconexión y reconexión de gafas: suspensión y liberación, reporte nuevo de presencia y nueva concesión; no reutilizar estado viejo.
- OFF mientras otra captura normal está activa, verificando que no corta esa captura. Ya se probó OFF aislado.
- Contrastar recursos después de cada cierre. No medir autonomía con USB cargando ni confundir el historial de wakelocks con la lista activa.
- Si reaparece OFF_HEAD llevando las gafas puestas, aislarlo mediante eventos de presencia/conexión; no atribuirlo automáticamente a Chat.

El campo nativo `capturing=true` en la ventana de métricas tras OFF es la **última instantánea anterior al STOP**, según el diseño. El estado actual se contrasta con `enabled`, `resources` y wakelocks activos. La ventana de métricas pausa la captura porque es un modal: abrirla **después de OFF**, no mientras se pretende medir continuidad. Cada ON reinicia los contadores. El estado `escuchando` aparece en la parte inferior del móvil, encima del botón, solo con ON y PCM válido; no en las gafas.

## Requisito añadido por el usuario

El usuario es bilingüe **español/valenciano**, también alternando idiomas. Conservarlo como requisito para la etapa de transcripción/semántica. G0 captura audio sin depender del idioma, pero **el asistente actual sigue forzando `es`** en `AndroidSpeechEngines.kt`. Whisper enumera catalán como `ca`; eso no acredita precisión en valenciano ni cambios de idioma dentro de una frase. Evaluar frases monolingües y mixtas, conservando el idioma original, cuando toque ese incremento. No cambiar ahora el ASR ni dar el requisito por implementado.

Se mantiene la instrucción anterior: dejar pasar contenido incomprensible sin avisos repetidos ni interrumpir la conversación. No guardar audio, crear perfiles ni enviar el ensayo al agente por defecto.

## Cómo retomar en casa

1. Comprobar `git status` y conservar cualquier trabajo local. Obtener GitHub y cambiar a `codex/conversation-detection-g0`; actualizar con fast-forward. Leer `AGENTS.md`, esta nota, `notes/conversation-detection-g0-results.md` y `notes/asistente-hermes-jarvis.md`.
2. Comprobar estado real del móvil, USB, versión instalada, firma y conexión Hermes. La APK G0 ya está instalada; **no volver a instalar ni repetir la auditoría completa por defecto**.
3. Confirmar ensayo OFF. Guiar una sola prueba pendiente cada vez, iniciando por `escuchando` comprobado; respetar el límite de dos minutos y terminar con OFF.
4. Guardar solo métricas/evidencia técnica y registrar resultados reales. No declarar superadas todas las puertas por las pruebas ya realizadas.
5. Si se requiere otra APK, recuperar/verificar la firma original. `scripts/install-conversation-g0.ps1` valida específicamente g0.1; si cambia la versión, revisar su validación antes de usarlo. Conservar código 805 y firma para la reversión según el plan actual.
6. Actualizar GitHub y las copias del NAS después de la siguiente sesión. Cuando se complete esta continuación, ejecutar la limpieza temporal indicada al principio de este archivo.

Mensaje para iniciar en el PC de casa:

> Continúa el proyecto codex/conversation-detection-g0. Sincroniza esa rama sin descartar cambios locales y lee AGENTS.md y notes/continuacion-pc-casa-2026-10-03.md. La APK G0 ya está instalada y la firma original está respaldada en el NAS. Retoma las pruebas pendientes de G0/G1 con el ensayo OFF al empezar y al terminar; conserva Hermes y el requisito español/valenciano. No repitas la auditoría ni añadas VAD antes de superar las pruebas.
