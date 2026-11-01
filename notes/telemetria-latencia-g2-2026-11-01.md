# Telemetría de Conversación G2 instalada — 01/11/2026

Cliente `4ecef0dd19dfec3808ca61277c01538e620ea2d6`, sobre la base instalada S2.25
`277d1b0`. Claude aprobó cliente y puente en Buzz `3e4c4981…`, tras autorización
de Dani de build/instalación en OFF (`23bf0063…` y `62426dc4…`). PR:
https://github.com/DanielGTdiabetes/faceclaw-es/pull/3.

## Artefacto y comprobación de instalación

La APK inicial se extrajo del Pixel `61161FDCG0013L`: SHA256
`1cd0e632df6ace5a65fcef40be8f1b4703ae01fc31134a47c6e0ecca6c5d67f8`, idéntico al
S2.25 documentado. Se reemplazaron solamente `assets/app/bundle.mjs`,
`assets/app/vendor.mjs` y `assets/app/tns_modules/inspector_modules.mjs` por el bundle
release compilado desde el código aprobado y el lockfile existente sin cambios.
Runtime, manifiesto, recursos, ocho bibliotecas nativas y dos DEX se conservaron
por contenido. Alineación 16 KB y firma original verificadas.

**La versión visible sigue siendo S2.25/805 porque el manifiesto no cambia.**
Distinguir por SHA256, nunca solo por versionName:

- Instalada/extraída: `9c5264da4b745d0af3786631a3955b45a0a584c68f13679f61262788adce1c10`.
- Certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- `adb install -r`, Success. `lastUpdateTime`: **15:10:04 CET / 14:10:04 UTC**.
- APK extraída después de instalar idéntica a la firmada; 48/48 ajustes comparados
  en privado e idénticos; `firstInstallTime=2026-10-02 09:39:05` conservado.
- PID Android `25780`, UI Conectado; cero wakelocks `Faceclaw:ConversationG0` y cero
  FATAL EXCEPTION/JS ERROR/SyntaxError/ReferenceError/TypeError en su log de arranque.
  No se activó escucha. OFF declarado por Dani; no se afirma haber leído un
  interruptor OFF en el árbol de accesibilidad (solo Conectado/Conversación).
- Los XML de ajustes se trataron en una carpeta temporal local con ACL privada;
  no se imprimieron ni se copiaron al NAS. El export temporal del Pixel se retiró.

Artefacto y retorno persistentes en Buzz Nest:
`OUTBOX/FACECLAW_TELEMETRIA_20261101/{FACECLAW_TELEMETRIA.apk,RETORNO_S225.apk}`.
Recibos agregados: `RESEARCH/TELEMETRIA_{PIXEL_INSTALLED,PIXEL_POSTFLIGHT,VALIDATION}_20261101.json`.

## Campos y límites

`conv.clientTiming` lleva `turnToRequestMs`, `vadStopToRequestMs`,
`gapSinceLastRequestMs` cuando hay medición y `closedBy` del último turno aceptado.
La primera petición omite el intervalo anterior desconocido. Solo duraciones
finitas de 0 a 86.400.000 ms y categorías cerradas; sin texto/audio/huellas.
`presented.requestToPresentedMs` usa el reloj del cliente y conserva la primera
medición si hay un reintento del ACK. No sincroniza relojes cliente/servidor.

No cambian `pauseMs`, la compuerta de 2 s, el mínimo de 5 s ni la cadencia adaptativa.
El puente registra `conv timing` y, para ACK válidos, `conv presented`; correlacionar
por **InvocationID + sequence**, pues la secuencia reinicia al arrancar.

Límites revisados por Claude:

- La confirmación del presentador no es una medición óptica del primer píxel.
- El último VAD puede corresponder a una locución anterior: no interpretar
  `vadStopToRequestMs` aislado; separar valores que excedan `turnToRequestMs` más
  un margen declarado antes del análisis. No se fija aquí un umbral de descarte.
- `_deliver_late` no usa `deliveries`: esas entregas carecen de `conv presented`.
- Los campos escalares también vuelven en `fields["timing"]`; el lector del móvil
  ignora los desconocidos. No entran en prompts ni decisiones.
- No se ha añadido instrumentación a Ey Even normal ni se han recogido aún
  muestras reales. Se necesita uso autorizado por Dani para validar el circuito.

## Comprobaciones y preparación

- Suite Node completa: 1350 tests, 1349 pasan, una omisión, cero fallos.
- Kotlin `wear/gradlew.bat -p tests/kotlin testAndroidHostTest`: 365/365.
- `tsc --noEmit` correcto. Oxlint: cero errores; aviso previo de Builder obsoleto
  en `app/native/evo-alert-notification.ts:33`.
- Bundle release correcto; `lintVitalRelease` correcto, informe `No issues found.`.
- Puente `f26bc2d`: suite completa 49/55, seis fallos con nombres idénticos a R1;
  dos tests nuevos pasan, cero errores; protocolo conserva el fallo previo
  `tool-activity` en `test_bridge.py:127`. No se presentan como verdes.

La preparación directa de webpack dejó inicialmente un directorio Android parcial.
Se completó desde el runtime 9.1.1 existente y se ejecutó NativeScript prepare.
Gradle directo necesitó `-PappResourcesPath` y `-PappPath` explícitos; las rutas
absolutas inválidas de su `dependencies.json` generado se hicieron relativas al
worktree (`../../node_modules/<paquete>`). No se modificaron fuente ni lockfile.
El CLI release exige contraseñas en argumentos: se evitó esa ruta y se firmó con
`apksigner --ks-pass file:<archivo privado existente>`, sin generar identidad.
Las nativas/DEX recompiladas durante lint **no** se incorporaron a la candidata.

Puente complementario:
https://github.com/DanielGTdiabetes/hermes-agent-proactive/pull/9,
instalado **15:10:36 CET / 14:10:36 UTC**, PID `255005`, InvocationID
`9550095742e64445812aefc8cd2863d6`. Separar este corte del R1 de 14:46:53 CET.

## Retorno y siguiente paso

En OFF y reposo, `adb -s 61161FDCG0013L install -r` con `RETORNO_S225.apk`;
extraer de nuevo y comprobar `1cd0e632…d67f8`, ajustes y arranque. El puente nuevo
sigue aceptando la APK antigua. Para volver también el puente a R1, restaurar
solo los dos módulos desde `/home/dani/telemetria-install-20261101T141025Z/before/`
y reiniciar `faceclaw-hermes` en OFF/reposo vigente; no restaurar datos completos.

Pendiente: Claude comprueba el recibo; Dani decide ON y realiza uso habitual;
Deepseek agrega un día de datos por resultado, herramientas, recuerdo y `closedBy`,
sin exportar conversaciones. No se declara ahorro de latencia ni equivalencia
física validada a partir de los tests simulados. No se ha hecho merge.
