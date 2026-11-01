# Faceclaw S2.15: correcciones ASR e instalación — 16/10/2026

**Actualización 16/10/2026, 11:15 (Codex): EVO configurado en el Pixel.** Clave cargada con autorización del usuario y proveedor `even`/dirección/clave coincidente verificados después de abrir Faceclaw. 42 ajustes ajenos conservados, total 45; copia privada previa en `.tools/evo-config-20261016/`, temporales retirados. Salud desde Android por Tailscale 200/ready:true; UI Conectado/Escucha apagada observada. No se inició micrófono. Pruebas del usuario: texto rápido y respuesta lenta (~8 s totales); apunta a Hermes/LLM, sin medición separada ni prueba de ausencia de reserva. `even` en Conversación sigue pendiente. No repetir configuración/instalación automáticamente. Detalle: [configuración del Pixel](configuracion-pixel-2026-10-16.md).

Estado validado a las 10:46 Europe/Madrid en el PC del trabajo. Rama `claude/even-asr-provider`,
cambios locales sobre `eae0bc3`; no se han publicado commits nuevos.

## Resultado

- Corregidos los cinco problemas auditados: envío prematuro durante reserva, recorte silencioso de audio,
  configuración incompleta que seleccionaba Moonshine, interferencia entre sesiones Nemotron y falso éxito
  del medidor sin final. Corregidos también los cinco fallos antiguos de las pruebas Node.
- La interfaz espera el resultado remoto/local y el drenaje de PCM; silencio, error y cancelación no envían
  parciales antiguos. Reserva Whisper con límite explícito de 30 s, sin recortar frases como si fueran completas.
- Nemotron 0.2.0 sigue sin soportar correctamente dos inferencias simultáneas en este equipo. La pasarela
  admite una sesión, rechaza la siguiente con 503 y permite reserva local en PTT/Hey Even. No se ha resuelto
  la causa interna del motor. Continuo conserva reconexión; `even` en Conversación sigue pendiente.
- Pruebas finales: Node 1220 correctas, 0 fallos, 2 omitidas (1222); TypeScript y oxlint correctos;
  Kotlin 311/311, forzado sin caché. ASR Linux 138 pruebas + 51 subtests; Python Windows 195 correctas,
  30 omitidas + 51 subtests. Release y lintVitalRelease correctos.
- EVO: servicio activo/habilitado, NRestarts=0, límite 6 GiB; público solo `100.93.23.103:18770`, backend
  `127.0.0.1:18771`. Prueba TS real por Tailscale: JFK completa, 27 parciales, final a 0,227 s;
  segunda sesión 503 y una reserva simulada. No acredita Whisper Android con voz real.

## APK instalada y recuperación

Usuario autorizó expresamente instalación por USB. Pixel 10 Pro Fold, serie `61161FDCG0013L` comprobada.
Actualización mediante `adb install -r`, sin desinstalar; versión
`0.8.3-es.6-conversation.s2.15-even-asr-fixes`, código 805. APK instalada extraída e idéntica al artefacto:

- Archivo: `D:/Proyectos/faceclaw-es-even/dist/evo-asr-fixes-20261016/faceclaw-s2.15-even-asr-fixes.apk`.
- SHA-256: `e3d033b8c7e31df80c833ca3400f08a75ee7740fc20bfab90cdf46d6353a0064`.
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`; firmas v2/v3 válidas.
- Firma disponible ahora en `.tools/signing` de este clon, copiada desde la copia local antigua, protegida
  para usuario/SYSTEM e ignorada por Git. No crear otra clave. Clon antiguo conservado intacto.
- Copia privada de reversión S2.14 y ajustes en `.tools/install-s2.15-20261016/` (ACL usuario/SYSTEM),
  `before.apk` SHA-256 `b69cc0106db90ac6a4f340a7c2fc7f3c2ffd3e59810b8eecd0f4e2325713c342`.
  Volver con `adb -s 61161FDCG0013L install -r <before.apk>` tras comprobar identidad y escucha apagada;
  no desinstalar. No versionar XML privados ni copias de producción.
- Los 43 ajustes originales siguen idénticos tanto tras instalar como tras abrir la app; cero ajustes añadidos.
  Primera instalación sigue `2026-10-02 09:39:05`. Exportaciones temporales del móvil retiradas.
- UI observada tras desbloqueo: **Conectado / Escucha apagada**. Cero líneas wakelock Faceclaw y cero errores
  fatales Java/JS/nativos en la muestra del proceso. No se inició escucha ni se cambió el proveedor.

Servidor: copia de unidad anterior en `~/.config/even-asr/rollback-20261016-102011/`; procedimiento de reversión
en `preparacion-evo-x2/asr/servicio/README.md` de Hermes. Sin cambios de clave, UFW ni linger.

## Continuidad y límites

NAS SSH directo desde este PC: identidad contrastada con known_hosts existente, autenticación de la clave
actual rechazada. No se han alterado claves ni probado contraseñas. Se utiliza la ruta CIFS ya autorizada
de even para una copia nueva en `/mnt/evo-backup/faceclaw-correcciones-20261016/`
(NAS `//192.168.0.110/Home/evo-x2/faceclaw-correcciones-20261016/`).
El LEEME histórico de `/volume1/home/Dani/Faceclaw/` no se ha actualizado por esa limitación de acceso.

Pendiente de validación física: voz/G2 y reserva Whisper Android. H1 no cerrado; implementación `even` en
Conversación, valenciano, corpus ampliado (suspendido por el usuario), reinicio con linger y estabilidad
8 h/48 h siguen pendientes. No repetir instalación ni activar captura automáticamente.
