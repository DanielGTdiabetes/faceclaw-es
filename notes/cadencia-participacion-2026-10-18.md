# Participación natural y cadencia — 18/10/2026 (Codex)

**Instalado; comportamiento hablado pendiente de nueva valoración.** El usuario probó Conversación tras la
reparación anterior, informó poca interacción y sensación de retraso, y recordó que al principio iba mejor.
Confirmó OFF antes de los cambios y conectó el Pixel por USB cuando se necesitó actualizar la app.

## Causas observadas

- Primeros seis turnos reales tras la reparación: cinco `nada`. El estilo instalado por la escucha discreta
  excluía opiniones, reacciones y comentarios sin pregunta. El requisito nuevo pide más interacción.
- Un turno generado sin terminar durante **60 s**: llama-server produjo más de **3.000 tokens** antes de la
  cancelación. No era una espera de ASR ni falta de velocidad del modelo (~53 tokens/s). Dejó un turno
  posterior **10,5 s en cola**, luego descartado como retired. Turnos ordinarios: **1,4–3 s** en el puente,
  excluyendo captura, ASR, espera del móvil y entrega a las lentes.
- La app tenía una espera adaptativa de **5, 10, 20, 40, 60 s** tras respuestas silenciosas y esperaba **8 s**
  desde la última transcripción para liberar el contexto durante una pausa. `mentionsHermes` solo reconocía
  «Hermes», por lo que «Jarvi» no restablecía esa espera. Esta espera y el estilo restrictivo se reforzaban.
- Las versiones anteriores tenían reglas más participativas; posteriormente se incorporó el agente completo
  con herramientas/memoria y se endureció la participación. No atribuir todo retraso al hardware.

## Cambios

**Puente:** permite reacciones, opiniones y preguntas breves ligadas a la charla; no requiere pregunta ni
invocación para comentar. Mantiene silencio para ruido, charla privada, fragmentos o repeticiones y conserva
la distinción entre comentar y ejecutar una orden ajena. Declara la preferencia actual del usuario sobre la
escucha discreta anterior. «Hermes/Jarvis/Jarvi» son nombres del agente. Generación limitada a **384 tokens
por llamada del modelo**, solo en Conversación; herramientas y memoria siguen disponibles y el chat normal
no recibe ese límite. No implica un límite de 8 s de todo el turno: puede haber varias llamadas o herramientas.

**App S2.17:** base de 5 s conservada, máximo adaptativo **10 s** y liberación tras pausa de **5 s**.
Se añaden Jarvis/Jarvi y variantes a la detección de nombre que restablece la cadencia. Conserva una evaluación
en vuelo, límites del contexto, silencio y OFF. No se han cambiado motores, modelos, VAD ni captura.

## Validación e instalación

- **25 tests** del puente correctos, sin inferencia. Primer candidato aún callaba en el ejemplo de lluvia;
  preferencia explícita reforzada, probada aparte antes de promoverla.
- Dos turnos sintéticos con agente real, sin teléfono real y con whitelist de herramientas de solo lectura:
  reaccionó a plan de película en casa (**2,01 s**) y anécdota de buscar las gafas puestas (**1,80 s**).
  `agent.max_tokens == 384` comprobado. No es banco de calidad general ni prueba hablada.
- **74 tests** de canal/conversación/identidad manual correctos con TypeScript compilado. Prueban que la
  espera no crece a un minuto, conserva el texto, atiende Jarvi y respeta OFF/reconexión.
  Copia de código aislada primero; faltaron sus dependencias al compilar y se enlazaron las existentes.
  Tres fallos de arnés por cwd y dos expectativas de la cadencia anterior se ajustaron; ejecución final 74/74.
- Clon móvil `E:\projects\faceclaw-es`, base **aecebac**, cuatro archivos de código/versionado modificados;
  notas ajenas sin tocar. Webpack, Gradle `assembleRelease` y `lintVitalRelease` correctos.
- Pixel **61161FDCG0013L / Pixel 10 Pro Fold**, versión anterior `0.8.4-es.8-conversation.s2.16-g2img`/805,
  firma original validada. Actualización `install -r`, sin desinstalar. **48 ajustes idénticos** antes/después;
  `firstInstallTime` **2026-10-02 09:39:05** conservado. APK extraída del dispositivo idéntica a la final firmada.
- La primera compilación alteró `libfaceclaw_llama.so`, detectado al comparar después de instalar. Sin captura
  activa, se corrigió el paquete con las **ocho bibliotecas exactas de la APK anterior**, se alineó, firmó e
  instaló de nuevo. Verificación final: **8/8 nativas idénticas**. `conservar_nativas.py` y `compilar-app.ps1`
  recogen ese paso para una reconstrucción. No dar como final el primer paquete `d0a95d50…`.
- Final: móvil «Conectado», puente con35herramientas del teléfono, NRestarts0, sin wakelock activo al releer.
  No se inició ninguna captura por el agente. La UI principal no mostró texto OFF en la extracción; el OFF
  previo fue confirmado por el usuario y no se observó captura posterior. Falta valoración en conversación real.

## Artefactos y reversión

- **Final:** `E:\projects\faceclaw-es\dist\conversation-g0\faceclaw-0.8.4-es.9-conversation.s2.17-cadencia.apk`
  (código805, firma española original).
- SHA-256 **761497ac173917b9aca20a0a65e9bcbdb02c3776f4a4d6815acd0ea0e5b00fe0**.
- **Reversión móvil correcta:** `E:\projects\faceclaw-es\dist\conversation-g0\before-install-20261018-174841.apk`,
  SHA-256 **f190444e0b193416e316d2d5f77e29d64e29866a7725bc87463509bdfdf4cd76**. Con el Pixel en OFF:

```powershell
adb -s 61161FDCG0013L install -r "E:\projects\faceclaw-es\dist\conversation-g0\before-install-20261018-174841.apk"
```

El respaldo `before-install-20261018-175042.apk` es el paquete intermedio de este trabajo, no la reversión a
S2.16. Ajustes privados en `.tools/s217-private/`, con ACL restringida; no publicar sus valores ni el perfil.

**Retorno solo del puente:** `python3 ~/reparacion-conversacion-20261018/rollback-participacion-natural/revertir.py`
(inactividad primero). Conserva la reparación de Kiwix/entrega tardía anterior y restaura el estilo más discreto.
Puente y app son pasos distintos; no es necesario revertir ambos para comparar participación.

Código y notas sin commit/push. H1 y los hitos de proactividad mantienen sus criterios propios.

## Continuación en el PC del trabajo

Usuario solicita actualizar GitHub al finalizar,18/10/2026. Fuente de la app en la rama
`claude/faceclaw-0.8.4-integration`; cambios de Hermes/Sala/pulsos/recordatorios en
`DanielGTdiabetes/hermes-agent-proactive`, rama `main`, con guía
`CONTINUAR-DESDE-TRABAJO-2026-10-18.md`. La publicación sustituye las menciones históricas
«sin commit/push» una vez comprobado el remoto. No se necesita otra APK para estos cambios del servidor.

Pulsos G2 normal/Conversación activados20:35: cada cinco minutos en reposo, solo modelo local,
máximo un token por prefijo; no son conversaciones ni ejecutan herramientas.30tests y protocolo pasan;
703/2425ms en el primer pulso observado, no tiempos de respuesta de voz. Sala tiene su pulso separado.
Recordatorio veterinario20oct09:30 Madrid programado en Hermes nativo, gafasO Telegram; Calendar/token
en otro hilo. No publicar firma, tokens, ajustes, audio, SQLite, APK ni respaldos de producción.

Copia NAS verificada en el EVO: `/mnt/evo-backup/faceclaw-s217-20261018/`
(`//192.168.0.110/Home/evo-x2/faceclaw-s217-20261018/`). Incluye APK final, retorno original y fuente saneado
ZIP de S2.17. No confundir con la ruta histórica `/volume1/home/Dani/Faceclaw`.
