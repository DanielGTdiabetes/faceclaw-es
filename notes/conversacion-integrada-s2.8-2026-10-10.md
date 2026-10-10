# Conversación integrada S2.8 · 10-10-2026

El usuario pide reorganizar los controles, retirar opciones obsoletas y eliminar shadow para probar
Gatekeeper directamente con Hermes. Esta decisión posterior reemplaza el requisito anterior de
pasar por shadow antes de ACTIVE. No convierte los resultados sintéticos en validación de calidad.

## Interfaz y comportamiento

- Entrada Conversación desde el mando y botón explícito Salir dentro del panel; Atrás
  también cierra el panel. Se retiraron las dos pestañas iniciales tras la observación del usuario.
  El mando recupera su espacio; la conversación tiene un panel
  desplazable propio, estado, texto recibido y aportaciones de Hermes durante la sesión.
  Colores adaptados al tema del resto de Faceclaw; comprobado en oscuro, sin tarjetas blancas.
- Tres inicios explícitos: Escucha continua con Gatekeeper, Hermes sin Gatekeeper y Solo transcribir.
  El primero selecciona ACTIVE + Hermes; los demás desactivan Gatekeeper. Abrir/navegar no captura.
- Un botón Detener escucha permanece fuera del área desplazable mientras está ON. Volver al mando
  no detiene la sesión. Las gafas ofrecen los mismos tres modos y comparten el mismo propietario.
- Ajustes agrupados y cerrados inicialmente: reconocimiento/modelo/idioma, modelo Gatekeeper,
  memoria, perfil opcional y diagnóstico. Se congelan durante ON. Sin selector shadow ni controles
  duplicados de inicio, texto, participación o modo. La identificación Soniox aparece solo cuando aplica.
- Sin pesos Gatekeeper, el botón permite descargarlos explícitamente y exige otro toque para iniciar.
  Nunca inicia escucha al finalizar la descarga. Desde gafas, sin pesos informa y permanece OFF.
- LFM2.5-1.2B Q4 es la selección inicial Gatekeeper por su mayor retención provisional de ASSIST
  frente a Qwen; ambos resultados y sus límites se conservan. No se descargan pesos adicionales.
- Siguen vigentes prioridad de interacción explícita, cancelación, límite temporal, fallback ASSIST,
  breaker y recuperación. Deadline normal 1500 ms/caliente y 8000 ms/frío; tres fallos abren bypass
  de 180 s. Con LFM (P50/P95 4645/7940 ms en replay sin audio), cabe esperar bypass frecuente:
  esta entrega habilita la prueba directa solicitada, **no demuestra ahorro ni latencia adecuada**.
- WAIT sigue apagado inicialmente, ajustable solo en diagnóstico. Las pruebas sintéticas son opcionales.
  Memoria diaria sigue opt-in; no se alteran prompts ni proveedores Hermes o Whisper.

## Última sesión real, anterior a S2.8

El usuario termina OFF y permite consultar métricas. Whisper small/Automático/Texto y Hermes,
memoria diaria OFF. Gatekeeper resulta null: **no estuvo activo**, aunque el usuario esperaba que sí.

- Escucha 533879 ms, PCM capturado 530550 ms. 67 turnos entregados.
- 2 assess → 2 tema; 38 assist → 37 nada y 1 mensaje, efectivamente presentado en lentes.
  Sin errores/fallback/cancelaciones del canal. Jarvis coincide con estos recuentos.
- Roundtrip assist medio 1298 ms/máximo 2375 ms; tiempo servidor P50/P95 1003/2065 ms.
- Whisper: 145 decodificaciones, media 2074,5 ms/máximo 5444; 71 aceptadas/67 entregadas,
  73 abstenciones (69 idioma distinto de es/ca, 4 estructura), 27 descartes, sin errores de decode.
  Las ventanas se solapan: no convertir esos recuentos en segundos perdidos o porcentaje de precisión.
- 10638 paquetes nativos, cero paquetes faltantes/duplicados/descartes de cola, 27 descartes de entrega
  PCM. No sumar estos 27 a los 27 descartes Whisper como si fueran 54 pérdidas independientes.
- 100/145 ventanas bajo −60 dBFS; ganancia media 20/máxima 28. Señal débil y rechazos de idioma
  merecen diagnóstico, pero no prueban por sí solos la causa ni que small sea peor que base.

37/38 abstenciones de Hermes corroboran la baja frecuencia de aportaciones; sin texto completo
etiquetado no prueban cuántas oportunidades útiles perdió. El prompt favorece silencio y exige
utilidad clara: posible explicación, pendiente de contraste. No se cambia a ciegas en esta entrega.
No se exportaron transcripciones/audio/perfil; solo se versionan agregados. El ACK de memoria de
aportaciones recientes del puente no significa actualización de memoria diaria.

## Verificación e instalación

265/265 pruebas de conversación/Gatekeeper/Whisper/Soniox; TypeScript, oxlint, XML, preparación
NativeScript, compilación release y lintVital correctos. Pruebas cubren los tres inicios, protección
frente a controles retenidos, falta de modelo, navegación sin captura, prioridad y paradas.

- Pixel 10 Pro Fold, com.faceclaw.app, versión `0.8.2-es.5-conversation.s2.8-integrated`, código805.
- APK final SHA256 `1fcd56ce96825666e19c273b5f83f9dd0602cb7ccc2de9a00bd4d7fafa26b35f`;
  extraída después e idéntica. Firma original `57aaa887…c435`, actualización install-r, sin desinstalar.
- 35 ajustes privados idénticos (SHA256 `d1ee861b…af95`); perfil guardado observado, sin leer/exportar vector.
  La selección RAM se deja Whisper small/Automático/memoria OFF; escucha OFF, ajustes cerrados.
- Runtime package.json idéntico (`70f23257…b647`); 6/7 nativas idénticas a S2.7r3.
  llama.cpp recompilado desde la fuente vigente, sin cambios fuente nativos de esta entrega:
  `350f46cb8dee33cdd4ad02cd07fbb50a7a2dd2141210b00be86209bfc7ac222f`.
  Fuente C++ empaquetada en el proyecto Android igual a App_Resources, SHA `45f2473e…af44`;
  cuatro símbolos JNI Gatekeeper (crear/liberar/ejecutar/época de cancelación) presentes.
- UI real comprobada: «‹ Salir» y Atrás regresan, no botón Mando exterior, entrada Conversación
  oculta dentro, tema oscuro legible, modelos/idioma/memoria/perfil accesibles por scroll.
  No nueva escucha ni inferencia de replay para comprobar esta UI. Inicio real ACTIVE aún sin medir.
- Reversión S2.7r3 `5f0b6a5c…6d83`: `dist/conversation-g0/before-install-20261010-051325.apk`.
  Reversión fresca inmediata (S2.8 anterior al ajuste final de colores) `7d867dc1…f2d2`:
  `dist/conversation-g0/before-install-20261010-051940.apk`. Siempre install-r con firma original.
- Ajuste USB `stay_on_while_plugged_in=0` verificado y no modificado en S2.8; reserva propia liberada.

No se modifica firmware/Wear ni se repite el registro de voz. No hay nueva copia NAS en esta entrega.
Los cambios concurrentes ajenos en el prompt Hermes y el plan Whisper no forman parte de esta entrega de UI.
