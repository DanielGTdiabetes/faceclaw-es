# Revisión Codex de S2.6.12 · 09-10-2026

Revisadas las correcciones `a85b04a` y el informe `342154c` de Claude. Los seis archivos
Kotlin integrados coinciden con esa corrección. `coveredAudioMs` excluye fallos e
invalidaciones; `attemptedAudioMs` conserva los intentos. El banco recoge el anillo
incrementalmente y retiene como nulas las métricas incompletas. No aparecen nuevos
bloqueos en este incremento.

La mejora de velocidad aplica a **Whisper base**, de uno a cuatro hilos. Small y medium
siguen a cuatro. No se han cambiado modelos, filtros de idioma ni ventanas de producción;
coalescencia, XNNPACK y padding experimental siguen fuera del recorrido de la app.
Las mediciones anteriores no prueban precisión con una persona a dos metros.

## Instalación contrastada sin acceder al móvil

La APK entregada y la copia extraída tras la instalación tienen SHA-256
`2cd955b1896ffebc61b8d108c9458e8956ff5f4b309fb0846e789e0d825cd6c4`.
Firma original `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`
verificada de nuevo con apksigner; alineación de 16 KB correcta. Los archivos privados
de ajustes anteriores y posteriores tienen el mismo hash. La evidencia de instalación,
OFF, reversión y límites está en el [informe de Claude](whisper-s2.6.12-instalacion-2026-10-09.md).
Esta revisión no reinstala, no inicia captura y no consulta el estado actual del Pixel.

## Correcciones de la revisión

- El instalador tolera el progreso por stderr de `adb pull` en Windows PowerShell 5.1;
  exige salida cero, respaldo no vacío y después la firma original antes de instalar.
  Restaura `ErrorActionPreference` incluso si falla. Tres simulaciones reales de un
  ejecutable prueban éxito con stderr, salida distinta de cero y copia vacía.
- La prueba del despliegue de memoria usa `6395abd` como fuente histórica de reversión,
  en lugar de HEAD, para seguir funcionando después de publicar el candidato.

Estas dos correcciones son de herramientas/pruebas, no cambian la APK instalada.

## Verificación independiente

- Kotlin de transcripción/acondicionamiento/Whisper: **56/56**.
- Banco Android: **6/6**; resumen Python: **4/4**; vectores métricos: **15/15**.
- TypeScript de pruebas y **34/34** comprobaciones Node afectadas.
- Hermes: **60 pruebas sin fallos, dos omitidas** por exigir las fuentes históricas de
  Jarvis; protocolo standalone correcto. Proveedores sintéticos y transporte loopback.
- Despliegue/reversión de memoria: **6/6**. Respaldo PowerShell 5.1: **3/3**.

El Python global carecía de websockets; la verificación de transporte usa websockets
15.0.1 en `.tools/hermes-review-deps`, sin cambiar producción. La ejecución restringida
que quedó bloqueada se detuvo y se repitió fuera de esa restricción.
No se repitió la suite Kotlin completa: el fallo de reloj de animación ya reproducido
en la base sigue documentado en el informe. Build/lintVital son los realizados por Claude.

## Fuentes para GitHub

La rama `codex/conversation-detection-g0` reúne S2.6.11 (memoria diaria previamente
instalada/desplegada) y S2.6.12, junto con las correcciones de herramientas y esta revisión.
El banco reproducible, corpus público, resultados e informe permanecen en
`claude/whisper-perf-bench-2026-10-09` (`342154c`), para conservar su historial separado.
Publicación autorizada expresamente por el usuario; no incluye APK, ajustes privados,
credenciales, audio, modelos ni bases de memoria. La nota de investigación de Gemini Nano
queda fuera de este incremento. No hay copia NAS nueva.
