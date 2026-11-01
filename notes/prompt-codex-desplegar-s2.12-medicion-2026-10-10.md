# Encargo a Codex: S2.12 medición en el PC, el Pixel y Jarvis · 10-10-2026

Preparado por Claude Code, que corre en la nube y no llega al PC, al móvil ni a Jarvis. El usuario
autoriza en el chat el despliegue completo en Jarvis si es necesario y la actualización del móvil, que
está conectado y listo.

---

Trabaja en el repositorio de Faceclaw de este PC (`E:\projects\faceclaw-es` u otra ruta local). Lee
primero `AGENTS.md`, `notes/continuidad-entre-pcs.md` y `notes/ahorro-llamadas-hermes-2026-10-10.md`.

**Autorización del usuario:** actualizar el repositorio local, compilar e instalar la APK S2.12 en el
Pixel con la firma original y desplegar en Jarvis solo `conversation.py` con el ayudante reversible.
Nada más: no cambies `FACECLAW_CONV_REASONING_EFFORT` (debe seguir en `low`), ni proveedor,
credenciales, `private.json`, `bridge.py`, `daily_context.py` o `hermes-gateway.service`. No borres
datos del móvil ni desinstales. No imprimas secretos ni texto de conversaciones.

## 1. Repositorio local al día

1. `git status`. Si hay cambios locales, consérvalos (commit en una rama aparte o stash con nombre
   descriptivo) y avísalo. No hagas reset ni descartes nada.
2. `git fetch origin`, `git switch codex/conversation-detection-g0` y
   `git pull --ff-only origin codex/conversation-detection-g0`.
3. Comprueba que HEAD es `6b1d258` o posterior y que contiene `scripts/deploy-hermes-measurement.py`.
4. Comprueba `sha256` de `integrations/hermes/conversation.py`:
   `5b9020d050a2704e924a0ae6387e6da3ec2da1d75668ff26ed80938da2a6db1a`.
5. Pruebas rápidas: `npm test` (esperado 1095 correctas, 4 fallos previos ajenos: eventos de entrada y
   ajustes del asistente iOS/Android, 2 omitidas), en `integrations/hermes`
   `python -m unittest test_conv_journal_summary test_conversation test_conversation_fallback test_conversation_memory test_conversation_bridge test_daily_context`
   y `python -m unittest scripts/test_deploy_hermes_measurement.py`.

## 2. Línea base S2.11 antes de tocar Jarvis (solo lectura)

Copia `integrations/hermes/conv_journal_summary.py` a una carpeta temporal de Jarvis (no dentro del
puente) y ejecuta sobre el journal de hoy, desde la prueba física S2.11:

```sh
journalctl --user -u faceclaw-hermes.service -o short-iso --since "2026-10-10 15:00" --until "2026-10-10 15:20" \
  | python3 conv_journal_summary.py --since 2026-10-10T15:00 --until 2026-10-10T15:20 --label "S2.11 base"
```

Si el journal es del sistema y no de usuario, quita `--user`. Guarda la salida (solo números) para la nota.
Los tokens saldrán «no registrados»: el puente S2.11 no los registra. Es lo esperado.

## 3. APK S2.12 en el Pixel

1. Confirma en el móvil Conversación OFF y que no hay worker o drenaje en curso. No inicies captura.
2. Compila con la receta local de S2.11 (`.tools/s2.11-build.ps1`, entorno `s2.10-env.ps1`):
   `ns prepare android --release --env.production` y Gradle
   `--offline assembleRelease lintVitalRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a -x prepareFaceclawNativeLibs -x prepareFaceclawLlama`.
   La versión sale de `app.gradle`: `0.8.2-es.5-conversation.s2.12-measurement`, código 805. Si la receta
   fija otro nombre, adáptala sin tocar firma ni nativas.
3. Comprueba que las 8 `.so` son byte idénticas a S2.11 (no hay cambios Kotlin ni nativos).
4. Firma e instala con `scripts/install-conversation-g0.ps1 -InputApk <apk> -Install`. El script verifica
   la huella `57aaa887…c435`, hace respaldo de la APK instalada y usa `install -r`. Si la firma no
   coincide, para: no desinstales.
5. Extrae la APK instalada y confirma que el SHA-256 coincide con la firmada. Anota la ruta de reversión
   que deja el script.

## 4. Jarvis: solo `conversation.py`

Destino conocido: `dani@100.65.212.74`, `/home/dani/faceclaw-hermes-bridge/`.

1. Con Conversación OFF en el móvil, copia `scripts/deploy-hermes-measurement.py` y
   `integrations/hermes/conversation.py` a una carpeta temporal de Jarvis (no dentro del puente).
2. Simulación: `python3 deploy-hermes-measurement.py --check /tmp/.../conversation.py`. Espera
   `CHECK_OK live=417dc5c98ceb -> 5b9020d050a2`. Si dice que algún hash difiere, **para y avisa**: no
   fuerces nada.
3. Aplica: `python3 deploy-hermes-measurement.py /tmp/.../conversation.py`. Espera
   `MEASUREMENT_APPLIED=TRUE ready_in=…`. El ayudante crea `rollback-20261010-measurement/` (700/600),
   sustituye de forma atómica, reinicia solo `faceclaw-hermes.service` y espera hasta 45 s el puerto 8791
   y el marcador `listening` sin `conversation unavailable`. Si falla, restaura solo.
4. Comprueba que `hermes-gateway.service` sigue activo y con el mismo PID.
5. Reversión si hiciera falta: `python3 deploy-hermes-measurement.py --rollback` con Conversación OFF.

## 5. Comprobación mínima conjunta

Con el usuario: una conversación breve (2–3 min) en «Escuchar con Hermes sin límite de llamadas», con
alguna pregunta. Después de OFF, ejecuta el resumen sobre ese tramo y comprueba que aparecen
`inputTokens`, `cacheReadTokens`, `outputTokens`, `reasoningTokens`, `promptChars` y `effort low`. Lee en
«Métricas tras OFF» del móvil `savings` y `usage` (solo números).

La prueba completa A/B/C (15 min de conversación, 10 min de TV, 5 min de silencios y frases cortas) se
hará después con el usuario: no la empieces sin él.

## 6. Cierre

Actualiza `notes/ahorro-llamadas-hermes-2026-10-10.md` con hashes, versión instalada, rutas de reversión,
salida del resumen base S2.11 y de la comprobación mínima. Añade una entrada al principio de `AGENTS.md`
y de `notes/continuidad-entre-pcs.md`. Commit y push a `codex/conversation-detection-g0`. Deja la
Conversación en OFF y avisa de cualquier paso que no se haya podido completar.
