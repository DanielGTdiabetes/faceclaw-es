# Continuidad para Claude: Whisper medium, Pixel y candidata S2.6.13

Retoma el trabajo de Faceclaw donde lo deja Codex por cuota. El usuario te
encarga continuarlo, resolver lo pendiente, instalar la actualización necesaria
y dejar cambios públicos en GitHub. No te limites a proponer pasos. Trabaja por
etapas y distingue soporte de medium, diagnóstico y aceleración demostrada.
No solicites confirmaciones repetidas para acciones ya autorizadas aquí.

## Objetivo y autorizaciones vigentes

El usuario quiere que Faceclaw reconozca a la otra persona a unos dos metros,
estudiar cómo acelerar **Whisper medium en Pixel 10 Pro Fold/Tensor G5** y poder
elegir medium en el asistente «ey Even». Medium funcionó bien subjetivamente
con TV a dos metros, aunque lento; esto no valida una conversación humana.

Ya autorizó: «que lo instale y luego revisas» y después «actualiza github con
los cambios si no se ha hecho ya». Puedes preparar, firmar e instalar una
actualización necesaria con firma original, respaldo fresco y `adb install -r`,
conservando datos. Publicación de código/resultados públicos también autorizada.
No desinstales Faceclaw ni borres datos, no generes otra firma, no cambies Hermes,
memoria, perfil, firmware ni reloj, no inicies conversaciones/grabaciones privadas.
Los benchmarks usan solo corpus público/sintético. No contratar GPU ni trasladar
STT al BMAX; no solicitar registro Tensor SDK ni aceptar condiciones por el usuario.

## Lecturas y estado de los checkouts

Consulta `C:\Users\danie\.codex\memories\faceclaw.md`, `AGENTS.md` aplicables y
`E:\projects\faceclaw-es\notes\continuidad-entre-pcs.md`. La cabecera de memoria
es antigua; las entradas recientes del repositorio y el estado comprobado prevalecen.
La memoria/continuidad indican firma original y copia NAS; no imprimas secretos.

Principal: `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`.
HEAD observado al preparar este relevo:
`54c3781da5b5936791bd7b189ebca3c029b160a6`.
Base publicada y revisada antes de Terra: `72816632f7ec9dc8c510b080fa73a1ccbbf6739f`.

Commits de Terra, todos locales según la entrega, sin push ni instalación:

- `e5d361b`: medium en selector/mapeo/asistente.
- `2fd320a`: primera retención de diagnóstico OFF (tenía un fallo, corregido después).
- `09564de`: primera investigación NPU/preflight, superada por la siguiente.
- `1e4c785`: refresco del diagnóstico durante drenaje real tras OFF.
- `db91a21`: pruebas del enum medium/4 hilos y caché de verificación de archivos.
- `b90c235`: preparación de candidata Android S2.6.13 y cambios de empaquetado.
- `54c3781`: investigación LiteRT corregida, candidata pública y límites.

Banco de Luna: `E:\projects\faceclaw-es-whisper-bench`, rama
`claude/whisper-perf-bench-2026-10-09`; referencia inicial publicada
`342154c74a66d077e0a6961001a99094b5ddb159`. Comprueba HEAD/estado actuales.
No mezcles su antigua base `6395abd` ni su APK de producción con el principal:
se perderían S2.6.11/memoria diaria y posteriores.

Lee estos documentos del principal:

- `notes/prueba-medium-tv-2026-10-09.md`.
- `notes/revision-codex-whisper-s2.6.12-2026-10-09.md`.
- `notes/resultado-terra-medium-pixel-2026-10-09.md`.
- `notes/prompt-terra-revision-medium-2026-10-09.md`.
- `evaluations/whisper-medium-npu/README.md`.

El informe de Terra conserva frases obsoletas «correcciones sin commit» y
«pendientes de commit»: los commits anteriores sí existen. Corrige esa documentación
sin confundirla con evidencia de instalación o medición, que no existen aún.

## Cambios locales que debes conservar

Codex deja una modificación SIN COMMIT en
`tests/conversation-model-selection.test.cjs`: la comprobación de hashes ahora
lee `LocalWhisperModels.kt`, donde se movió el catálogo, en lugar de
`FaceclawLocalTranscriber.kt`. La referencia antigua ya estaba rota en la base
7281663. Tras corregirla pasan las 29 pruebas ampliadas indicadas abajo.
Es una corrección de prueba, no modifica el binario candidato.

Notas no rastreadas observadas: prompts de Claude/Luna/Terra/revisión Terra,
`notes/prueba-medium-tv-2026-10-09.md`, este relevo y
`notes/evaluacion-gatekeeper-gemini-nano-2026-10-09.md`.
La última es ajena: no modificar ni añadirla a tus commits. Conserva el stash
histórico. No `reset`, `clean`, stash automático ni `git add .`.

## PRIORIDAD 1: revisar empaquetado antes de instalar S2.6.13

Terra dejó esta APK firmada, todavía NO instalada:
`E:\projects\faceclaw-es\dist\conversation-g0\faceclaw-0.8.2-es.5-conversation.s2.6.13-whisper-medium.apk`.
SHA-256 `a10097b0f06b3da286942ec8520f51761e127de7e432ba2909a4b00eb6b21951`.
Codex comprobó independientemente:

- Firma v2/v3 válida y certificado original SHA-256
  `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Paquete `com.faceclaw.app`, versionCode 805,
  versionName `0.8.2-es.5-conversation.s2.6.13-whisper-medium`, solo arm64-v8a.
- Alineación `zipalign -c -P 16 4` correcta.
- Las siete bibliotecas `.so` son idénticas byte por byte a S2.6.12.

PERO Codex detectó una diferencia que no llegó a investigar antes del relevo:
**S2.6.12 contiene `assets/app/package.json`; la candidata S2.6.13 NO contiene
ningún `package.json` en su ZIP.** Ambas tienen 15 assets JS/MJS; S2.6.12 tiene
85 entradas bajo assets/app y S2.6.13 tiene 84.

No se comprobó arranque ni se demostró un fallo de runtime: no lo afirmes como
hecho. Verifica el contrato de arranque de esta versión de NativeScript y por qué
desapareció el archivo; repara/reconstruye si es necesario ANTES de instalar.
Revisa especialmente `b90c235`, que eliminó `package="__PACKAGE__"` del manifiesto
fuente y añadió `nativescript.id` al package.json raíz. El id ya figura en
`nativescript.config.ts`; no asumas que esos cambios explican por sí solos la omisión.
Compara la receta con builds S2.6.12 y confirma que el bundle incluye la corrección
actual. Si reconstruyes, documenta nuevo hash y no reutilices el anterior.

## Revisión de soporte medium y diagnóstico

Medium está conectado como `onboard-whisper-medium` → `whisper-medium` →
`WHISPER_MEDIUM`, local, sin fallback cloud/Moonshine. Usa el modelo ya descargado
y pide CPU/4 hilos en el asistente; base/small conservan sus valores previos ahí.
En Conversación los tres ya usan 4 hilos. El wakeword sigue siendo del firmware;
este cambio transcribe la frase posterior, no mejora la detección de «ey Even».

Codex reprodujo el fallo inicial OFF: una copia fija dejaba `busy/worker=true`
para siempre aunque el nativo drenara. `1e4c785` refresca la instantánea del mismo
motor mientras drena, conserva contadores finales y borra al iniciar otra sesión.
Las nuevas pruebas pasan; revisa que OFF no conserve texto/audio ni acepte turnos.

`db91a21` cachea verificación medium por ruta/existencia/tamaño/mtime para evitar
rehashar ~946 MB en cada intervención caliente. Se revalida al cambiar la huella;
no se ha medido una mejora de latencia por esta caché.

Verificaciones realizadas por Codex en este último turno:

```powershell
npx --no-install tsc -p tests/tsconfig.json
node --test tests/voice-finalization.test.cjs tests/soniox-conversation.test.cjs tests/conversation-model-selection.test.cjs
```

29/29 correctas tras la corrección local de la referencia de catálogo.
XML de Kotlin revisados: VoiceCaptureSessionTest 11/11, FingerprintedVerificationCacheTest
1/1, VoiceTranscriberCacheTest 6/6, cero fallos/errores, emitidos por Terra el
09-10-2026 alrededor de 16:27 UTC. Codex leyó esos resultados; no volvió a ejecutar
Gradle. Terra también informó AAR, Android assembleRelease/lintVital y laboratorio
debug correctos. No repitas suites completas sin motivo; prueba las reparaciones.

## PRIORIDAD 2: coordinar Luna y completar mediciones

Luna prepara y mide CPU/medium, no toca producción. Había parado indebidamente
al encontrar Faceclaw en primer plano: esa condición sola no significa ocupado.
El usuario lo había dejado abierto y OFF. Codex indicó continuar tras comprobar
OFF/drenaje, usando modelos, corpus y APK auxiliar ya preparados.

Último estado local leído por Codex, no garantía del estado actual:
`E:\projects\faceclaw-es\.tools\medium-luna-handoff-2026-10-09.json` existe,
`state: busy`, `completed: false`, `status_checked: false`.
Reserva: `E:\projects\faceclaw-es\.tools\medium-pixel-reservation`, owner.json
identifica la tarea de Luna (aunque el campo owner diga Codex).
No borres una reserva ajena ni uses el Pixel mientras siga midiendo.

Recomprueba el relevo cuando necesites ADB. Solo con `released` y sin reserva
ajena, adquiere la reserva mediante creación exclusiva del directorio, registra
propietario y comprueba identidad/OFF/drenaje actuales. No inferir disponibilidad
de la ausencia de un archivo o del tiempo transcurrido. Si Luna ya terminó pero
dejó metadatos obsoletos, aclara y verifica ese hecho antes de transferir la reserva;
no inventes una liberación. Continúa mientras tanto con empaquetado/TFLite en PC.

Luna descargó y verificó los tres archivos ONNX medium (946.072.270 bytes), en
`E:\projects\faceclaw-es-whisper-bench\.tools\medium-pixel-prep-20261009\models\sherpa-onnx-whisper-medium-es-int8`.
Auxiliar recompilado: 6 Kotlin/4 Python correctas, corpus público 24 hashes correctos.
Su informe/resultados iniciales quedaron nulos porque no había ejecutado mediciones;
consulta el informe actual, no interpretes esos nulos como rendimiento negativo.
Rutas: `notes/resultado-luna-medium-pixel-2026-10-09.md` y
`evaluations/whisper-tensor/results/pixel-medium-2026-10-09/` en su checkout.

Baseline CPU/4 hilos/auto/acondicionamiento actual/padding por defecto/ref-6-3.
Piloto 1/2/4/6 hilos, mismos audios, frío/caliente y después finalistas ABBA sostenido.
Promoción: ≥20 % menos p95 repetible sin degradación material de reconocimiento,
estabilidad o térmico. 6 s cada 3 s exige menos de 3 s para sostener el flujo.
No usar solo las últimas 256 ventanas ni WER de bucles contra referencias inválidas.
Si no hay ganador, conserva configuración y entrega límites medidos.

## PRIORIDAD 3: completar prueba TFLite; no está bloqueada por falta de descarga

Terra localizó candidata pública medium multilingüe, pero NO la descargó, inspeccionó
ni ejecutó. La vía NPU sigue SIN EVALUAR. Laboratorio local:
`E:\projects\faceclaw-es-medium-npu-lab`, paquete `com.faceclaw.whispermediumlab`,
LiteRT público 2.2.0, código compile-only CPU/NPU, sin inferencia. Compilarlo no
acredita soporte ni delegación. Conserva ese workspace y revisa sus fuentes.

Candidata declarada en su documentación:
https://huggingface.co/cik009/whisper/blob/08cc7cda80c788c4ae30e0d0999c3a36444b3101/whisper-medium.tflite
SHA publicado `a5e9dc7c7a461c72e358615cc72e471ef9cc1175f84b90fe04657aad4bb9bfb9`,
~774 MB, licencia declarada Apache-2.0, vocabulario `filters_vocab_multilingual.bin`.
Codex intentó abrir esa página con la herramienta web: falló por cache miss; no
verificó independientemente esos metadatos ni descargó el modelo.

Verifica procedencia/revisión/licencia, descarga si procede, calcula hash, inspecciona
FlatBuffer, tipos/formas/operadores y contrato frontend/decoder/vocabulario. Haz toda
la preparación posible en PC sin esperar al Pixel. No tener el modelo local es
trabajo pendiente, no impedimento externo. Descarta con evidencia un artefacto corrupto,
incompatible o mal identificado y busca alternativa acotada si la hay.

Compara mismo TFLite medium/audio en CPU y delegado viable, informando carga fría,
compilación, Log-Mel, encoder, decoder autoregresivo y tiempo total caliente.
Demuestra backend y subgrafos/nodos delegados y fallback mediante perfil/logs filtrados.
Tiny o encoder-only no acredita medium completo. Compara aparte con ONNX de Luna
declarando diferencias de pesos/cuantización/búsqueda. No migres producción por el piloto.

Google Tensor SDK Beta/AOT requiere acceso; no solicitarlo ni aceptar condiciones.
Ese requisito no demuestra que toda prueba legacy NNAPI requiera ese SDK. NNAPI
deprecado no equivale a ausente: comprueba la ruta concreta. Activar setUseNNAPI
en un ejemplo TFLite no modifica el runtime ONNX/sherpa de Faceclaw.
La cifra «16×» enlazada por el usuario procede de puntuaciones Geekbench de Samsung
S23 Ultra/QNN frente a GPU; no es Whisper/Pixel ni energía medida.
Fuentes primarias y referencias están en `evaluations/whisper-medium-npu/README.md`.

## Instalación, cierre y GitHub

Última instalada documentada: S2.6.12/805/firma original, APK hash
`2cd955b1896ffebc61b8d108c9458e8956ff5f4b309fb0846e789e0d825cd6c4`.
No hay instalación S2.6.13 ni respaldo fresco para ella todavía.
ADB: `C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe`,
serial esperado `61161FDCG0013L`. No uses `$pid` en PowerShell: `$PID` es automático
y no escribible; usa `$faceclawProcessId`. Errores de sandbox/red/caché requieren
resolver permisos/rutas, no declarar fallo del banco. No hagas capturas privadas.

Una vez resuelto el empaquetado, completadas las verificaciones y liberado Pixel:
respaldo fresco, firma original comprobada, ajustes privados antes/después,
`adb install -r`, extracción/hash/version/firma, arranque correcto y OFF/drenaje.
Reutiliza scripts corregidos; revisa efectos antes de ejecutarlos. No imprimas XML,
tokens o claves. Motor de Conversación/memoria son RAM y pueden restablecerse al
reiniciar: no elijas opciones por el usuario; informa del estado observado.
Retira auxiliares y sus propios archivos al finalizar; libera solo tu reserva.

Actualiza informe/continuidad y registra hechos, pruebas, límites y reversión real.
Publica commits públicos tras revisar diffs y secretos, en las ramas correctas,
sin force-push. Incluye la corrección de prueba y notas pertinentes de Codex;
excluye nota Gemini ajena, `.tools`, firma, APK, pesos y audio. No confundir push
con instalación o con aceleración demostrada. Si no hay resultado NPU, dilo.
Entrega un cierre claro con versión instalada, qué mejoró realmente y qué sigue
pendiente para otra persona a dos metros. Codex revisará al volver a disponer de cuota.
