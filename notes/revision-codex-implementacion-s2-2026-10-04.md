# Revisión Codex de S2 implementada — 04-10-2026

**Resultado: requiere cinco correcciones antes de instalar.** El enfoque de frase completa/elección manual se mantiene. Revisión sobre HEAD `ae55d83`; cambios locales conservados. No he cambiado código de app, recompilado Android, instalado, capturado audio ni enviado conversaciones a Hermes. S1 es la última versión instalada documentada; no he consultado otra vez el teléfono.

## Hallazgos reproducidos

### F1 · P2 · Resultado aceptado después del plazo

`app/conversation-detection/wearer-identity.ts:306`: `progress()` evalúa sin comprobar `host.now() >= deadlineAt`. Solo `tick()` verifica la caducidad.

Reproducción: cerrar ventana con frase válida; avanzar a 6001 ms después del cierre sin ejecutar el temporizador; entregar progreso suficiente. Resultado: `identificado`, cuando debería quedar `sin-resultado`. Un callback de socket puede ejecutarse antes del temporizador retrasado. Comprobar caducidad en las rutas de recepción/resolución independientemente del orden de callbacks; revisar también el límite de escucha de 8 s ante audio/acciones tardíos.

### F2 · P2 · Acciones de un menú antiguo actúan sobre el intento nuevo

`app/conversation-detection/session-controls.ts:79`: `wearerActions()` devuelve funciones directas sin capturar sesión/stream/intento. `wearerChoices()` sí protege las asignaciones manuales.

- Guardar «Listo» del intento A; cancelarlo, abrir B y enviar 2500 ms; ejecutar «Listo» antiguo: devuelve `true` y cierra B.
- Guardar «Cancelar», OFF/ON, abrir otro intento y ejecutar la acción antigua: devuelve `true` y cancela la sesión nueva.

Proteger «Identificar», «Listo» y «Cancelar» con referencias/estado del momento de construcción. Comparar solo sesión no protege entre dos intentos de la misma sesión.

### F3 · P2 · Los finales retrasados atraviesan una frontera de captura

`app/native/soniox-conversation.ts:183` y `app/conversation-detection/conversation-turns.ts:83`: `resetStream()` cierra el turno existente pero no conserva `boundaryMs` para los finales pendientes.

Reproducción: enviar 1000 ms, `resetStream()`, enviar otros 500 ms; entregar entonces dos finales de la misma voz, «antes» 500–690 ms y « después» 1100–1290 ms, más `<end>`. Se emite un turno `antes después`, 500–1290 ms, que atraviesa el corte de 1000 ms.

El diseño §4.1 exige registrar esa frontera y evitar intervenciones con tokens a ambos lados. Un `<fin>` posterior no garantiza la separación. Aplicar las fronteras a finales que lleguen después y definir el tratamiento conservador de tokens que cruzan la frontera o tienen tiempos inválidos, sin inventar tiempos ni palabras.

### F4 · P2 · El último turno pierde la relación del portador al apagar

`app/native/soniox-conversation.ts:198`: `prepareStop()` llama a `identity.end()` antes de `turnLog.finish()`. Se borra la asociación antes de consultar la relación para el cierre.

Reproducción: final «Hola» de voz 2 sin endpoint, asociar manualmente voz 2, OFF. El último turno tiene `associationVersion: 1` y `relation: desconocido`, cuando debería ser `portador`. Aquí la voz ya estaba identificada al apagar; es distinto del turno de la frase anterior a confirmarse la identidad, cuyo estado desconocido se aceptó.

Cerrar el turno mientras su relación está disponible o capturarla para ese cierre. Conservar la precisión previa: el intento pendiente debe resumirse como `cancelado-off` antes de `release()/resetStream()`. Revisar también el orden de eventos de asociación y turnos.

### F5 · P2 · La normalización sin ICU del informe no existe en fuente ni APK

`app/conversation-detection/wearer-identity.ts:85` usa `text.normalize("NFD")`; la llamada está también en `assets/app/bundle.mjs` de la candidata. El informe de Claude §3 afirma haberla eliminado y sustituido por una tabla explícita de acentos; esa tabla no existe en esta función.

El repositorio documenta V8 Android sin ICU (`tests/unicode-class.test.cjs`), pero la guarda solo prohíbe escapes de propiedad Unicode. El [código oficial de V8](https://raw.githubusercontent.com/v8/v8/main/src/builtins/builtins-string.cc), líneas 179–205, devuelve la cadena original al normalizar sin internacionalización.

Simulando únicamente `normalize` como función identidad y restaurándola después, la variante que la suite acepta en Node (`SÓY yo quién lleva las gafas`) pasa a `frase-no-reconocida`. No se ha probado ese comportamiento en el móvil; sí está verificada la dependencia en fuente y APK. Implementar el plegado explícito y una prueba sin dependencia del ICU de Node. La frase canónica sin acentos puede seguir funcionando; no se afirma que toda identificación falle.

## Verificación independiente

- Compilación TypeScript de pruebas y área conversación: **109/109 pasan**, incluyendo identidad, integración S2, Soniox, coordinador, fases, presencia, UI móvil/lentes y guarda Unicode.
- `tsc --noEmit` y `oxlint`: correctos.
- Seis sondas reproducen los cinco hallazgos (F2 tiene dos casos): `.tools/codex-s2-review/reproduce.cjs` y salida `reproduce.log`. No contactan con dispositivos/proveedores. Sus aserciones comprueban el defecto actual: no son pruebas de aprobación tras corregirlo.
- Fallo previo `local-vad snapshots` reproducido; prueba y módulo idénticos a HEAD. El test iOS falla aquí al lanzar `python3` con `EPERM`, antes de probar el codec: no se ha revalidado su lógica ni confirmado el mismo motivo que Claude. Sus archivos tampoco cambiaron y ambos casos constan en el informe A3. No se repitió la suite completa de 840 ni el build Android.
- APK firmada SHA-256: `0613d27338c8802fbe5ba7aca410d7a952c822589274b396ec5171babeda0207`.
- APK unsigned SHA-256: `00c9b7bf4d98365dc8e7f1c78bacc9237bf746f5b192d001189478a12a62be6f`.
- Firma verificada por `apksigner`, certificado original: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- `aapt`: `com.faceclaw.app`, `0.8.2-es.5-conversation.s2`, código 805.
- Frente a S1 unsigned: siete `.so`, `classes.dex`, `classes2.dex` y `assets/app/package.json` idénticos. Bundle S2 SHA-256: `a9dcb32c1b8935669bce1c6184218ebe54f4410c7db585e1b188ce41ee75e58b`.

Corregir F1–F5, añadir regresiones que exijan el resultado correcto, repetir verificaciones afectadas y entregar APK nueva firmada para revisión. Prueba humana y escala temporal real de Soniox siguen pendientes. No ampliar S2 a Hermes, escucha continua ni filtro de TV.
