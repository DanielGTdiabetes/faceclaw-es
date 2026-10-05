# Continuidad S2.6: Hermes manual con identidad opcional

05-10-2026, PC del trabajo. Rama `codex/conversation-detection-g0`. El usuario pidió revisar la entrega Claude, compilar la APK, publicar los cambios en GitHub y preparar continuidad. Este documento es la referencia para retomar; las notas históricas conservan sus estados anteriores.

## Resultado revisado por Codex

La escucha se inicia con un único ON desde gafas/móvil. Con el puente `conv/2`, perfil ausente, fallido, incierto o carga superior a10s no impiden continuar con Soniox+Hermes. Una voz/turno válido sin identidad personal permite evaluar el tema. Relaciones desconocidas se conservan como tales; ninguna voz se convierte automáticamente en portador. Identificación posterior invalida contexto viejo y no reetiqueta turnos emitidos.

Modalidad explícita `identidad-opcional`; solicitudes antiguas sin modalidad mantienen el contrato requerido `conv/1`. La app exige anuncio autenticado de ambas capacidades para usar opcional. Contra producción `conv/1` sigue solicitando perfil y portador+otro: **instalar solo la APK no activa el nuevo comportamiento**.

Conservados20min máximos, OFF tras >5min sin actividad de voz, español/catalán-valenciano automático,12turnos/6000caracteres RAM, candidata15s/episodio30s, presupuesto80solicitudes/5s/2s, timeout5s. Lentes apagadas en escucha y solo aportaciones finales válidas; prioridades del chat/Hey Even/PTT/teclado/gestos intactas. Hermes puede abstenerse; identidad opcional no obliga a responder. Sin herramientas/memoria/historial en este canal ni filtros TV nuevos.

## Verificación en este PC

- **254/254** suites de conversación afectadas, incluidos los20casos nuevos; TypeScript app/pruebas y oxlint correctos.
- **23/23** Python de conversación/puente y `test_bridge.py` PASS, exclusivamente loopback/agentes sintéticos, sin proveedores/producción.
- Webpack/NativeScript prepare Android producción, `assembleRelease` y `lintVitalRelease` correctos. AAR precompilado de S2.5 posterior al último código nativo conservado; sin reconstruir NDK/bibliotecas JNI ajenas al cambio.
- Certificado original, zipalign16KB, siete `.so` iguales a S2.5 y `assets/app/package.json` idéntico. Marcadores `conv/2`, modalidad/UI/binding presentes en bundle.
- Corrección adicional Codex: ambos generadores Python usaban `write_text`, que en Windows producía CRLF y un hash distinto. Reproducción previa fallaba; sustituido por escritura de bytesUTF-8 y fijado LF en `.gitattributes` para las fuentes públicas del puente. Ambos caminos producen ahora exactamente `be530122…` en Windows. `conversation.py` coincide byte a byte con el candidato revisado.

No repetida auditoría G0/G1/G2 ni suites nativas sin cambios. No mide reconocimiento humano, óptica física, autonomía ni respuesta del proveedor real. Persisten como pendientes las comprobaciones físicas; la prueba del bar de S2.5 no sirve para validar S2.6.

## Artefactos preparados

| Artefacto | SHA-256 |
| --- | --- |
| APK S2.6 original firmada `faceclaw-0.8.2-es.5-conversation.s2.6-manual-context.apk` | `62c6f594c48c666aea77540162d876ae377d3e1dbe91bef439d96f348c120415` |
| Reversión S2.5 firmada `faceclaw-0.8.2-es.5-conversation.s2.5-manual.apk` | `f8c704ff600d49de13ea9dc24651e989ccc09e1c15d0c980e8c6972ec67ff840` |
| Puente candidato completo `hermes-conv2-candidate-20261005.zip` | `8e3d24488af88aeda36891f6f70ac03b49479d58f98cba84af1c7edd541f395b` |
| Puente candidato `bridge.py` | `be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d` |
| Módulo candidato `conversation.py` | `0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078` |

Versión APK `0.8.2-es.5-conversation.s2.6-manual-context`, código805. Certificado SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`.

Local: APKs en `D:\Proyectos\Faceclaw_spanish\dist\conversation-g0\`, ZIP y carpeta puente en `dist\hermes-conv2-candidate-20261005*`. NAS: `/volume1/home/Dani/Faceclaw/apk-builds/0.8.2-conversation-s2.6-manual-context/`, los tres archivos APK/reversión/ZIP. **Copia NAS completada: los tres hashes remotos coinciden con los locales; carpeta700/archivos600.** APK/ZIP/firma/ajustes/logs privados se mantienen fuera de Git; GitHub contiene código/pruebas/notas y helpers públicos `scripts/check-conversation-s2.6.ps1`, `scripts/deploy-hermes-conv2.py`, generadores en `integrations/hermes/`.

## Estado instalado y servicios

**No se instaló S2.6 ni se desplegó conv/2 en esta revisión.** Último estado comprobado del móvil: S2.5/805 instalada,34ajustes/perfil conservados, detector/HermesOFF. No se consultó ni activó el móvil para compilar/publicar. Último estado comprobado de Jarvis: producción conv/1 y servicios activos; no se hizo un probe autenticado ni un reinicio en esta revisión.

Producción esperada en `/home/dani/faceclaw-hermes-bridge/`: `bridge.py` SHA256 `2563695d3166ef7206d7553f92c1fe189bcfe0cfd0a76510206faeb9aa91676e`, `conversation.py` `3b6809182c87018cabb27f3258e6d30d9a1e1bcbaf1c08f04a3a801934ab0d2f`. Drop-in `40-conversation.conf` ya activa `FACECLAW_CONVERSATION=1`. Comprobar estos hashes antes de actualizar; el helper falla si difieren o ya existe reversión conv/2. No reutilizar el helper antiguo de S2.5 sobre producción actual.

## Siguiente paso desde otro PC

1. Sincronizar `codex/conversation-detection-g0` de GitHub, conservando cualquier cambio local. Leer esta nota y el informe Claude. Recuperar del NAS las candidatas exactas y verificar los hashes; no recompilar por rutina. Desde el trabajo estamos fuera de LAN: Hermes `100.65.212.74` y NAS `100.64.237.87` por Tailscale. No copiar credenciales al prompt/notas ni imprimir ajustes/perfiles.
2. Coordinar actualización con conversaciónOFF. **Primero puente, después APK.** Revisar nuevamente producción y crear `/home/dani/faceclaw-hermes-bridge/conversation-candidate-conv2-20261005/`; copiar `bridge.py`, `conversation.py` y helper público del candidato. Ejecutar `python3 deploy-hermes-conv2.py` en Jarvis. Respaldo `/home/dani/faceclaw-hermes-bridge/rollback-20261005-conv2/`,700/600; solo reinicia `faceclaw-hermes.service`, no gateway/modelo/token/configuración privada. Reversión con `--rollback`. Por defecto no hace probe autenticado; `--probe` solo si el móvil está desconectado, pues puede desplazar su conexión.
3. Antes de instalar, confirmar móvil conectado/desbloqueado/FaceclawOFF, conservar respaldo fresco de APK/ajustes y comprobar firma original. Verificar candidata con `scripts/check-conversation-s2.6.ps1`, instalar **exactamente** `adb -s 61161FDCG0013L install -r <APK S2.6>`, sin desinstalar. Comparar ajustes antes/después sin mostrar valores y hash de APK instalada. No tocar firmware/Wear ni reenrolar.
4. Confirmar capacidad conv/2 en la conexión normal del móvil y UI OFF. Ensayo breve coordinado cuando el usuario pueda: ON y habla comprensible sin frase/selección de voz, comprobar métricas de candidatos/solicitudes/veredictos/mensajes y observación humana de lentes. Una voz basta para validar que llega evaluación; una aportación útil concreta depende de Hermes. No afirmar éxito físico con agentes sintéticos. Final detector/HermesOFF; actualizar estado instalado/servidor/artefactos/notas y copia NAS con lo observado.

### Texto breve para retomar

«Retoma Faceclaw en `codex/conversation-detection-g0`. Lee `AGENTS.md` y `notes/continuidad-s2.6-manual-context-2026-10-05.md`. S2.6 está revisada, compilada y firmada; S2.5 sigue instalada y producción sigue en conv/1 según la última comprobación. Recupera candidatas exactas del NAS, verifica hashes y prepara actualización conservadora puente conv/2 primero y APK después. Conserva datos/firma/perfil/Hermes normal y cambios locales; no exijas identidad, frase, dos voces ni saludo en manual. No repitas auditorías/build ya acreditados. Comprueba estado actual antes de instalar, coordina ensayo breve y deja OFF. Documenta únicamente lo realmente ejecutado.»
