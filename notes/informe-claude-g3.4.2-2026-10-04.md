# Informe Claude — incidencias de uso y G3.4.2, 04-10-2026

Pendiente de revisión por Codex. Rama `codex/conversation-detection-g0`. Base: Codex aceptó G3.4.1 en `5277dd7`, publicado por Claude.

## Incidencias reportadas por el usuario tras probar G3.4.1

1. **«Cuando la activo desde las gafas y estas apagan la pantalla, se desconecta.»**
2. **«No reconoce la voz del otro interlocutor, solo distingue mi voz; imagino que solo usa mi perfil.»**

El log de la prueba ya no estaba disponible: el búfer `main` del Pixel empezaba a las 09:50 y la sesión había terminado antes, por expiración («OFF · Tiempo agotado (2 min)»). Diagnóstico basado en el código.

## 1. Pantalla de las gafas durante la sesión — defecto corregido

**Evidencia en código:** `Shell.applyScreenTimeout` solo aplaza el apagado por inactividad si la ventana en primer plano declara `isVoiceCapturing()` o `keepsScreenOn()`. Transcribe lo declara mientras captura. La ventana `local-conversation` (G3.4) no declaraba ninguno, así que con la sesión ON el temporizador normal apagaba las lentes a mitad de conversación y el usuario perdía estado y texto.

**Corrección `0161fdd`:** `keepsScreenOn: () => !closed && session.detector.snapshot().enabled`. Mantiene la pantalla solo con sesión ON (máximo 120 s) y ventana abierta. En OFF rige el timeout normal. Se eligió `keepsScreenOn` y no `isVoiceCapturing` porque este último altera otras rutas del shell (diálogo de voz y foco). Sin cambios en coordinador, motores, modelos ni umbrales.

**Limitación:** el código protege la sesión de audio frente a la suspensión EvenHub por pantalla apagada mientras hay concesión (`holdsSession()`), así que no queda demostrado que apagar la pantalla cortara la captura por sí mismo. La corrección evita el apagado. Si el corte persiste con la pantalla encendida, será otra causa (presencia/BLE/PCM > 2 s) y hará falta un log de esa sesión.

**Pruebas:** nueva prueba en `tests/conversation-lenses.test.cjs`, que falla sin la corrección porque no existe la opción. TypeScript, compilación de pruebas, **71 Node correctas/0 fallos** (lentes, móvil, UI, coordinador, host iOS) y oxlint con tipos sin avisos. Log `.tools/g3.4.1-logs/node-tests-g3.4.2.log`.

## 2. Voz del otro interlocutor — sin corrección, diagnóstico pendiente

**Evidencia en código:** la transcripción **no usa el perfil para filtrar**. `LocalTranscriptSession.kt` segmenta solo con el estado del VAD por energía (`posible voz`/`pausa`) que entrega el coordinador. El perfil solo alimenta las etiquetas provisionales de comparación/participación. El VAD (`local-vad.ts`) exige RMS por trama ≥ max(0,003, 3× ruido de fondo) durante 150 ms.

**Hipótesis (no verificada):** la voz del interlocutor llega a los micrófonos de las G2, orientados al usuario, por debajo de ese umbral, o Whisper descarta esos segmentos (`rejectedEmpty`/`rejectedLanguage`/`shortSegments`). No se cambian umbrales ni modelos sin datos (G4 solo con error justificado y mejora demostrada).

**Siguiente paso autorizado por el usuario:** un único ensayo guiado de ~60 s. Primero habla solo el interlocutor y después solo el usuario. Al terminar en OFF se leen únicamente los contadores agregados de «Métricas tras OFF» (nivel/umbral VAD, episodios, decodificaciones, rechazos). Sin grabación ni lectura del texto.

## APK G3.4.2

`com.faceclaw.app`, código 805, `0.8.2-es.5-conversation.g3.4.2`, certificado SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. Mismo procedimiento que G3.4.1: webpack con runtime restaurado (hash igual), Gradle offline `assembleRelease lintVitalRelease` (salida 0), helper seguro primero sin `-Install`.

| Archivo (`dist/conversation-g0/`) | SHA256 |
| --- | --- |
| `faceclaw-0.8.2-es.5-conversation.g3.4.2.apk` | `990a10f1c22a2ef995ef87169336d6c3dc917bd1ec7d607e0736d33fbd84b5f8` |
| `faceclaw-0.8.2-es.5-conversation.g3.4.2-unsigned.apk` | `721bbc14335f331a0c3277218eb3c9a71cc6f56511c79c03020a39477946c0c9` |
| `before-update-g3.4.2.apk` (reversión = G3.4.1 firmada exacta) | `9029bb89853269ba57671cd774941afcf7eececb7f0107430aabad0f64780f0e` |

Frente a G3.4.1: siete bibliotecas nativas y `assets/app/package.json` idénticos, bundle distinto. Antes de instalar: `Wake Locks: size=0`. Preferencias privadas en `.tools/g3.4.2-private/` (ACL usuario/SYSTEM): **33 antes, 33 después, idénticas**, incluidos Hermes y bloqueo. `adb install -r` → `Success`, sin desinstalar ni borrar datos. Instalada `0.8.2-es.5-conversation.g3.4.2`/805. Perfil sin tocar.

Pendiente de este bloque: copia NAS de G3.4.2 y resultado del ensayo (secciones siguientes).
