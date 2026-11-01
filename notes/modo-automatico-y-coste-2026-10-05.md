# Control automático y coste de la escucha

**Decisión posterior del mismo día:** el usuario descarta por ahora la activación automática y elige ON/OFF manual desde gafas/móvil, máximo20min y cierre tras >5min sin voz. Confirma idioma automático español/catalán-valenciano y asociación automática mediante perfil guardado. Leer [implementación manual y estado real](modo-manual-hermes-perfil-2026-10-05.md). La elección inicial de espera local queda sustituida; no seguir desarrollando el arranque automático en este incremento. El historial inferior documenta la consulta anterior.

05-10-2026. Tras instalar S2.4-Hermes el usuario pide un único ON/OFF accesible desde móvil o gafas, sin abrir la app Conversación local ni activar por separado captura y Hermes. Pregunta si detectar conversación exige Soniox continuamente. Esta intención es el siguiente trabajo; S2.4 ya instalada permanece OFF y todavía conserva el tope experimental120s y presupuesto8solicitudes/sesión.

## Responsabilidades actuales

Soniox `stt-rt-v5` transcribe, etiqueta hablantes y marca finales. Faceclaw reúne turnos actuales y asociación del portador en un episodio candidato; Hermes recibe texto acotado para evaluar tema/cortesía/incertidumbre y puede abstenerse. Diarización o final de una frase no acreditan por sí solos conversación temática ni identificación biométrica del portador.

Con la arquitectura actual, Soniox mantiene una sesión en la nube mientras escucha. Unificar el botón no ahorra API. Hermes solo recibe solicitudes candidatas; no recibe un flujo de audio. El puente activo aún no anuncia conv/1 y se mantiene separado del candidato hasta despliegue reversible.

## Tarifa oficial consultada

- [Precios API Soniox](https://soniox.com/pricing): streaming aproximadamente0,12USD/h, calculado por tokens. Entrada audio2USD/1M; texto entrada/salida4USD/1M. Referencia oficial: alrededor30000tokens de audio por hora y15000tokens de texto por hora de habla. La tarifa horaria es orientativa, no factura medida de esta cuenta.
- [Keepalive](https://soniox.com/docs/stt/rt/connection-keepalive): factura duración completa del stream aunque no se envíe/procese audio. Pausar o dejar socket abierto con keepalive no vuelve gratis la espera.

A0,12USD/h, ejemplos aritméticos orientativos: 1h0,12USD; 8h0,96USD; 8h/día durante30días28,80USD. Solo Soniox; uso/cuota del proveedor de Hermes aparte. El silencio sigue teniendo coste de sesión/entrada, aunque genere menos texto. No se consultó saldo/consumo privado ni se activó escucha para medirlo.

## Elección presentada al usuario

1. Soniox continuo mientrasON, hastaOFF explícito; primera integración más sencilla y con mayor continuidad de contexto/etiquetas. Requiere sustituir el tope120s, revisar presupuesto de inferencias/límites del proveedor y ciclo de identidad, sin parche de reinicios automáticos cada120s.
2. Espera local de voz y Soniox por episodios; requiere desarrollar y validar apertura/cierre reales, pre-roll/contexto, mapa de tiempos, identidad por nuevo stream y ahorro medido. Detector local de voz no confirma un tema ni elimina TV por sí solo. No presentarlo como ya implementado.

Pregunta enviada con coste y alcance explícitos; respuesta pendiente al escribir esta nota. No elegir silenciosamente una escucha indefinida ni prometer ahorro manteniendo la conexión abierta. Controles compartidos móvil/gafas deben usar una única autoridad, mostrar el estado real y tener OFF inmediato; app diagnóstica opcional, sin inicia captura por pintar/restore/reconexión.

La autorización de instalación ya se completó: [informe S2.4](instalacion-s2.4-hermes-2026-10-05.md). Sin nueva APK, captura ni despliegue por esta aclaración. Código actual local sin publicación; conservarlo.
