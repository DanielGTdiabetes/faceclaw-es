# Revisión Codex de C1 — 04-10-2026

Código `0858d09`, documentación `6492a89`, base `a0b1233`, rama `codex/conversation-detection-g0`. Árbol limpio al comenzar y tras verificar. Revisión del diff, implementación y pruebas frente a §12 del diseño y al encargo Codex. **Sin hallazgos accionables que bloqueen instalar la APK preparada.** Aceptación de software y artefacto; no mejora física demostrada ni modo proactivo terminado.

## Código

- VAD conserva fórmulas/decisiones; observador contabiliza todas las tramas, saturación, candidatos abortados e interrumpidos. Franjas bajo umbral no se presentan como voz perdida. Reloj y duración de muestras separados.
- Las fases viajan desde las muestras, incluido el anillo previo, hasta el segmento, Job y Result. Los segmentos fronterizos se agrupan como `mixta` con reparto de muestras; resultados tardíos no toman la fase actual. Marca y entrega PCM están ordenadas en el callback real del hilo principal.
- Descarte centralizado de resultado pendiente en sobrescritura/reset/OFF/deadline/finally, publicación inválida o sin listener, sin doble cuenta. Callbacks antiguos no consumen resultados de una generación nueva. Ranura única y política de drops conservadas.
- Idioma capturado por inicio aceptado y pasado como valor al worker/decoder: un reinicio rechazado no modifica el worker que carga. En `es`, vacío/es se normaliza como forzado; en/ca explícitos se rechazan. `auto` conserva el filtro previo. UI indica castellano forzado.
- Selectores de módulo en RAM, sin claves nuevas de preferencias; congelados durante ON y defaults `auto`/diagnóstico OFF. OFF limpia texto y mantiene agregados para leer al terminar el drenaje. Sin ruta nueva de red, almacenamiento de conversación ni cambios de perfil.
- Cambios en fixtures existentes conservan sus expectativas de comportamiento. El buffer sigue siendo compatible con participación mediante fase por defecto.

## Verificación independiente

| Comprobación | Resultado |
| --- | --- |
| Compilación TypeScript de pruebas y app | Correctas |
| oxlint sobre app/tests | Salida 0 |
| Node: detección, fases, lentes, UI móvil, presencia, UI y host de conversación iOS | **64/64**, 0 fallos |
| Kotlin, ejecución nueva con `--rerun-tasks`: fases / sesión ASR / participación | **12 + 12 + 10**, 0 fallos/errores en XML de resultados |
| Firma APK, `apksigner verify --print-certs` | Válida, certificado original |
| Identidad APK, `aapt dump badging` | `com.faceclaw.app`, 805, `0.8.2-es.5-conversation.c1` |
| ZIP de APK firmada frente a G3.4.2 unsigned | Siete `.so` idénticos; runtime `assets/app/package.json` idéntico; bundle distinto con símbolos y bindings C1 |
| AAR actual | `8f8413db5e407fc3386b89708aee32e33dae3a86f7f4048c50e69dbf027fa154`; clases C1 presentes, sin `.so` |

Claude ejecutó 82 Node (los 18 adicionales son del host iOS general); log leído, no repetidos por no afectar este cambio. Se revisaron sus logs de webpack/restauración del runtime, release y lintVital, correctos. No se repitió el build de APK ni se modificaron artefactos firmados. Las pruebas Kotlin usan JDK21 Microsoft y SDK local existentes; la limitación de simulador iOS en Windows no afecta esas 34 pruebas.

Hashes recalculados localmente:

- APK firmada: `de2115f84afd2c24af2d8ddd9b51f2d61ae8162b7bcc26e7e33d36394cb8c8b6`.
- Unsigned: `1a82c75149bc7ffea49721a2c326e50e340bd8255b47acdb7488f14595480429`.
- Fuente `0858d09`: `ec0db6816b0b47ac37ef2d09793d46faec8171fccb13726e2c8d509f988f5b7a`.
- Certificado público: `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.
- G3.4.2 firmada local (reversión documentada): `990a10f1c22a2ef995ef87169336d6c3dc917bd1ec7d607e0736d33fbd84b5f8`. En la instalación se respalda y verifica además la APK realmente presente.

Copias NAS/hashes/permisos: acreditados por informe Claude, no consultados de nuevo por Codex en esta revisión. Preferencias: ausencia de nuevas claves por inspección, sin comparación de dispositivo porque no se instaló. Sin consultas al móvil, captura, lectura del perfil ni servicios remotos.

## Límites y siguiente paso

La corrección de pantalla heredada de G3.4.2 (`0161fdd`) se comprobó en código, contrato del shell y prueba de lentes: solo mantiene pantalla con ventana abierta y sesión ON. No demuestra por sí sola causa de la incidencia anterior. La lectura causal del informe G3.4.2 sigue sin confirmarse: sus totales VAD/idioma no separaban hablantes, por eso existe C1. Esta revisión no convierte ese ensayo en prueba de captación del interlocutor ni cierra el historial físico de G3.4.2.

Siguiente encargo: [instalación conservadora C1](prompt-claude-instalar-c1-2026-10-04.md). APK exacta revisada, respaldo fresco, firma original, datos/perfil/33 ajustes conservados y comprobación UI OFF. Sin build nuevo ni ensayo de voz. El usuario ha ofrecido conectar el móvil; antes de UI/instalación comprobar conexión y OFF visible. Precisión, participación, autonomía, idioma real devuelto con `es` e incidentes históricos siguen abiertos.
