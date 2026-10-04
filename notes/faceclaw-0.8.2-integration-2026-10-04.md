# Faceclaw 0.8.2 + G3.3 — actualización del 04-10-2026

**App instalada: `0.8.2-es.5-conversation.g3.3`, código805, firma original.** Actualización con `adb install -r`, sin desinstalar ni borrar datos. Los33ajustes exportados antes/después son idénticos; Hermes, bloqueo desactivado y GPS previamente confirmado se conservan. El perfil sigue en el móvil: comprobado visualmente «Mi perfil: guardado en este móvil» y «Conversación local · OFF». No se leyó/exportó el vector, registró otro perfil, descargó modelos ni activó captura o ensayos.

## Integración y alcance

- Base oficial [Faceclaw0.8.2](https://github.com/jimrandomh/faceclaw/releases/tag/0.8.2), tag `61ede9b2a07b2a1cbf85cb333e69fdd88c829173`, fusionada sobre G3.3 (`bf3a37a`) en `codex/faceclaw-0.8.2-conversation`. Conserva la historia y los cambios locales de castellano/valenciano, Hermes, ubicación y conversación.
- Incluye selector de apps configurable, barra inferior combinada/profundidad, batería Dense, velocidades de animación y correcciones oficiales de vista previa, terminal, música e incompatibilidad iOS.
- Conserva G3.3: texto ASR opcional con el perfil existente, espera de motores antes de capturar, error→OFF, motivo de cierre/plazo y drenaje de workers claros. Observados los controles nuevos en el Pixel desdeOFF; precisión y participación real siguen pendientes. Una candidata/alternancia provisional no acredita participación confirmada.
- Compatibilidad añadida al renombrar los ajustes de animación: el antiguo valorOFF se lee como velocidad `disabled`, sin sobrescribir los33ajustes. Un valor nuevo elegido explícitamente tiene prioridad.
- El usuario aclaró que actualizar/reinstalar la APK sí está autorizado y autorizó revisión oficial de firmware /36 si resulta necesaria. El anterior «no reinstalar» en el informe G3.3 fue una interpretación ya corregida, no una restricción vigente.

## Firmware

La app oficial0.8.2 requiere `Faceclaw/36`; introduce un cambio real del protocolo de dibujo. No se baja artificialmente el requisito. El patchset y el protocolo integrados son idénticos a los de la versión oficial, sin modificaciones propias de firmware. Tras desbloquear, observado el aviso: revisión35, baseL/R2.3.0.24, requisito36. El usuario desconectó el Pixel y realizó la actualización con el actualizador incluido en Faceclaw. Después confirmó: «Las gafas están actualizadas con el nuevo firmware y todo parece funcionar como antes». La actualización /36 requerida y el funcionamiento general quedan confirmados por el usuario; no son una lectura posterior de versión ni una batería física del agente. Este no flasheó/modificó firmware ni consultó el móvil durante el proceso. Último OFF observado anterior; comprobar OFF/conexión al retomar si se requiere UI.

## Verificación

- Node: 783pruebas ejecutadas,782correctas,1omitida,0fallos. Se excluyó el archivo `ios-config-scripts.test.cjs`, que depende de un shell POSIX no disponible en este Windows; no se acredita compilación iOS aquí.
- Kotlin host: 240correctas,0fallos. La prueba nueva de aviso de animación fallaba por inicialización fría del renderizador después de iniciar su reloj; se calcula el patrón de referencia antes de iniciar la animación, conservando las exigencias de primer frame intermedio, avisos sucesivos y último frame asentado. Suite completa correcta tras el ajuste.
- Ajustados mocks iOS a las nuevas interfaces `submenuItem`, `onPreviewAnimationFrame` y `file-access`; expectativas de versiones stock validadas y tiempos de animación actualizados. Dos pruebas nuevas cubren la migración de ajustes.
- TypeScript, oxlint con tipos, webpack producción, AAR Kotlin, APK Android offline y lintVital completados. NativeScript9.1.2 bloqueó `prepare` por la comprobación del emulador; se actualizaron los puentes Android generados desde App_Resources y se restauró el archivo de configuración runtime del APK anterior. Identificador/versión/código/certificado verificados en el artefacto final antes de instalar.
- Instalación `Success`;33ajustes privados idénticos y perfil/OFF observados después. No es un ensayo de reconocimiento, autonomía o transporte de audio.

## Artefactos

Certificado original SHA256: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

- Firmada: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.g3.3.apk`, SHA256 `dc0370bae67863a5a6b061f374b8186def0997544a93762c3c04039467dfaf05`.
- Sin firma: mismo nombre con `-unsigned.apk`, SHA256 `2408024684e8e19f48274e1653f3c12f0dddf47faa968e3c1aec9143bb1c3074`.
- Reversión fresca extraída del Pixel: `dist/conversation-g0/before-update-0.8.2-g3.2.apk`, SHA256 `bb4f5e5eea97bd9e27aee98f90c4f5ffd4ec0e6b1d5c204e76d003d9e831378c`.
- Los respaldos de ajustes contienen preferencias, no el perfil. El perfil nunca se copia al NAS ni se incluye en fuente/APKs.

Integración publicada en GitHub: `5cfe1af`, fusión con dos padres `bf3a37a`/`61ede9b`. La rama original `codex/conversation-detection-g0` se actualizó por fast-forward y está sincronizada; se conserva también la rama de integración. Copias NAS privadas en `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-g3.3/`: firmada/sin firma/reversión y fuente `faceclaw-0.8.2-g3.3-source-5cfe1af.zip` (SHA256 `a756a2e09c1fbce6fb10d27643b158d23b1960fbf80723efa70f04cd51f09acc`). Los cuatro hashes coinciden, carpeta700/archivos600. Informes/continuidad/LEEME/Obsidian compartidos, preservando su historial.

## Continuación

Actualización de firmware terminada según el usuario; retomar G3.3 desde el [prompt de continuidad](prompt-continuidad-g3.3-2026-10-04.md). No repetir el registro del perfil ni la evaluación inicial. La interfaz de conversación aún está en el móvil: falta una entrada propia y estado/texto en lentes. G4 solo ante errores concretos; G5 estabilidad/autonomía prolongadas pendientes; G6 requiere decisión posterior, sin conectar audio/texto experimental a Hermes.

Los huecos/pérdidas de audio históricos siguen abiertos (492ms/siete descartes; lectura posterior UI1046ms/21drops). Esperar la carga de motores corrige una pérdida inicial posible en código, no demuestra resolver esos incidentes. No cambiar modelos/umbrales por defecto ni iniciar nuevas baterías físicas.
