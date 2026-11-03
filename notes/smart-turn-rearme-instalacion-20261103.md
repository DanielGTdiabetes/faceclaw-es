# S2.28.1 instalada — 03/11/2026

Prevalece sobre el estado de candidata de las notas anteriores.
Claude aprobó el ejecutable de `06ab44dd3f20433fb76609d577e89c370179485d`
en el evento Buzz `9dd14bfc8b280dea51d68180286708a806c8c5d408afe8387199b2602bb47818`.

- Pixel 10 Pro Fold USB, paquete `com.faceclaw.app`.
- `adb install -r` terminó con `Success`, sin desinstalar ni borrar datos.
- `lastUpdateTime=2026-11-03 12:55:34` CET.
- Versión instalada `0.8.4-es.19-conversation.s2.28.1-smart-turn-rearme`, código 805.
- APK extraída después de instalar: SHA256
  `d16d05e197f9930d0b5868e9a7c22aa46a213e11f4f2ffbf3f848c5011712575`,
  idéntica a la candidata revisada.
- 48 ajustes antes/después: cero diferencias comparando cada entrada XML ordenada.
  Los valores privados quedan fuera de Git, de los recibos públicos y del NAS compartido.
- Primera instalación conservada: `2026-10-02 09:39:05`.
- `am start -W`: `Status: ok`; proceso 29024 vivo en dos comprobaciones posteriores.
- UI: `Conectado`, botón `Conversación`; no muestra `Conversación · escuchando`.
  `main-view-model.ts` deriva esa etiqueta de `conversationOn`.
  Última lectura `dumpsys power`: `Wake Locks: size=0`.
  No se activó captura. Los 80 registros finales del buffer crash no incluyen Faceclaw.

Retorno fresco extraído antes de actualizar:
`OUTBOX/HERMES_SMART_TURN_REARME_7C9C58DA/PIXEL_BEFORE_INSTALL_S228.apk`,
SHA256 `ac2f8783fc48700987305c1a572f60c5d55d3a16b88edf9bc91c0cf64276dd86`.
Coincide con el retorno S2.28 ya archivado en NAS.

Código y pruebas permanecen en el SHA revisado; este cierre solo añade documentación.
No se repiten suites ni build para una nota de instalación. Véase
[evidencia de construcción y pruebas](smart-turn-rearme-20261103.md).

Pendiente: Dani vuelve a ON cuando quiera; observar `conv timing` en uso normal y
comprobar si desaparecen las rachas `smartTurn=off`. No se ha probado físicamente una
reconexión nueva, ni medido consumo o calidad acústica. Los fallbacks con socket vivo
siguen abiertos; este rearme no los resuelve. Sin merge por el agente.

Issue: buzz://issue?id=7c9c58dad7cd3805492f1e09230b38bfbdfe0e8e5f3e02e201b78e232ffec4b8&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=hermes-agent-proactive

PR: buzz://pr?id=f656c2b5fbe03dce5ae87c63009d517309e63e58ae745d1d0c59eaa360addc66&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es
