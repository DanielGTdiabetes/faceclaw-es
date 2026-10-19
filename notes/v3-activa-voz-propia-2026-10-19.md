## Estado vigente: identificación de Conversación en EVO — S2.20.5 instalada, 19/10/2026

**Decisión expresa del usuario:** «ya lo hacemos todo en el EVO porque comprobamos que da más problemas
en el móvil». Prioridad yo/otro/incierto, no identificar personalmente a todos. Sol 6.1 alto.
**Instalado y comprobado técnicamente, precisión propia pendiente:**

- Pixel `61161FDCG0013L`, `0.8.4-es.12-conversation.s2.20.5-identidad-evo`/805/firma original,
  SHA256 `c3ef4f982ee0a9e7fe400b88f6045c46d2781e36d4571de024e7dc6aec9a2138`.
  Extraída idéntica; 8 nativas/48 ajustes/primera instalación conservados, arranque estable.
- EVO identificado even/dani/MAC/SSD. `g2-diar-activa 82234c71dd3d41a5bbdebd03c651ff1d`,
  `even-asr-parakeet 058809348bf6426a91be42372bfa9c47`, activos/NRestarts0.
  Puente/Qwen/Sala/sombra con InvocationID conservados; sin cambios del LLM ni firmware.
- EVO ejecuta Parakeet, V3 y WeSpeaker fijado al mismo hash de 512 dimensiones. Móvil consume etiquetas
  v2 y no carga ni ejecuta modelo de voz en la ruta remota. El audio sale sin acondicionamiento ASR.
  Se comparan intervalos exclusivos completos de 1,5–6 s sin ganancia/recorte nuevo; no dos fragmentos de
  1 s. Umbrales 0,80/0,60 conservados. Ventana de identidad EVO acumula al menos4 s y hasta12 s, con
  cierre por pausa; aumenta la espera de una frase corta y debe medirse en uso. No modifica Whisper.
- Se reutiliza el perfil nuevo, que el usuario **confirmó guardado/OFF** tras las cuatro frases de
  S2.20.4. La referencia compatible se migra por la conexión autenticada existente y se conserva solo
  en `~/g2-identidad-evo/perfil/profile.json` (0700/0600), con anterior al reemplazar. No se exporta al
  PC, Git o NAS. El perfil cifrado del móvil y el original anterior siguen en el teléfono. El registro
  antiguo de Mi perfil sigue disponible por compatibilidad; no es todavía un registro nativo de EVO.
- Kotlin **356/356**, Node específicos **58/58**, TS app/tests, release y lintVital correctos.
  Servidor15/15 Linux; Windows14 correctas/1omitida Unix. Verificador real aislado con JFK público:
  carga482ms, comparación12–30ms (no tasa de reconocimiento G2; segmentos solapados con la referencia).
  Contrato instalado público: legado92ms, v1=254ms, v2=272ms;22palabras/3intervalos. No se instaló un
  perfil público en producción: v2 indicó profile=false antes de la primera conexión del usuario.

**Prueba propia castellana confirmada y OFF:** tres ventanas recibidas del EVO, perfiltrue,
una comparación válida por ventana y ceroerrores. Similitudes0,656/0,462/0,812: primera incierta,
segundaotro+incierto (un fragmento corto rechazado), tercera portador. Hay una primera aceptación propia,
pero también atribución ajena en el ensayo propio; no es fiable ni está validado. La referencia ya existe
en EVO, fichero0600/directorio0700, comprobados sin leer el vector. Servicios conservan sus IDs.
**Pendiente de intervención:** usuario invitado a probar valenciano8–10s y volver a OFF. Esperar su
confirmación; después comprobar los nuevos escalares respecto de las tres ventanas castellanas.
Falta otra voz/TV/solape para rechazo; no bajar umbrales con estos datos.


Retorno del incremento: OFF, APK S2.20.4 privada `.tools/install-s2.20.5-v3/before.apk` del checkout
Faceclaw (`cb0debcf…278e4a`) y servidor
`python3 ~/g2-identidad-evo-candidato-20261019/asr/diarizacion/activa-v1/instalar_identidad.py --revert`.
Conserva el perfil de EVO; retorno técnico con guardas, todavía sin ensayo físico completo.
Para volver además a S2.19, ejecutar después el retorno original de V3, no el de sombra.
Las entradas inferiores describen iteraciones históricas, incluida la identificación en móvil ya sustituida.

## Estado vigente: S2.20.4 instalada; nuevo perfil autorizado — 19/10/2026, 16:14 Madrid

Pixel verificado `61161FDCG0013L`: **S2.20.4/805/firma original**, SHA256
`cb0debcf67fd96a977f72cc57b39ffb85ef25844f73a7ebac4f8129309278e4a`.
Extraída idéntica; 8 nativas/48 ajustes/primera instalación conservados y arranque estable.
Sin captura iniciada por el agente; comprobado sin wakelock de captura tras abrir.
EVO conserva V3 activa `e5230b6d…` y Parakeet `0740fa9f…`; no otro despliegue servidor en este paso.

El usuario confirma que el perfil original lo grabó llevando las G2 y **autoriza crear otro**
(«pero podemos crear otro», «cuando tú me digas, lo grabamos»). No volver a pedir esta decisión.
También aclara que el cifrado no es un requisito para su uso personal: se conserva el almacenamiento
ya existente, sin añadir configuración ni bloquear el ensayo por ese motivo.

Implementado **Mi perfil → Crear otro perfil (conservar el actual)**. El original se conserva cifrado
en el propio noBackupFilesDir del móvil, con la misma clave; solo se sustituye el activo al completar
el registro. Cancelar/OFF mantiene el activo. **Restaurar perfil anterior** exige OFF y workers drenados;
la copia anterior permanece incluso si falla/interrumpe la restauración. No se ha exportado el perfil.
La guía ahora muestra las frases nuevas aunque el perfil previo siga guardado. Kotlin **352/352**,
Node específicos **50/50**, TypeScript de app/tests, release y lintVital correctos.

**Pendiente de intervención:** se ha indicado al usuario que grabe las cuatro frases desde ese botón,
esperando «Habla ahora» y silencios entre muestras. Esperar confirmación escrita de guardado/OFF;
no consultar UI durante su grabación. Después probar una frase conocida en Conversación y leer solo
métricas `FaceclawVoz`, comparando ventana completa cruda/preparada y dos fragmentos V3. Este diagnóstico
de S2.20.3 está incluido en S2.20.4; S2.20.3 se compiló pero NO se instaló.
La prueba propia anterior S2.20.2 dio 0,363–0,405: **reconocimiento propio aún no validado**.
No bajar umbrales 0,80/0,60 sin medir rechazo ajeno. Mantener texto ajeno/contexto e incierto ante duda.

Código servidor y retorno completo: repositorio Hermes, `preparacion-evo-x2/asr/diarizacion/activa-v1/README.md`.
Retorno inmediato APK: `.tools/install-s2.20.4-v3/before.apk` del checkout Faceclaw, S2.20.2,
SHA256 `6fa7af839eb4890ac27a763317eceafd9433303060513c01f9821fd7392e74c1`.
El retorno completo a S2.19/servidor anterior sigue en README. Las entradas inferiores son históricas.

# V3 activa y verificación propia en el Pixel — 19/10/2026

Codex toma el relevo de Claude. El usuario prioriza su voz frente al resto y autoriza probar V3 fuera
de sombra. Después confirma Pixel USB y Conversación OFF; la ejecución continúa desde el trabajo.
Mantener Sol 6.1 alto por decisión del usuario.

## Instalado: S2.20.1

- APK `0.8.4-es.12-conversation.s2.20.1-v3-voz-propia`, código 805, firma original.
- Pixel `61161FDCG0013L`; APK extraída idéntica, SHA256
  `d0b57a94ebea1e9c6167ca7f05fbc35a66e278d9d8398a40f13a0692583277fd`.
- Ocho bibliotecas nativas idénticas a S2.19; 48 ajustes idénticos antes/después/abrir;
  primera instalación conservada, arranque estable. Captura iniciada por el usuario para ensayos.
- Kotlin 345/345, release y lintVital correctos. No cambios de firmware ni servicios del reloj.

## Circuito y límites

El decodificador remoto negocia intervalos V3 y tiempos de palabras sobre su misma ventana PCM.
V3 en EVO crea/finaliza un stream por ventana, con modelo cargado; no depende de futuras frases ni
arrastra identidades de ventanas anteriores. El servidor anterior sigue atendiendo clientes sin opt-in.

`LocalTargetSpeakerVerifier` compara el perfil propio **solo en el móvil** con dos fragmentos disjuntos
de voz exclusiva según V3. No exporta ni actualiza el perfil, ni guarda perfiles ajenos. Prepara copias
con calidad/duración y ganancia global acotada; borra audio temporal y vectores al terminar.
Umbrales sin rebajar: ambos >=0,80 portador; ambos <=0,60 otro; mezcla/duda/corto quedan desconocidos.
`voz-1` representa la categoría genérica de ajenos, no una persona identificada.

`LocalTranscriptSession` entrega partes del texto con sus tiempos/relaciones, recorta texto duplicado
y comprueba generación/OFF antes de cada devolución. Los intervalos inválidos o V3 no disponible
conservan el texto como desconocido. El camino local Whisper mantiene su atribuidor anterior.

## Pruebas habladas y corrección

- Un primer aviso interactivo de cierre se interpretó como prueba terminada, pero el usuario aclaró
  que no había pronunciado las frases. Los dos desconocidos de 15:39 no se puntúan como su voz.
- Después confirma tres frases: Parakeet recibe cuatro ventanas, sin fallo de V3, pero el puente solo
  registra un turno desconocido. No dar por reconocida ni reparada la voz propia.
- Se encontró una incompatibilidad del candidato inicial S2.20: `otra-voz` no cumple el validador TS
  `voz-N`. S2.20.1 lo corrige a `voz-1`; hay test de contrato, además de entrega múltiple/OFF.
- S2.20.1 añade un registro escalar `FaceclawVoz` por ventana: perfil cargado, comparaciones,
  descartes por calidad/duración, datos inválidos, errores, similitud min/max y resultados.
  No contiene texto, audio, perfil o huellas. El diagnóstico no altera la decisión y D0 viejo no se
  ejecuta en la ruta remota. Pendiente leerlo tras una prueba corta/larga confirmada por el usuario.

## Servidor y retorno

Código e instalador en el repositorio Hermes:
`preparacion-evo-x2/asr/diarizacion/activa-v1/README.md`. EVO identificado por even/dani/MAC/SSD;
nuevo `g2-diar-activa e5230b6d…`, solo Parakeet reiniciado (`0740fa9f…`). Puente, Qwen, Sala y sombra
conservados. ASR+V3 público de 11 s en 290 ms por el protocolo instalado; no es precisión G2.

Retorno completo con Conversación OFF:

1. Restaurar S2.19 con `adb -s 61161FDCG0013L install -r` y
   `.tools/install-s2.20-v3/before.apk` de este checkout, SHA256
   `fb2922c036979f115d9219a8aaeb07ba2408e6676528a6fb45f48d347b009ab7`.
2. En EVO ejecutar
   `python3 ~/g2-diar-activa-candidato-20261019/asr/diarizacion/activa-v1/instalar_activa.py --revert`.
3. Comprobar conexión, OFF, hashes y servicios. No usar el retorno de sombra para este incremento.

La copia intermedia S2.20 y la verificación S2.20.1 están en `.tools/install-s2.20.1-v3/`.
No publicar APKs privadas de retorno, ajustes, firmas, perfiles o audio. En casa consultar primero
`notes/continuidad-entre-pcs.md` y la memoria de Faceclaw si existe; no asumir rutas del PC del trabajo.

Siguiente: explicar el resultado con el diagnóstico de corta/larga, corregir la causa observada y
comparar una voz ajena antes de calibrar umbrales. No repetir pruebas de hardware/base ni regrabar
el perfil por rutina. G2 usa Ey Even o Conversación continua; Jarvi/Jarvis solo Sala.
