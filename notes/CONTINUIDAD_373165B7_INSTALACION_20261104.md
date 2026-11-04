# Continuidad 373165b7 instalada desde casa — 04/11/2026

Claude aprobó el ejecutable `2fda97209d11f87fff939061c8da87334788214e` a las
16:42:29 UTC. Dani autorizó continuar (`c19b4e6d`) y confirmó OFF corregido
(`3fb8bda6`); antes de instalar se observó «Escucha apagada» y Conectado.

## Instalación comprobada

- `adb install -r` terminó con Success; `am start -W`, Status ok. Actualización
  `2026-11-04 17:55:42` CET. APK extraída tras instalar idéntica a la candidata:
  `cef1313b97be16bfd4d5d47e7ab88309aac46dfbfff5b07cbfc57455b08696c6`.
- Firma original SHA256 `57aaa8871c7953212415d72d7484bdda9a74e1bfdc8fe5a007e23e226114c435`,
  v2/v3 y alineación 16KB correctas. Mantiene deliberadamente S2.28.2/código805;
  distinguir por SHA, no por versionName.
- Los 48 ajustes son idénticos antes/después; respaldo solo en carpeta privada
  local con ACL de usuario/SYSTEM. Primera instalación `2026-10-02 09:39:05`
  conservada. No se exportó el perfil de voz ni se inició captura.
- UI posterior Conectado, proceso1631, cero wakelocks y cero coincidencias del
  paquete en buffer crash desde17:55:40. La pantalla posterior es la principal:
  no se afirma haber leído una etiqueta OFF posterior; sí se leyó antes de instalar.
- Puente active/running, PID716486/NRestarts0, reconexión del móvil17:55:41,934.
  Sin reinicios de puente/Sala ni cambios en Calendar, modelos o firmware.

## Construcción y límites

Bundle de producción desde el worktree limpio del SHA aprobado; webpack0, tsc0,
oxlint0 con aviso previo de Builder. Lockfile idéntico al del checkout que aporta
node_modules. Se reemplazan los87 assets generados en la APK actual; package.json
runtime, dos DEX, ocho SO, manifiesto y recursos son idénticos byte a byte. No se
ejecutó Gradle/Kotlin al conservar los componentes nativos. Recibos verifican
también el contenido de la APK firmada, además de la intermedia.

No se repitió la suite completa ya ejecutada por Claude en este PC sobre ese SHA:
1418 totales,1417 correctas,1 omitida,0 fallos. La entrega inicial de Codex tenía
1416 correctas/2 omitidas y control negativo completo de10 fallos.

## Retorno y archivo

`OUTBOX/HERMES_CONTINUIDAD_373165B7/RETORNO_FD079D09.apk`, extraída del Pixel por
Deepseek antes de instalar y comprobada aquí, SHA256
`84922b2d7c80466bcda645fc0b251254ff0a528640b1826d1dd13afd139bdb18`.
Retorno con OFF y `adb install -r`; nunca desinstalar ni borrar datos.

Archivo NAS previsto `/mnt/evo-backup/faceclaw-continuidad-373165b7-apk-casa-20261104/`;
`NAS_ARCHIVE_RECEIPT.json` del OUTBOX acredita copia y hashes cuando se complete.
Recibos locales `ARTIFACT_SIGNED_RECEIPT.json`, `INSTALLATION_RECEIPT.json` y
`SETTINGS_after_SUMMARY.json`; no contienen valores de ajustes ni perfil.

## Siguiente

Verificación independiente de recibos por Deepseek y uso normal de Dani. Aún no
está validado físicamente que conserve el hilo ni identificado quién retira el
mensaje fugaz. El candidato aporta trazas escalares para investigarlo; no garantiza
haber corregido ese fallo. Participación, frases partidas y calidad siguen abiertas.
La instalación no implica merge. Mantener la base apilada Fluidez A visible.
