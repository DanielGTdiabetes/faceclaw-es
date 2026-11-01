# Revisión de la memoria de conversación de Hermes, 07-10-2026

Petición del usuario: revisar el sistema de memoria añadido por Claude el 06-10 en el Bmax/Jarvis y aclarar si funciona y está bien implementado. Revisión de lectura, sin modificar producción, reiniciar servicios, consultar el móvil ni iniciar una conversación real. Las pruebas usan agentes y teléfonos sintéticos, sin llamadas a proveedores ni credenciales.

## Conclusión

La memoria está desplegada, se usa en las solicitudes y funciona como contexto para evitar repetir aportaciones. No es una memoria de las conversaciones ni un sistema de recuerdo permanente. Dos defectos comprobados: se considera dicho un mensaje con solo completar el envío WebSocket, sin confirmar aceptación/presentación en el móvil; y la caducidad filtra el contexto pero no elimina físicamente de RAM los textos vencidos hasta que llega otra aportación. La prevención de repeticiones semánticas depende del modelo y no está garantizada por código.

## Estado real de Jarvis

- `faceclaw-hermes.service` activo, PID `912497`, iniciado el 07-10 a las 06:47:58 CEST. Mismo PID al terminar la revisión; no se reinició.
- `/home/dani/faceclaw-hermes-bridge/bridge.py`: SHA-256 `8e0cab24ac5d011c50064cf60040deadec1073ba846276189e98aefda2b460a9`.
- `/home/dani/faceclaw-hermes-bridge/conversation.py`: SHA-256 `893b44f0ed9acd9d8ebd1e6b1c727ed6bab73cf16883eb0433134066380d5f74`.
- Ambas fuentes coinciden con las revisadas localmente. Las cinco huellas internas de Hermes coinciden con `RUNTIME_HASHES`; no hay bloqueo por incompatibilidad del motor.
- La memoria nueva está en `ConversationService.said`, dentro del puente, no en los archivos persistentes de Hermes. Solo se consultaron fechas/tamaños de los archivos persistentes, sin leer su contenido: `USER.md` fechado 03-10 y `MEMORY.md` 24-08. Estas fechas no prueban todo el historial de escrituras, pero no indican que esta función añadiera memoria persistente ayer.

## Qué guarda y cómo se utiliza

`integrations/hermes/conversation.py` fija seis entradas y una ventana de dos horas con reloj monotónico. Guarda únicamente el texto generado por Hermes cuando un resultado `mensaje` supera la validación y se completa `phone.send`. No conserva directamente los turnos escuchados; una aportación del modelo sí podría incorporar información de esos turnos.

En modo `assist`, cada petición recibe `alreadySaid` con las entradas aún válidas, de la más antigua a la más reciente. El prompt pide no repetir una idea, broma o traducción, permitiendo aportar un ángulo nuevo. Las clasificaciones `assess` no incluyen esa lista. Cada petición utiliza `conversation_history=[]`; la memoria normal de Hermes se desactiva para este agente con `skip_memory=True`, y las herramientas/persistencia están bloqueadas.

El historial de cinco mensajes del móvil es otra lista, solo de la sesión actual, que se borra al OFF. La lista del puente sobrevive a OFF/ON y a reconexiones mientras siga vivo el proceso; desaparece al reiniciarlo. El chat normal conserva su propio historial y acceso habitual a la memoria de Hermes, separados de este canal.

## Hallazgos

### 1. P2: enviar no acredita que el mensaje se haya presentado

En `conversation.py:354–356` se añade el texto después de `await phone.send`. `Phone.send` en `bridge.py:68` solo espera el envío WebSocket. El protocolo no devuelve un acuse de aceptación o presentación para estos mensajes.

El móvil puede descartar un resultado por caducidad/cancelación en `app/assistant/conversation-channel.ts:134` o por estado/episodio en `app/conversation-detection/conversation-hermes.ts:250`. Incluso aceptar el resultado en el controlador no demuestra que el render de las lentes haya funcionado. Por tanto, `alreadySaid` puede disuadir al modelo de volver a aportar algo que el usuario nunca vio.

Reproducción: un teléfono sintético cuyo envío termina correctamente pero descarta el resultado deja el texto en `said`. Esto confirma el límite del contrato; no demuestra que un mensaje concreto de la sesión real se haya perdido así.

Corrección recomendada: confirmar aceptación/presentación con referencia e identificador correlacionados y actualizar esta memoria según esa confirmación; mantener el mensaje pendiente separado, con caducidad y compatibilidad con clientes anteriores.

### 2. P2: caducidad de uso, sin borrado físico al vencer

`_recent_said_entries` en `conversation.py:289` devuelve una lista filtrada, pero no modifica `self.said`. Solo una nueva aportación `mensaje` sustituye la lista por las entradas vigentes y la nueva. Si después solo hay silencio, clasificaciones o desconexión, los textos antiguos siguen en RAM hasta otro mensaje o fin del proceso. El contador `memory` del log mide entradas almacenadas, incluso vencidas.

Reproducción con reloj sintético: tras avanzar dos horas y un segundo, `alreadySaid` queda vacío, pero `said` conserva el texto; una respuesta `nada` tampoco lo purga. No aumenta sin límite: como máximo seis textos de hasta 1200 caracteres cada uno.

Corrección recomendada: purgar las entradas vencidas en una tarea de mantenimiento, además del filtrado al leer. Si se promete borrar al vencer, filtrar únicamente cuando hay una solicitud no cumple ese plazo durante la inactividad.

### Límites adicionales

- No existe un filtro determinista para textos repetidos. Un modelo sintético que devuelve el mismo texto dos veces produce dos envíos y dos entradas, aunque la segunda llamada sí recibe la primera en `alreadySaid`. La instrucción al modelo está conectada; no demuestra obediencia semántica en todas las conversaciones. Puede añadirse un filtro de igualdad normalizada sin asumir que resuelve paráfrasis o traducciones.
- La lista es global para el proceso, sin separación por teléfono, sesión, episodio o identidad. Está alineada con la intención documentada de evitar repeticiones al hacer OFF/ON rápido en el mismo equipo. La prueba confirma que otro teléfono/sesión autenticado recibe el contexto anterior; si se admiten varios usuarios, necesitará un ámbito de memoria apropiado. El puente solo mantiene una conexión móvil activa a la vez; no se ha observado un uso multiusuario real.
- Solo recuerda las seis últimas aportaciones propias. Tras siete o más, las más antiguas salen de la lista; tampoco recuerda lo que dijeron las personas fuera de la ventana de turnos actual. No permite recordar conversaciones de ayer.

## Evidencia operativa y pruebas

Los logs agregados del 06-10 muestran que el contador sube de cero a seis después de resultados `mensaje`, permanece con `nada` y vuelve a cero tras reiniciar. No se leyeron transcripciones ni textos de respuestas reales. Esto acredita funcionamiento en producción de la acumulación, no ausencia de repeticiones ni observación física.

Desde el arranque actual, la consulta del journal devuelve **18 `assist -> nada`, todas con `memory 0`**, entre las 13:05 y las 13:07 CEST del 07-10, además de las clasificaciones. En ese intervalo la abstención no se explica por una lista `alreadySaid` llena: estaba vacía. Los registros agregados no explican por qué el modelo se abstuvo; no permiten juzgar la relevancia de lo hablado ni la calidad del prompt en esa sesión.

Las 20 pruebas existentes de `test_conversation.py` pasan; la fuente del directorio de pruebas coincide con la fuente activa. Ocho escenarios adicionales contra el módulo activo pasan como reproducción del comportamiento descrito: límite/orden; caducidad sin purga; duplicado sin filtro; envío sin aceptación; ámbito compartido; conservación al desconectar y vacío de una instancia nueva; fallo de transporte sin guardar; cancelación sin guardar. Los escenarios que reproducen defectos pasando no significan que esos defectos estén corregidos.

Script local reproducible: `.tools/audit-hermes-memory-20261007.py`, con guardia del hash de producción. Ejecutado por stdin SSH en el intérprete administrado Python 3.14.7 de Hermes, con `-I -B`, sin crear archivos de prueba en Jarvis. Las 20 pruebas existentes se ejecutaron con Python del sistema y `-B`. No se cargó un agente real ni se usaron modelos, puerto de producción o dispositivo.

Resultado de esta sesión: revisión y documentación local; sin correcciones de código de app/puente, APK, despliegue, servicios, Git commit/push ni copia NAS. La mejora recomendada queda por implementar.
