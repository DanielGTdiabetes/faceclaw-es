# Hermes sin aportaciones: diagnóstico real S2.6.1

05-10-2026, PC del trabajo. Usuario informa que no recibe mensajes Hermes en las gafas y sospecha que el ON de las gafas funciona distinto al del móvil. Sin build, instalación, despliegue, reinicio de servicios ni cambios de ajustes/perfil.

## Evidencia observada

Móvil conectado por ADB, Faceclaw Conectado y escucha manual activa, voz opcional y 20 min. Primera sesión observada con 12 y después 30 evaluaciones intentadas. El usuario confirma que volvió a activar ON desde las gafas mientras se revisaba; ese nuevo ON reinició los contadores, por lo que no se recuperaron los resultados de la primera sesión. La sesión posterior de 12,95 s no produjo turnos ni solicitudes Hermes.

El usuario autoriza una única prueba orientativa de unos 45 s, iniciada por él desde las gafas. Se observa ON/escuchando/voz opcional y evaluaciones. La captura real terminó en OFF por Codex al recoger diagnósticos; el resumen acredita 119,15 s de audio enviado, superior al intervalo orientativo solicitado. No afirmar que duró 45 s. No iniciar otra prueba por rutina.

Resultados de esta prueba (recuentos, sin conversaciones):

- Soniox: 119150 ms enviados, 26 turnos, 674 tokens finales, 3 etiquetas de voz, cero errores/fallbacks/invalidez temporal. Primera entrega de token 12115 ms, primer final 15281 ms; backlog al parar 1430 ms. No identifica al portador, pero la modalidad opcional permite continuar.
- Hermes: modalidad `identidad-opcional`, 26 turnos aceptados y cero ignorados, una candidata, una clasificación y 15 solicitudes de asistencia. 16 solicitudes enviadas, un veredicto `tema`, siete resultados `nada`, ocho cancelaciones, cero errores/rechazos/resultados inválidos/caducidades. Cero mensajes y cero entregas.
- OFF comprobado: lease/timer/buffer retirados, motores sin trabajo, nativo `capturing:false`, cero paquetes perdidos/errores de decodificación/descartes PCM en la prueba final.

## Interpretación y límites

La activación desde las gafas sí alcanza el recorrido manual opcional y Hermes clasifica el tema. Los controles de móvil, app Conversación y menú del sistema llegan a `setManualConversationEnabled` del mismo controller. Abrir la app por sí solo no inicia escucha. Los menús mantienen la acción con la que se abrieron; su etiqueta puede quedar antigua si cambia la sesión mientras siguen abiertos. No se ha demostrado un defecto distinto de activación entre dispositivos.

La ausencia de mensajes en esta prueba se explica en la ruta previa al display: siete abstenciones explícitas y ocho solicitudes canceladas. El runtime cancela una solicitud al recibir contexto más nuevo y al cerrar; los recuentos no separan ambas causas. No atribuir todas las cancelaciones a latencia. No hay evidencia de timeout, error del proveedor ni bloqueo por identidad. Al no generarse una aportación, no se valida ni descarta un defecto adicional de presentación óptica.

El prompt actual pide `nada` salvo que una aportación ayude claramente, y abstenerse ante redundancia/incertidumbre/hechos actuales sin verificar. Los contadores no explican la motivación semántica concreta de cada abstención. Cambiar la frecuencia o ese criterio requiere concretar el comportamiento deseado; no se modificó por este diagnóstico.

Intento SSH de solo lectura con autenticación por clave falló; no se leyeron registros remotos ni se comprobó de nuevo systemd. La evidencia de veredicto/resultados sí acredita respuestas reales del canal del móvil durante esta prueba. No guardar credenciales en notas/chat/código.

Evidencia privada local en `.tools/hermes-test-metrics.xml` y dumps/registro auxiliares, excluidos de Git. Esta nota contiene solo agregados. Sin commit/push ni espejo NAS nuevos en este diagnóstico.
