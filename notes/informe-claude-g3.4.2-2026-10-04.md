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

## Resultado del ensayo guiado G3.4.2 (04-10-2026)

El usuario hizo el ensayo e informó «OFF» y que **la voz del otro interlocutor no aparece en pantalla**. Con OFF confirmado por el usuario y por la UI, Claude abrió «Opciones → Métricas tras OFF» por ADB (solo lectura, sin tocar Iniciar). Se leyeron únicamente contadores agregados, sin texto ni audio. Copia privada en `.tools/g3.4.2-private/ui-metrics.xml`.

- **Captura continua, sin cortes:** 1482 chunks / 74,1 s de PCM, `starts=1`, `preemptions=0`, hueco máximo 89 ms. Nativo: 0 pérdidas, duplicados, paquetes malformados, descartes de cola y `pcmDeliveryDrops`. Cierre `manual` (doble toque), no por error ni plazo. La sesión no se desconectó, aunque no hay confirmación visual de que la pantalla se mantuviera encendida.
- **VAD:** 17 episodios completados, 29,84 s de posible voz. El detector de energía sí se activó durante el ensayo (~30 s de habla prevista entre las dos fases): **el VAD no parece el cuello de botella**.
- **Texto local:** 14 decodificaciones sobre 46,05 s de audio enviado. **9 entregadas** (idioma `es`), **4 rechazadas por idioma** (Whisper detectó un idioma distinto de es/ca: `languageOther=4`, `rejectedLanguage=4`), 1 invalidada, 3 segmentos cortos y 0 vacíos o rechazados por estructura. Decodificación total 9,7 s, máximo 1,08 s.
- **Comparación de perfil:** 10 comparaciones, 4 abstenciones, estado final «insuficiente».

**Interpretación (probable, no verificada por segmento):** los contadores no guardan qué segmento corresponde a quién, a propósito. Aun así, el usuario vio su propio texto y no el del interlocutor, y el único descarte significativo son 4 de 14 segmentos rechazados por idioma. Lo más probable es que Whisper, con detección automática por segmento, identifique la voz lejana y atenuada del interlocutor como otro idioma y `localTextRejection` la descarte. La hipótesis del VAD queda débil. El perfil no interviene en el filtrado.

**Propuesta G4 (justificada por este error, no implementada):** cuando la detección automática devuelva un idioma distinto de es/ca, redecodificar ese segmento forzando `es` (Whisper multilingüe de sherpa-onnx admite idioma fijo) y aceptar solo si supera las comprobaciones estructurales actuales. Se conserva la detección automática para el valenciano. Coste: una decodificación extra por segmento rechazado (~1 s en el peor caso observado). Riesgo: alucinaciones con TV/ruido etiquetado como otro idioma. Requiere cambio Kotlin (`LocalTranscriptSession`/`FaceclawLocalTranscriber`), recompilar el AAR, pruebas Kotlin y un ensayo breve con métricas que muestre `rejectedLanguage` bajando y texto del interlocutor visible.
