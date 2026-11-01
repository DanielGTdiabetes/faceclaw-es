# Prueba de la API pública de reconocimiento local del Pixel

Diagnóstico temporal. Usa `SpeechRecognizer.createOnDeviceSpeechRecognizer`, consultas de compatibilidad para es-ES/ca-ES y una frase conocida generada en el PC por Microsoft Helena Desktop (System.Speech, sin red). Convierte el WAV a PCM16 mono 16 kHz y lo entrega mediante `EXTRA_AUDIO_SOURCE`, tubería en tiempo real y sesión segmentada. No reproduce la frase por el altavoz.

El manifest no declara permiso de micrófono ni Internet. No captura audio de personas/G2, no consulta ASI mediante interfaces privadas, no descarga modelos y no toca preferencias/servicios de Faceclaw. Un error 9 (permisos) es una prueba inconcluyente de recepción de PCM, no demuestra que el motor sea incapaz con permisos. Las consultas de compatibilidad no prueban por sí solas que se consuma el audio externo. Se exige recibir la frase conocida para confirmar esa ruta.

Los archivos de audio se borran al terminar/cerrar. `files/report.txt` contiene únicamente diagnósticos, idiomas, frase sintética y resultado; puede recuperarse con `adb shell run-as com.faceclaw.speechprobe cat files/report.txt`. La aplicación temporal se retira después de la prueba. No es un motor de producción ni una validación de ruido, voces lejanas, separación de hablantes, batería o captura continua.

## Resultado comprobado, 08-10-2026

Pixel 10 Pro Fold, SDK 37. La [prueba independiente](pixel-10-pro-fold-synthetic-result.txt) reconoce completa la frase «El lunes iremos al mercado para comprar tomates y preparar la cena». Español e inglés instalados; catalán no anunciado por el servicio. El resultado vacío obtenido al usar un archivo regular se sustituyó por una tubería PCM segmentada.

Con `--ez production true`, el diagnóstico carga **nuestras propias clases** `FaceclawSystemTranscriber`/listener desde la APK Faceclaw instalada mediante `Context.createPackageContext` y su class loader. Requiere misma firma. No accede por reflexión a ASI ni APIs privadas del sistema. Crea el adaptador con el contexto del diagnóstico, sin permisos de micrófono/Internet, y suministra la misma frase sintética. [Resultado del adaptador instalado](pixel-10-pro-fold-production-adapter-result.txt): texto completo, un segmento, cero errores/descartes, motor y trabajador detenidos y cola vacía tras OFF. Los ~4,7 s incluyen suministrar los 4,265 s de voz en tiempo real; no son una medida de inferencia aislada.

## Reproducir

1. Generar `assets/phrase.wav` local con System.Speech/SpeechSynthesizer, voz Microsoft Helena Desktop, frase anterior y System.Speech.AudioFormat.SpeechAudioFormatInfo: 16.000 Hz/Sixteen/Mono. El audio no se versiona.
2. Compilar `ProbeActivity.java` con el android.jar de API 35 o superior; empaquetar clases con D8 (`min-api 33`) y recursos/assets con AAPT y este manifest. Alinear y firmar con la **clave original propia de Faceclaw** para la variante production. No generar/reemplazar claves existentes.
3. Instalar solo el paquete auxiliar `com.faceclaw.speechprobe`, abrir `.ProbeActivity` y recuperar su `files/report.txt` con run-as. Añadir `--ez production true` para comprobar el adaptador de Faceclaw instalado. Mantener Conversación OFF y no conceder micrófono/Internet al auxiliar.
4. Desinstalar solo `com.faceclaw.speechprobe` y devolver Faceclaw al primer plano/OFF. No borrar datos ni desinstalar Faceclaw.

No se entrega una APK del diagnóstico ni credenciales. La prueba se ejecutó y el auxiliar fue retirado; falta comparar con audio real de G2/personas y verificar continuidad larga y consumo.
