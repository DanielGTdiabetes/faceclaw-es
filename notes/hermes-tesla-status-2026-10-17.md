# Hermes: herramienta `tesla_status` (TeslaMate) — 17/10/2026

**Estado:** aplicado en EVO-X2 a las 10:39 con OK del usuario. Detalle completo, scripts y pruebas en el repo
`Hermes agent proactive v2`, `preparacion-evo-x2/teslamate/README.md`.

## Qué cambia en el puente Faceclaw

- Plugin de Hermes de solo lectura `~/.hermes/plugins/teslamate/` con la herramienta `tesla_status`: lee
  TeslaMateApi en el NAS (`http://192.168.0.110:8085`, sin token, solo LAN) y devuelve batería, autonomía, carga y
  estado con `observed_at` y antigüedad. Si no hay dato en vivo, da el último viaje o carga registrado y lo dice.
- `~/faceclaw-hermes-bridge/bridge.py` (de `be37c9ae…` a `20c02c09…`): `enabled_toolsets=["hermes-cli",
  "faceclaw-phone", "teslamate"]` y `tesla_status` en la lista de herramientas siempre visibles (como las del
  móvil). La copia `integrations/hermes/bridge.py` de este repo ya no coincidía con producción y no se ha tocado.
- `~/.hermes/config.yaml`: `teslamate` en `plugins.enabled` y en `platform_toolsets.cli` y `.telegram`.
- Reinicio de `faceclaw-hermes` y `hermes-gateway` a las 10:39:49; el puente arrancó con 27 herramientas (antes 26).

Si el modo conversación pasa a usar el mismo agente, debe conservar `"teslamate"` en sus toolsets.

## Aviso: TeslaMate sin datos desde el 12/06/2026

TeslaMate recibe 403 de la owner-api de Tesla (hace falta Fleet API). Hasta arreglarlo, la respuesta correcta en
las G2 es «no hay dato en vivo; último registro de hace N días».

## Vuelta atrás

`config.yaml` (12:11) y `bridge.py` (14:34, agente único: `6d184810…`, que conserva `teslamate`/`tesla_status` y
lo extiende a Conversación) cambiaron después, así que `revertir.sh` se niega. Manual, con copia y sin actividad
(el `sed` de `bridge.py` está probado sobre una copia):

```bash
ssh evo-x2 'cp -p ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-sin-teslamate-$(date +%Y%m%d-%H%M%S) && cp -p ~/faceclaw-hermes-bridge/bridge.py ~/faceclaw-hermes-bridge/bridge.py.bak-sin-teslamate-$(date +%Y%m%d-%H%M%S) && sed -i "/^ *- teslamate$/d" ~/.hermes/config.yaml && sed -i "s/, \"teslamate\"\]/]/; s/, \"tesla_status\"\]))/]))/" ~/faceclaw-hermes-bridge/bridge.py && rm -rf ~/.hermes/plugins/teslamate && systemctl --user restart hermes-gateway faceclaw-hermes'
```
