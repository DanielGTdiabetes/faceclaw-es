# Prompt para Claude: continuar banco Whisper medium en Pixel

Continúa el encargo autorizado ya iniciado. Trabaja con razonamiento medio. No delegues ni repitas la preparación: pesos, corpus y APK ya fueron verificados. No pidas otra autorización para las mediciones ya encargadas.

## Estado actual

- El Pixel 10 Pro Fold/Tensor G5 (serial `61161FDCG0013L`, Android 17/API 37) conserva Faceclaw `0.8.2-es.5-conversation.s2.6.12-whisper-performance`, código 805.
- Antes de instalar el auxiliar se confirmó OFF en la UI: el control ofrecía iniciar conversación. “Métricas tras OFF” dio `enabled=false`, `worker=false`, `busy=false`, `inputBufferedBytes=0`, sin aviso de drenaje. AudioPolicy tenía 0 entradas activas, RecordingActivity 0 clientes y no había wakelock de conversación activo. No se leyó transcripción ni se inició captura.
- El auxiliar `com.faceclaw.whisperbench` está instalado por este trabajo y no solicita micrófono ni red. No lo reinstales ni borres mientras se ejecutan mediciones.
- La reserva sigue ocupada: `E:\projects\faceclaw-es\.tools\medium-pixel-reservation`. No la retires ni marques el relevo como released hasta terminar, desinstalar el auxiliar y verificar el estado final.
- Relevo vivo: `E:\projects\faceclaw-es\.tools\medium-luna-handoff-2026-10-09.json`.

## Verifica primero la corrida activa

El run `medium-baseline-corpus` está en curso. Antes de lanzar comandos, consulta:

```powershell
$adb = 'C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$serial = '61161FDCG0013L'
$B = '/sdcard/Android/data/com.faceclaw.whisperbench/files'
& $adb -s $serial shell cat "$B/results/medium-baseline-corpus/status.txt"
```

Si indica `running`, no dupliques, no reinicies ni fuerces el cierre del auxiliar. Espera y monitoriza estado, CPU acumulada, batería y thermal status mediante datos agregados. Si indica `done`, recupera sus archivos. Si Faceclaw muestra una sesión activa, no la interrumpas ni cambies ajustes; detén solo el auxiliar si hace falta evitar interferencia y deja constancia.

## Hechos medidos

Piloto terminado, resultados en `E:\projects\faceclaw-es-whisper-bench\evaluations\whisper-tensor\results\pixel-medium-2026-10-09\medium-pilot\run.json`:

| Hilos | p50 ms | p95 ms | Máx. ms | RTF |
|---:|---:|---:|---:|---:|
| 1 | 8492 | 11335 | 11366 | 1.455 |
| 2 | 8547 | 13552 | 13827 | 1.614 |
| 4 | 11114 | 15021 | 15649 | 1.849 |
| 6 | 12642 | 17843 | 21566 | 2.374 |

WER/CER fue igual entre grupos: es `0.1111 / 0.0233`; ca `0.0526 / 0.0744`. N=1 es el mejor candidato medido; RTF sigue mayor que 1.

Build/repo: `E:\projects\faceclaw-es-whisper-bench`, branch `claude/whisper-perf-bench-2026-10-09`, HEAD `342154c74a66d077e0a6961001a99094b5ddb159`. APK existente: `evaluations\whisper-tensor\bench-android\app\build\outputs\apk\release\app-release.apk`. Corpus en `evaluations\whisper-tensor\corpus\out`; pesos verificados en `.tools\medium-pixel-prep-20261009\models\sherpa-onnx-whisper-medium-es-int8`.

## Completa las corridas y el cierre

1. Termina el baseline de corpus completo ya lanzado: medium, CPU/4 hilos, idioma auto, conditioning on, 24 fixtures, repeat 3, warmup 2. Pull a `evaluations/whisper-tensor/results/pixel-medium-2026-10-09/medium-baseline-corpus/` y resume.
2. Ejecuta realtime ABBA para 4 y 1 hilos: `mode realtime`, `models whisper-medium-es`, `threads 4,1`, `providers cpu`, `language auto`, `conditioning on`, `policies ref-6-3`, `rounds 2`, `cooldownSec 120`, `kinds stream`, `keepScreenOn true`; run ID `medium-realtime-abba`.
3. Ejecuta sustained ABBA con los mismos controles: `mode sustained`, `threads 4,1`, `minutes 5`, `rounds 2`, `cooldownSec 120`, `kinds stream`; run ID `medium-sustained-abba`.
4. No accedas a transcripciones de Faceclaw ni arranques captura. Distingue los resultados del corpus público de cualquier dato de sesión. WER/CER del stream sostenido no es válido.
5. Recupera archivos y actualiza `E:\projects\faceclaw-es-whisper-bench\notes\resultado-luna-medium-pixel-2026-10-09.md` y el relevo `.tools\medium-luna-handoff-2026-10-09.json`.
6. Desinstala `com.faceclaw.whisperbench`; verifica que el paquete auxiliar ya no está y Faceclaw sigue en código 805. Solo entonces retira la reserva y marca el relevo released con estado final.

PowerShell: no asignes a `$pid` (`$PID` es variable automática de solo lectura). Usa exactamente:

```powershell
$faceclawProcessId = (& $adb -s $serial shell pidof com.faceclaw.app | Out-String).Trim()
```

Si alguna corrida termina con error, conserva artefactos/logs, corrige solo el problema del auxiliar y reanuda desde los datos que existan; no repitas descarga, build ni validación del corpus.