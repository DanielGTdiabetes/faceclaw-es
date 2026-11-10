# Inventario previo a la fusión de Faceclaw 0.9.0

Base `bde7bfda` (`28a2ef16` más `VAD_RUIDO.patch`). Se verificaron el tag oficial `70ec2a0d` y las ramas remotas de main y rearme mediante `git ls-remote`. La rama VAD documentada no está en el repositorio local ni en las ramas remotas consultadas. El parche y la APK de retorno coinciden con los hashes del encargo.

| Capacidad | Fuente en S2.34 | Pruebas de referencia |
| --- | --- | --- |
| Español y ajustes propios | `app/phone-ui/main-page.xml`, `app/ui/dashboard-settings.ts`, `app/native/settings-store.ts`, `FaceclawSettingsPortReceiver.kt` | `settings-store-migration`, `settings-panel`, `conversation-phone-ui` |
| Conversación, presencia y arbitraje | `app/conversation-detection/coordinator.ts`, `app/native/voice-control.ts`, `GlassesSessionCore.kt` | `conversation-presence`, `conversation-detection`, `voice-finalization` |
| Perfil guardado | `app/phone-ui/voice-profile-page.ts`, `app/conversation-detection/profile-speaker-matcher.ts`, `wearer-identity.ts` | `wearer-identity`, `conversation-manual-identity`, `conversation-speaker-probe` |
| Hermes y avisos | `app/native/hermes.ts`, `app/assistant/conversation-channel.ts`, `notification-channel.ts`, `conversation-hermes.ts` | `hermes-assistant`, `conversation-hermes`, `conversation-channel`, `notification-channel` |
| ASR EVO y reserva local | `app/conversation-detection/transcription.ts`, `app/native/voice-control.ts`, `app/native/conversation-model-options.ts`, `EvoRemoteTranscriptDecoder.kt` | `conversation-model-selection`, `evo-watchdog`, `LocalEvoSessionContractTest`, `LocalWhisperPerformanceTest` |
| Smart Turn y plazos | `app/conversation-detection/smart-turn.ts`, `conversation-episodes.ts`, `coordinator.ts`, `app/native/smart-turn-socket.ts` | `smart-turn`, `conversation-episodes`, `conversation-detection` |
| Cola PCM y huecos | `BoundedPcmDelivery.kt`, `GlassesSessionCore.kt`, `app/conversation-detection/coordinator.ts` | `BoundedPcmDeliveryTest`, `conversation-detection` |
| Rearme persistente y VAD S2.34 | `app/native/voice-control.ts`, `app/conversation-detection/local-vad.ts`, `app/version.ts` | `conversation-presence`, `local-vad` |
| GPS | `app/native/location.ts`, `app/assistant/system-tools.ts`, `LocationLookupCore.kt` | `assistant-location`, `LocationLookupCoreTest` |
| Imágenes y notificaciones | `app/assistant/glasses-image.ts`, `app/ui/shell/notification-delivery.ts`, `app/native/notification-icons.ts`, `FaceclawMediaNotificationListenerService.kt` | `glasses-image`, `notification-pictures`, `notification-filter`, `notification-delivery` |

Los nombres de pruebas son archivos `tests/*.test.cjs` o clases de `tests/kotlin`. El inventario identifica código presente y cobertura de referencia. Los resultados se registran por separado.
