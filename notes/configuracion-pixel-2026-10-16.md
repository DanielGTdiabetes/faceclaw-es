# Configuración EVO-X2 en Pixel — 16/10/2026

**Validado:** proveedor `even` seleccionado, URL correcta y clave coincidente con el servidor,
también después de relanzar Faceclaw. El usuario autorizó cargar la clave desde el PC mediante «ok».
No se inició micrófono ni se enviaron preguntas automáticamente.

## Ejecución y comprobaciones

1. Releídas continuidad, registro, configuración e instrucciones de Faceclaw. USB `61161FDCG0013L`,
   Pixel 10 Pro Fold/S2.15 verificados; UI Conectado/Escucha apagada observada antes del cambio.
2. Consulta selectiva confirmó `voice.provider=onboard-whisper-small`, sin clave EVO y 43 ajustes.
   El selector deshabilita EVO mientras falta clave o dirección. Primer helper buscaba el UID en un campo
   ausente de dumpsys; corregido a `cmd package list packages -U`, antes de modificar ajustes.
3. SSH estricto comprobó even/dani, MAC `84:47:09:9c:a5:d8`, SSD `YMA51T0KA2520106HE`, servicio activo y
   archivo de clave 600. Clave leída solo en RAM; autenticación `/v1/models` correcta desde PC, sin audio.
4. Copia privada previa en `D:/Proyectos/faceclaw-es-even/.tools/evo-config-20261016/before-settings.xml`,
   ACL usuario/SYSTEM, ignorada por Git. No contiene aún la nueva clave EVO. No versionar/copiar a notas.
5. Para evitar el EACCES anterior de staging creado por shell, se reutilizó un archivo de exportación
   **creado por la app** (UID 10497/660). Sobrescritura por stdin y renombrado conservando el UID,
   comprobado antes de importar. No se repitió el procedimiento fallido de staging shell.
6. Importación oficial correcta de solo tres ajustes previstos: `voice.provider=even`, dirección
   `ws://100.93.23.103:18770/v1/audio/transcriptions/realtime` y clave existente. **42 ajustes ajenos idénticos**;
   total 43→45 por añadir dirección/clave explícitas. Verificado en disco y otra vez tras abrir la app.
   Clave sin imprimir ni persistir en archivos locales nuevos/argumentos; solo transferencia temporal y ajustes
   del móvil. Temporales export/import eliminados y ausencia comprobada en finally.
7. UI final Conectado/Escucha apagada observada. Una consulta pública de salud desde Android confirmó
   `HTTP/1.1 200 OK`, `ready:true`, `device:vulkan:0`. Ruta Tailscale del Pixel `100.113.213.3`→even correcta;
   ping inverso 44 ms. Servicio sigue activo y escuchando `100.93.23.103:18770`.
8. Los primeros diagnósticos `nc` con stdin de ADB devolvieron vacío/timeout: no acreditaban un fallo real
   de red. Recuperado generando la petición dentro de Android con printf y manteniendo stdin abierto;
   salud correcta. Consulta `sudo -n ufw status` no disponible por autenticación: no se alteraron firewall,
   sudo, claves ni servicio, ni fue necesario hacerlo. Backend no registra peticiones/texto, por lo que cero
   coincidencias en journal no demuestra ausencia de uso. No inferir motor efectivo por ese recuento.

## Pruebas comunicadas por el usuario

- Antes de configurar EVO: pregunta meteorológica ~10 s y aritmética sencilla ~5 s, apreciaciones del usuario;
  reconocimiento con una pequeña variación recordada de forma aproximada. Proveedor small confirmado después.
- Tras configurar: pregunta de habitantes de Valencia reconocida bien, ~8 s totales; segunda pregunta `5+4`
  también ~8 s, ambos aproximados. El usuario aclara **texto rápido, respuesta lenta**.
- Esto apunta a espera en la ruta Hermes/LLM después de transcribir. No mide por separado el LLM, las herramientas,
  la red o el envío de fin de turno, ni demuestra uso remoto sin reserva. No atribuir los 8 s al ASR ni afirmar
  que el cambio de motor aceleró o empeoró sin instrumentación. No se ha cambiado Hermes, proveedor LLM ni esfuerzo.

## Continuidad

La prueba siguiente de voz usa **Hey Even/PTT** con Tailscale activo. Configuración lista; falta medir por separado
fin de voz→final ASR→envío Hermes→respuesta. Reserva Whisper Android y estabilidad siguen por validar de forma
controlada. `even` en Conversación aún pendiente: sus modos locales no prueban este proveedor. H1 abierto.

Reversión de configuración: conservar la copia privada previa; si se solicita volver a local, seleccionar
Whisper small desde Ajustes→Voz. No restaurar todo el XML antiguo sin comparar posibles cambios posteriores.
Firma/APK no cambiadas, sin publicaciones ni captura automática. No repetir importación ni instalación.
