# Continuación en casa: revisión LLM del EVO-X2 — 16/10/2026

El banco LLM y las evidencias están en [Hermes](https://github.com/DanielGTdiabetes/hermes-agent-proactive/blob/main/preparacion-evo-x2/llm/auditoria-2026-10-16.md).
Qwen3.6/llama.cpp sigue como referencia provisional; Gemma es alternativa. No se ha cambiado el proveedor
Hermes de producción ni se ha conectado Faceclaw a estos LLM. No hay APK nueva ni ajustes del móvil nuevos.

El usuario decide esperar a cambiar UMA a **2G en casa**, con pantalla/teclado, antes de continuar Strata.
Auto reservó 32 GiB en este equipo; después de 2G se debe dimensionar/verificar TTM/GTT desde Ubuntu y repetir
el banco, incluyendo caché, memoria y swap. Codex/SSH pueden preparar Linux y pedir entrada en firmware,
pero no se dispone de consola remota para operar la BIOS. No reiniciar ni cambiar memoria desde el trabajo.

Qwen/Gemma: tres pasadas, 45/45 formato y 36/36 comprobaciones parciales por modelo. Strata con 1 GiB/2 slots
restaura un cambio simple de prompt, pero cinco decisiones JSON expulsan el prompt largo; swap global activa.
Variante 4 GiB/8 slots detenida por preferencia del usuario antes de resultados. Todos los LLM parados;
ASR Nemotron activo/NRestarts=0. Evidencias sintéticas, sin audio ni secretos, en el repositorio Hermes.

S2.15/805 y proveedor `even` de Hey Even/PTT conservados. Conversación permanece local; H1 sigue abierto.
La medición histórica de Jarvis no reconstruye fin de voz→respuesta mostrada; pendiente traza correlacionada.
No repetir instalación, configuración ni captura automáticamente. Mantener firma y datos conforme a continuidad.
