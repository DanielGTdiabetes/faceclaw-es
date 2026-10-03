# Continuar Faceclaw desde otro PC

## Continuación activa: prototipo conversacional G2 (03-10-2026)

Trabajo nuevo en **`codex/conversation-detection-g0`**, manteniendo la adaptación española como base. Leer [conversation-detection-g0-results.md](conversation-detection-g0-results.md): implementación y APK sin firma, resultados de software, continuación desde el trabajo y pruebas físicas pendientes. El Pixel conserva `0.8.1-es.5`; no se instaló el prototipo. No añadir VAD hasta superar G0/G1 en dispositivos reales. Se conservó la conexión con Hermes.

**Firma compartida:** usar la carpeta privada ya creada **`Dani@100.64.237.87:/volume1/home/Dani/Faceclaw/signing/`** desde el exterior por Tailscale; en LAN corresponde a `192.168.0.110`. Desde `.tools/signing/` del repositorio del PC del trabajo, copiar juntos **`faceclaw-es.jks` y `store.password`**; carpeta 700 y archivos 600. Estaba vacía al comprobarla el 03-10-2026. El informe nuevo incluye comandos para copiar/recuperar y las rutas NAS de la APK de ensayo y de reversión. No subir firma, contraseñas, tokens ni ajustes privados a GitHub.

Estado comprobado el **2 de octubre de 2026**. Esta nota está versionada en GitHub; las claves privadas y las APK se guardan en el NAS.

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
| Carpeta de firma | `/volume1/home/Dani/Faceclaw/signing/` | **Vacía; falta copiar la firma desde el PC del trabajo** |
| APK original extraída del móvil | `/volume1/home/Dani/Faceclaw/apk-backups/faceclaw-installed-es.5.apk` | Guardada y comprobada por SHA-256 |
| APK de móvil corregida, sin firmar | `/volume1/home/Dani/Faceclaw/apk-builds/11ed6ac/faceclaw-location-unsigned.apk` | Guardada y comprobada por SHA-256 |
| APK de reloj del mismo build, sin firmar | `/volume1/home/Dani/Faceclaw/apk-builds/11ed6ac/faceclaw-watch-unsigned.apk` | Guardada y comprobada por SHA-256 |

La nota de Obsidian puede actualizarse mediante SSH/SCP; el conector de Obsidian presentó problemas de finales de línea desde Windows. No modificar ni borrar otras notas del NAS para resolverlos.

## Firma original: copia todavía pendiente

Los archivos originales están en la carpeta `.tools/signing/` del repositorio del **PC del trabajo**:

- `faceclaw-es.jks`
- `store.password`

Se necesitan **los dos archivos juntos**. En el estado comprobado no estaban en el NAS ni en el PC de casa. Comprobar de nuevo su existencia antes de afirmar que la firma está respaldada. No ejecutar el script de firma si falta la clave original, ya que podría generar otra.

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

1. Copiar y verificar los dos archivos de firma originales en el NAS.
2. Recuperar una copia privada de la firma en `.tools/signing/` del PC que vaya a firmar.
3. Firmar la APK corregida, comprobar la huella e instalarla como actualización en el móvil.
4. Reconectar el puente actual de Hermes en Jarvis para actualizar su lista de herramientas.
5. Preguntar desde las gafas: «¿Dónde estoy? Consulta la ubicación de mi móvil» y comprobar que llama a `location.get_current`.
6. Actualizar esta nota y la del NAS con el resultado real y la fecha de la comprobación.

El teléfono comprobado fue un Pixel 10 Pro Fold con Faceclaw `0.8.1-es.5`: ubicación activada, permisos de ubicación precisa y aproximada concedidos y servicio de Faceclaw en funcionamiento. La corrección permite consultar coordenadas, precisión y antigüedad durante una conversación, sin abrir Tiempo ni Navegar. El puente oficial de OpenClaw pasó una comprobación con una posición nativa simulada. **La APK corregida todavía no se había instalado ni probado desde las gafas reales.**
