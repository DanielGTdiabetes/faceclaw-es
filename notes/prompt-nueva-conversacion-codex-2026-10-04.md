# Continuar Faceclaw en otra conversación de Codex — 04-10-2026

Continúa el trabajo desde este relevo. El usuario tiene poco uso restante de Codex y ha elegido que **Claude haga el desarrollo/build y Codex escriba los encargos y revise sus entregas**. Mantén ese reparto; no repitas por tu cuenta el encargo que esté realizando Claude. No crees otra conversación ni envíes mensajes a Claude automáticamente.

## Estado del repositorio y lectura inicial

Proyecto Windows `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`, origen `https://github.com/DanielGTdiabetes/faceclaw-es.git`. Último commit antes de guardar este prompt: `f56ab37`, revisión Codex y siguiente encargo de build. Árbol limpio y rama sincronizada en esa comprobación. Este prompt puede tener un commit posterior, y Claude puede publicar más cambios: comprueba estado/HEAD real, conserva cambios ajenos y no hagas reset/clean ni cambies de rama a ciegas.

Lee primero:

1. `AGENTS.md` y `C:\Users\danie\.codex\memories\faceclaw.md`.
2. `notes/revision-codex-g3.4.1-2026-10-04.md`.
3. `notes/prompt-claude-build-g3.4.1-2026-10-04.md`, el último encargo preparado para Claude.
4. `notes/continuidad-entre-pcs.md`.

Cuando necesites contexto adicional: `notes/prompt-claude-g3.4-2026-10-04.md` contiene el relevo completo original; `notes/conversation-detection-g3.4-lenses.md` contiene implementación/instalación/artefactos G3.4; `notes/informe-claude-g3.4-2026-10-04.md` contiene su primera entrega. Prevalecen las entradas recientes sobre estados históricos.

## Qué está hecho y qué falta

- G3.4 implementada por Codex: app **Conversación local** (`local-conversation`) en launcher/lentes, mismo coordinador y motores del móvil, controles explícitos y texto temporal. Abrir/restaurar no inicia captura. Toque dentro de app inicia o detiene; doble toque dentro de app hace OFF y cede foco; cerrar ventana hace OFF. Texto opcional compartido solo en RAM; máximo120s y prioridad Hey Even/PTT/asistente conservados.
- G3.4 **instalada y comprobada anteriormente**: `0.8.2-es.5-conversation.g3.4`, paquete `com.faceclaw.app`, código805, firma original. Los33ajustes eran idénticos antes/después. Después de desbloquear se observaron conectado/OFF/perfil guardado y0wakelocks experimentales actuales. No se abrió la nueva app en lentes ni se observó bajo escucha. No asumir una comprobación nueva al retomar.
- Claude entregó código `5f35bc1` e informe `e4c8c01`: arregló menú Iniciar retenido que detenía una sesión iniciada desde otra entrada, etiqueta Texto local del menú que mostraba la selección en vez del motor activo y cuenta atrás duplicada en lentes.
- Codex revisó esa entrega: **sin hallazgos accionables**; comprobó de forma independiente70Node/TypeScript/lint y diff. Revisión publicada `f56ab37`. No ejecutó webpack/Gradle/firma/instalación ni consultó dispositivo/UI durante esa revisión.
- **G3.4.1 todavía no estaba compilada/firmada/instalada en el último estado comprobado.** Claude recibió el siguiente prompt para preparar `0.8.2-es.5-conversation.g3.4.1`, código805/firma original, verificar artefacto y actualizar el móvil solo cuando conectado y OFF confirmado. No hace falta incrementar a `es.6`.
- Informe esperado de ese encargo: `notes/informe-claude-build-g3.4.1-2026-10-04.md`. Todavía no se había recibido al guardar este relevo. No inventes su resultado ni trates el prompt como trabajo realizado.

## Próxima acción de Codex

Si el usuario aporta la nueva respuesta/commit de Claude, revisa el diff desde `f56ab37` o la base real de su entrega y lee su informe. Comprueba que se limita al build/metadatos/instalación/continuidad autorizados, y que sus evidencias respaldan lo afirmado. Verifica selectivamente lo necesario; no repitas suites o builds que no aporten evidencia nueva. Separa implementación, comprobación de software, observación física y pendientes.

Si aún no hay entrega nueva, indica que el próximo paso es ejecutar/terminar el encargo de Claude ya preparado; no reinicies desarrollo ni evaluación. Cuando haya un defecto en su entrega, prepara un encargo de corrección concreto con evidencia. Cuando esté correcta, registra la revisión y prepara el siguiente encargo acotado que corresponda al objetivo del usuario. Mantén respuestas concisas para ahorrar uso.

## Restricciones y dispositivos

- Antes de cualquier consulta de UI del móvil, comprobar conexión y confirmar conversaciónOFF. Nunca consultar/capturar UI duranteON. No inferirOFF solo por ausencia de wakelock. Si falta confirmación, continuar trabajo independiente y esperar; no iniciar captura/enrolamiento por tu cuenta.
- Un único perfil propio existente para castellano/valenciano. No repetir registro, leer/exportar vectores ni respaldar `noBackupFilesDir/faceclaw-own-voice/` alNAS. No importar perfiles históricos de Microphones ni crear perfiles de terceros. Guardado no acredita precisión/participación.
- Conservar33ajustes, Hermes, bloqueo desactivado, GPS y firma original. Actualizaciones necesarias autorizadas: respaldo fresco deAPK/preferencias privadas, misma firma y `adb install -r`; nunca desinstalar/borrar datos ni reinstalar la misma versión sin motivo.
- Sin grabaciones, audio experimental en red, modelos/umbrales nuevos por defecto. **No conectar audio/texto experimental aHermes.** No tocar firmware, otros proyectos ni servicios/configuración de Hermes/NAS/Jarvis.
- Gafas `Faceclaw/36` actualizadas manualmente porusuario, quien confirmó funcionamiento general como antes; no volver a actualizar ni modificar firmware.
- Pixel Watch4 Wear`0.8.2-es.1`/código3, misma firma/paquete y ACK real previo comprobado. Usuario lo desconectó deliberadamente porque ya estaba actualizado; no reconectar/emparejar/repetirACK por defecto.
- Pixel último serial USB `61161FDCG0013L`, ADB `C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe`. Conexión actual desconocida; Claude indicó móvil desconectado durante su revisión anterior.
- No reiniciar evaluación ni repetir baterías G0/G1/G2/GPS/Wear. Si un ensayo es imprescindible: único, breve, guiado, justificado y terminarOFF. Precisión/participación, rechazoTV/replay/mezclas, autonomía/Doze pendientes. Incidentes históricos492ms/siete descartes y UI1046ms/21drops siguen abiertos. G4 solo ante errores justificados,G5 prolongado pendiente,G6 requiere decisión posterior.

## Firma, compilación y continuidad compartida

Firma original en `.tools/signing/faceclaw-es.jks` y `store.password`; comprobar ambos antes de helpers, sin imprimir secretos ni generar sustitutos. Certificado público SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. El helper seguro `scripts/install-conversation-g0.ps1` valida firma/identidad. Preferencias privadas con ACL usuario/SYSTEM; imprimir solo número/igualdad, nunca valores/tokens.

Webpack directo exige guardar/restaurar `platforms/android/app/src/main/assets/app/package.json` original. SDK local Android y Java21 existentes, AAR/puentes reutilizados si no hay cambios nativos. Detalles y comandos en el encargo Claude de build. No ejecutar a ciegas `scripts/build-environment.ps1`, que contiene rutas/cambios deHOME de otro entorno.

NAS SSH `Dani@192.168.0.110`, raíz `/volume1/home/Dani/Faceclaw/` (Tailscale exterior`100.64.237.87` si procede). G3.4 APKs/fuente/reversión y preferencias antes/después ya respaldadas con hashes verificados, carpetas700/archivos600. Informes Claude, revisión Codex, prompt de build y continuidad compartida también copiados después de `f56ab37`; nunca perfil/audio/secretos. El encargo pendiente exige sus propios respaldos G3.4.1 y actualizar resúmenes preservando historial. Publicar código/notas sin secretos en la rama compartida. No afirmar que G3.4.1 está enNAS o instalada hasta revisar evidencia de Claude.

El usuario espera que al terminar Claude entregue commit final y ruta del informe, y que Codex los compruebe antes del siguiente encargo. Este prompt reemplaza la necesidad de cargar la conversación anterior completa.
