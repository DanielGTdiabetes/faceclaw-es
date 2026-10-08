# Faceclaw Español

**Conversación S2.6.10 instalada:** selector visible de Soniox, motor local del Pixel y Whisper base/small/medium, descarga independiente y modos «Texto y Hermes» / «Solo texto». Idioma automático en Soniox/Whisper; Pixel español. La API pública del Pixel y el adaptador instalado reconocen una frase sintética completa sin permiso de micrófono. [Uso, resultados y límites](notes/selector-modelos-conversacion-2026-10-08.md). Falta comparar con voces reales, ruido y sesiones largas.

Adaptación de [jimrandomh/faceclaw](https://github.com/jimrandomh/faceclaw), basada en la versión 0.8.1. Licencia GPLv3, conservando la licencia y los avisos originales.

- Whisper **base multilingüe**, cuantizado a int8, con idioma `es` y tarea `transcribe`: conserva el texto en español.
- Whisper **small multilingüe** como segunda opción para priorizar precisión, con mayor uso de memoria y tiempo de respuesta. Descarga verificada de unos 375 MB; base sigue disponible como alternativa rápida.
- Modelo independiente de `base.en`, con tamaños y SHA-256 verificados. Descarga de unos 161 MB desde el espejo del mantenedor de sherpa-onnx.
- Whisper local como proveedor predeterminado. Moonshine sigue disponible para inglés.
- Chat indica **Preparando / Cargando modelo** hasta que se activa el micrófono. Mantener pulsado, esperar a **Escuchando**, hablar y soltar al terminar. Con Whisper la transcripción aparece al finalizar; si se suelta durante la carga, muestra cómo reintentar en lugar de afirmar que no había voz.
- Mientras Chat está abierto, conserva el modelo en memoria entre mensajes para evitar cargarlo de nuevo en cada pulsación. Al cerrar Chat libera el modelo; cambiar de modelo también requiere una nueva carga. El tiempo de transcripción y respuesta del agente sigue dependiendo del modelo y la conexión.
- Controles principales del móvil, menús de ajustes y flujo de entrada de voz traducidos. La traducción de todas las apps secundarias y textos de ayuda aún no está completa.
- App **Tiempo** en español con cobertura mundial mediante [Open-Meteo](https://open-meteo.com/en/docs), temperatura en °C, viento en km/h y pronóstico de las próximas 14 horas. Sustituye NWS, que rechazaba ubicaciones fuera de su cobertura. Envía coordenadas redondeadas a dos decimales y consulta solo mientras la app está abierta; las condiciones actuales son estimaciones meteorológicas.
- Mantiene la integración con OpenClaw y las mismas claves de configuración. Esta adaptación no cambia el firmware de las gafas. La activación «Hey Even» pertenece al firmware y sigue siendo la misma.
- Los subtítulos continuos de la app Micrófonos aún usan Moonshine en inglés; este cambio se aplica a la entrada de voz del asistente y al dictado.

## Estado

El incremento experimental de captura conversacional G2 está en `codex/conversation-detection-g0`: versión `0.8.1-es.5-conversation.g0.1`, código 805. Tiene control local ON/OFF en el móvil, estados visibles y prioridad para el asistente. Compila sin firma y pasa las comprobaciones de software de su alcance; **no se ha instalado ni se han superado G0/G1 en las gafas**. La firma original está pendiente de recuperar desde el PC del trabajo. Continuación, NAS, APK, pruebas y reversión: [notes/conversation-detection-g0-results.md](notes/conversation-detection-g0-results.md). No incluye VAD ni reconocimiento de participación.

La conexión con OpenClaw y una pregunta de voz sobre el tiempo han funcionado en las gafas. Los avisos creados directamente también se han mostrado; sigue pendiente comprobar que el agente programa correctamente los avisos solicitados por voz.

La compilación conjunta de móvil y reloj pasa en GitHub. Las gafas han mostrado errores de reconocimiento con small; su mayor tamaño no garantiza una mejora. En una comparación local de la misma frase meteorológica, base y small acertaron. Una sola frase no valida la precisión general; la grabación temporal se eliminó y su guardado quedó desactivado.

## Instalación desde la APK oficial

La firma propia impide instalar esta APK encima de la oficial. Antes de desinstalar, exportar los ajustes con `scripts/pull_config.sh` y guardar la APK original. Después de instalar la española, restaurarlos con `scripts/push_config.sh`.

El exportador original copia `faceclaw_settings.xml`: incluye servidor, puerto, token, proveedor e historial del asistente. No exporta todos los datos privados de la app: las direcciones de las gafas y el estado de bienvenida de NativeScript se guardan aparte en `prefs.db.xml`. Puede ser necesario volver a emparejar en la app; el firmware ya instalado debe detectarse y conservarse. No instalar firmware si las gafas ya usan el compatible.

Desde `0.8.1-es.3`, la restauración guarda la copia anterior como `.import-backup`. La extensión `.bak` está reservada por Android y hacía que se recuperaran los valores anteriores al reiniciar. Verificar siempre los ajustes exportados después de una importación.

En Ajustes → Voz, descargar **Whisper base (español, rápido)** o **Whisper small (español, mayor precisión)** y seleccionar el proveedor correspondiente. Los modelos se descargan al móvil y no están incluidos en la APK. La actualización conserva la selección anterior: cambiar a small cuando termine su descarga.

Nunca subir copias de ajustes, historiales, tokens ni claves privadas a GitHub. `backups/`, `.tools/`, `signing/` y keystores están excluidos de Git.

## Ubicación del asistente

El asistente dispone de `location.get_current` tanto en modo directo como a través del puente de OpenClaw. Consulta la ubicación del móvil durante una conversación sin abrir Tiempo ni Navegar. Requiere el permiso de ubicación de Faceclaw y la ubicación del teléfono activada; admite el permiso aproximado y devuelve la precisión disponible.

La respuesta incluye coordenadas, precisión en metros, fecha de la posición y antigüedad. Android puede devolver una posición guardada; `is_stale` indica que supera los dos minutos o que no se conoce su antigüedad. El asistente debe comprobar esos datos antes de usarla como posición actual. Esta herramienta no permite consultas proactivas ni mantiene un seguimiento continuo.

Tras instalar una versión con esta herramienta, volver a conectar el puente para que OpenClaw actualice la lista de herramientas del móvil. Para comprobarlo, preguntar «¿Dónde estoy? Consulta la ubicación de mi móvil».

## Compilación en GitHub

El workflow **APK española** ejecuta las pruebas y compila las APK de publicación del móvil y del reloj sin firmar en Linux. Se puede lanzar desde Actions y también se ejecuta al subir cambios en la rama española. Descargar el artifact `faceclaw-es-unsigned-…` y descomprimirlo; incluye las APK en sus carpetas originales.

Firmar esa APK en Windows con la clave local persistente:

```powershell
./scripts/sign-spanish.ps1 -InputApk ./app-release-unsigned.apk -OutputApk ./dist/faceclaw-es.apk
```

El script crea una clave la primera vez y la reutiliza. Guardar una copia privada de `.tools/signing/faceclaw-es.jks` y `store.password`. Si se pierde esa clave, una nueva firma volverá a exigir reinstalar. No compartirla ni incluirla en el repositorio.

## App del reloj

Wear OS Data Layer exige el mismo identificador `com.faceclaw.app` y la misma clave de firma en móvil y reloj. El complemento oficial, firmado con otra clave, puede indicar que Faceclaw no está instalada aunque la variante española esté funcionando.

Compilar `wear/` en release y firmar también su APK con `scripts/sign-spanish.ps1`, indicando otra ruta de salida, por ejemplo `dist/faceclaw-watch-es.apk`. Al migrar del complemento oficial hay que guardar su APK y sustituirlo en el reloj por el firmado con la clave española. Sus preferencias locales del mando vuelven a los valores iniciales. Las siguientes versiones, con la misma firma, se instalan con `adb install -r`.

## Mantener las actualizaciones

La rama `spanish-0.8.1` conserva los cambios de español. El remoto `upstream` debe apuntar a jimrandomh/faceclaw y `origin` al fork. Para una nueva versión:

1. Obtener la nueva etiqueta de upstream y fusionarla en una rama de actualización española. Resolver los conflictos conservando el modelo multilingüe, `es` y las traducciones.
2. Revisar la compatibilidad del firmware y del puente con OpenClaw, ejecutar pruebas y compilar en Actions.
3. Firmar con **la misma clave local** y mantener `com.faceclaw.app` como identificador. El `versionCode` debe ser igual o superior al ya instalado.
4. Instalar como actualización (`adb install -r …`), sin desinstalar ni borrar los datos. Comprobar la voz y la conexión con OpenClaw.

Sincronizar el fork no adapta automáticamente los cambios que haga upstream: requiere revisar conflictos y probar cada nueva versión. Las APK oficiales usan otra firma y no son actualizaciones de esta variante.
