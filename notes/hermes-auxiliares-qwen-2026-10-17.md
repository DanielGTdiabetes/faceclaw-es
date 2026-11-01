# Hermes en EVO-X2: auxiliares a Qwen local — 17-10-2026

Aplicado con autorización del usuario a las 10:15:47. Detalle completo, prueba previa y scripts en el repo
`Hermes agent proactive v2`: `preparacion-evo-x2/llm/auxiliares-qwen/README.md`.

## Cambio

`~/.hermes/config.yaml` en EVO-X2 (SHA-256 antes `ca83ec2e…13d`, después `18e5e7bc…855`):

- `auxiliary.{compression, title_generation, session_search, approval, mcp, skills_hub, triage_specifier,
  curator, web_extract}`: de LiteLLM → OpenRouter (`hermes_fast` / `hermes_standard`) a `provider: qwen-local`,
  `model: qwen3.6-35b-a3b`, sin `base_url` ni `api_key` (la clave sale de `QWEN_LOCAL_API_KEY`).
- `auxiliary.compression.context_length`: 1 048 576 → 64 000.
- `compression.threshold`: 0.1 → 0.5.
- Visión sin cambios (sigue por LiteLLM → OpenRouter).

Motivo: dejar de enviar texto de conversación a modelos gratuitos de OpenRouter ahora que Hermes usa Qwen3.6 local.

## Efecto en Faceclaw

El puente `faceclaw-hermes` comparte `HERMES_HOME`: sus auxiliares pasaron a Qwen en caliente al instalar el
archivo. El nuevo umbral de compresión le llegará en su próximo reinicio. Vigilar la latencia de las G2, porque
gateway, puente y auxiliares comparten las dos ranuras de `even-llm-qwen`.

## Verificación

Gateway activo, `NRestarts=0`; Telegram conectado a las 10:16:06; ticker del cron a las 10:18:08;
`glucose-heartbeat` a las 10:20:10. `faceclaw-hermes` y `even-llm-qwen` activos sin reinicios.

## Reversión

```bash
ssh evo-x2 '~/migracion-hermes-20261016/aux-qwen-20261017/revertir.sh'
```

Selectiva (desde las 14:55): devuelve a la preimagen solo las 38 claves de este cambio, respeta lo que otras
sesiones cambiaron después (`teslamate`, `web.extract_backend: keenable`), guarda copia y reinicia `hermes-gateway`.
`python3 revertir.py` sin argumentos muestra lo que haría.

## Respaldo del puente en Qwen (10:37)

Decisión del usuario: nunca saltar a OpenRouter. Nuevo drop-in `~/.config/systemd/user/faceclaw-hermes.service.d/
zz-sin-openrouter.conf` con `FACECLAW_FALLBACK_PROVIDER=qwen-local` y `FACECLAW_FALLBACK_MODEL=qwen3.6-35b-a3b`, que
sustituye el respaldo `openrouter/openai/gpt-6-luna` heredado de `50-openai.conf` (lo usaban el modo conversación y el
agente de las G2). Puente reiniciado sin actividad a las 10:37:38, `NRestarts=0`.

Reversión: `ssh evo-x2 '~/migracion-hermes-20261016/sin-openrouter-20261017/revertir.sh'` (borra el drop-in,
daemon-reload y reinicia faceclaw-hermes).
