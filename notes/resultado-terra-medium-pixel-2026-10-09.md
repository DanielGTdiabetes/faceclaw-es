# Resultado Terra · Whisper medium / Pixel · 09-10-2026

## Estado actual

Tres commits locales y correcciones aún sin commit, sin `push`, merge, ADB, instalación, extracción de APK,
lectura de ajustes ni captura del Pixel. El relevo
`.tools/medium-luna-handoff-2026-10-09.json` existe y sigue con `state: busy`;
la reserva pertenece a Luna. No se borró, sustituyó ni usó como autorización.

| Área | Commit | Estado revisado |
| --- | --- | --- |
| Opción medium del asistente | `e5d361b` | Selector, mapeo y descarga local preparados. |
| Retención tras OFF | `2fd320a` | Base inicial retenida; la corrección posterior queda en el árbol de trabajo hasta revisión. |
| Investigación LiteRT | `09564de` | Sustituida por evidencia más precisa y laboratorio aislado actualizado. |

## Corrección pendiente de commit: diagnóstico OFF

La revisión identificó que una copia fija de `lastLocalSnapshot` conservaba
`busy`/`worker` para siempre si el decoder terminaba después de OFF. Ahora la
instantánea local retenida tiene época de sesión y se refresca solo mientras el
mismo decoder indica drenaje. Conserva únicamente escalares finales; no acepta
PCM, texto, audio ni turnos, no usa temporizador y una nueva sesión o cambio
local→cloud borra la retención antes de crear/usar otro motor.

La prueba TS avanza el mock de ocupado a drenado y comprueba los contadores
finales, OFF repetido, el inicio local nuevo y local→cloud. No está marcada como
entrega final hasta pasar revisión y quedar en su commit separado.

## Medium en el asistente

- `onboard-whisper-medium` aparece como opción explícita, permanece local y se
  mapea a `VoiceModelKind.WHISPER_MEDIUM`.
- La prueba Kotlin ya no acepta un fake indistinto: registra el enum solicitado
  y afirma `WHISPER_MEDIUM`; también afirma que la configuración efectiva del
  asistente pide cuatro hilos CPU solo para medium (base/small/Moonshine: uno).
- Los archivos medium se verifican contra SHA-256 antes de cargar JNI. Para no
  rehashar ~946 MB por intervención, la verificación se cachea por huella de
  ruta/existencia/tamaño/mtime; un reemplazo cambia la huella y fuerza hash de
  nuevo. Hay prueba de cache, cambio de huella e invalidación explícita. No se
  atribuye una latencia medida a este cambio.

## LiteRT / NPU: investigación abierta

No hubo inferencia, compatibilidad ni delegación demostradas. La compilación del
auxiliar aislado no prueba ninguna de esas cosas. La restricción de registro del
Tensor SDK concierne a su ruta Tensor SDK/AOT, no prueba que NNAPI legado o
LiteRT público requieran ese SDK ni que el Pixel no pueda ejecutar un artefacto
compatible.

Se localizó una candidata pública para preparar la prueba: `cik009/whisper`,
`whisper-medium.tflite` multilingüe de 774 MB en revisión inmutable
`08cc7cda80c788c4ae30e0d0999c3a36444b3101`, SHA-256 publicado
`a5e9dc7c7a461c72e358615cc72e471ef9cc1175f84b90fe04657aad4bb9bfb9` y
licencia declarada Apache-2.0. Aún no se descargó ni se verificó localmente:
eso es trabajo pendiente, no bloqueo externo. Continúan pendientes contrato de
decoder, vocabulario, firmas/operadores del FlatBuffer y comparación de calidad.

El laboratorio `E:\projects\faceclaw-es-medium-npu-lab` compiló debug con
LiteRT público 2.2.0 y contiene un plan CPU/NPU *compile-only* sin descarga de
runtime ni inferencia. Tras relevo y reserva propia deberá ejecutar el decoder
completo con mismo audio en CPU/NPU y conservar logs/perfiles de backend,
subgrafos delegados/fallback, carga fría, preprocesado, encoder, decoder y total
caliente. Tiny, `.en` o solo encoder no cuentan como medium completo. No se
integra en producción ni se promete 16×.

## Preparación de candidata Android

- La versión candidata ya es
  `0.8.2-es.5-conversation.s2.6.13-whisper-medium` (código 805), y el helper
  de instalación la admite, pero no se invocó con `-Install`.
- La firma original está disponible: existen `.tools/signing/faceclaw-es.jks`
  y `.tools/signing/store.password`; no se leyó/imprimió secreto ni se generó
  sustituta. La candidata firmada local queda en
  `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.13-whisper-medium.apk`,
  SHA-256 `a10097b0f06b3da286942ec8520f51761e127de7e432ba2909a4b00eb6b21951`,
  con certificado público original `57aaa887…6114c435`; no se instaló.
- Al liberarse el relevo: comprobar de nuevo una vez el estado, adquirir solo
  la reserva propia, validar OFF/drenado, compilar y firmar, comprobar firma y
  hash, respaldar APK/ajustes, comparar ajustes privados, instalar `-r`, volver
  a comprobar OFF/drenado y liberar solo la reserva propia.

## Validación de PC hasta ahora

- TypeScript y Node afectados: 22/22 correctos.
- Kotlin host: `testAndroidHostTest` correcto en Windows (advertencia iOS
  esperable).
- APK principal arm64: `assembleRelease lintVitalRelease` correcto, paquete
  `com.faceclaw.app`/805 y SHA-256 sin firmar
  `ec7f785df497572d94db9b3609fbedca1ab86c39d25959a433ebc35751e0275a`.
  El manifiesto fuente elimina el atributo `package` obsoleto para AGP actual y
  `package.json` declara de nuevo el identificador NativeScript original.
- Laboratorio aislado: `assembleDebug` correcto con LiteRT 2.2.0; advertencias
  de Java source/target 8, namespace LiteRT y símbolos nativos sin strip, sin
  ejecución en dispositivo.

No se ha hecho la fase física: respaldo/comparación privada de ajustes,
instalación, comprobación posterior ni ensayo de voz siguen pendientes del
relevo Luna y la reserva propia.
