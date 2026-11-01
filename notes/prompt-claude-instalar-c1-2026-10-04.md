# Encargo Claude — instalar la APK C1 revisada, conservando datos

Continúa Faceclaw en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. Codex revisó `0858d09`/`6492a89`, código, pruebas y APK: `notes/revision-codex-c1-2026-10-04.md`. No hay hallazgos que bloqueen la instalación. El usuario mantiene autorizadas las actualizaciones necesarias con firma original/datos conservados y ha ofrecido conectar el móvil. **Este encargo es instalar y comprobar OFF, sin ensayo de voz.**

Lee AGENTS.md, continuidad y revisión C1. Comprueba HEAD/estado y conserva cambios locales. No reset/clean, force-push, PR ni fusiones. Mantén intactos perfil existente, 33 ajustes, Hermes habitual, GPS/bloqueo, firmware /36 y Wear desconectado.

## Artefacto exacto

Usa `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.c1.apk`, SHA256 `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6`. Identidad `com.faceclaw.app`/805/`0.8.2-es.5-conversation.c1`, certificado original SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Recomprueba hash/firma/identidad antes de instalar. No regeneres AAR, repitas suites, rebuild ni vuelvas a firmar la APK ya revisada. Si el archivo falta, recupera la copia NAS y comprueba ese hash; no sustituyas silenciosamente el artefacto.

## Precondición y procedimiento

1. Comprueba solo conexión ADB primero; selecciona explícitamente el Pixel correcto (serial documentado `61161FDCG0013L`, verificar, no asumir). Si falta, pide conectar USB y desbloquear. **Antes de consultar UI o instalar, el usuario debe haber dejado Conversación local en OFF visible**; si puede estar ON, espera su confirmación, sin dump/captura/UI durante ON. No inicies ninguna sesión.
2. Con OFF confirmado y móvil desbloqueado, comprueba el estado seguro y ausencia de captura experimental/drenaje. Haz respaldo fresco de la APK realmente instalada y de los ajustes privados mediante el método ya usado. Nunca imprimas tokens, valores privados ni contenido del respaldo. No leas/exportes/copias el vector de perfil ni `noBackup`.
3. Verifica firma y hash del respaldo instalado; último estado esperado G3.4.2, SHA256 documentado `990a10f1c22a2ef995ef87169336d6c3dc917bd1ec7d607e0736d33fbd84b5f8`. Si difiere, identifica la versión real y conserva ese respaldo; no uses una reversión nominal en lugar del APK realmente presente ni continúes ante una discrepancia inexplicada.
4. Instala **la APK firmada exacta** con `adb -s <serial> install -r <apk>`. Sin desinstalar ni borrar datos. El helper de firma vuelve a firmar; no lo uses para sustituir el artefacto revisado. Reutiliza las comprobaciones/backups del procedimiento anterior de forma explícita.
5. Compara preferencias antes/después: cuenta esperada 33 e igualdad completa, imprime solo cuenta/igualdad. Investiga cualquier diferencia, sin restauraciones generales a ciegas. Comprueba paquete/versionCode/versionName instalados. Abre app solo después de OFF confirmado; observa nueva UI en OFF, perfil indicado como guardado sin leerlo y cero captura experimental actual. Verifica botones de idioma/diagnóstico, defaults `auto`/diagnóstico OFF de proceso nuevo y controles de fase ocultos; no pulses Iniciar ni actives modelo/captura. Si no se puede ver UI, informa esa limitación: versión instalada no equivale a observación de pantalla.
6. Conserva la reversión fresca y ajustes privados en los destinos habituales NAS con 700/600, hashes comprobados. No copies audio, transcripción, perfil ni secretos a notas/Git. Actualiza notas compartidas con respaldo de las anteriores. No modifiques servicios Jarvis/NAS/Hermes.

## Entrega

Escribe `notes/informe-claude-instalacion-c1-2026-10-04.md`: artefacto exacto, respaldo/reversión fresca, firma/hashes, resultado `install -r`, versión comprobada, comparación de ajustes, lo realmente observado en UI OFF y rutas/igualdad NAS. Separa instalada de ensayada; idioma real del motor y mejora del interlocutor **no medidos**. Si algún requisito impide instalar, informa el punto pendiente sin declarar éxito.

Actualiza AGENTS.md/continuidad con estado real, revisión Codex C1 y enlace al informe; conserva historial y problemas abiertos. Publica commits documentales en la rama compartida conservando commits Codex. Entrega commit final y ruta del informe. El ensayo posterior se acota con el usuario tras esta instalación; no lances automáticamente las cuatro sesiones de §13 ni recojas nuevas muestras de perfil.
