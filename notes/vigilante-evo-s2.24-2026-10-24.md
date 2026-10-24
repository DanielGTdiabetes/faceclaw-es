# S2.24 — vigilante del EVO-X2 en el móvil (24/10/2026, Claude)

Vía crítica de salud de la spec Hermes proactivo v5.3, §12.6: el EVO-X2 no puede avisar de su propia caída, así que
el móvil dice **«EVO-X2 inaccesible desde este móvil»** cuando el puente del asistente lleva caído un rato. Nunca
afirma que el equipo se haya caído: puede ser el móvil, la red o Tailscale. Complementa a `hermes-salud` en el
EVO, que vigila desde dentro gateway, puente, modelo, ASR, Sala, diarización y servicio proactivo.

## Qué cambia

Solo bundle (TypeScript) y `versionName`; Kotlin, AAR y nativas iguales a la S2.23.

| Archivo | Cambio |
|---|---|
| `app/assistant/evo-watchdog.ts` | Lógica pura: umbral, franja nocturna, avisos de caída y recuperación |
| `app/assistant/bridge-client.ts` | Ping de aplicación `ctl ping` cada 60 s (el puente ya responde `pong`); si en 150 s no llega ningún frame, cierra el socket y vuelve a marcar. `isAlive()` e `isConfigured()` |
| `app/native/evo-alert-notification.ts` | Notificación Android en canal propio «Estado del EVO-X2» (importancia alta); id fijo, la recuperación sustituye al aviso |
| `app/g2/dashboard-controller.ts` | Arranca el vigilante (comprobación cada 30 s); aviso en el móvil siempre y en las G2 si están puestas, sin cargar y libres |

**Por qué el ping:** si el EVO pierde la corriente, el socket queda medio abierto y el cliente no recibe ningún
cierre: seguiría «conectado» indefinidamente. El puente ya enviaba pings de protocolo WebSocket cada 20 s, pero
el cliente no los ve. Con el ping de aplicación, el silencio de 150 s se trata como conexión perdida y se activa
la reconexión de siempre. Mejora también el asistente normal tras un corte.

## Cuándo avisa

- Puente configurado (backend `external`) y sin conexión viva durante **10 min** → un aviso:
  «EVO-X2 inaccesible desde este móvil desde las 11:15. Puede ser el equipo, la red o Tailscale.»
- Al volver: «EVO-X2 accesible de nuevo desde este móvil (sin conexión 25 min).»
- **Horario energético del EVO** (se apaga entre 21:00 y 22:00 si está en reposo y se enciende a las 03:50):
  entre 21:00 y 03:50 no avisa. Si a las 04:00 sigue sin conexión:
  «EVO-X2 inaccesible desde este móvil desde las 03:50: no ha vuelto tras el apagado nocturno.»
  Si la caída empezó antes de las 21:00 y ya duraba 10 min, se avisa antes de la franja y no se repite.
- Valores provisionales en `EVO_WATCHDOG_DEFAULTS`; la franja usa la hora local del móvil.

**Límites:** no distingue si el móvil está sin red (el texto lo dice); no vigila con el móvil apagado o Faceclaw
detenido; tras reiniciar la app la caída cuenta desde el arranque. Si `evo-energia mantener` deja el EVO
encendido por la noche, simplemente no hay caída que avisar.

## Pruebas

- `tests/evo-watchdog.test.cjs`: 7 casos (franja, caída corta y larga con recuperación, apagado nocturno normal,
  EVO que no vuelve a las 03:50, caída antes de las 21:00, desactivado, caída al arrancar).
- `tests/conversation-bridge.test.cjs`: el caso de envío fallido comparaba con cero temporizadores vivos; ahora
  compara con los que había antes de la petición (el temporizador de vida de la conexión sigue armado).
- `npm test`: 1343 pruebas, 1342 correctas, 0 fallos, 1 omitida (la de siempre). `tsc` de la app correcto.

## Compilación e instalación

Receta `.tools/s2.24-build.ps1` (copia de la S2.23): release sin firmar, nativas conservadas desde la S2.23 local
(`dist/conversation-g0/faceclaw-0.8.4-es.15-conversation.s2.23-sesion-continua.apk`, `232fe249…`) y firma
original. Antes de instalar: extraer la APK instalada del Pixel y comprobar que es `232fe249…`; si no, recompilar
con la extraída. Mismo código 805 y misma firma: `install -r` conservando datos; retorno inmediato a la S2.23:

```bash
adb -s 61161FDCG0013L install -r dist/conversation-g0/faceclaw-0.8.4-es.15-conversation.s2.23-sesion-continua.apk
```

## Prueba real — 24/10/2026, 07:41–07:53 (Dani)

Modo avión en el Pixel. El puente registró el cierre a las 07:42:00. Hacia las 07:51:30 llegó la notificación
«EVO-X2 inaccesible desde este móvil desde las 07:41. Puede ser el equipo, la red o Tailscale.» (canal
`faceclaw-evo-status`, importancia alta). Al quitar el modo avión, el móvil reconectó a las 07:52:53 y llegó la de
recuperación, que sustituye a la anterior (Dani: «llegó, aunque no me di cuenta»). La compilación de producción
quita los `console.log`: el aviso se comprobó leyendo la notificación con `dumpsys notification`, no en logcat.
