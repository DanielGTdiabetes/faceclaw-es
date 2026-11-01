# Continuación para Terra tras revisión de Codex

Continúa el encargo. Codex ha leído tus tres commits y reproducido un fallo del
diagnóstico posterior a OFF. No des por cerrada ni instales aún esta corrección.
No sobrescribas cambios concurrentes ni repitas preparación que ya pasó.

## 1. Corregir el drenaje observable tras OFF

En `app/native/soniox-conversation.ts`, `lastLocalSnapshot` es una copia fija de
`local.snapshot()` tomada al parar. Si el decoder está ocupado, `busy/worker`
quedan true indefinidamente aunque el nativo termine después. Los contadores
finales que lleguen durante el drenaje también pueden quedar desactualizados.

Codex reprodujo esto usando tu harness: iniciar local, fijar `busy/worker=true`,
parar, cambiar el mock nativo a `busy/worker=false`, leer `snapshot()` otra vez.
El resultado sigue siendo true. Las nueve pruebas existentes del archivo pasan;
la nueva comprobación falla. Tu prueba actual solo comprueba la instantánea inicial.

Conserva los agregados de la última sesión, pero refresca el estado real del mismo
motor durante el drenaje sin aceptar PCM/turnos ni recuperar texto/audio. Protege
fronteras de sesión/cambio de motor; no mezcles una sesión nueva con la anterior.
Añade la prueba que avanza de ocupado a drenado y comprueba contadores finales,
OFF repetido, inicio nuevo y local→cloud. No marques drenado por temporizador.

## 2. Completar la evidencia del soporte medium

La extensión de `VoiceCaptureSessionTest` a tres nombres no comprueba el enum
real solicitado: el fake devuelve el mismo transcriber. Registra y afirma
`WHISPER_MEDIUM` en la carga, además del mapeo TS. Acredita también CPU/4 hilos
en la configuración efectiva del asistente mediante una prueba pertinente.

Revisa el coste añadido de `LocalWhisperModels.verified` en `findAsrModelDir`:
`hasTranscriberModel` lo invoca en cada sesión y la carga vuelve a invocarlo.
El hash completo de medium recorre unos 946 MB. Evita rehashes redundantes en
intervenciones calientes sin perder la verificación al cargar/reemplazar archivos;
documenta invalidación y prueba el comportamiento relevante. No atribuyas una
latencia medida a esta revisión de código: todavía no se ha medido su coste.

## 3. No cerrar la investigación NPU con una pantalla preflight

La app vacía demuestra compilación, no compatibilidad ni delegación. Documenta
con precisión que no hubo inferencia. El registro Tensor SDK bloquea esa vía
concreta; no demuestra por sí solo que la prueba TFLite con NNAPI legado requiera
el SDK ni que no pueda hacerse en el Pixel actual.

Investiga separadamente si existe un runtime público y un artefacto multilingüe
medium con procedencia/licencia/hashes verificables en los repositorios indicados.
No tenerlo descargado localmente es una tarea pendiente, no un bloqueo externo.
Si hay candidato, prepara la prueba CPU/delegado aislada y, cuando Luna libere el
Pixel, verifica el backend efectivo. Si no lo hay, registra qué artefactos/URLs
examinaste y cuál es el requisito concreto ausente. No aceptes condiciones ni
solicites registro. Tiny/encoder-only no acredita medium completo. No integres
el prototipo en producción ni prometas 16×.

## 4. Completar la candidata sin ocupar el Pixel

Puedes preparar versión nueva, pruebas, APK y firma original antes del relevo;
la reserva de Luna bloquea ADB/instalación, no esas tareas de PC. Comprueba la
disponibilidad de la firma sin imprimir secretos ni generar una sustituta.
Si falta, documenta ese bloqueo concreto. La extracción de respaldo actual,
comparación privada de ajustes e instalación se realizan después del relevo.

En la consulta de Codex el relevo sí existe y dice `state: busy`; la reserva es de
la tarea de Luna. No lo borres ni sustituyas. Recomprueba cuando corresponda,
sin polling continuo, y corrige la afirmación de archivo ausente si resulta
obsoleta. Mantén el protocolo de reserva original. El usuario ya autorizó
instalación después de las verificaciones; no hace falta otra confirmación.

Actualiza tu informe con la revisión, pruebas y límites reales. Commits separados,
sin push ni cambios ajenos; Codex hará la revisión final y publicación.
