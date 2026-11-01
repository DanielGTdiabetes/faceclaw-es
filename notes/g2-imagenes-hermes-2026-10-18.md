# Imágenes de Hermes en las G2 (`glasses.show_image`) — 18/10/2026

**Petición del usuario:** que Hermes pueda añadir imágenes o dibujos a sus respuestas en las gafas.
El puente (EVO-X2) tiene su candidato en
`E:\projects\Hermes agent proactive v2\preparacion-evo-x2\puente\imagenes-g2-20261018\`, con el diseño completo
en su README.

## Cómo pinta hoy Faceclaw y qué admite

- **Texto y overlays:**
  - Las respuestas del chat (`chat/text-delta`) se pintan en `AssistantLayer` (`app/ui/shell/assistant.ts`,
    cuadro de `input-dialog.ts`: 560×232 en x=40, dentro de la franja de 288 px de `geometry.ts`).
  - Los avisos `notify/deliver` (máx. 240 caracteres) y la herramienta `glasses.show_alert` usan
    `ShellAlertLayer` (`shell.ts`).
- **Pantalla:**
  - Lente de 640×480. `GrayImage` usa gris de 8 bits y se cuantiza a **16 niveles** (`grayToNibble`).
  - El **0 es la clave de color** (transparente) del shell: las capas rellenan con 1.
  - El negro de las lentes es transparente, así que la tinta tiene que ser clara.
  - Firmware modificado (`g2flash`): no hay límites de contenedor del SDK.
- **SDK oficial EvenHub** (por comparar; skill `goodrahstar/evenhub-g2-skill`):
  - Contenedor de imagen en gris de 1 byte/píxel, con compresión LZ4.
  - 20–288 × 20–144 y como mucho 4 imágenes por página. Si se pasa de cualquier límite, falla la página entera.
  - Faceclaw emula estos contenedores para las apps EvenHub (`app/apps/evenhub/containers.ts`), pero aquí no
    se usan.
- **PNG:** `upng-js` ya está en la app (`imagefile.ts`, `evenhub/session.ts`).

## Cambios

- `app/assistant/glasses-image.ts` (nuevo, puro y probado con node):
  - Decodifica el base64 (estándar o URL-safe) y valida el PNG: como mucho 400 000 caracteres y 1600×1200 px
    decodificados.
  - Convierte RGBA a gris con el alfa sobre negro.
  - Si hace falta, lo reduce por media de áreas hasta 528×216 (196 de alto con pie).
  - Cuantiza a 16 niveles con mínimo 1 y limita la duración (3-60 s, 15 por defecto) y el pie (120 caracteres).
- `app/ui/shell/image-layer.ts` (nuevo): `ShellImageLayer`.
  - Usa el mismo cuadro que la respuesta, con la imagen centrada (`bitBlt`) y un pie opcional.
  - Se cierra sola tras los segundos indicados; un clic o doble clic la cierra antes.
- `shell.ts`: `showImage(image, caption, seconds)` despierta la pantalla y sustituye la imagen anterior si sigue
  arriba. Con el asistente abierto, añade al menú de la respuesta la fila **«Imagen»**, que la vuelve a abrir.
- `assistant.ts`: `setImage()` y tercera fila del menú. Cada turno nuevo la quita.
- `system-tools.ts`: herramienta `glasses.show_image` `{png_base64, caption?, seconds?}`, `proactive: true`
  (pasa por el límite de 6/min del MCP).
  - Solo en Android: el test de iOS fija la lista de herramientas y el puente Hermes solo se usa con el Pixel.
  - El decodificador se carga en la primera llamada, para que los tests de `system-tools` no necesiten
    simular `upng-js`.
- Tests: `tests/glasses-image.test.cjs` (7), inclusión en `tests/tsconfig.json` y mock de `./image-layer` en
  `tests/ai-chat.test.cjs`, que fija los imports de `shell.ts`.
- `App_Resources/Android/app.gradle`: `versionName` `…-es.8-conversation.s2.16-g2img` (`versionCode` 805).

Diff completo: `cambios-app.diff` en la carpeta del candidato del puente.

## Comprobaciones

- `tsc --noEmit`: sin errores. oxlint (archivos tocados): sin diagnósticos.
- `npm test`: **1318 pruebas, 1317 correctas, 0 fallos**. En el primer intento fallaron 10 porque los arneses
  no simulaban los imports nuevos; se corrigieron como se describe arriba.
- **Compilación:** con `.tools/g2img-build.ps1`, derivado de `u084-build.ps1`. El primer intento falló porque
  la shell de Claude define `NoDefaultCurrentDirectoryInExePath=1` y cmd no encontraba
  `platforms/tempPlugin/core/gradlew.bat`. Además faltaba `node_modules/@nativescript/core/platforms/android/core.aar`,
  que estaba a las 07:29. Se repitió sin esa variable, solo para ese proceso: Gradle correcto.
- La firma exigía añadir la versión al `ValidateSet` de `scripts/install-conversation-g0.ps1` (hecho).
- **APK:** `dist/conversation-g0/faceclaw-0.8.4-es.8-conversation.s2.16-g2img.apk`, SHA-256
  `0a973bf5e0ad744d3d9542640b832e77c56c0e075309b636a6d45bbd8a30bcda`, `versionCode` 805 (`aapt`), firmada con la
  identidad original. Sin firmar: `28558db0041824abf59136edc5f1fb01e6e7974624b914b46b525a0e730286e2`.
  `bundle.mjs` contiene `glasses.show_image` y la fila «Imagen».

## Instalación — 18/10/2026, 11:32 (OK del usuario)

- Ajustes antes y después con `.tools/g2img-export-settings.ps1`: **48 entradas, idénticas**.
- `install -r` correcto: `0.8.4-es.8-conversation.s2.16-g2img` / 805, `firstInstallTime` 2026-10-02.
- Respaldo de la anterior (0.8.4-es.7, `92447fff…`) en `dist/conversation-g0/before-install-20261018-093216.apk`.
  Para revertir, `install -r` de esa APK.
- Arranque sin errores; gafas ON_HEAD. Puente actualizado a las 11:33: Pixel con 35 herramientas.

## Pendiente (antes de la instalación)

- Instalar la APK en el Pixel (`61161FDCG0013L`) con `install -r`, conservando los datos y comparando los ajustes
  antes y después (`.tools/u084-export-settings.ps1`). Antes, el script guarda la APK instalada para poder
  revertir.
- Probar en las gafas: posición y legibilidad, cierre con clic y la fila «Imagen».
- Sin commit: el cambio está en el árbol de trabajo (archivos de esta nota) hasta que el usuario lo valide.
