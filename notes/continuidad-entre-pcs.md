# Continuar Faceclaw desde otro PC

## Continuación activa: prototipo conversacional G2 (03-10-2026)

**Para retomar desde el PC de casa tras las pruebas del trabajo, leer [continuacion-pc-casa-2026-10-03.md](continuacion-pc-casa-2026-10-03.md).** Incluye instalación, firma respaldada, pruebas reales de captura/Hey Even/Chat/Pixel bloqueado, evidencia y próximos pasos. El ensayo terminó OFF por su límite temporal; no se dan por superadas todas las puertas G0/G1.

Trabajo activo en **`codex/conversation-detection-g0`**, manteniendo la adaptación española como base. Leer [conversation-detection-g0-results.md](conversation-detection-g0-results.md): implementación, instalación desde el trabajo y pruebas físicas pendientes. El Pixel ya tiene `0.8.1-es.5-conversation.g0.1`, firmado con la clave original; 32 ajustes conservados, incluido Hermes. Ensayo comprobado OFF, cero chunks y sin wakelock propio. No añadir VAD hasta superar G0/G1 en dispositivos reales. Requisito añadido: español y valenciano, también alternados; todavía pendiente de implementación y validación en ASR.

**Firma compartida:** ambos originales **`faceclaw-es.jks` y `store.password`** ya están copiados en **`Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/signing/`**; SHA-256 de ambos archivos comprobado idéntico al PC del trabajo. Carpeta 700 y archivos 600. En LAN corresponde a `192.168.0.110`. El certificado de la APK firmada coincide con el instalado, huella pública indicada más abajo. El informe incluye los comandos de recuperación. No subir firma, contraseñas, tokens ni ajustes privados a GitHub.

Estado actualizado el **3 de octubre de 2026**. Esta nota está versionada en GitHub; las claves privadas y las APK se guardan en el NAS.

**Asistente actual:** Faceclaw utiliza Hermes en Jarvis (`100.65.212.74:8791`), con Luna 6. El usuario confirmó la mejora de velocidad y decidió mantenerlo. El token no se cambió; OpenClaw queda como alternativa con sus datos conservados. Véase [asistente-hermes-jarvis.md](asistente-hermes-jarvis.md) para operación, mediciones y restauración. La copia del NAS contiene el estado más reciente mientras estos cambios de documentación locales estén pendientes de publicar en GitHub.

## Repositorio y rama

- Repositorio: https://github.com/DanielGTdiabetes/faceclaw-es
- Rama de trabajo de la adaptación española: `spanish-0.8.1`.
- Corrección de ubicación integrada: [PR #2](https://github.com/DanielGTdiabetes/faceclaw-es/pull/2), commit de fusión `444a85b8ae930f518004dd30bf6f1941ef852345`.
- Carpeta en el PC de casa: `E:\projects\faceclaw-es`. La ruta local del otro PC puede ser diferente.

Desde la carpeta del repositorio, comprobar primero `git status`. Si hay cambios locales, conservarlos antes de cambiar de rama o actualizar. Con el árbol limpio:

```powershell
git fetch origin
git switch spanish-0.8.1
git pull --ff-only origin spanish-0.8.1
```

Codex debe leer el `AGENTS.md` de la raíz y esta nota. La memoria local del PC de casa, `C:\Users\danie\.codex\memories\faceclaw.md`, sirve de apoyo; no se sincroniza mediante Git.

## Dónde está la información en el NAS

Servidor: **192.168.0.110** en LAN; desde el exterior usar **100.64.237.87 por Tailscale** (indicación confirmada por el usuario el 03-10-2026). Son dos direcciones del mismo NAS. Usuario SSH/SCP: **Dani**. Acceso comprobado desde casa por SSH con la autenticación ya configurada. El otro PC necesita acceso de red al NAS y su propia autenticación; no asumir que tiene la misma configuración SSH.

| Contenido | Ruta absoluta en el NAS | Estado comprobado |
| --- | --- | --- |
| Carpeta del proyecto privado | `/volume1/home/Dani/Faceclaw/` | Creada, permisos 700 |
| Resumen de continuidad | `/volume1/home/Dani/Faceclaw/LEEME.md` | Guardado |
| Nota de Obsidian compartida | `/volume1/Docker/obsidian/vault/Proyectos/Faceclaw.md` | Guardada |
| Carpeta de firma | `/volume1/home/Dani/Faceclaw/signing/` | Ambos originales copiados, hashes verificados y permisos 600 |
| APK original extraída del móvil | `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-installed-es.5.apk` | Guardada y comprobada por SHA-256 |
| APK de móvil corregida, sin firmar | `/volume1/home/Dani/Faceclaw/apk-builds/11ed6ac/faceclaw-location-unsigned.apk` | Guardada y comprobada por SHA-256 |
| APK de reloj del mismo build, sin firmar | `/volume1/home/Dani/Faceclaw/apk-builds/11ed6ac/faceclaw-watch-unsigned.apk` | Guardada y comprobada por SHA-256 |

La nota de Obsidian puede actualizarse mediante SSH/SCP; el conector de Obsidian presentó problemas de finales de línea desde Windows. No modificar ni borrar otras notas del NAS para resolverlos.

## Firma original: copia completada

Los archivos originales están en la carpeta `.tools/signing/` del repositorio del **PC del trabajo**:

- `faceclaw-es.jks`
- `store.password`

Se necesitan **los dos archivos juntos**. Ya están respaldados y verificados en el NAS. El PC de casa puede recuperarlos siguiendo el informe G0; no sobrescribir otra firma existente sin comprobar su identidad. No ejecutar el script de firma si falta la clave original, ya que podría generar otra.

Desde la raíz del repositorio en el PC del trabajo, después de comprobar que ambos archivos existen:

```powershell
scp .\.tools\signing\faceclaw-es.jks .\.tools\signing\store.password Dani@192.168.0.110:/volume1/home/Dani/Faceclaw/signing/
ssh Dani@192.168.0.110 'chmod 600 /volume1/home/Dani/Faceclaw/signing/faceclaw-es.jks /volume1/home/Dani/Faceclaw/signing/store.password'
```

Si SSH no está configurado en ese PC, copiar los dos archivos mediante File Station a la misma carpeta privada. Mantener los directorios con permisos 700 y los archivos con permisos 600. Nunca poner el contenido de estos archivos en GitHub, Obsidian o el chat. No sobrescribir una firma local existente sin comprobar primero si corresponde a la instalada.

## APK corregida y comprobación de la firma

La compilación del commit `11ed6acf48147bd1870c3e5bcc2c2f9088b3f1b9` terminó correctamente: [ejecución de GitHub Actions](https://github.com/DanielGTdiabetes/faceclaw-es/actions/runs/37023353011). Pasaron 693 pruebas Node, con 2 omitidas y 0 fallos, las pruebas Kotlin y la compilación Android de móvil y reloj.

Artifact: `faceclaw-es-unsigned-11ed6acf48147bd1870c3e5bcc2c2f9088b3f1b9`.

La APK de móvil corregida mantiene `com.faceclaw.app`, versión `0.8.1-es.5` y `versionCode` 805. Distinguirla de la instalada por su commit y el SHA-256 del archivo:

```text
e68599f513234190996217cc577fac17b02b042fde2c39f48c4e66300f435227
```

Huella **pública** SHA-256 del certificado de la APK instalada en el móvil (`CN=Faceclaw Espanol`):

```text
57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435
```

El hash del archivo y la huella del certificado son datos distintos. Una vez recuperada la firma, firmar la APK con `scripts/sign-spanish.ps1` en un entorno de compilación configurado y verificar con `apksigner verify --print-certs` que el certificado tiene **la misma huella** antes de instalar con `adb install -r`. Las APK sin firmar no son instalables. Usar la misma clave para móvil y reloj, sin desinstalar ni borrar datos para actualizar.

## Qué queda por hacer en Android

1. Validar físicamente G0/G1 con el usuario presente, siguiendo el informe: referencia OFF, captura breve, Hey Even/PTT, apagado y ciclo de vida. Terminar con ensayo OFF.
2. Confirmar desde las gafas la conexión con Hermes y la consulta de `location.get_current`; la APK instalada incluye esa corrección.
3. Recuperar la firma del NAS en cualquier otro PC que vaya a actualizar la app, verificando la misma huella pública.
4. Registrar las pruebas reales aquí y en el NAS. Planificar el soporte español/valenciano sin darlo por validado.

El Pixel 10 Pro Fold está actualizado por USB a `0.8.1-es.5-conversation.g0.1`, código 805. Conserva permisos de ubicación precisa/aproximada y notificaciones. Antes del prototipo se instaló también la APK de ubicación `11ed6ac`, con el mismo certificado. La corrección permite consultar coordenadas, precisión y antigüedad durante una conversación, sin abrir Tiempo ni Navegar. El puente oficial de OpenClaw pasó anteriormente una comprobación con una posición nativa simulada. **La instalación está comprobada; las pruebas desde las gafas reales siguen pendientes.**
