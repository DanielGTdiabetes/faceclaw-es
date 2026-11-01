# R6: pausa EVO de 1.000 ms instalada — 01/11/2026

**NO ADOPTADA.** Dani decidió volver a R4 tras fallar las pausas y observar menos
respuestas en la segunda ronda. R4 completa restaurada a las 19:52:58 CET;
el experimento ca del EVO se conserva. [Recibo y motivo](retorno-r4-2026-11-01.md).
La PR #7 no se mergea. El resto de esta nota conserva la evidencia histórica de R6.

Código `1f7600d0fd787c1ed930ebac39cc82d32ef5ba1f`, sobre R5 `adffd69`, misma
rama `feat/ventana-pausa-evo-20261101` y PR #7. Dani aprobó 1.000 ms en
`057450992` y dio vía libre en `b32a4c76`. Claude aprobó código y APK en `9014bf2b`.

`EVO_IDENTITY.longPauseCloseMs` pasa de 700 a 1000. El test actualizado comprueba
que a los 950 ms no cierra y a los 1.000 ms sí. Se conservan el mínimo de 300 ms
de voz, la rama existente de cuatro segundos/400 ms y las demás políticas.
Una pausa humana que alcance exactamente un segundo sigue pudiendo partir la
pregunta: subir el margen no garantiza absorber cualquier pausa llamada «de 1 s».

Kotlin completo ejecutado por Codex sobre los cambios luego publicados en 1f7600d:
367 tests, cero fallos/errores/omitidos; Gradle AAR, assembleRelease y lintVital
con salida 0. Se usó el AAR del worktree y los adaptadores conservados de R5.
No se repitió Node: no cambia TS ni el bundle.

APK R6 SHA256:
`e8ee67b15052261e1ccfaee0c40393780ad4cebcdc3509d4644ae504ed0eb1e7`.
Frente a R5 solo cambia classes.dex; todas las entradas, los tres metadatos, las
11.525 clases y ocho bibliotecas nativas se conservan. Fuera de la cabecera DEX
solo cambian dos bytes contiguos: bc02→e803, 700→1000, offsets 3246076–3246077.
Firma original y alineación 16 KB comprobadas también por Claude.

Instalada con `adb install -r` en Pixel 61161FDCG0013L a las **19:25:03 CET**
(18:25:03 UTC), PID 10444. Hash extraído idéntico; 48 ajustes, versionCode 805,
versionName S2.25 y firstInstallTime 2026-10-02 09:39:05 conservados. OFF declarado
por Dani y cero wakelocks actuales de captura antes/después. No se inició escucha.
Postflight: 1.027 líneas de logcat del PID examinadas, cero patrones de error
fatal/JS/clase/método/enlace nativo detectados.

Recibo Buzz Nest: `RESEARCH/LATENCIA_R6_PIXEL_INSTALLED_20261101.json`.
Artefactos y recetas: `OUTBOX/FACECLAW_LATENCIA_R6_20261101/`.
Retorno completo R5: `RETORNO_LATENCIA_R5.apk`, SHA256
`cbee2ace3ad963dd91bc3b169284e33cba0d320ce686f3864ee0271b938f5b31`.
Es un enlace físico local a la APK R5 para no duplicar espacio; ambos nombres
apuntan al mismo contenido. Instalar completo con OFF/reposo y `adb install -r`.

Después se instaló por separado el experimento ca de Whisper corto en el EVO,
PR Hermes #11, código/configuración `1e88a36`. Solo se reinició Parakeet,
19:29:33 CET, PID 326377, G2_WHISPER_IDIOMA=ca y ready=true. R6 no cambia el
idioma del móvil ni el valor por defecto del código. Las frases largas siguen
en Parakeet; el experimento ca no les incorpora catalán.

Prueba física pendiente: Deepseek es el único que publica la batería
`OUTBOX/BATERIA_R6_CA_20261101.md` tras verificar ambos recibos. Claude coordina.
No publicar otra lista, repetir pruebas ni intervenir en el dispositivo cuando
Dani active Conversación. Aún no se acredita calidad bilingüe ni cortes corregidos.

El recibo R5 anterior fue comprobado por Claude en `b035993a`.
Las PR siguen sin merge. El registro Buzz de repositorio/issues continúa pendiente;
no se ha reintentado la acción previamente bloqueada.
