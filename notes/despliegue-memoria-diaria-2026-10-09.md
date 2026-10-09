# Memoria del día: despliegue y primera prueba

Fecha: 09-10-2026. Estado vigente: **instalada S2.6.11 y puente desplegado**. La arquitectura de audio de la auditoría sigue siendo propuesta; este incremento añade memoria opcional y conserva captura, motores y modelos anteriores.

## Instalación comprobada

- Pixel: `0.8.2-es.5-conversation.s2.6.11-daily-context`, código 805, paquete com.faceclaw.app. Instalación mediante adb install -r desde OFF, sin desinstalar. APK extraída después idéntica a la entregada.
- 35 ajustes idénticos antes/después; perfil existente guardado observado en UI, sin leer ni exportar su vector. Firma española original, SHA-256 del certificado `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- Siete bibliotecas nativas y configuración del runtime idénticas a S2.6.10. Build release/lintVital, firma v2/v3 y alineación 16 KB correctos. No firmware, Wear, modelos descargados ni reenrolamiento nuevos.
- Jarvis/BMAX: tres fuentes actualizadas, servicio faceclaw-hermes activo y capacidad conv/daily-context/1 anunciada. Configuración de proveedor, credenciales, herramientas y servicio gateway conservados. SQLite 3.50.4 con FTS5 comprobado.
- La memoria móvil arranca desactivada y su selección vive en RAM. El usuario la activó para su prueba con Whisper small y Texto y Hermes. No restablecer el motor o la memoria por rutina al retomar.

## Política de memoria y límites

Opt-in separado: hasta 32 resúmenes por tema, 600 caracteres, hasta tres relevantes por evaluación. Caducan a las 24 horas de su última actualización; las lecturas y repeticiones exactas no renuevan el plazo. El modelo puede proponer una paráfrasis como novedad: no se garantiza una deduplicación semántica perfecta.

Sin grabaciones ni archivo de transcripciones completas. Base privada en `/home/dani/.cache/faceclaw-daily-context/topics.sqlite3`, directorio 700/archivo 600, fuera de las copias de este despliegue. Purga activa cada 30 segundos y al acceder; con el servicio apagado, borrado físico al siguiente arranque. SQLite secure_delete/reconstrucción FTS; sin cifrado propio ni control de la retención del proveedor. «Desactivar» evita nuevas consultas/escrituras; «Borrar memoria del día» exige acuse y elimina resúmenes existentes. La memoria anterior de seis aportaciones entregadas/dos horas en RAM sigue siendo independiente.

## Primera prueba del usuario

Whisper small, memoria activa, 81,797 segundos. Después de confirmar OFF se leyeron métricas agregadas, sin transcripción ni contenido de resúmenes: 17 turnos aceptados, dos evaluaciones y diez peticiones de ayuda; las diez respondieron «nada». Cero fallos de canal, errores, respuestas caducadas o fallback. Latencia media de ayuda 1.348 ms, máxima 1.624 ms. Cero mensajes y cero presentaciones en lentes.

La captura recibió 1.634 bloques, sin errores LC3, huecos de trama, descartes de cola o de entrega; hueco máximo entre paquetes 104 ms. Estos datos no acreditan que se reconociera la otra voz. Las métricas ASR se reinician al OFF y no permiten medir aquí el tiempo de Whisper ni su precisión. La base contenía un tema y cero caducados, comprobando solo recuentos: guardar un tema no valida su calidad o la utilidad de su recuperación.

Ejemplo recordado por el usuario: «¿qué vais a comer hoy?». Abstenerse puede ser adecuado porque Hermes no conoce los planes de esas personas. No demuestra que todas las abstenciones fueran correctas. Próxima prueba breve útil: «¿qué puedo cocinar con garbanzos, tomate y arroz?», mirando si aparece completa la frase en el móvil antes de atribuir el silencio al asistente. No se ha relajado el prompt a partir de un único ejemplo.

## Validación

60 pruebas Python de conversación/memoria/puente/fallback y protocolo standalone, también en el runtime real de Hermes con proveedores simulados; 155 pruebas Node relacionadas; seis pruebas del helper de despliegue/reversión; TypeScript app/pruebas, oxlint y XML correctos. Compilación Android release y lintVital correctas. La prueba humana anterior es independiente: no hay validación prolongada de memoria, autonomía, interlocutor ni aceleración Tensor.

## Fuentes y recuperación

Repo actualizado por fast-forward a `6395abdf57b1eb934ccd3605d66800ecf21ebe00`, rama codex/conversation-detection-g0. Incremento actual local, sin commit/push nuevo. Stash anterior pre-sync-faceclaw-2026-10-09-local-oct06 conservado; no reaplicarlo sin comparar. El ZIP de recuperación incluye las fuentes públicas actuales con este incremento, no solo HEAD.

| Artefacto | SHA-256 |
| --- | --- |
| faceclaw-0.8.2-es.5-conversation.s2.6.11-daily-context.apk | ed471aa3479fe7a979021b193e5b3d25f6759602332dd2f3de30826b37f1e2dd |
| before-update-s2.6.11-daily-context.apk (S2.6.10 extraída) | d9be4259ee278343c060fff1618b321ac049b27ee4d8919083420b003e259d60 |
| bridge.py | e285abf63f838be762c4bee221289947e04ab9a517705c0a7ec7e115961adbb5 |
| conversation.py | 5cfb9981b4f27c11da36dc996fd76a2f16131b9078e04a9f8ca82252abfa1df6 |
| daily_context.py | 5702985aeed25058977a31addfd7b13f73cd8628c74a9aa5ded6838becf56bf7 |

APK local en dist/conversation-g0/. NAS: `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-s2.6.11-daily-context/`; ajustes privados en `connection-backups/2026-10-09-s2.6.11-daily-context/`, permisos 700/600. SHA256SUMS acompaña los artefactos. No copiar SQLite de memoria, perfil, audio, modelos ni credenciales. El estado final de la verificación NAS se registra en continuidad.

Reversión **solo si se decide volver atrás y con Conversación OFF**: instalar con adb install -r la APK before-update anterior; no desinstalar. En Jarvis ejecutar con su Python de Hermes `~/faceclaw-hermes-bridge/candidate-20261009-daily-context/deploy-hermes-daily-context.py --rollback`. El helper restaura las fuentes de rollback-20261009-daily-context, retira su drop-in 60-daily-context.conf y borra los resúmenes antes de retirar el trabajador de caducidad. No restaura proveedores ni toca gateway. No ejecutar helpers históricos sobre estas fuentes.

## Siguiente trabajo de voz

El BMAX no dispone de GPU adecuada: STT GPU en ese servidor descartado. [Estudio Pixel/Tensor](whisper-aceleracion-pixel-tensor-2026-10-09.md): medir CPU y ventanas descartadas primero; TPU mediante SDK beta/AOT es investigación separada, sin compatibilidad Whisper demostrada. Acelerar no recupera por sí solo una voz ausente en la señal. [Auditoría completa](auditoria-conversaciones-continuas-2026-10-09.md), secciones N/O, conserva los límites y el plan de diagnóstico.
