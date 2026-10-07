# Auditoría de latencia Hermes y activación de voz, 07-10-2026

## Estado y sincronización

Petición del usuario: recuperar los cambios de Claude de GitHub, medir el puente real, optimizar la rapidez y revisar «ey Even» que requiere varios intentos. `git fetch origin` confirmó que local y remoto `codex/conversation-detection-g0` ya coincidían en `b634d84`. No se descartó ningún cambio ni se necesitó un pull. El incremento público de esta auditoría se conserva en la misma rama; APK, firma, ajustes y logs privados quedan fuera de Git.

Jarvis ejecutaba OpenRouter `openai/gpt-6-luna` como principal y ChatGPT/Codex `gpt-6-luna` como respaldo: `50-openrouter.conf` activo, `50-openai.conf.disabled`. La entrada de continuidad del 06-10 que describe ChatGPT principal corresponde a un estado anterior; el cambio a OpenRouter fue posterior. Los servicios Faceclaw y gateway están activos. Carga baja y memoria disponible: no hay evidencia de saturación de Jarvis.

El usuario autorizó cuatro pruebas sin cambiar todavía el proveedor y, tras verlas, eligió explícitamente ChatGPT principal y OpenRouter de respaldo. Aplicado a las 06:48: `50-openai.conf` activo; el antiguo principal queda como `50-openrouter.conf.inactive-20261007`, sin sobrescribir el `.disabled` histórico. Copias de ambos drop-ins en `~/faceclaw-hermes-bridge/rollback-20261007-provider/` (700/600). Reiniciado solo Faceclaw; inicialización 4705 ms, modelo `gpt-6-luna`, catálogo móvil 34 herramientas, ambos servicios activos. Gateway sin cambiar. Reversión del proveedor: mover `50-openai.conf` a `50-openai.conf.disabled`, restaurar `50-openrouter.conf.inactive-20261007` como `50-openrouter.conf`, `systemctl --user daemon-reload` y reiniciar únicamente Faceclaw con audio OFF.

No hay comprobación de saldo antes de cada respuesta: el respaldo existente interviene tras fallar la llamada principal y puede añadir el tiempo consumido por ese fallo. La disponibilidad de cuota incluida de Codex y el saldo API/OpenRouter son distintos. Cuota del PC consultada: 82 % restante en cinco horas y 97 % semanal; no acredita por sí sola la cuenta de Jarvis. Las cuatro llamadas correctas sí acreditan acceso ChatGPT en Jarvis en ese momento.

## Mediciones autorizadas

Ocho consultas sintéticas de OpenRouter autorizadas expresamente, aisladas del teléfono, sin mostrar ni almacenar autenticación. Chat con esfuerzo medio: 3253 y 2059 ms; bajo: 2272 y 1292 ms. Evaluación conversacional: 1004 y 878 ms; aportación: 1316 y 1188 ms. El callback de primer texto de ese script no coincidía con el del runtime: esos tiempos son totales, no tiempos de primer token. Muestra pequeña, sin prueba causal de superioridad del esfuerzo bajo.

Cuatro consultas sintéticas posteriores por ChatGPT/Codex, Luna 6, esfuerzo bajo, sin fallback ni herramientas: chat 3087 ms (primer texto 2509) y 982 ms (733); evaluación 1142 ms (869); aportación 1097 ms (712). Cuatro respuestas correctas por contrato. No se ha demostrado que un proveedor sea siempre más rápido; ambos presentan variación.

Primer ensayo físico: el usuario aclara que preguntó si iba a llover hoy. La activación funcionó a la primera. Hermes empleó ubicación y cuatro llamadas a herramientas, cinco llamadas de modelo; primer texto 9545 ms, total 9975 ms. Las herramientas eran pertinentes para esa petición, no un defecto demostrado.

## Cambios aplicados

Puente: chat con `FACECLAW_CHAT_REASONING_EFFORT=low` por defecto; la frase actual tiene prioridad sobre historial y contexto, y se solicita aclaración si parece cortada. Se conserva la capacidad de contestar seguimientos cortos claros. Herramientas, límites, autenticación, gateway y fallback permanecen intactos.

Conversación: estilo intermedio solicitado por el usuario tras explicar que los chistes anteriores eran forzados y cargantes. Se permiten observaciones y humor breve cuando encajan; la mayoría de respuestas pueden ser directas. Se conserva `alreadySaid` (seis aportaciones propias entregadas, dos horas, RAM) y no se recupera el prompt excesivamente sarcástico de GitHub.

Despliegue reversible del código con `scripts/deploy-hermes-latency.py`. Antes: `bridge.py` `f0147d168e9c6d53f0f83c2780ad8020b940ce6b80d52b5796314d3f878fe0d5`, `conversation.py` `6350ced02429121c13dfd3826305f6cfde2317ae0d34e07760a4efd31d63ba26`. Después: puente `8e0cab24ac5d011c50064cf60040deadec1073ba846276189e98aefda2b460a9`, conversación `893b44f0ed9acd9d8ebd1e6b1c727ed6bab73cf16883eb0433134066380d5f74`. Copia anterior en `~/faceclaw-hermes-bridge/rollback-20261007-latency/`; `--rollback` restaura ambos. Reiniciado solo `faceclaw-hermes.service`, ambos servicios activos y catálogo del móvil reconectado.

App S2.6.6: si la sesión EvenHub conserva un layout completamente entregado, se puede empezar audio sin esperar el frame de encendido de pantalla. Se comprueba la disponibilidad nativa antes de `shell.wake`; sesión suspendida, layout incompleto o reanudación en curso conservan la barrera completa. No se activa captura por abrir la app ni se mantiene el micrófono encendido.

## APK y validación

APK original `0.8.2-es.5-conversation.s2.6.6-manual-context`/805, SHA-256 `dfee9a8f5576daefc1884f167bdec87b1689447f83215646840b5089c6670c09`, en `dist/conversation-g0/`. Certificado original `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`; zipalign 16 KiB; siete bibliotecas nativas y runtime package idénticos a S2.6.3/S2.6.4. No se modificó firmware ni código nativo.

Instalada con `adb install -r` desde Conversación OFF, hash de base extraída idéntico. Los 35 ajustes antes/después son byte a byte idénticos; perfil conservado sin leerlo ni reenrolarlo. El ajuste adicional frente a los 34 históricos es la suspensión desactivada por el usuario para el diagnóstico. Respaldo privado con ACL restringida en `.tools/audit-20261007-private/`; reversión fresca S2.6.5 `before-update-s2.6.6-manual-context.apk`, SHA-256 `3f00614ea2c782fb8bd659cfcd3857c12390a943eaabaacafd9a51774d7640f3`.

318/318 pruebas JS/TS del área conversación, Soniox, voz, chat y arbitraje correctas; typecheck de app/pruebas y oxlint correctos. Cuatro regresiones ejercitan el método real del controller; el caso de sesión retenida falla sobre HEAD anterior y pasa en la corrección. Prepare, Gradle y lintVital correctos. La receta `.tools/s2.6.6-run.ps1` llegó hasta firma y rechazó inicialmente el nombre de versión no incluido en ValidateSet; ampliados los helpers públicos, firma y comprobación completadas sin recompilar. En el runtime real de Jarvis: 24 pruebas aisladas y protocolo del puente correctos; simulación de despliegue/idempotencia/reversión/origen desconocido/recuperación correctas. No se ejecutaron nuevas consultas pagadas en esas pruebas.

## Activación física: fallo todavía abierto

Con S2.6.5 y pantalla apagada, «ey Even, ¿cuánto es tres más tres?» seguido no abrió y no llegó evento de activación al móvil. Un «ey Even» posterior aislado sí abrió. Esto sitúa ese intento fallido antes de Soniox y Hermes; no demuestra si falló el detector del firmware o el transporte del evento.

El usuario desactivó Ajustes → Desarrollador → «Suspender EvenHub al apagar pantalla» en las gafas. En un ensayo posterior abrió pero respondió sobre el tiempo; solo llegaron siete caracteres de frase actual al puente, compatible con inicio de pregunta perdido y uso del historial meteorológico. No se dispone de transcripción exacta para afirmar qué palabras se captaron.

Antes de corregir: eventos fríos procesados en 1187 y 1249 ms; uno con suspensión desactivada, 420 ms. S2.6.6: dos eventos recibidos a las 06:42:33 y 06:42:45 procesados en 62 y 31 ms, primer frame de voz enviado en 378 y 294 ms. Audio recibido sin pérdidas ni errores de decodificación en esas capturas. El usuario informa «No se abre» en el ensayo de frase seguida y aclara que el primer intento no abrió, después volvió a intentarlo; cree que la ausencia de pausa es la causa. Los dos eventos registrados no demuestran que el primer intento fuese detectado. Una respuesta posterior del puente: 4208 ms, primer texto 4053, una herramienta, dos llamadas de modelo; frase actual de 13 caracteres. No acredita que captase la pregunta aritmética entera.

Ensayo final con pausa: «ey Even», esperar entrada de voz y después «¿cuánto es tres más tres?». El usuario confirma funcionamiento correcto a la primera y respuesta seis; acepta explícitamente la pausa como tolerable/admisible. Evento recibido 06:47:44, procesamiento 24 ms; primer frame de voz enviado aproximadamente 417 ms después del evento; 79 paquetes/4 s, sin pérdidas ni errores. Respuesta 3181 ms, primer texto 2926, una herramienta/dos llamadas de modelo. Este ensayo fue anterior al cambio de proveedor de las 06:48, por tanto esos tiempos reales pertenecen todavía a OpenRouter. ChatGPT está probado con las cuatro consultas sintéticas; no atribuirle ese ensayo físico.

La suspensión sigue desactivada por indicación durante el diagnóstico. Puede aumentar el consumo de batería (no medido) y no ha resuelto por sí sola el síntoma. El primer intento con pausa queda validado en esta prueba; la detección de frase seguida no está corregida ni su causa interna demostrada. No repetir ensayo por rutina: el usuario acepta el uso con pausa. Si reaparece el fallo incluso con pausa, recoger un único intento con timestamp antes de nuevos cambios.

Cierre: UI móvil Conectado/Display off/Hermes en conversación OFF/perfil guardado observada tras la prueba; último audio de voz finalizado, sin nuevas capturas iniciadas por Codex. Tono nuevo aún sin evaluación humana en modo conversación. La clave SSH existente solo estaba autorizada para Jarvis (confirmación del usuario); el NAS la rechazó. El usuario autorizó acceso al NAS por contraseña, introducida únicamente en el prompt SSH sin eco, sin almacenarla en archivos o argumentos.

Archivo NAS por Tailscale: APK y reversión en `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-s2.6.6-manual-context/`, ajustes privados antes/después en `connection-backups/2026-10-07-s2.6.6/` y notas de continuidad en `notes/auditoria-20261007/`. Directorios 700 y archivos 600. La verificación final compara los hashes remotos con los locales; no se modifica autenticación del NAS ni se instala una nueva clave pública.
