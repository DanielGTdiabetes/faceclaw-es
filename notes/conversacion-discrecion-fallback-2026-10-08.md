# Discreción, fallback secuencial y métricas de conversación — 08-10-2026

El usuario acepta conservar la captura continua y encarga implantar el ajuste de tono, las métricas y un respaldo más temprano. Se le avisa antes de necesitar el móvil. El circuito Codex–Claude está **desactivado**, comprobado al empezar: Codex implementa directamente conforme a su guía. Se conservan los cambios locales anteriores.

## Comportamiento implementado

- `integrations/hermes/conversation.py`: silencio por defecto; preguntas recientes aún sin resolver, información claramente útil o sugerencias prácticas justifican una intervención. Una reacción ingeniosa por sí sola no la justifica. Tono principalmente neutro y natural, sin coletillas humorísticas en respuestas factuales. No se obliga a buscar otro ángulo al encontrar memoria previa.
- Un agente principal y otro de respaldo separados, ambos sin herramientas, persistencia ni historial. Cada evaluación empieza por el principal. Se solicita su cancelación al alcanzar **6 s** o el plazo total, el que llegue antes. Solo un fallo técnico, JSON inválido o agotamiento del presupuesto permite un respaldo. `nada`, `cortesia` e `incierto` válidos **no** lo activan.
- El respaldo espera al fin real del trabajador de red principal; los overrides son exclusivos de estos agentes y se revisan contra los hashes del runtime. La cancelación puede necesitar tiempo de cierre: los 6 s son el momento de solicitarla, no una garantía de cierre instantáneo. Si no quedan al menos 1 s dentro del plazo original, se abstiene. No hay carrera ni tercer agente. El móvil conserva **15 s** para cada evaluación; rechaza resultados posteriores aunque su temporizador se retrase.
- El chat normal conserva proveedor, respaldo, herramientas, configuración y plazos. Sin cambios en VAD, Soniox, cadencias, tamaño del contexto, límites de sesión, prioridades de audio o suspensión EvenHub.
- Memoria `conv/memory-ack/1` intacta: solo tras `sent` nativo y acuse válido; seis aportaciones propias, dos horas, purga automática, filtros y reservas anteriores.

## Métricas y límites de interpretación

En «Métricas tras OFF», diagnósticos agregados en RAM hasta el próximo ON: tiempo de escucha efectiva, solicitudes/minuto, duración de evaluaciones, turnos/chunks/audio enviado/tokens finales durante ellas, latencias por modo, turno recibido→solicitud, resultado→`sent` nativo y turno recibido→`sent`. Contadores del principal/respaldo, primer texto observado, cola, espera de cancelación, intentos y llamadas API que comunica el runtime. El puente añade un campo opcional `timing`; los clientes anteriores lo ignoran y el cliente nuevo ignora campos de diagnóstico inválidos sin perder la respuesta válida. Los errores/cancelaciones también quedan en métricas numéricas del journal.

Histogramas de tamaño fijo, media, máximo y límites superiores aproximados de p50/p95. Sin textos, etiquetas, referencias o historial por turno. `nativeSent` indica entrega nativa, **no** observación óptica. El primer texto observado incluye el trabajo previo del agente: **no** se anuncia como TTFT de red exacto. La finalización VAD incluye su liberación de 600 ms y se limpia al cambiar de captura: **no** es el final físico exacto de la frase. Los incrementos de transcripción muestran continuidad observada; **no** demuestran ausencia de pérdidas BLE ni del firmware. Los intentos cuentan etapas del servicio; no equivalen necesariamente a todas las reconexiones internas del proveedor.

## Verificación y candidata

- Typecheck de app y pruebas, oxlint, webpack, build Android y lintVital correctos. Firma original, zipalign 16 KB, código 805 y siete bibliotecas nativas/runtime iguales a las referencias S2.6.3/S2.6.4/S2.6.6.
- **289/289 JS/TS** de conversación, métricas, VAD, captura, identidad y Soniox pasan en la ejecución final; incluye las nuevas pruebas del resumen estadístico y del timestamp VAD.
- 44 pruebas Python de conversación en el intérprete administrado de Hermes, más protocolo de autenticación/MCP/chat/cancelación/reconexión correcto. Construcción de agentes reales `openai-codex/gpt-6-luna` y `openrouter/openai/gpt-6-luna`, con restricciones comprobadas, **sin solicitudes al modelo**.
- Tres simulaciones de despliegue: aplicación/idempotencia/reversión, rechazo previo a escrituras ante fuentes inesperadas y recuperación de fuentes anteriores si falla el reinicio. Solo directorios temporales.
- Una prueba antigua de VAD incluía el observador C1 nulo en la prohibición de objetos. Se corrige la comprobación para exigir observador nulo y estado acústico escalar; algoritmo intacto. 136 pruebas de audio/VAD/Soniox/identidad/captura y coordinador pasan.

APK candidata: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.6.8-manual-context.apk`, SHA-256 `1b2caa1b250ea45b36c41013fd1a283659dfa69d03cecbd9522ee3ee63fb07f3`.

Puente candidato: `conversation.py` `4a2e23e8b60416948b3c1ac122efc99cf94d8ed7ac6ed77c8d09813f4ee37246`; `bridge.py` `ae97e5acf9f4283a6a257193bec8db041323c0e5affebf3cf9540b2bd7c88886`. Entrada portable [deploy-hermes-discretion.py](../scripts/deploy-hermes-discretion.py), fuentes previas exactas y copia remota `rollback-20261008-discretion/`, permisos 700/600. Solo reinicia Faceclaw, no el gateway ni sus proveedores.

## Estado de aplicación

El móvil se conecta y se observa Conectado / Display off / Conversación OFF. Se bloquea antes de aplicar, por lo que el guard detiene la operación **antes del despliegue y de la instalación**. Tras confirmar el usuario que lo ha desbloqueado, se vuelve a comprobar Faceclaw abierto y OFF y se completa:

- Puente aplicado con los hashes candidatos anteriores, verificados de nuevo tras el despliegue. Solo Faceclaw se reinicia a **06:48:28 CEST**, PID 1259125. Servicio y gateway activos; puerto listo a 06:48:34 y catálogo **34 herramientas** reconectado a 06:48:36 y tras la instalación a 06:48:49. Sin aviso de agente de conversación/respaldo no disponible en el registro inspeccionado.
- S2.6.8 instalada con `install -r` después de dos comprobaciones OFF. Hash extraído **idéntico** a `1b2caa1b…`; **35 ajustes byte a byte idénticos** antes/después. No se cambia suspensión ni se inicia captura.
- Reversión móvil extraída previamente: `dist/conversation-g0/before-update-s2.6.8-manual-context.apk`, S2.6.7 original `38de94d98f8c1291511d74f3403af79dc6e5738ba5447b2c5eb4d82d66c38b61`. Comparación adicional contra esa APK: **7/7 nativas y `assets/app/package.json` idénticos**.
- Reversión del puente verificada **700/600** en `/home/dani/faceclaw-hermes-bridge/rollback-20261008-discretion/`. Para volver: `python3 candidate-20261008-discretion/deploy-hermes-discretion.py --rollback` desde la carpeta del puente, con audio OFF; reversión APK aparte con firma original/datos conservados.
- Estado final observado tras relanzar: **Conectado / Display off / Hermes en conversación: OFF**. No se abre una nueva sesión ni se valida ópticamente el resultado.

Receta local ignorada `.tools/s2.6.8-run.ps1`, logs `.tools/s2.6.8-logs/`; instalador `.tools/install-s2.6.8-discretion.ps1`. Exportaciones de ajustes y base instalada en `.tools/discretion-20261008-private/`, ACL limitada a Usuario/SYSTEM; fuera de Git. No repetir build, despliegue o instalación por rutina.

Sin prueba física nueva de conversación, sin evaluación semántica con modelos reales, sin commit/push ni copia NAS de este incremento. No iniciar escucha ni repetir ensayos por rutina.
