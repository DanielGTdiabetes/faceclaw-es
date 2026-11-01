# Encargo para Codex: desplegar solo el STYLE participativo en Jarvis

**Completado por Codex el 10-10-2026:** [resultado, comprobaciones y reversión](despliegue-style-jarvis-2026-10-10.md). Hash `417dc5c9…45e8dc` activo, respaldo original 700/600 verificado, puente/gateway activos; reiniciado solo el puente. Las instrucciones inferiores se conservan como encargo original, no deben ejecutarse otra vez por defecto.

Autorizado por el usuario el 10-10-2026 («sí a las dos»). Claude Code no pudo ejecutarlo: su
clasificador de permisos bloquea despliegues en producción. Nada se ejecutó en Jarvis.

## Estado comprobado (10-10-2026, Claude por SSH de solo lectura)

- Jarvis `dani@100.65.212.74` (Tailscale; la LAN 192.168.0.235:22 no respondió desde este PC).
- `~/faceclaw-hermes-bridge/conversation.py` SHA-256
  `8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868` (igual que en la auditoría Codex).
- `bridge.py` `e285abf6…adbb5` y `daily_context.py` `5702985a…6bf7`: idénticos a `integrations/hermes/`.
- El local `integrations/hermes/conversation.py` `417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc`
  (LF) solo difiere del remoto en `STYLE` (`diff --strip-trailing-cr`).
- Pruebas Python locales `integrations/hermes`: 64 pasan, 6 omitidas.
- Servicio `faceclaw-hermes.service` (usuario): `ExecStart=/home/dani/.hermes/hermes-agent/.venv/bin/python
  /home/dani/faceclaw-hermes-bridge/bridge.py`.
- Móvil: S2.11-recovery instalada, conversación OFF (sin wakelock de Faceclaw). Reiniciar solo
  Faceclaw con la conversación OFF.

## Pasos (desde `E:\projects\faceclaw-es`)

1. Comprobar de nuevo el hash remoto `8bfc06…8868`; si difiere, parar e informar.
2. Respaldo: `~/faceclaw-hermes-bridge/rollback-20261010-style/conversation.py` (700/600).
3. `scp integrations/hermes/conversation.py` a `conversation.py.new`, chmod 600, verificar
   `417dc5c9…45e8dc` y `ast.parse` con el Python del venv; `mv` atómico sobre `conversation.py`.
4. `systemctl --user restart faceclaw-hermes.service` (solo este servicio; el gateway no se toca).
   Comprobar que ambos servicios siguen activos y revisar el journal sin imprimir tokens ni texto.
5. Reversión: copiar el respaldo sobre `conversation.py` y reiniciar solo `faceclaw-hermes.service`.

Comando equivalente que Claude preparó (no se llegó a ejecutar):

```bash
R=dani@100.65.212.74
ssh $R 'set -e; cd ~/faceclaw-hermes-bridge; [ "$(sha256sum conversation.py|cut -d" " -f1)" = 8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868 ]; d=rollback-20261010-style; mkdir -m 700 -p $d; cp -p conversation.py $d/; chmod 600 $d/conversation.py'
scp integrations/hermes/conversation.py $R:faceclaw-hermes-bridge/conversation.py.new
ssh $R 'set -e; cd ~/faceclaw-hermes-bridge; chmod 600 conversation.py.new; [ "$(sha256sum conversation.py.new|cut -d" " -f1)" = 417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc ]; /home/dani/.hermes/hermes-agent/.venv/bin/python -c "import ast;ast.parse(open(\"conversation.py.new\").read())"; mv conversation.py.new conversation.py; systemctl --user restart faceclaw-hermes.service; sleep 6; systemctl --user is-active faceclaw-hermes.service'
```

## Después

Actualizar `AGENTS.md` y `notes/continuidad-entre-pcs.md` con hash desplegado, respaldo y servicios
activos. No desplegar otras partes del puente. La validación de aportaciones (con y sin preguntas)
se hace luego en una sesión física coordinada, con un número de peticiones acotado.
