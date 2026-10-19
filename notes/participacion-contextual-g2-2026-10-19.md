# Participación contextual G2 — 19/10/2026

Instalada en el puente del EVO a las 05:30:33 Europe/Madrid, incluida la corrección final de activación.
Usuario autoriza publicar los repositorios al terminar. La APK S2.17 permanece instalada sin cambios.

- **G2 normal: Ey Even. Conversación: continua, sin nombre obligatorio. Jarvi/Jarvis: solo Sala.**
- Se decide por destinatario probable, contexto, utilidad y momento. Preguntas/frases compuestas no bastan.
  Se conserva contexto al callar y se usan únicamente respuestas propias con ACK de presentación para el diálogo.
- Intervenciones ambientales: solo consultas permitidas, sin recuperación privada por turno ni escrituras.
  Las peticiones directas conservan las comprobaciones y herramientas habituales. La atribución de voz es provisional.
- 75 pruebas de código/contrato correctas. Integración final instalada con agente real y teléfono simulado:
  tema→silencio; capital contextual→Canberra; seguimiento sin nombre→París; Jarvi→silencio/0 intentos de modelo.
  El banco final reaplica filtros a salidas reales guardadas: 21 casos obligatorios y una sugerencia opcional omitida;
  no es una tanda nueva de inferencia ni una validación de voz física.
- Falta valorar uso hablado: interrupciones molestas, silencios que perdieron una ayuda y respuestas mal entendidas.
  No se acredita calidad de ASR/diarización ni se cierra H1/Fase E con estos ensayos.

[Diseño completo, fuentes finales, pruebas, métricas saneadas, fallos y recuperación](https://github.com/DanielGTdiabetes/hermes-agent-proactive/tree/main/preparacion-evo-x2/puente/participacion-contextual-20261019).

SHA-256 de los tres módulos instalados:

```text
bridge.py  9fe394b57184731d644d634f7ae14ed753e4452ee4d74f0a466055f99f99f870
conversation.py  4c4cc9883eb4c1206a88718c01761f66e64d709770f379b467b36c4cad3ca2fe
participation.py  40c44eb831349414dafe8db6942cf3a1baad191e04a730a6f7b85b653d845846
```

Solo se reinició faceclaw-hermes durante la instalación; Sala, gateway y Qwen conservaron sus InvocationID.
Retorno privado verificado por hashes en `/home/dani/participacion-contextual-20261019/rollback/revertir.py`;
no ejecutado sobre producción. Confirmación OFF recibida del usuario antes de la corrección final.

`integrations/hermes` es una referencia histórica y no contiene todas las dependencias actuales.
Las fuentes del servidor se publican en Hermes con sus dependencias por incrementos; no sustituir aquí
solo bridge/conversation/participation. No hay cambios móviles, compilación, firma ni nueva instalación en
esta entrega. Sincronizar ambos repositorios y leer continuidad antes de trabajar desde otro PC.
Los cambios ajenos de Wear, herramientas y navegación permanecen fuera de este commit.
