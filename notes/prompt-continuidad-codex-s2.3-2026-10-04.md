# Continuar Faceclaw desde GitHub — S2.3 y base de episodios, 04-10-2026

**Estado posterior, 05-10-2026:** [S2.5 manual con perfil](modo-manual-hermes-perfil-2026-10-05.md) ya instalada y verificada,34ajustes idénticos/perfil guardado/OFF; puente conv/1 desplegado/reversible. Usuario pide pausa del móvil al salir: esperar su aviso, no consultar/reinstalar/capturar mientras tanto. Al volver solo validación física nueva de perfil/lentes, sin identificación manual ni repetir auditorías. NAS APK/reversión/ajustes verificados. Este estado sustituye las instrucciones históricas inferiores.

**Instalación actualizada 05-10-2026:** [S2.4-Hermes comprobada](instalacion-s2.4-hermes-2026-10-05.md) instalada por petición del usuario, firma original/805/hash `8e59a2a6…`; 34 ajustes idénticos y ambos selectoresOFF observados. APK/reversión/ajustes copiados y verificados en NAS. Siguiente fase puente conv/1 reversible y ensayo breve coordinado, todavía no desplegado ni escuchado. No reinstalar ni repetir auditoría. Código/notas actuales sin commit/publicación GitHub; preservar el árbol. Supera «S2.2 instalada» y «sin build/APK» inferiores.

**Revisión UI completada, 05-10-2026:** seguir [revisión Codex](revision-codex-ui-hermes-2026-10-05.md). Entrega Claude revisada/corregida y binding conectado al controller; 81/81, TS/lint correctos. UI ya integrada en código, sin build/APK/instalación/prueba física/despliegue. S2.2 instalada, puente candidato aislado. Preparar siguiente candidata y ensayo breve coordinado sin repetir auditoría; firma original/ajustes/OFF. Conservar todos los cambios locales sin commit/publicación/NAS. Esta entrada supera «UI pendiente» inferior.

**Actualización 05-10-2026:** autorización semántica y límites resueltos: candidata15s/cierre30s/12turnos/6000caracteres RAM, sin saludo obligatorio. Seguir [canal, runtime y estado del PC del trabajo](conversation-hermes-channel-2026-10-05.md), conservando sus cambios locales sin commit. ADB confirma S2.2/805; cliente conv/1/runtime/controller implementados y 39/39 pruebas. Puente candidato aislado13/13 y dos evaluaciones sintéticas con Hermes real, sin desplegar; interfaz pendiente de [encargo a Claude](prompt-claude-ui-hermes-2026-10-05.md), sin nueva APK/instalación/captura. Usar Tailscale exclusivamente. Reinicio autorizado de Jarvis completado, kernel7.0.0-34 sin reinicio pendiente; ambos servicios activos/habilitados. No volver a preguntar autorización/límites ni empezar el canal de cero. Los estados y preguntas de los párrafos del 04-10 son históricos.

**Cierre solicitado para mañana desde el PC del trabajo.** Leer primero `notes/episodios-codex-2026-10-04.md`: nuevo gestor aislado, 13/13 pruebas nuevas, TS/lint correctos, todavía sin integración en app/Hermes ni nueva APK. S2.2 instalada y candidata S2.3 conservadas. Pregunta sobre enviar intercambios candidatos a evaluación Hermes aún sin respuesta; no asumir autorización. Valores de política de pruebas no aprobados. Recuperar también este último avance desde el HEAD remoto, además de la publicación anterior `e995946`.

Retoma el proyecto `faceclaw-es` desde la rama **`codex/conversation-detection-g0`** del repositorio `DanielGTdiabetes/faceclaw-es`. El usuario autorizó a Codex a asumir implementación y verificación, no solo revisión y prompts para Claude. Conserva decisiones, trabajo local y todos los cambios de S2/S2.1/S2.2/S2.3. Sin reset/clean/stash automático ni sustitución de un árbol con cambios por una copia remota.

## Recuperación en el PC del trabajo

Primero lee `AGENTS.md` y comprueba `git status`, rama y HEAD. Consulta la rama remota y trae el avance con fast-forward solo si no existen cambios/conflictos locales que lo impidan. `ae55d83` es la base histórica S1: el código S2–S2.3 se publica después. Usa el HEAD remoto comprobado, no vuelvas a esa base ni reconstruyas el árbol desde las notas históricas.

Lee:

- `notes/implementacion-codex-s2.3-2026-10-04.md`: cambios, validación, hashes y límites actuales.
- `notes/informe-claude-prueba-breve-s2.2-2026-10-04.md`: evidencia humana de las dos sesiones, separadas.
- `notes/continuidad-entre-pcs.md`: firma/NAS/instalación y estado entre PCs; las primeras entradas prevalecen sobre las históricas.
- `C:\Users\danie\.codex\memories\faceclaw.md`, si existe en ese PC, para las rutas de firma/NAS; su encabezado G3.4 no reemplaza el estado S2.3 de GitHub.

## Estado instalado y código preparado

**S2.2 sigue instalada. S2.3 está implementada, compilada y firmada, todavía no instalada.**

S2.3 añade botón de identificación por frase directamente en el móvil, guarda el diagnóstico después de STOP en las dos capas que retenían una instantánea anterior, separa texto histórico Soniox con etiquetas numéricas de texto local sin identificación, maneja rechazos/excepciones de envío y guarda estado/cola/categoría de transporte sin contenido. Siete bibliotecas nativas iguales; cambia el wrapper Android y su dex/metadata, no el AAR ni modelos.

163/163 pruebas del área afectada, TypeScript/lint/webpack/Android/lintVital correctos. No repetir revisión S2.2 ni suites/build por rutina; sí verificar los cambios nuevos que se hagan. Los fallos históricos de local-vad/iOS siguen abiertos; no declarar la suite completa correcta.

APK local preparada en el PC de origen: `dist/conversation-g0/faceclaw-0.8.2-es.5-conversation.s2.3.apk`, SHA-256 `2e10ee16a1b5d7bf8cea76a08d23b011b6b5c6b4e7f0383cc92cc4cc498657bf`, código805, firma original `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`. **Los APK, logs/copias `.tools`, firma y ajustes privados no se incluyen en GitHub. S2.3 aún no está copiada al NAS según el último estado documentado.** Si se necesita esa candidata exacta desde otro PC, localizar/transferir el archivo y verificar su hash; no asumirlo disponible ni confundir un rebuild con el mismo archivo. No generar una clave sustituta ni instalar S2.2 de nuevo.

## Prueba cerrada y asuntos abiertos

Prueba guiada 18:56 (~51 s): frase **no intentada** porque no encontró el menú (intentos0), manual1; antes de corregir ambas voces compartieron etiqueta, después «Yo» y otra etiqueta en el móvil. Soniox estable, backlog5660ms, primer token6129ms, OFF sin recursos experimentales. No aprueba la frase; lentes no observadas.

Sesión libre 18:43 (~101 s), aparte: error `envio-audio` a66000ms enviados, fallback local y «Yo» observado con intentos/manuales0/0. La causa del fallo real y ese «Yo» concreto siguen sin demostrarse. No concluir que los cambios S2.3 los han reproducido o resuelto físicamente.

El usuario pide **aviso antes de necesitar el móvil**. No acceder al dispositivo para completar una sincronización de GitHub. Para actualizar/probar, avisar primero y coordinar conexión/OFF; no iniciar captura automáticamente ni repetir la prueba por defecto. Actualizaciones necesarias con firma original, respaldo fresco y conservación de ajustes/datos; no desinstalar/borrar datos. No leer/exportar/copiar el perfil ni imprimir claves/tokens.

## Próxima fase y decisiones del producto

Se ha iniciado el diseño e implementación de episodios; seguir desde `notes/episodios-codex-2026-10-04.md`, sin rehacer el gestor aislado. Resolver la evaluación semántica pendiente, concretar política y contrato del canal de conversación y después integrar proactividad/visualización Hermes. Leer `notes/soniox-capacidades-conversacion-hermes-2026-10-04.md` y `notes/aclaracion-activacion-hermes-conversacion-2026-10-04.md`. Distinguir saludo de conversación temática y contexto de respuesta; analizar texto con un LLM ya supone enviarlo. No reutilizar el `utterance` que cancela el agente para todas las voces ni parchear continuidad con reinicios automáticos cada120s.

**Producto final: lentes apagadas durante la escucha, sin conversación/transcripción visible; mostrar únicamente los mensajes de Hermes cuando intervenga.** S2.3 mantiene interfaz diagnóstica y aún no implementa ese requisito. Soniox por defecto/Whisper reserva, castellano actual, TV sin filtros, perfil existente sin reenrolar, GPS/bloqueo/Hermes habitual/firma conservados. Tope120s absoluto, incluido silencio, sin reactivación automática. Sin envío experimental de conversaciones a Hermes, firmware ni Wear por defecto.
