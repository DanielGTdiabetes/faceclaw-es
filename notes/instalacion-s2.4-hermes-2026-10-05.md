# S2.4-Hermes instalada conservando datos

05-10-2026, PC del trabajo, rama `codex/conversation-detection-g0`. El usuario conecta el Pixel y autoriza actualizar la APK. Build/instalación completados; sin escucha, audio, ensayo físico, reenrolamiento, firmware, reloj ni despliegue del puente.

## Artefacto e identidad

| Elemento | Estado comprobado |
| --- | --- |
| Paquete / versión / código | `com.faceclaw.app` / `0.8.2-es.5-conversation.s2.4-hermes` / 805 |
| APK firmada local | `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.4-hermes.apk` |
| SHA-256 firmada e instalada | `8e59a2a63e8b94e98ca8b9874972f8fce1f8081b297b6812306b726860da994c` |
| SHA-256 unsigned | `d6c8212464ba8b1e21212402125a968e027b93f0a3e49b43a097beff1dbcf04c` |
| Certificado original SHA-256 | `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435` |
| Reversión fresca S2.2 | `dist/conversation-g0/before-update-s2.4-hermes.apk`, SHA-256 `072e14be98066b52e55f2ec75a252e86160fa4fbf5c47fb5461e02f9f1c257fa` |
| Pixel / serie | Pixel 10 Pro Fold / `61161FDCG0013L` |

Se mantiene805 para permitir reversión con misma firma y `adb install -r`. No se generó clave ni se desinstaló/borró app. El helper de firma admite la nueva versión y verifica identidad antes de firmar. Candidata nueva, distinta de la S2.3 exacta preparada en casa; no se afirma haber recuperado aquella APK.

## Compilación y comprobaciones

Antes de firmar se comprobó la presencia conjunta de `.tools/signing/faceclaw-es.jks` y `store.password`, y el certificado público original. Kotlin AAR compilado desde la fuente actual; NativeScript prepare y webpack Android producción completados. Android release y lintVitalRelease completados offline.

El primer intento de Gradle quiso recompilar llama y falló por NDK ausente en este PC. No se instaló un NDK ni cambiaron fuentes nativas: se extrajeron las cuatro bibliotecas propias de la APK S2.2 recién respaldada a la carpeta generada de jniLibs. El segundo build omite únicamente `prepareFaceclawLlama` y `prepareFaceclawNativeLibs`, recompilando Kotlin/Android/JS y ejecutando lintVital. **Las siete `.so` finales son idénticas por SHA-256 a S2.2**, incluido runtime/ML. `assets/app/package.json` también idéntico. Bundle acredita selector Hermes, `conv/1`, método de apagado y binding integrado. Firma válida original y zipalign16KB verificados.

81/81 pruebas del incremento y TS/lint acreditadas por [revisión Codex](revision-codex-ui-hermes-2026-10-05.md); no repetidas por rutina durante esta instalación. Logs/builds/helpers en `.tools/` y `dist/`, excluidos de Git. APK/base instalada extraída de nuevo: coincide con el hash de la firmada.

## Conservación y pantalla final

Antes: usuario desbloquea y confirma OFF; UI leída muestra Conectado, Display off, conversaciónOFF, perfil guardado y castellano forzado. Ajustes exportados con receptor autorizado solo para respaldo, carpeta local `.tools/s2.4-hermes-private` con ACL usuario/SYSTEM; export temporal del móvil retirado. No perfil/vector/audio/noBackup exportados.

`adb -s 61161FDCG0013L install -r` → Success. `dumpsys package`: nueva versión/805, `lastUpdateTime=2026-10-05 07:59:49` según el móvil. **34 entradas antes y después, comparación canónica idéntica**, incluidos Soniox, Hermes/token, bloqueo y GPS; no se imprimen valores ni se restaura una copia antigua.

El móvil se bloqueó automáticamente al verificar la pantalla; usuario lo vuelve a abrir. Observación final: Conectado, Display off, Conversación localOFF, **Hermes en conversaciónOFF**, perfil guardado, castellano forzado, `Wake Locks: size=0`. Arranque/UI de la nueva app comprobados; sin pulsar ON ni probar gafas. No se atribuye apagado físico ni precisión a esta observación.

## Copias NAS y continuación

Acceso SSH/SCP comprobado por Tailscale `Dani@100.64.237.87`; autenticación no guardada en archivos/notas/Git. APK nueva y reversión en `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-s2.4-hermes/`, hashes remotos iguales a locales. Ajustes privados `before.xml`/`after.xml` en `/volume1/home/Dani/Faceclaw/connection-backups/2026-10-05-s2.4-hermes/`, byte a byte idénticos en el NAS. Carpetas700, archivos600. Copias históricas/firma conservadas.

Nota compartida y este informe se sincronizan en `/volume1/home/Dani/Faceclaw/notes/`, con referencia añadida a LEEME. Cambios de código/notas aún sin commit ni publicación GitHub; conservar el árbol local. La copia NAS no sustituye publicar el código cuando se autorice esa fase.

**Puente activo todavía sin `conv/1`: la UI informa «No disponible» y mantiene HermesOFF.** Candidata del servidor ya probada en carpeta aislada; falta despliegue reversible y comprobación de capacidad. Después, ensayo breve guiado de escucha/aportación/retirada/prioridades con OFF final. No repetir auditoría G0/G1/G2 ni considerar resueltos los incidentes reales de envío o «Yo» sin identidad por instalar esta APK.
