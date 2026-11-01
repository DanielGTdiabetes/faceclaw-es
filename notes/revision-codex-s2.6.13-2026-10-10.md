# Revisión Codex de S2.6.13-r2 · 10-10-2026

Instalación y conclusiones principales contrastadas. Sin nueva inferencia, captura, ensayo humano,
reinstalación ni modificación de Faceclaw en el Pixel.

## Comprobación independiente

- APK extraída nuevamente del Pixel: SHA-256
  `c99eacf4d39ce129d18bede5d25f612a5074ee29bb787150a49f7f6a61ed362b`, igual a la candidata `-r2`.
  Paquete `com.faceclaw.app`, versión `0.8.2-es.5-conversation.s2.6.13-whisper-medium`/805,
  última actualización 09-10-2026 20:44:43 y primera instalación del 02-10-2026 conservada.
- Firma original `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`, alineación 16 KB,
  runtime `assets/app/package.json` recuperado e idéntico a S2.6.12, siete `.so` idénticas.
- Respaldos privados antes/después de la instalación: 35 entradas, byte idénticos. No se imprimieron
  valores ni se volvió a exportar la configuración actual.
- Estado: `Global active count: 0`, sin Faceclaw en el monitor de grabación ni wakelock actual de
  Faceclaw; hay un wakelock de sistema. Auxiliares y reserva de Pixel ausentes; relevo Luna `released`.
  No se consultó UI ni selección RAM actual de motor/memoria; no afirmar esos controles comprobados.
- `git ls-remote` contrastó las publicaciones previas a la revisión: principal
  `0baff52c2a5a4820660682b4b2bcdc535fa49d52`, banco `137225d724944b82f062a6fea423e1bb246c66dc`.
  La nota Gemini no rastreada se conserva ajena. Sin nueva copia NAS.

## Resultados y límites

Se regeneraron las tablas de los JSON: medium CPU/4 hilos no sostiene el presupuesto de 3 s,
p95 sostenido 15.073/15.221 ms y cobertura decodificada 56,9/57,8 %. Un hilo empeora el sostenido.
La llamada limita el baseline, no los bloques ABBA documentados sin llamada. No se repitió la batería.

Logs TFLite: media caliente de inferencia de 4,056 s sobre una entrada precomputada; no es latencia
micrófono→texto ni p95 de corpus. Log-Mel fuera del Pixel y diferencias de exportación/cuantización
limitan la comparación con ONNX. Rechazo de delegados del grafo completo contrastado en logs.

Sonda estática: 0 nodos NNAPI en fp32/fp16, fallo en int8 y delegación GPU completa del bloque sintético.
Pesos aleatorios. Extrapolar 24 bloques GPU no mide el encoder Whisper real ni descarta otras exportaciones
o runtimes futuros. Se acotó esa afirmación en el README. El desglose encoder/decoder se midió en TFLite,
no en ONNX. Reducir contexto del encoder sigue siendo hipótesis, sin mejora instalada.

## Corrección de presentación

El contador bruto de corpus `nonSpeechWordsDelivered` también suma streams con voz: el resumen mostraba
425 falsas palabras, que no lo son. El resumen del banco ahora deriva solo `silence`/`noise`: baseline 0;
piloto sin esos fixtures = dato no disponible. JSON originales intactos. No cambian tiempos, WER es/ca
de las frases, cobertura ni decisión sobre hilos. El contador bruto del runner queda señalado para corregir
antes de reutilizarlo. Seis pruebas de presentación cubren evidencia real sin reescritura y falta de datos.

Sin cambios de producción ni necesidad de nueva APK. Pruebas TS/Kotlin afectadas ya contrastadas antes
de la reconstrucción; el código no cambió. Pendientes: ensayo humano a dos metros y asistente medium
con el usuario. La TV, el arranque y esta consulta de estado no validan esas situaciones.
