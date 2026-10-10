# STYLE participativo desplegado en Jarvis — 10-10-2026

Usuario autoriza directamente en este chat: «Autorizo sustituir `conversation.py` en Jarvis por el archivo preparado y reiniciar solo `faceclaw-hermes.service`». Completado el [encargo](prompt-codex-desplegar-style-jarvis-2026-10-10.md).

## Cambio y comprobaciones

- Destino: `dani@100.65.212.74`, `/home/dani/faceclaw-hermes-bridge/conversation.py`.
- SHA-256 anterior, confirmado antes de actuar: `8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868`.
- SHA-256 desplegado: `417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc`, idéntico a `integrations/hermes/conversation.py`. AST local y remoto iguales salvo la asignación `STYLE`; sintaxis validada con el Python del venv del servicio.
- Respaldo: `/home/dani/faceclaw-hermes-bridge/rollback-20261010-style/conversation.py`, hash anterior verificado; carpeta 700 y archivo 600. No sobrescribirlo al retomar.
- Transferencia a `conversation.py.new`, modo 600, sustitución atómica. Archivo activo final 600.
- Solo reiniciado `faceclaw-hermes.service`: activo/running, PID final `2101760`, puerto 8791 escuchando y marcador de arranque observado a los 6,2 s. Journal de la invocación: 18 entradas, cero prioridades de error, tracebacks, indisponibilidad del canal de conversación o colisión de puerto; solo recuentos, sin imprimir contenido de conversaciones ni secretos.
- `hermes-gateway.service` activo; PID `557095` idéntico antes/después, sin reinicio.
- `bridge.py` y `daily_context.py` no desplegados; hashes: `e285abf63f838be762c4bee221289947e04ab9a517705c0a7ec7e115961adbb5` y `5702985aeed25058977a31addfd7b13f73cd8628c74a9aa5ded6838becf56bf7`.

La primera comprobación ADB encontró cero wakelocks de Faceclaw en la sección activa, coherente con el OFF documentado de S2.11. Al recomprobar, el móvil ya no estaba disponible por ADB; no se consultó UI ni se inició captura. No se observó reconexión/catálogo del móvil en el arranque final. El despliegue no acredita todavía aportaciones con/sin preguntas ni visualización en las gafas; sesión física coordinada y acotada pendiente.

## Incidencias de ejecución

La revisión automática bloqueó inicialmente el SCP por considerar privado el código; GitHub confirmó archivo público e idéntico al blob local `acf15e2d420d824df97b6511f5a07eb615f0487b` del commit `bf46b4793bdf3aab3088933d8dae96b0d90199a2`, y la transferencia fue admitida. La activación se bloqueó después por falta de autorización humana directa; se recibió la autorización citada arriba y se permitió ejecutar. No se cambiaron los permisos generales de Codex.

El primer intento autorizado revirtió automáticamente porque la comprobación fija a los seis segundos llegó antes del marcador de escucha. Se confirmó calentamiento de 5210 ms más arranque del proceso y ambos servicios activos tras revertir. El intento final esperó disponibilidad efectiva del puerto y el marcador de su propia invocación, con cota de 45 s; completó en 6,2 s. El respaldo original se conservó.

## Reversión

Con conversación OFF, comprobar el hash del respaldo y restaurar atómicamente; reiniciar únicamente el puente:

```bash
cd /home/dani/faceclaw-hermes-bridge
cp -p rollback-20261010-style/conversation.py conversation.py.new
chmod 600 conversation.py.new
mv conversation.py.new conversation.py
systemctl --user restart faceclaw-hermes.service
```

Esperar a que el puerto 8791 escuche y comprobar ambos servicios. La recuperación del hash anterior revierte exclusivamente STYLE. No se hizo commit, push ni copia NAS en este encargo; se conservaron los cambios locales S2.10/S2.11.
