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

## v0.1.1 instalada — 17/10/2026, 14:56

Con TeslaMate en 4.3.0, el coche aparece `offline` con el 64 % guardado en junio y la v0.1.0 lo daba como dato en
vivo. La v0.1.1 solo da batería en vivo con el coche conectado (`online`/`driving`/`charging`); si no, da el estado
actual y la batería del último viaje o carga con su fecha. Instalada con OK del usuario y sin actividad; gateway y
puente reiniciados con `NRestarts=0`. Volver a v0.1.0: `install -m 600
~/migracion-hermes-20261016/teslamate-20261017/plugin-v2/__init__.py.instalado ~/.hermes/plugins/teslamate/__init__.py`
y reiniciar ambos servicios.

## Validada con las G2 — 17/10/2026, 14:57

Turno de las G2 con una llamada a herramienta (23 s, sin respaldo). Según el usuario, las gafas dijeron que el
Tesla está sin conexión y dieron el dato de junio (64 %, 251 km) con su antigüedad. Criterio de cierre cumplido.
