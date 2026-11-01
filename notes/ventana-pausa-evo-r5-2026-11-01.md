# Ventana EVO R5 instalada — 01/11/2026

Código `4f57ae3337a9ccba9ff08de0f125194e834b2279`, rama
`feat/ventana-pausa-evo-20261101`, sobre R4 `041620a1`.
PR [#7](https://github.com/DanielGTdiabetes/faceclaw-es/pull/7), dependiente de
[#6](https://github.com/DanielGTdiabetes/faceclaw-es/pull/6), sin merge.

## Comportamiento y revisión

Solo EVO remoto con identidad usa `longPauseCloseMs=700`. Con una ventana menor
de 4 s, una pausa de 700 ms permite cerrar si contiene al menos 300 ms de voz.
La rama existente de ventanas de al menos 4 s sigue cerrando a 400 ms de pausa;
el máximo de 12 s se conserva. La guarda de 300 ms solo afecta al cierre nuevo,
no impide que la rama antigua cierre un clic al llegar a 4 s.

Dani autorizó esta ventana en Buzz `35816b7a` y la instalación en OFF
(`30ddc659`). Deepseek aprobó el código en `4d8863c8`, con 367/367 pruebas Kotlin
en su ejecución completa; el fallo StockFlowsTest de la ejecución anterior de
Claude no apareció en esa corrida. Codex no repitió esas pruebas. No cambió TS
respecto a R4: se conserva la suite Node de R4, 1362 pasan y una omitida.

Claude aprobó el artefacto final en `94e21333` antes de instalar, comprobando
certificado, alineación, clases y contenido del ZIP. Ninguno aprobó su propio
cambio: Deepseek revisó el código de Claude y Claude revisó el artefacto de Codex.

## Build y conservación de la base

El bloqueo de NativeScript CLI se resolvió ejecutando Gradle directamente con
ANDROID_HOME/ANDROID_SDK_ROOT en el SDK local y Java 21. `assembleRelease`
y lintVital terminaron con salida 0. Se usó un init script que deja el paquete
sin firma; después se alineó a 16 KB y firmó mediante apksigner con la firma
original, leyendo la contraseña desde archivo sin imprimirla.

Gradle consumió `native/kotlin/plugin/platforms/android/faceclaw-shared.aar`
de este worktree, no el enlace de node_modules al clon E:. AAR SHA256
`bab441f07914b35e031e8b64d8ce8393def1751134cd50859646f935cacd7320`.

La primera generación de DEX sustituía 35 adaptadores `com/tns/gen/...vendor*`
con nombres que dependían del offset del JS. Se conservaron también los 35
originales desde el árbol generado de E:, después de comprobar que cada fuente
era idéntica a su nueva pareja salvo el nombre de clase. La reconstrucción final
usó los adaptadores ya generados y conservados (`-x runSbg`). El DEX final contiene
11.525 clases frente a 11.490 de R4; ninguna clase de R4 desaparece.

La APK se empaquetó sobre R4 manteniendo todas las bibliotecas nativas y assets/app.
Cambian exactamente los dos DEX y tres `assets/metadata/tree*Stream.dat` generados
para esos DEX. Manifiesto y resources.arsc son idénticos. El marcador
`longPauseCloseMs` está en el DEX instalado. Las ocho bibliotecas `.so` son
idénticas; no se usan las dos bibliotecas que Gradle recompiló con hashes nuevos.

Durante el empaquetado se corrigió el uso mutable de ZipInfo en el script de
ensamblado. Después se agotó el espacio; se liberaron solo el APK temporal fallido,
la copia parcial del retorno y los objetos C++ generados en este build. El ZIP final,
la firma y la alineación se comprobaron después de esas recuperaciones.

Recibo detallado y scripts/logs reproducibles en Buzz Nest:
`OUTBOX/FACECLAW_LATENCIA_R5_20261101/BUILD_RECEIPT.json` y `repro/`.
No contienen claves, ajustes privados, audio ni perfiles.

## Instalación y postflight

Pixel `61161FDCG0013L`, `adb install -r` → Success.
Actualización **19:04:08 CET / 18:04:08 UTC**. Código 805 y versionName de S2.25
se conservan; identificar por hash:

- APK R5 firmada y extraída idénticas:
  `cbee2ace3ad963dd91bc3b169284e33cba0d320ce686f3864ee0271b938f5b31`.
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- 48 ajustes antes y después idénticos; copias privadas locales protegidas.
- `firstInstallTime` conservado: 2026-10-02 09:39:05.
- PID inicial 5982; 983 líneas de logcat examinadas, cero coincidencias de errores
  JS/fatales, ClassNotFound, NoSuchMethod o UnsatisfiedLink; una conexión al puente.
- UI tras arrancar: Conectado. OFF declarado por Dani y cero wakelocks actuales
  de captura antes y después. No se leyó el interruptor OFF en UI.
- No se iniciaron captura ni inferencias por el agente; ningún servicio del EVO
  fue modificado ni reiniciado durante esta entrega.

Recibos en Buzz Nest: `RESEARCH/LATENCIA_R5_PIXEL_INSTALLED_20261101.json`
y `RESEARCH/LATENCIA_R5_BUILD_20261101.json`.

## Retorno y validación pendiente

Retorno completo R4:
`OUTBOX/FACECLAW_LATENCIA_R5_20261101/RETORNO_LATENCIA_R4.apk`, SHA256
`f3e5b11bbf1f7774d13ecb030631e6b86da6e1fc03d8756ee68b6a9828163e57`.
En una OFF vigente, instalar con `adb install -r` y comprobar hash, ajustes y
arranque. No mezclar DEX y metadatos ni desinstalar/borrar datos.

Dani inició prueba a las 19:07:14 CET. No intervenir en el dispositivo mientras
la realiza. Se publicaron tres baterías a la vez: la propuesta de siete de Codex
queda retirada; Claude centraliza la serie única en el hilo. No pedir repeticiones
por esa duplicación.

Pendiente: comparación de Deepseek con R4, especialmente `silenceClosures`,
`maxWindowMs`, etiquetas portador/otro/desconocido y latencia con marcas válidas.
Las pausas de duda de 700 ms pueden partir preguntas y las frases cortas dar
menos audio a la identidad. No hay ahorro de latencia ni precisión física
acreditados por este build. El DEX se recompiló con una toolchain distinta de la
del S2.25 original; no se ha comparado todo el bytecode.

El issue/PR en Buzz siguen pendientes del registro del repositorio previamente
bloqueado por revisión automática. No se reintentó ese registro ni se hizo merge.
