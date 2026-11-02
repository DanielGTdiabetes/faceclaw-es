---
title: "S2.27: prueba física de notificaciones sintéticas"
tags: [faceclaw, notificaciones, imagenes, evidencia]
status: active
created: 2026-11-02
---

## Estado y alcance

S2.27 instalada, código fuente de APK `8e918952cdd1e9051b74b9c217eb9fa31b939c2a`.
Documentación previa `ab726b3f81339eb0a7c35808c5b44f7e147ad924`, rama `feat/e624c5e5`.
No se modificó código, firmware, permisos, perfiles ni modelos; no se reinstaló,
reinició ni inició captura en estas pruebas. Las pruebas usaron exclusivamente
patrones sintéticos; no imágenes clínicas, audio ni capturas del usuario.

## Resultados confirmados por Dani

1. Gráfica 640x240: curva y cuadrícula visibles en detalle, popup automático solo texto.
   Confirmación específica `f63ebf46ffa6863fb89f5341db780d13e534297589eb7b28c12c8565e876d0a3`
   («sí, exacto»), tras confirmación general `f9f50025d60345bb0592e88ae8fee05847856587456fa8965b1ca7b5e1a451f0`.
2. Patrón de color 2048x1024: rectángulo verde con tablero de cuadrados apenas
   distinguible; imagen visible, legibilidad limitada. No se aprueba calidad general.
   Observación `de6f3a1ea8685efed82a8f1828cd0052baad6e871a6c435a662cf3c37035a7d6`.
3. Mismo tag del patrón grande actualizado a aviso sin adjunto: retirada de imagen
   y conservación del texto confirmadas («prueba sin imagen correcta»), evento
   `79bc638c559fa1d4a4d797112d5b4987f2b1590ec24a3347e96e584ddb78b65c`.
   Esto prueba retirada del adjunto; no un fallo de decode provocado.

## Interpretación del contraste

La fixture de color alterna el canal azul B=40/200 sobre degradados R/G.
`GrayPacket.kt:luma` pondera azul con 114/1000: el tablero aporta unos 18 niveles
de contraste sobre 255 antes de gamma, dithering y reducción.
`app/native/image-files.ts:PHOTO_TONE` aplica gamma 2.2 y dithering a 16 niveles.
`app/ui/notifications.ts:notificationContentWidth` reserva espacio a las acciones.
El patrón elegido es poco adecuado para juzgar nitidez monocroma. Es una explicación
compatible con lo observado; no demuestra por sí sola que la imagen física sea correcta.

## Tiempo observado y límites

Se leyó en memoria el export existente de FrameTimings, conservando solo números,
sin copiar el archivo completo ni sus etiquetas de contexto.
Root frame 252: `2026-11-02 18:15:14.563`, durante la ventana del patrón grande;
frame 256: `fetch-notification-picture` = **79 ms**.
Ese span engloba carga nativa, escalado, conversión a gris y copia del paquete TS.
No es decode aislado ni tiempo hasta imagen visible. El span no incluye key;
atribuirlo al patrón grande es una correlación temporal. El export conserva solo
una ventana y frames lentos: no permite afirmar que fuera la primera carga absoluta.

## Mecánica y recibos

Android confirmó BigPictureStyle y `pictureIcon` para ambos avisos con imagen;
para el aviso final, template=null y sin adjunto. El filtro del recibo final se
acotó al registro actual mediante indentación para excluir el historial de Android.
Antes de los envíos no había wakelock actual de Conversación.

La entrada file URI del CLI falló como «not a bitmap» devolviendo exit code 0.
La misma gráfica se publicó usando el formato documentado data:base64.
El patrón grande se recodificó con PNG Sub: 179050 a 41805 bytes, píxeles idénticos
comprobados al invertir el filtro. No se alteró la fixture original.

Recibos públicos en OUTBOX y copias versionadas en `notes/evidence/`:

- `PHYSICAL_CHART_STEP1.json`
- `PHYSICAL_LARGE_STEP2.json`
- `PHYSICAL_NO_IMAGE_STEP3.json`
- `PHYSICAL_FETCH_TIMING.json`
- `SYNTHETIC_PHOTO_PATTERN_TRANSPORT.json`

## Pendientes

Calidad fotográfica general y autonomía no validadas. Decode aislado/primera carga
absoluta sin medir, memoria/GC sin medir. Fallo real de acceso/decode y protocolo
S2.26 de hueco/rebind/dedupe no ejecutados en esta sesión. Sin merge.
No se repitieron suites ni build: solo documentación y recibos; resultados previos
pertenecen a `8e918952` y constan en `IMAGENES_S2_27_CASA_20261102.md`.

Issue: buzz://issue?id=e624c5e5e91cd57aaa35d45de23d39a39f71412e8dedf59cc7a94d35910fb8ee&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

PR: buzz://pr?id=8a4bcdc3b70abc1674e085061419ad3f2798410725a8b7e71e63c51706d402ca&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es
