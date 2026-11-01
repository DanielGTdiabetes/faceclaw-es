# Plan: Hermes asistente personal proactivo con memoria — 12-10-2026

Estado: **plan de trabajo, sin cambios aplicados**. Ordena lo hablado el 12-10-2026 sobre memoria, proactividad,
sensores, Tesla y la migración al mini PC. Especificación funcional de referencia (Google Doc del usuario):
[Arquitectura y Casos de Uso para Hermes Agent Proactivo (Con Auto-Aprendizaje)](https://docs.google.com/document/d/15xusVlQvmVfNeLPC3x5hsOdLXohzLCXvTfDjRs23Ie0).

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Qué es "Hermes" | **Hermes Agent (Nous Research) en Jarvis** (BMAX, 192.168.0.234). El FastAPI de `~/hermes` en WSL2 está **descontinuado** |
| Uso | Asistente **personal y proactivo** (G2 + Telegram), no proxy de ejecución para Claude Code |
| Letta | **Descartado** como cerebro: sustituiría el bucle de Hermes Agent y su ecosistema (gateway, cron, plugins, puente Faceclaw). Hermes ya trae proveedores de memoria enchufables |
| Memoria | Memoria integrada (`MEMORY.md`/`USER.md`) más el proveedor **`holographic`** (local, SQLite/FTS5, con confianza por hecho) |
| Sensores | **Faceclaw y el propio móvil** (GPS, SSID, BT del coche, calendario); TeslaMate para el coche; el correo ya lo lee Hermes |
| "Ignorar" | Descartar el aviso **desde las gafas o desde el bot de Telegram** |
| Coche | Tesla, con TeslaMate en el NAS (ahora mismo roto, ver §3) |
| Modelo | Por ahora **ChatGPT Plus / `gpt-6-luna`** (`openai-codex`); más adelante, LLM local en el mini PC |

## 2. Principios de diseño

1. **Silencio por defecto** (de la especificación): solo se avisa si hay novedad y la confianza es suficiente.
2. **Tres capas; el LLM solo en la última.** La ingesta (capa 1) y las reglas/novedad (capa 2) son deterministas y no
   cuestan nada de modelo.
3. **El LLM no guarda números.** La confianza de los patrones, los umbrales y los contadores de ignorados viven en
   tablas que actualiza el código. El LLM *propone* cambios con una tool y el código los aplica y audita.
4. **Avisos críticos con plantilla.** "Sal ya, hay un atasco" no depende del modelo (ni de su latencia, cuota o errores).
5. **Privacidad.** La traza GPS en bruto no sale del móvil, solo los cambios de estado. Se guardan estancias agregadas
   con caducidad, y a las APIs externas solo se envía lo mínimo (origen y destino de una ruta puntual).
6. **Seguridad de la memoria.** Solo se memoriza lo que dice el usuario, nunca el texto de tools, webs, correos o
   notificaciones (para que una inyección de prompt no quede guardada). Las acciones con efectos piden confirmación.

## 3. Inventario actual (comprobado el 12-10-2026, solo lectura)

**Jarvis / Hermes Agent**
- v0.21.4 canary. Memoria integrada activa (40k/20k caracteres de límite; ahora ~7,3 KB `MEMORY.md` + ~2,2 KB `USER.md`).
- `memory.provider: ''`. Proveedores disponibles: byterover, **holographic**, honcho, mem0, openviking, retaindb.
  Se admite **uno externo**, además de la memoria integrada, que siempre está.
- Plugins: `faceclaw-notifications` (S2.14, avisos a G2 o Telegram), `homeassistant` (habilitado), `hermes-achievements`.
- Servicios: `hermes-gateway` (Telegram, cron) y `faceclaw-hermes` (puente con el móvil).

**Faceclaw (móvil)**
- Permisos ya presentes: ubicación precisa con servicio en primer plano, estado de la Wi-Fi, conexión Bluetooth,
  lectura del calendario y notificaciones.
- `FaceclawLocationTracker.kt` / `FaceclawLocationProvider.kt` ya existen.
- S2.14 confirma la entrega (`sent`), pero **no devuelve a Hermes lo que el usuario hizo con el aviso**.

**NAS (Portainer, stack de compose 78 `teslamate`)**
- teslamate v3.0.0 (:4000), grafana (:3100), teslamateapi 1.24.2 (:8085), mosquitto 2 (sin autenticación y sin
  publicar), postgres 16. Contenedores arriba.
- ❌ **No registra datos.** Cada 30 s recibe un 403 de `owner-api.teslamotors.com` ("forbidden, see fleet-api"): la Owner
  API heredada está cerrada y hay que migrar a la **Fleet API**.
- Otros: `orion` ("capa predictiva de Bolus AI para Hermes Agent") parado desde hace 6 semanas; DuckDNS y Nginx Proxy
  Manager en marcha (útiles para publicar la clave pública de la Fleet API).

**Mini PC (pendiente de llegar)**
- GMKtec EVO-X2, Ryzen AI MAX+ 395, 64 GB unificados, Ubuntu nativo.
- Motor: [Strata](https://github.com/Niko1221/Strata) con Qwen3.8-Flash-Next 125B. Strix Halo **experimental**
  (compilar con ROCm 7.14.1, `docs/STRIX_HALO.md`). Con 64 GB: **IQ2_XS o IQ3_XXS** (IQ3_S no deja sitio).
  Hay que subir el límite GTT (`ttm.pages_limit`).

## 4. Arquitectura objetivo

```
CAPA 1 — Sensores (sin LLM)
  Faceclaw: GPS/SSID/BT → solo cambios de estado ─┐
  TeslaMate (Fleet API) → teslamateapi REST ──────┤
  Correo (Hermes), Google Calendar, AEMET ────────┤
                                                  ▼
CAPA 2 — Motor de contexto (plugin/servicio Python junto a Hermes, sin LLM)
  máquina de estados: at_home / at_work / driving / walking / at_gym / at_supermarket
  geovallas del día · time-to-leave · deduplicación/novedad · presupuesto de llamadas LLM
  tablas: stays, places, patterns(confidence, ignores, threshold), notices, interactions
                                                  ▼  solo si hay novedad
CAPA 3 — Hermes Agent (+ memoria integrada + holographic)
  redacta hipótesis · interpreta correcciones · contexto de citas · resumen matutino
                                                  ▼
ENTREGA — faceclaw-notifications
  crítico: G2 (+ Telegram de respaldo) · informativo: Telegram con botones · pasivo: estado/dashboard
        └──── notice_id → dismissed / acted / expired ────▶ tabla interactions (capa 2)
```

## 5. Consumo de modelo (con ChatGPT Plus / `gpt-6-luna`)

**`holographic` por sí mismo no gasta modelo**: guardar y buscar es SQLite y FTS5 local, sin ninguna llamada a un LLM
(comprobado en su código; `auto_extract` está desactivado por defecto y, aun activado, no usa LLM). Lo que sí añade:

| Coste | Cuánto | Cómo limitarlo |
|---|---|---|
| Esquemas de sus tools (`fact_store`, `fact_feedback`) en cada petición | unos cientos de tokens fijos por turno | Asumible |
| Hechos recuperados (`prefetch`) inyectados en el contexto | según cuántos se recuperen | Limitar el número; `min_trust_threshold` |
| Turnos extra cuando el modelo decide guardar o buscar | alguna petición más por conversación | Que guarde solo cuando el usuario confirme o corrija |

Comparación: la memoria integrada ya mete unos 9,5 KB (~2,5k tokens) en *cada* petición. Holographic puede incluso
ahorrar si con el tiempo los hechos pasan de `MEMORY.md` (siempre en contexto) a holographic (solo se recupera lo relevante).

**Lo que sí aumentaría el consumo es la proactividad**, no la memoria. Reglas mientras sea ChatGPT Plus:
- las capas 1 y 2 filtran casi todo, así que el LLM solo se invoca ante una novedad real;
- un **presupuesto diario de llamadas proactivas** en la capa 2 (por ejemplo, N al día), con contador y registro;
- avisos críticos y repetitivos con plantilla, sin LLM;
- consolidación y detección de patrones nocturnas **deterministas**; el LLM solo redacta la pregunta final;
- seguir el criterio de [ahorro de llamadas](ahorro-llamadas-hermes-2026-10-10.md).

Con el mini PC el coste pasa a ser de latencia y energía, no de cuota; el presupuesto se puede relajar.

## 6. Fases

Cada fase tiene criterio de salida. F1, F2 y F9 son independientes y pueden ir en paralelo.

### F0 — Definición (sin código)
- 8–10 **escenarios de uso** reales que sirvan de batería de pruebas.
- Contrato de **eventos móvil→Hermes** (tipos, campos y frecuencia; sin traza GPS).
- Contrato de **feedback de avisos** (`notice_id`, `dismissed` / `acted` / `expired`, corrección).
- **Prioridad entre contextos** (gimnasio con no molestar frente a aviso naranja de AEMET frente a cita próxima).
- **Retención** (estancias N días, interacciones M días) y procedimiento de borrado.
- **Métricas**: avisos útiles frente a ignorados por semana, correcciones y llamadas LLM al día.
- Salida: documento aprobado por el usuario.

### F1 — TeslaMate a la Fleet API (NAS)
- Opción recomendada: **app propia en Tesla Developer**. Clave pública en `/.well-known/appspecific/com.tesla.3p.public-key.pem`
  mediante DuckDNS y Nginx PM, OAuth, y variables de la Fleet API en TeslaMate. Primero con consultas periódicas;
  Fleet Telemetry (streaming) solo si hace falta.
- Alternativa: proxy de terceros (rápido, pero la ubicación del coche pasa por ellos).
- Revisar el modelo de cobro actual de la Fleet API antes de empezar.
- Copia de seguridad de la base de TeslaMate antes de tocar nada.
- Salida: TeslaMate registra de nuevo y `teslamateapi` devuelve el estado y la batería actuales.

### F2 — Memoria `holographic` (Jarvis)
- Probarla en un **`HERMES_HOME` temporal**, como en S2.14; producción sin tocar.
- Configuración: `auto_extract: false`, `min_trust_threshold` adecuado y límite de hechos en `prefetch`.
- Probar el ciclo: añadir un hecho → contradecirlo o corregirlo → `fact_feedback` → búsqueda.
- Medir los tokens por turno antes y después.
- Salida: activada en producción con reversión documentada (`memory.provider: ''`).

**Estado 12-10-2026 17:39: ACTIVADA en Jarvis.**
- Prueba aislada previa en un `HERMES_HOME` temporal (ya borrado): todas las acciones de `fact_store` y
  `fact_feedback` funcionan sin numpy (sin álgebra HRR, con FTS5). Confianza: helpful +0,05; con trust < 0,3 un hecho
  deja de recuperarse. Las escrituras en la memoria integrada se copian como hechos.
- Cambio único: `memory.provider: '' → 'holographic'` con `hermes config set`. Configuración del plugin por defecto
  (`$HERMES_HOME/memory_store.db`, `auto_extract: false`, `min_trust_threshold: 0.3`).
- Copia: `/home/dani/.hermes/config.yaml.bak-holographic-20261012-173903` (SHA-256 `49b6f2fa995ee82b…`).
- El gateway (Telegram) no se ha reiniciado: recompone el agente en el siguiente mensaje porque `memory.provider` forma
  parte de la firma de su caché. `faceclaw-hermes` (chat por gafas) se **reinició a las 17:40:05** con autorización del
  usuario, tras comprobar 10 min sin actividad. En el log aparece `Memory provider 'holographic' registered (2 tools)`,
  `ready` (gpt-6-luna, 30 tools) y escucha en 8791. El agente de conversación usa `skip_memory=True` y no le afecta.
- Reversión: `~/.hermes/hermes-agent/.venv/bin/hermes memory off` (o restaurar la copia). La base
  `memory_store.db` se puede conservar o borrar aparte.
- Observaciones:
  - el prompt del plugin pide "ALWAYS probe or reason first" antes de responder sobre el usuario, así que habrá alguna
    tool call extra. Vigilar el consumo;
  - con la base vacía, invita a añadir hechos de forma proactiva. Vigilar que no guarde contenido de tools o correos (§2.6);
  - `auto_extract` solo tiene patrones en inglés, así que no sirve para español: dejarlo apagado;
  - SQLite 3.50.4 tiene el fallo de reinicio de WAL y el plugin usa `journal_mode=DELETE` (seguro). `hermes update`
    lo arreglaría, pero no se ha ejecutado.
- Pendiente: primera conversación real por Telegram, revisar qué hechos guarda y medir los tokens por turno.

**Consumo medido el 12-10-2026 (sesiones de `~/.hermes/state.db`, solo lectura).** El usuario agotó la cuota de ChatGPT
Plus hasta las 20:20 tras hablar poco con Hermes. Datos:
- Telegram (gateway) usa **`gpt-5.6-terra`** (el chat por gafas usa `gpt-6-luna`).
- Hermes hoy: 5 llamadas al modelo principal en total (4 en la sesión 16:56–17:40, antes de holographic; 1 en la de
  17:41–17:43, después) y 2 de títulos por OpenRouter/`hermes_fast`. Desde la activación, una sola tool call
  `fact_store` y **0 hechos guardados**.
- **Cada mensaje de Telegram cuesta unos 33k tokens de entrada** (system prompt, ~30 tools y memoria). Holographic
  añade unos cientos.
- Conclusión: holographic no causó el agotamiento. La cuota de ChatGPT Plus es compartida con Codex y la app, y Codex
  trabajó en S2.14 ese mismo día (deducción: el consumo de Codex no se ve desde Jarvis).
- Opciones para ahorrar mientras siga en ChatGPT Plus (ninguna aplicada): reducir los toolsets de Telegram (el
  mayor ahorro por mensaje), un proveedor de respaldo de pago por uso (OpenRouter ya está configurado), y el mini PC (F9).

**Siguiente paso al retomar:** después de una conversación real por Telegram, revisar los hechos de
`~/.hermes/memory_store.db` (¿solo cosas dichas por el usuario?) y los tokens por turno en `state.db`; decidir si se
recortan herramientas. Después, F0 (escenarios) o F1 (TeslaMate a la Fleet API).

### F3 — Feedback de avisos (Faceclaw + plugin)
- `notice_id` en `faceclaw-notifications`.
- G2: reportar `dismissed` / `acted` / `expired` al cerrar el overlay.
- Telegram: botones `[👍] [Descartar] [Corregir]`. **Comprobar si el gateway de Hermes admite botones en línea.**
- Tabla `interactions` y regla de "3 ignorados seguidos → bajar o preguntar".
- Salida: cada aviso tiene un resultado registrado.

### F4 — Faceclaw como sensor (capa 1 en el móvil)
- Detectar en el móvil: SSID de casa y trabajo (con histéresis de 3–5 min), BT del Tesla (`driving`) y geovallas.
- Enviar a Hermes **solo las transiciones de estado** por el puente existente.
- Medir el consumo de batería con el servicio de ubicación.
- Salida: Hermes recibe `at_home → in_transit → driving → at_work` correctos durante un día real.

### F5 — Motor de contexto (capa 2)
- Máquina de estados, deduplicación, presupuesto de llamadas LLM y tablas de §4.
- Time-to-leave determinista (calendario + API de tráfico + margen). **Hay que elegir proveedor de tráfico.**
- AEMET OpenData con umbral (amarillo, naranja, rojo).
- Salida: pruebas con eventos sintéticos y cero llamadas LLM cuando no hay novedad.

### F6 — MVP proactivo 1
- Presencia en casa y en el trabajo, time-to-leave, AEMET y resumen matutino; avisos por G2 y Telegram.
- Una o dos semanas de uso real con métricas de F0.
- Salida: el usuario lo considera útil y no molesto.

### F7 — Hipótesis y aprendizaje (MVP 2)
- Registro de estancias y detección nocturna de patrones (agrupar estancias y contar por franja horaria; sin LLM).
- El LLM redacta la pregunta e interpreta la respuesta; el código actualiza la confianza.
- Calibración de umbrales a partir del feedback ("no hacía falta avisar por 8 min").
- Hechos confirmados → holographic.

### F8 — Ampliaciones (MVP 3)
- Geovallas efímeras de las citas (preparar contexto al llegar; preguntar por acuerdos al salir).
- Tareas que dependen del lugar y lista de la compra.
- Paquetes a partir del correo cruzados con la presencia.
- Tesla: batería suficiente para ida y vuelta y **envío del destino al coche** (Fleet API + clave virtual, siempre con confirmación).

### F9 — Migración al mini PC (en paralelo, cuando llegue)
- Ubuntu reciente, límite GTT y llama.cpp con Vulkan como referencia (Qwen3.6-35B-A3B).
- Strata compilado para gfx1151; Qwen3.8-Flash-Next en IQ3_XXS e IQ2_XS.
- Banco de pruebas con los escenarios de F0: porcentaje de tool calls válidas, latencia por turno y RAM real.
- Migrar Hermes Agent desde Jarvis (configuración, memorias, plugins, servicios) con reversión.
- Salida: decisión de modelo y Hermes funcionando en local con la misma funcionalidad.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cuota de ChatGPT Plus por la proactividad | Capas 1–2 filtrando, presupuesto diario y plantillas |
| Tool calling poco fiable con modelos locales en Q2/Q3 | El estado crítico no depende del LLM; banco de pruebas en F9 antes de migrar |
| Memoria envenenada por inyección | Solo se memoriza lo que dice el usuario; acciones con confirmación |
| Datos de ubicación y salud | Todo local, retención limitada, mínimo hacia fuera |
| Batería del móvil | Solo transiciones y medición en F4 |
| Avisos molestos | Silencio por defecto, feedback de F3 y métricas de F0 |
| Strix Halo experimental en Strata | Referencia con llama.cpp/Vulkan; no migrar sin que el banco de pruebas lo justifique |

## 8. Preguntas abiertas

1. ¿`orion` (NAS, parado) está abandonado o entra en este plan?
2. ¿Home Assistant está en funcionamiento? (el plugin `homeassistant` está habilitado en Hermes).
3. Proveedor de tráfico para el time-to-leave (Google, TomTom, HERE…) y su coste y privacidad.
4. ¿El gateway de Hermes admite botones en línea de Telegram?
5. Fleet API: ¿app propia (recomendada) o proxy de terceros?

## 9. Descartado

- **Letta** como servidor de agentes (ver §1). Si hiciera falta, se podría escribir como proveedor de memoria de
  Hermes (~300 líneas, como `mem0`), pero ahora no aporta ventaja clara.
- **Hermes en WSL2** (`~/hermes`, FastAPI): descontinuado.
