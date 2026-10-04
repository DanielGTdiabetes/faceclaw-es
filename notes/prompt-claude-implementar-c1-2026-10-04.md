# Encargo para Claude — implementar C1, castellano primero

Continúa Faceclaw en `E:\projects\faceclaw-es`, rama `codex/conversation-detection-g0`. Codex ha revisado tu entrega `1c02587` y acepta C1 para implementación acotada con las precisiones de `notes/revision-codex-contratos-c1-2026-10-04.md`. No hace falta otra ronda de diseño: implementa, verifica y entrega el resultado para revisión de Codex.

Lee AGENTS.md, `notes/continuidad-entre-pcs.md`, el diseño `notes/diseno-claude-conversacion-proactiva-hermes-2026-10-04.md` (§9–§14, especialmente §12) y la revisión indicada. En este PC consulta también `C:\Users\danie\.codex\memories\faceclaw.md` si existe. Comprueba estado/HEAD y conserva cualquier cambio local; no reset/clean ni reescritura del historial publicado. El carácter invisible del título de `1c02587` no requiere corrección.

## Objetivo y alcance

El objetivo sigue siendo detectar conversaciones en las que participa el usuario y que Hermes aporte respuestas, ideas y comentarios breves en las lentes, con humor irónico ocasional. Primero castellano; valenciano aplazado. C1 es el incremento mínimo para entender por qué la otra persona apenas se transcribe y comparar `auto/es` con medidas fiables. No lo presentes como modo proactivo terminado ni como otra auditoría general.

Implementa §12: diagnóstico acústico de todas las tramas por fase, atribución ASR en origen incluyendo prebuffer/segmentos mixtos/trabajos/resultados y selector de idioma RAM solo OFF, congelado por sesión. Default `auto` y diagnóstico desactivado. Mantén modelos, umbrales, segmentación, tope manual de 120 s, prioridad del asistente y flujo habitual. No reintento ASR. No implementes C2/C3/C5 ni envíes audio/texto experimental a Hermes.

## Condiciones concretas de código y pruebas

- Sigue los contratos de fases de §12. Los rótulos son marcas del usuario, no identificación de hablantes. Cuenta señal bajo umbral como actividad acústica; referencia ambiental separada. No añadas texto/audio a snapshots, logs ni informes. Controla índices y memoria de fases/marcas.
- Conserva exactamente las decisiones del VAD. Instrumentación opcional; contabiliza candidatos abortados por origen de sus tramas, e interrumpidos por reset/OFF por separado. Un candidato que abre episodio no suma a `candidateOnlyMs`.
- Propaga fase al buffer compartido y sus muestras previas, Job y Result. Nunca atribuyas por última fase, última etiqueta de voz o resta de snapshots. Comprueba que marcar y aceptar PCM tienen el orden indicado también en la integración real.
- Centraliza o cubre todos los descartes de Result pendientes: sobrescritura, reset, stop, deadline en `nextJob`, `finally` y publicación inválida. Cuenta cada descarte una sola vez en su fase. Consumo sin listener no es entrega. Conserva totales compatibles y las métricas hasta el siguiente inicio. En OFF no aparece texto; presenta drenaje mientras el worker siga activo. No añadas cola ni cambies la ranura única en C1.
- Idioma: no uses un campo mutable escrito antes de un `start()` que puede ser rechazado mientras carga el worker anterior. Cada inicio aceptado debe capturar su configuración inmutable. Prueba carga bloqueada + intento de inicio con otro idioma rechazado; el decoder original conserva su idioma.
- En modo `es`, `result.lang` vacío o `es` se normaliza como castellano forzado. Otro idioma explícito, **incluido `ca`**, suma discrepancia y rechazo, sin texto entregado. `auto` conserva el filtro anterior. Extrae normalización a una función comprobable si hace falta: prueba vacío/es/en/ca y filtro compartido. No afirmes conocer el valor real devuelto por el dispositivo hasta el ensayo posterior.
- Muestra «castellano (forzado)», sin idioma detectado ni confianza inventada. Ninguna preferencia persistente nueva; controles RAM no alteran los 33 ajustes.
- Conserva `wallMs` e `inputMs` por separado. Su diferencia también puede contener desfases de cola/reloj; no la llames audio perdido confirmado.
- Escribe las diez pruebas mínimas de §12.6 y las variantes anteriores. Para N3, 80/40 ms sirve como prueba aislada de tramas; la variante integrada usa fronteras reales de chunks de 50 ms. Ajusta solo detalles de fixtures que lo requieran, con explicación y sin cambiar semántica para hacer pasar pruebas.

## Verificación y artefacto

Ejecuta TypeScript/lint, pruebas Node del área afectada y Kotlin pertinentes, incluida regresión de participación al cambiar el buffer compartido. Regenera el AAR, prepara build Android release y `lintVitalRelease`. No repitas baterías físicas ni suites ajenas por defecto. Resuelve fallos propios antes de entregar; informa limitaciones reales sin ocultarlas.

Prepara la APK de móvil como `0.8.2-es.5-conversation.c1`, código805 y **firma original**. Comprueba certificado público `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`, paquete y hashes. No generes una firma nueva. Verifica los hashes de las siete bibliotecas nativas contra la APK G3.4.2; el AAR cambia por Kotlin compartido, los `.so` no. Conserva assets y cambios de build previos; sigue el flujo existente de preparación sin ejecutar helpers de otro entorno a ciegas.

Esta entrega acaba en **APK preparada, no instalada**. No consultas al móvil, captura, ensayo ni servicios de Jarvis. No leas/exportes/reenroles el perfil ni copies `noBackup`. Conserva Hermes habitual, GPS, bloqueo, firmware /36 y Wear deliberadamente desconectado.

Respalda código/notas/artefactos sin secretos en los destinos habituales del NAS, con hashes y permisos existentes, si está accesible. No inventes copia o igualdad si no se comprobó. No abras PR ni fusiones; publica commits en la rama compartida sin force-push, conservando commits Codex previos.

## Entrega

Escribe `notes/informe-claude-c1-2026-10-04.md`: commit final, diff/símbolos afectados, pruebas y resultados, AAR/APK/firmas/hashes/nativas, compatibilidad de preferencias por inspección, reversión y límites. Distingue pruebas software de observación física: no se ha medido mejora del interlocutor ni valor real del idioma forzado en el dispositivo. No afirmes 33 ajustes antes/después de una instalación inexistente.

Actualiza AGENTS.md y continuidad: «C1 implementado y APK preparada, pendiente de revisión Codex; no instalado ni ensayado». G3.4.2 continúa como último estado instalado documentado y su revisión completa sigue pendiente; C1 no la aprueba retroactivamente. Mantén abiertos precisión/participación/autonomía e incidentes históricos. Entrega commit final y ruta del informe; después Codex revisará el código y artefacto antes del paso físico. El ensayo de §13 es posterior y debe acotarse con el usuario, no ejecutarse automáticamente como una batería de cuatro sesiones.
