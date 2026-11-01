# A3: ganancia por ventana + Whisper small — 04-10-2026

## Por qué

Sesión A2 real (época 3, 92 s): transporte perfecto (1840 paquetes, 0 perdidos), 17 ventanas a Whisper, 14 textos, 556 caracteres. El usuario no ve mejora en la voz del interlocutor. El cuello de botella ya no es la segmentación: es la señal (micrófono G2 orientado a la boca del portador, ruido de fondo ~ -56 dBFS) y el modelo (Whisper base int8). Whisper no normaliza el nivel: una voz lejana a -50 dBFS queda pegada al suelo de las features log-mel.

## Qué cambia

- `LocalAsrConditioner` (commonMain): solo sobre la copia float que va a Whisper. Quita DC, estima suelo de ruido (p20 de RMS por trama de 20 ms), ganancia por trama suavizada hacia ~-20 dBFS con tope +30 dB, expansor -12 dB para tramas de ruido y limitador de pico. Una voz baja sube más que una alta dentro de la misma ventana. Captura, VAD y perfil no cambian.
- Diagnóstico agregado `levels`: histograma de nivel por ventana (tramo alto p90 y tramo activo bajo p25) en dBFS, suelo medio, ganancia media/máxima. `engine` y `conditioned`. Sin audio ni texto.
- Rechazo de frases fantasma típicas de Whisper en español (Amara.org, suscríbete, gracias por ver, música…) como `rejectedHallucination`.
- `FaceclawLocalTranscriber` usa Whisper small int8 (2 hilos) si está descargado y verifica hashes; si no, base. Opciones muestra «Modelo preciso (small)» para descargarlo.

## Verificación

Kotlin 268/268 (8 nuevos). Node conversación 64/64. Suite Node completa 800/803: los dos fallos (`iOS config codec`, `local-vad snapshots`) ya fallaban en `f0c3304`. tsc y oxlint limpios. APK `0.8.2-es.5-conversation.a3`, código 805, firma original, 7 `.so` idénticas a A2.

| Archivo | SHA256 |
|---|---|
| `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.a3.apk` | `11cf949a10d6164e3059b3860272347875ad52e3481d05669ec94edaea08e529` |
| `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.a3-unsigned.apk` | `03b0eb7d327a02f89777ceb7a5fade833326004f2a57bf182679d1bf6160fbd8` |
| Reversión A2 `dist/conversation-g0/before-update-a3.apk` | `14fd97e508ac3471a44a7400bad6b0a5a2c4ac2fcb1eaea3b8fb48082dacc618` |

Instalada con `adb install -r`, 33 ajustes idénticos antes/después. Small detectado como listo en el móvil.

## Prueba y lectura

Conversación normal 30 s, 7 s de margen, OFF. Después: Opciones → Métricas tras OFF. Mirar `engine` (debe ser `whisper-small`) y `levels.quietActiveWindows`. Si la voz del otro aparece en tramos <-60/-60 dBFS con suelo similar, es un límite físico del micrófono de las gafas: la siguiente palanca sería una fuente de audio alternativa (micrófono del móvil), no más software sobre la señal G2.