# Latencia de ~20 s del agente de las G2 con Qwen3.6: precarga del prompt (17/10/2026)

Estado: **preparado y medido, pendiente del OK del usuario para instalar** en even (EVO-X2).

- **Causa:** Qwen3.6-35B-A3B es híbrido. llama.cpp b11687 solo reutiliza la caché hasta un checkpoint de contexto,
  y solo los crea al empezar un mensaje de usuario o en los últimos 512 tokens. Hermes fija el prompt de sistema
  por sesión. Lo que cambia entre sesiones (MEMORY, USER PROFILE, memoria holográfica, plugin y fecha) está en
  el 86-97 % del prompt. Por eso el primer turno tras reiniciar `faceclaw-hermes` reprocesa ~20 200 tokens
  (~19 s) si la memoria cambió. Con el puente en marcha, la caché funciona (0,3 s).
- **Corrección:** nuevo `prompt_prewarm.py` en `~/faceclaw-hermes-bridge` y 5 líneas en `Bridge.warmup()`. El
  puente fija el prompt de la sesión y lo envía una vez a Qwen en segundo plano: solo loopback, `max_tokens=1`,
  sin registrar contenido. La unidad `even-llm-qwen` no cambia.
- **Medido** en el Qwen real: primer turno tras un cambio de memoria, de 19,2 s a 0,24 s; segundo turno, 0,23 s.
- **Instalación:** `bash ~/faceclaw-hermes-bridge/candidate-20261017-prewarm/instalar-prewarm.sh`. Comprueba que
  no hay actividad, guarda la preimagen y reinicia el puente.
- **Reversión:** `bash ~/faceclaw-hermes-bridge/rollback-20261017-prewarm/revertir.sh`.
- Detalle y evidencias: repo `Hermes agent proactive v2`,
  `preparacion-evo-x2/puente/prewarm-g2-20261017/README.md`.
- No incluido en `integrations/hermes/bridge.py` de este repo: la copia del repo ya difiere de producción.
  Integrarlo al sincronizar.
