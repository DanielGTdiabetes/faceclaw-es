# Revisión Codex de los contratos corregidos de C1 — 04-10-2026

Revisado `1c02587` en `codex/conversation-detection-g0`, contra el diseño anterior y el código actual del VAD, coordinador, buffer/sesión ASR y wrapper Android. Árbol limpio y sincronizado al comenzar. Entrega solo documental; sin pruebas ejecutadas, build, instalación, consulta al móvil ni servicios remotos.

**C1 aceptado para implementación acotada**, con las precisiones siguientes incorporadas al encargo. No hace falta otra ronda dedicada a corregir documentación. Esta aceptación sustituye el bloqueo de C1 de la revisión anterior; no valida precisión, participación, autonomía, G3.4.2 ni los incrementos posteriores.

## Correcciones verificadas

- §12 incluye todas las tramas válidas, señal bajo umbral, saturación y referencia ambiental. Los candidatos abortados no se confunden con voz débil ni con candidatos que abren episodio.
- Fases por origen, también en muestras previas, segmentos mixtos, trabajos y resultados: evita contaminar fases por inferencia/callback tardíos. El cambio compartido y la regeneración del AAR están reconocidos; los `.so` deben conservar sus hashes.
- Selector RAM `auto/es`, solo OFF y congelado por sesión, con etiqueta explícita de idioma forzado. Default `auto` conserva una comparación controlada; no supone retomar el valenciano como objetivo.
- Las pruebas propuestas ejercitan fronteras, descarte, señal bajo umbral y privacidad. El ensayo artificial queda separado de la comprobación humana y permite resultado inconcluso.
- §10 declara los contratos futuros que faltaban: origen común texto/voz, reconfiguración de motores dentro de ON, ruptura de evidencia incierta y aislamiento efectivo de Hermes. Son propuestas para revisar al implementar C2/C3/C5, no funcionalidad existente ni aprobaciones anticipadas.
- La referencia Merge-Legacy ayuda a la política de intervención sobre texto ya obtenido, sin resolver la captación del interlocutor. No bloquea C1.

## Precisiones obligatorias en la implementación

1. **Descarte de resultados: cubrir todos los caminos.** El código actual también pone `result = null` por deadline en `nextJob()` y en el `finally` del worker; no solo en reset/stop. Centralizar el descarte o asegurar cobertura equivalente, una vez por resultado pendiente y con su fase original. Un resultado consumido sin listener tampoco cuenta como entregado. Tras el drenaje, los aceptados deben quedar explicados por entrega o descarte, sin callbacks pendientes capaces de añadir texto. C1 contabiliza la ranura única; no añade cola ni corrige su política de sobrescritura.
2. **Idioma inmutable también ante un inicio rechazado.** Guardar un campo mutable del wrapper antes de `session.start()` no basta: un intento rechazado mientras el worker anterior carga podría modificar el idioma que ese worker leerá. Capturar la configuración de cada inicio aceptado y pasarla al worker/decoder, o una solución equivalente segura. Prueba con carga bloqueada e intento de reinicio con otro idioma.
3. **Discrepancia en castellano forzado.** El filtro actual admite `ca`; por tanto «otro idioma se rechaza como hoy» no garantiza rechazar `ca` en modo `es`. Normalizar `""`/`"es"` solo en el modo forzado. Cualquier otro valor explícito, incluido `ca`, cuenta como `forcedMismatch` y no entrega texto. En `auto` conservar el filtro anterior. Probar normalización del wrapper mediante una función comprobable y el rechazo compartido, sin dar por observado el valor real de sherpa en el dispositivo.
4. **Reloj y duración de muestras son medidas distintas.** `wallMs - inputMs` puede reflejar desfase de callbacks/colas y fronteras, además de ausencia de entrada. No etiquetar esa resta como pérdidas confirmadas ni corregirla artificialmente para que parezca exacta. Los contadores explícitos de huecos/cesión y el transporte ayudan a interpretarla.
5. **Pruebas fieles a la frontera real.** La fase integrada cambia entre chunks de 50 ms. El caso N3 de 80/40 ms puede probarse directamente a nivel de acumulador de tramas; su variante integrada debe usar fronteras alcanzables, por ejemplo 50/50 ms, sin insertar una marca dentro de un chunk. Los números son entradas de prueba, no motivo para cambiar el VAD.

## Siguiente entrega

[Encargo de implementación C1](prompt-claude-implementar-c1-2026-10-04.md): código, pruebas específicas, AAR y APK firmada preparada para revisión. Sin instalación ni ensayo en esta entrega. No desarrollar C2/C3/C5, cambiar umbrales/modelos ni conectar conversación a Hermes.

La BOM del título de `1c02587` no afecta al código ni justifica reescribir el historial publicado. Mantenerlo.
