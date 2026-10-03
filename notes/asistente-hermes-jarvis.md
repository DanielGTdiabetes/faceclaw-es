# Asistente de Faceclaw en Hermes / Jarvis

Estado verificado el **2 de octubre de 2026**. El usuario confirmó la mejora de velocidad y decidió mantener esta conexión.

## Conexión actual

| Dato | Valor |
| --- | --- |
| Teléfono | Pixel 10 Pro Fold, Faceclaw `0.8.1-es.5` |
| Gafas | Even Realities G2 |
| Proveedor en Faceclaw | Agente externo; la interfaz aún usa etiquetas de OpenClaw |
| Servidor Tailscale | `100.65.212.74` |
| Puerto | `8791` |
| Equipo | BMAX / Jarvis, LAN `192.168.0.234`, usuario SSH `dani` |
| Motor | Biblioteca `AIAgent` de Hermes instalado en Jarvis |
| Modelo del puente | `gpt-6-luna`, proveedor `openai-codex`, OAuth existente de Hermes |
| Servicio de usuario | `faceclaw-hermes.service`, habilitado; `Linger=yes` |

Se cambiaron exclusivamente `assistant.bridgeHost` y `assistant.bridgePort` mediante el receptor oficial de ajustes ADB. **El token permaneció idéntico**, al igual que los demás ajustes. No se modificó ni instaló una APK.

El puente reconoce las 33 herramientas MCP que ofrece el teléfono. Usa `hermes-cli` y las entradas directas `glasses_list_tools` / `glasses_call`. Inicializa el agente una vez, reutiliza su conversación y mantiene el streaming. No usa los antiguos scripts de G1/Rokid ni LiteLLM. La conversación de este servicio reside en RAM y se pierde al reiniciarlo; se conserva la memoria normal de Hermes. No importa el historial de OpenClaw ni archivos de contexto de proyectos.

El servicio principal `hermes-gateway.service` sigue activo y conserva su configuración habitual con Terra. No debe confundirse con el nuevo servicio de Faceclaw ni pararse como parte de retirar OpenClaw del NAS.

## Código y operación

- Instalación: `/home/dani/faceclaw-hermes-bridge/`.
- Fuente local: `E:\projects\faceclaw-hermes-bridge\`.
- Unidad instalada: `/home/dani/.config/systemd/user/faceclaw-hermes.service`.
- Intérprete: `/home/dani/.hermes/hermes-agent/.venv/bin/python`.
- Configuración privada: `/home/dani/faceclaw-hermes-bridge/private.json`, permisos `600` dentro de carpeta `700`. Contiene el token; no imprimirlo ni publicarlo.

```sh
ssh dani@192.168.0.234 'systemctl --user status faceclaw-hermes.service'
ssh dani@192.168.0.234 'journalctl --user -u faceclaw-hermes.service --since "10 minutes ago" --no-pager'
ssh dani@192.168.0.234 'systemctl --user restart faceclaw-hermes.service'
```

Las métricas propias registran tiempo al primer texto, tiempo total, resultado y número de llamadas; no incluyen las frases del usuario. Tras actualizar Hermes, repetir las pruebas del adaptador: depende de la API interna de la versión instalada.

## Mediciones comprobadas

Tres turnos reales de la conexión del móvil, completados sin herramientas:

| Turno | Primer texto enviado | Respuesta completa |
| --- | ---: | ---: |
| 1 | 1,777 s | 2,446 s |
| 2 | 1,112 s | 1,857 s |
| 3 | 1,643 s | 2,537 s |

Medianas: **1,643 s / 2,446 s**. Último turno sencillo comparable de OpenClaw en el NAS: **12,808 s / 13,394 s**. El usuario indicó que ahora responde «rapidísimo». Los tiempos comienzan cuando el puente recibe el texto; no incluyen transcripción de voz ni el instante exacto en que las gafas muestran la respuesta.

La mejora corresponde a la combinación de Hermes, su contexto y Jarvis. Cambiaron servidor, implementación e historial, por lo que no se aisló la influencia del hardware. La integración MCP se probó con herramientas simuladas inocuas; aún no se ha validado cada herramienta real del teléfono. El catálogo inicial de este perfil tuvo 22 herramientas; los otros MCP configurados de Hermes no se consideran todos verificados o habilitados aquí.

## Vuelta a OpenClaw sin perder datos

La configuración anterior de Faceclaw está conservada íntegramente en una carpeta privada del PC:

`C:\Users\danie\.codex\private\faceclaw-hermes-2026-10-02\before-hermes.xml`

También se conserva una copia privada en el NAS:

`/volume1/home/Dani/Faceclaw/connection-backups/2026-10-02/before-hermes.xml`

Estos archivos contienen tokens y otros ajustes sensibles. No incluirlos en Git, Obsidian ni mensajes. La nota publica únicamente sus rutas.

Para volver:

1. Arrancar los contenedores si están parados:
   `ssh Dani@192.168.0.110 'docker start openclaw-gateway openclaw-cli'`.
2. Esperar a que el gateway esté sano: `ssh Dani@192.168.0.110 'docker ps --filter name=openclaw'`.
3. En Faceclaw, mantener proveedor externo y token, y cambiar servidor a **`100.64.237.87`** y puerto a **`8790`**.
4. Comprobar reconexión, catálogo del teléfono y un turno sencillo desde las gafas.

El token actual sirve para ambas conexiones. Si después se cambian otros ajustes del móvil, conservarlos al volver: normalmente basta cambiar esos dos campos. El respaldo completo queda como recuperación adicional.

OpenClaw conserva configuración, autenticación e historial en `/volume1/Docker/openclaw/config` y `/volume1/Docker/openclaw/workspace`. Modelo configurado: Luna 6; OcuClaw y streaming permanecen habilitados. Producción sigue en `2026.9.6`; la imagen `2026.9.7` se descargó y se preparó una copia aislada, pero no se probó ni se activó.

## Parar los contenedores del NAS

Faceclaw ya no depende de `openclaw-gateway` ni `openclaw-cli`. Se verificaron Telegram habilitado y los plugins OcuClaw y Nightscout; pararlos también deja esas funciones de OpenClaw sin servicio. No se encontraron trabajos en `cron/jobs.json`.

**Estado final:** el usuario autorizó parar ambos contenedores y conservar los datos. Se ejecutó `docker stop -t 30 openclaw-gateway openclaw-cli` y se verificó que ambos están en estado `exited`. Los directorios de configuración y workspace siguen presentes. Hermes y la conexión TCP real del móvil al puerto 8791 permanecen activos. Telegram, OcuClaw y el plugin Nightscout de OpenClaw quedan sin servicio hasta arrancar de nuevo el gateway.

Parar conserva los datos y los contenedores:

```sh
ssh Dani@192.168.0.110 'docker stop openclaw-gateway openclaw-cli'
```

No borrar contenedores, volúmenes, configuración ni autenticaciones. Mantener el contenedor Tailscale del NAS y los demás servicios ajenos a OpenClaw. El gateway tiene política `unless-stopped`; un paro manual debe revertirse con `docker start` para volver a utilizarlo.

Auditoría completa local: `E:\projects\openclaw-latency-audit-2026-10-02.md`.
