---
title: "Faceclaw S2.27: imágenes bajo demanda, instalada y revisión física pendiente"
tags: [faceclaw, continuidad, notificaciones, imagenes]
status: active
created: 2026-11-02
---

S2.27 instalada con la autorización de Dani: actualización de APK en `5d03c745`, apertura S2.27
en `2fecb00f` y Pixel desbloqueado/OFF en `6baab441`. No se inició captura ni una prueba física.

## Cambio y decisión

Imágenes BigPictureStyle solo en detalles abiertos desde lista/bandeja. Los popups automáticos
conservan texto; no cargan el adjunto. Una gráfica sin título puede ocupar el detalle; si no hay imagen
o desaparece el acceso, se conserva el texto o el marcador anterior «(untitled)».
Caché máxima de ocho imágenes, renovada por postTime/tamaño/60 s e invalidada al cambiar listener/notificaciones.
No incluye diseños personalizados 0.8.6, firmware /38, nuevos permisos/dependencias ni cambios en Hermes/ASR/perfiles/tiempo/GPS.

Base: `feat/7f26a24f @ 79a23ef72abb4145744d45bba0fc44680f8fa26c` (S2.26).
Rama: `feat/e624c5e5`. Fuente del artefacto: `8e918952cdd1e9051b74b9c217eb9fa31b939c2a`.
Worktree: `E:\projects\faceclaw-images-s2.27-20261102`; el checkout original permanece limpio en su rama anterior.
Port `703029f`: ocho ficheros de upstream `40082b3f5b35a4d43beafcac00ef11215a5d3373`, sin CHANGELOG;
autor James Babcock conservado. `8e91895`: adaptación y nueve pruebas de comportamiento.

La evaluación inicial de Claude afirmó que no afectaba a popups. Al trazar SingleNotificationLayer,
Codex comprobó que comparte drawDetailContent con el modal automático: se añadió una exclusión por origen,
probada y aceptada por Claude. No se acepta el cherry-pick sin contrastar comportamiento/dependencias.

## Validación sobre 8e918952

- `npm test`: 1375 pruebas, 1374 correctas, una omitida, cero fallos; incluye las nueve nuevas.
- `tsc --noEmit`, `bash lint.sh`: salida 0; aviso Builder obsoleto previo.
- `bash scripts/test-kotlin.sh`: 368 pruebas, cero fallos/errores/omitidas. Incluye gráfica clara,
  transparencia, fondo oscuro, rampa de tonos y comportamiento previo sin inversión.
- NativeScript release y AAR compartida, Android `assembleRelease lintVitalRelease` (unsigned,
  arm64, tareas C++ excluidas y ocho nativas R4 conservadas): salida 0. Listener Android compilado.
- Claude aprueba código en `0a3972a2`; Deepseek verifica artefacto en `05a07416` y estado instalado en `84ddb3d8`.
- Nueve pruebas nuevas: no carga durante pase obsoleto, caché y actualización, viewport menor,
  pérdida de acceso/imagen ausente, invalidación, máximo de ocho entradas, encaje de gráfica,
  exclusión de popup y fallback con fuente grande.

## Instalación y artefactos

- `0.8.4-es.18-conversation.s2.27-imagenes-notificaciones` / 805; release, arm64-v8a, minSdk24/target35.
- APK y base.apk extraída: `b247d4975132a6a35b4cc1f3020b756b8096e667aa40e01d465adebe6411f6f1` (141829422 bytes).
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`; apksigner v2/v3 y zipalign comprobados por Deepseek.
- Ocho .so idénticas a S2.26 y R4; classes.dex cambia y classes2.dex se conserva.
- `adb install -r`: correcto, última actualización 18:02:04 CET; primera instalación
  `2026-10-02 09:39:05` conservada; 48 ajustes idénticos en comparación privada.
- Proceso estable durante cinco segundos iniciales. UI «Conversación» corresponde a enabled=false
  en main-view-model.ts:301-302; cero wakelocks actuales. Sin nuevos permisos ni captura iniciada.
- Arranque pasivo S2.27: 2 enlaces negocian txPhy=2/rxPhy=2/status=0,
  listener en la lista viva de Android, cero marcadores FATAL en log filtrado. No mide mejora de latencia.
- Firmware sigue `Faceclaw/37`; nada flasheado ni reemparejado.
- Artefactos locales: `C:\Users\danie\.buzz\OUTBOX\FACECLAW_IMAGES_S2_27_20261102\`.
- Retorno inmediato S2.26 fresco extraído: `e7fa8a076bcec6c9f535e45d730f784bbe3d98aa6c75c514865b925aec90f2f9` (`RETORNO_S2_26.apk`).
- Retorno R4: `f3e5b11bbf1f7774d13ecb030631e6b86da6e1fc03d8756ee68b6a9828163e57` (`RETORNO_R4.apk`). Ambos firmados originales y disponibles.
- Recibos públicos: `notes/evidence/IMAGENES_S2_27_*.json`; ajustes privados solo en
  `.scratch/FACECLAW_IMAGES_PRIVATE`, excluidos de Git/NAS. Sin perfil, audio ni datos clínicos exportados.

## Pendiente físico y riesgos

Pendientes: legibilidad real de imagen, fallback/popup sin imagen y coste del primer decode.
La primera decodificación/escalado es síncrona. Los bitmaps intermedios restantes los recupera el GC;
Claude lo considera menor no bloqueante. Un fallo transitorio puede dejar null en caché hasta 60 s
si no cambian postTime/listener. No se han medido memoria, tirones ni latencia física.

Se prepararon `SYNTHETIC_CHART.png` (640x240) y `SYNTHETIC_PHOTO_PATTERN.png` (2048x1024),
patrones generados sin datos personales/clínicos. Su hash está en SYNTHETIC_FIXTURES.json.
La ayuda real `cmd notification post --help` confirma BigPicture y file:///data/local/tmp/ como fuente.
No se publicaron avisos de prueba. Prueba guiada por coordinar con Dani: gráfica en detalle, patrón grande,
notificación sin imagen, popup sin imagen y valoración del primer decode. No usar gráficas clínicas reales
por petición original del humano. El protocolo de pérdida/rebind/dedupe de S2.26 sigue pendiente de ejecución física.

Retorno conservando datos (no ejecutado):
`adb -s 61161FDCG0013L install -r C:\Users\danie\.buzz\OUTBOX\FACECLAW_IMAGES_S2_27_20261102\RETORNO_S2_26.apk`
o RETORNO_R4.apk, tras confirmar OFF y respaldar el estado actual.

NAS verificado: `/volume1/home/Dani/Faceclaw/apk-builds/s2.27-imagenes-20261102/`.
Diez archivos con hashes idénticos: APK, ambos retornos, recibos, continuidad y patrones sintéticos;
carpeta 700/archivos 600. El recibo NAS se conserva localmente y en notes/evidence.

Issue: buzz://issue?id=e624c5e5e91cd57aaa35d45de23d39a39f71412e8dedf59cc7a94d35910fb8ee&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es

PR: buzz://pr?id=8a4bcdc3b70abc1674e085061419ad3f2798410725a8b7e71e63c51706d402ca&owner=ab90d61db8ac4aada915d46267f0b64e06b9a4c5ee7d304f03e7d5ece5d4b584&d=faceclaw-es


## Actualización de prueba física — 02/11/2026, 18:17 CET

Esta actualización supera los pendientes visuales de la sección anterior:
Dani confirma gráfica/curva/cuadrícula en detalle, popup solo texto y retirada
correcta del adjunto al actualizar a notificación sin imagen. El patrón grande
se ve con contraste limitado; no se aprueba calidad general. Un span conservado
de carga/conversión dura 79 ms durante esa prueba, sin key ni latencia visible.
Detalle, eventos y límites: [prueba física](IMAGENES_S2_27_PRUEBA_FISICA_20261102.md).
Decode aislado/primera carga absoluta, memoria y hueco/rebind S2.26 siguen pendientes.
Recibos públicos adicionales en `notes/evidence/IMAGENES_S2_27_PHYSICAL_*.json`.
NAS: seis archivos con hashes verificados en
`/volume1/home/Dani/Faceclaw/apk-builds/s2.27-imagenes-20261102/prueba-fisica-20261102-1720/`.
Sin código nuevo, reinstalación, captura, firmware ni merge.
