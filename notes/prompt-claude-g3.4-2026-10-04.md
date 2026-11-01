# Relevo a Claude — Faceclaw G3.4, 04-10-2026

Actúa como desarrollador del proyecto existente. Empiezas sin el historial de las conversaciones anteriores: este documento recoge el contexto necesario. El usuario quiere que continúes el trabajo y que Codex revise tus cambios al terminar. Trabaja en el repositorio; no te limites a proponer un plan. No reinicies el proyecto ni la evaluación.

## Repositorio y punto de partida

- Proyecto Windows: `E:\projects\faceclaw-es`.
- Rama compartida: `codex/conversation-detection-g0`.
- Origen: `https://github.com/DanielGTdiabetes/faceclaw-es.git`.
- HEAD al entregar este relevo: `7b34bc8`, documentación final de G3.4. Código G3.4: `63f234b`. Cierre G3.3 anterior: `3e3922a`.
- Árbol limpio y rama publicada/sincronizada antes de crear este prompt. Comprueba el estado real; el commit de este prompt será posterior. Conserva cualquier cambio ajeno, no hagas reset/clean ni sobrescribas trabajo concurrente.
- Es una app Android/NativeScript/TypeScript con puentes Kotlin, para gafas Even Realities G2. También hay una app Wear y soporte iOS parcial. El trabajo actual es Android y el flujo conversación local.

Lee primero y en este orden:

1. `AGENTS.md`.
2. `notes/prompt-continuidad-g3.4-2026-10-04.md`.
3. `notes/conversation-detection-g3.4-lenses.md`.
4. `notes/continuidad-entre-pcs.md`.
5. `C:\Users\danie\.codex\memories\faceclaw.md`, si estás en este PC.

Para contexto técnico consulta `notes/conversation-detection-g3.3-usage.md`, `notes/conversation-detection-g3-integrated.md`, `notes/faceclaw-0.8.2-integration-2026-10-04.md` y `notes/faceclaw-wear-0.8.2-2026-10-04.md`. La hoja de ruta original está en `notes/auditoria-conversaciones-g2-2026-10-03.md`, especialmente G0–G6. Son documentos con historial: prevalecen las entradas recientes. «Sin perfil», «no instalada», «firmware pendiente» y «falta app/texto en lentes» de cierres antiguos están superados.

## Objetivo del usuario

Completar una experiencia integrada de conversación local con su perfil propio ya guardado, español/valenciano y texto local opcional. Avanzar en funciones útiles y corregir incidencias reales, distinguiendo código implementado, comprobaciones de software y resultados observados. Evitar sesiones dedicadas solo a diseñar o repetir subpruebas.

## Estado real de dispositivos y datos

- Pixel 10 Pro Fold: instalada `0.8.2-es.5-conversation.g3.4`, `com.faceclaw.app`, código805, firma española original, mediante `adb install -r`.
- Respaldo fresco de G3.3 y comparación de los **33 ajustes privados: idénticos antes/después**. Hermes, bloqueo desactivado y GPS conservados. GPS ya fue confirmado funcionando; no repetir esa prueba por defecto.
- Tras desbloquear, G3.4 mostró «Conectado», «Conversación local · OFF», «Mi perfil: guardado en este móvil», texto opcional ON y botón de inicio. Cero wakelocks experimentales activos. Esto fue observado en esta sesión, pero no es una comprobación nueva cuando tú retomes.
- El perfil existe y se conserva. Es un único perfil propio para castellano/valenciano. No repetir registro, leer/exportar vectores ni copiar el almacén noBackup al NAS. Guardado no acredita precisión de identidad o participación.
- Gafas: firmware requerido `Faceclaw/36` actualizado manualmente por el usuario, quien confirmó funcionamiento general como antes. El agente no lo flasheó. **No tocar ni volver a actualizar firmware.**
- Pixel Watch4: `0.8.2-es.1`, código3, misma firma/paquete que el móvil. Enlace real previamente comprobado por ACK `ok=true/jsReady=true`. Usuario lo desconectó deliberadamente porque ya estaba actualizado. **No reconectar, emparejar o repetir el ACK por defecto.**
- USB Pixel en la última sesión: `61161FDCG0013L`; ADB local `C:\Users\danie\AppData\Local\Android\Sdk\platform-tools\adb.exe`. Verifica conexiones actuales, no las presupongas.

## Qué acaba de implementarse

G3.4 incorpora la app **Conversación local**, `appId=local-conversation`, en el launcher/selector de las gafas. Usa exactamente el mismo coordinador y motores que el móvil:

- Abrir/restaurar/pintar la ventana mantiene OFF y no descarga modelos.
- Toque dentro de la app inicia explícitamente con el plan G3.3, o detiene si ON. Espera a los motores seleccionados antes de capturar; bloquea durante drenaje.
- Doble toque dentro de la app hace OFF y cede el foco al selector; cerrar la ventana también hace OFF. En menús/selector rigen los gestos normales del shell.
- Tap-then-hold abre el menú propio: inicio/OFF, texto local ON/OFF, OFF explícito. El texto opcional se comparte con el móvil **solo en RAM**, modificable solo estando OFF.
- Lentes: estado, motivo/plazo, perfil y texto temporal. Rueda para revisar líneas ajustadas a la anchura. Texto sin atribución a hablantes, últimas tres líneas/máximo600 caracteres por línea del motor existente; la app no guarda otra historia. OFF/cesión/discontinuidad/error retiran el texto anterior.
- Las etiquetas de comparación/alternancia son provisionales: no confirman participación ni voz en vivo. Tope120s, incluida preparación/suspensión, y prioridad Hey Even/PTT/asistente conservados.
- Se corrigió la etiqueta del móvil para reflejar el motor de texto realmente activo cuando otra entrada inicia un modo distinto. Se protege un menú de detener retenido tras agotarse el plazo para que no reinicie por accidente.

Archivos principales:

- `app/apps/local-conversation/index.ts` y `local-conversation-app.ts`: nueva ventana y controles/renderizado.
- `app/conversation-detection/session-controls.ts`: enlace al coordinador y selección compartida en RAM; evita dependencia circular con el controlador.
- `app/conversation-detection/coordinator.ts`, `conversation-ui.ts`, `participation.ts`, `transcription.ts`: contratos y comportamiento existentes.
- `app/g2/dashboard-controller.ts`: enlace de la nueva interfaz al coordinador y disponibilidad/prioridad existentes.
- `app/phone-ui/main-view-model.ts`: controles del móvil y selección compartida.
- `app/apps/all-apps.ts`, `app/apps/ios-availability.ts`: registro y restricción Android.
- `app/native/local-transcription.ts`, `local-participation.ts` y puentes Kotlin: motores existentes, sin cambios en G3.4.

## Primer encargo para ti

Revisa y continúa el flujo G3.4 recién integrado. Prioriza defectos concretos de interfaz/lifecycle/control que puedas demostrar en el código o que el usuario reporte. Revisa especialmente navegación y OFF, cambios de estado entre móvil/lentes, expiración, limpieza del texto y renderizado en los tamaños/fuentes soportados. Si encuentras un defecto reproducible, corrígelo con el menor cambio útil y una comprobación específica; no cambies reconocimiento/modelos/umbrales como respuesta a un problema de UI.

La nueva app está instalada pero **no se abrió ni se observó bajo escucha** durante el trabajo de Codex: la vista previa estaba negra/pantalla de gafas apagada. No presentes como éxito físico las simulaciones ni infieras reconocimiento correcto. Una observación de la ventana estando OFF puede ser útil si el dispositivo está disponible y el usuario confirma OFF. **No inicies captura/enrolamiento por tu cuenta.** No conviertas la falta de observación física en una batería obligatoria.

Si la revisión no revela un defecto concreto, informa de ese resultado y del pendiente físico exacto; no inventes incidencias ni funciones nuevas solo para producir cambios. No implementes G4/G5/G6 como fases automáticas de este encargo. Codex revisará tu resultado antes de un siguiente encargo.

## Restricciones que debes respetar

- Antes de cualquier consulta de UI del móvil, verificar conexión y confirmar OFF. **Nunca consultar/capturar UI durante ON.** Si puede estar activo, esperar a la confirmación de cierre del usuario. No interpretar ausencia de wakelock como prueba suficiente de OFF.
- No repetir evaluación inicial, registro del perfil, baterías G0/G1/G2/GPS ni pruebas Wear por defecto. Si es imprescindible un ensayo, uno solo, breve, guiado, justificado y terminado OFF. No añadir rondas de confirmación para acciones ya autorizadas.
- Sin grabaciones, perfiles de terceros, audio experimental en red, descarga de modelos o cambios de umbrales por defecto. No reutilizar perfiles históricos de Microphones, adaptar el centroide al ambiente ni modificar el perfil existente.
- **No conectar audio/texto experimental a Hermes**, ni realizar semántica/acciones con ese contenido. El asistente habitual y sus ajustes deben seguir funcionando. La app nueva solo usa las interfaces locales existentes; no ofrece una herramienta para leer su contenido al asistente.
- No tocar firmware, otros proyectos, servicios del NAS/Jarvis, configuración de Hermes, token, bloqueo o permisos/GPS para maquillar resultados.
- Incidentes históricos de audio siguen abiertos:492ms/siete descartes y UI1046ms/21drops. Tramos limpios posteriores y espera de motores no demuestran resolverlos. Precisión de comparación/participación, rechazo de TV/replay/mezclas, estabilidad prolongada, autonomía y Doze siguen sin acreditarse.
- G4 incorpora complejidad solo ante errores justificados y mejora demostrada. G5 prolongado está pendiente. G6 requiere decisión posterior del usuario.

## Verificación y compilación

G3.4 pasó **67 pruebas Node, TypeScript, lint completo con tipos, webpack producción, assembleRelease offline y lintVitalRelease**. No hubo cambios Kotlin; no se repitieron las240Kotlin/782Node del cierre0.8.2. Configuración runtime y siete bibliotecas nativas idénticas byte a byte a G3.3.

Pruebas relevantes:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p tests/tsconfig.json
node --test tests/conversation-lenses.test.cjs tests/conversation-phone-ui.test.cjs tests/conversation-ui.test.cjs tests/conversation-detection.test.cjs tests/ios-app-host.test.cjs
node node_modules/oxlint/bin/oxlint --type-aware
```

Ejecuta solo lo adecuado a los cambios. No repitas suites completas sin una razón. El archivo `ios-config-scripts.test.cjs` depende de shell POSIX y fue excluido de la batería completa en Windows; no arregles problemas ajenos para satisfacer un entorno diferente.

En este PC se compiló con webpack directo y el proyecto Android generado. **Guarda y restaura `platforms/android/app/src/main/assets/app/package.json` original al ejecutar webpack**: el archivo generado genérico puede romper el identificador/runtime. SDK en `C:\Users\danie\AppData\Local\Android\Sdk`, Java21 en `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot`. Gradle desde `platforms/android`: `gradlew.bat --offline assembleRelease -Prelease -PfaceclawUnsigned -Pabis=arm64-v8a`. Lee el informe para las precauciones de preparación; no regeneres a ciegas puentes o AAR sin cambios nativos.

No ejecutes a ciegas `scripts/build-environment.ps1`: contiene rutas de otro entorno y cambios a HOME/USERPROFILE. Usa las rutas comprobadas de este PC. No instales nuevos toolchains/modelos para este encargo.

## APK, firma y respaldos

Actualizar una APK necesaria está autorizado cuando el avance lo requiera: firma original, respaldo fresco de APK/ajustes y `adb install -r`; **nunca desinstalar ni borrar datos**, ni reinstalar la misma versión sin motivo. Si no cambia código distribuible, no reinstales.

Firma original: `.tools/signing/faceclaw-es.jks` y `.tools/signing/store.password`, ambos presentes y respaldados en NAS. Comprobar que existen antes de ejecutar helpers: `scripts/sign-spanish.ps1` puede generar clave si faltan; nunca permitirlo. Preferir el helper seguro `scripts/install-conversation-g0.ps1`, que falla si no están y verifica identidad. Para una nueva versión, actualizar metadatos/validación conscientemente. Huella pública del certificado:

`57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`

Nunca imprimir claves, contraseña, tokens o contenidos de ajustes privados. `.tools/g3.4-export-settings.ps1` exporta/compara preferencias con ACL privada y solo imprime el número y la igualdad; no incluye perfil. No usar un backup completo de datos que incluya `noBackupFilesDir/faceclaw-own-voice/`.

NAS disponible por SSH `Dani@192.168.0.110` (exterior Tailscale `100.64.237.87`, si procede), raíz privada `/volume1/home/Dani/Faceclaw/`. G3.4 respaldada y seis hashes comprobados, carpetas700/archivos600:

- `apk-builds/0.8.2-conversation-g3.4/`: APK firmada/unsigned, reversión G3.3 y fuente sin secretos de `63f234b`.
- `connection-backups/2026-10-04-g3.4/`: solo preferencias privadas antes/después.
- Informe, prompt de continuidad, `continuidad-entre-pcs.md` y `LEEME.md` actualizados. Nota Obsidian `/volume1/Docker/obsidian/vault/Proyectos/Faceclaw.md` conserva su historial.

Los hashes completos y archivos locales están en el informe G3.4. No copiar perfil/vector/audio al NAS. Si publicas un avance, comparte código/documentación sin secretos y registra hashes/permisos de artefactos. No borres notas o historial para actualizar resúmenes.

## Entrega para revisión de Codex

Guarda `notes/informe-claude-g3.4-2026-10-04.md` con:

1. Base y commits finales, rama, estado del árbol y si se publicaron. Conserva todos los cambios ajenos.
2. Defecto/problema concreto, evidencia, archivos cambiados y comportamiento resultante. Explica limitaciones; si no encontraste defectos, dilo.
3. Comandos/pruebas ejecutados, resultados y lo omitido con motivo. Enlaces a logs locales sin datos privados. No inventes medidas físicas.
4. Separación explícita entre **implementado**, **comprobado en software**, **observado en dispositivo** y **pendiente**.
5. Si hubo APK: versión/código/certificado/hash, respaldo/reversión, instalación, comparación privada de ajustes, perfil conservado sin exportación y estado OFF final. Si no hubo instalación, dilo.
6. Estado de dispositivos, continuidad/GitHub/NAS actualizados y cualquier bloqueo o siguiente paso concreto.

Haz commits revisables en la rama autorizada si has cambiado código/documentación; no mezcles otras tareas. No generes PR ni fusiones otras ramas por defecto. Deja el flujo experimental OFF y no mantengas capturas/ensayos activos. En tu respuesta final indica el commit final y la ruta del informe para que el usuario los entregue a Codex. No afirmes que Codex ya revisó o aprobó tus cambios.
