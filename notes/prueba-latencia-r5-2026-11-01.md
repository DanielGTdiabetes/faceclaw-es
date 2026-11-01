# Prueba de la ventana EVO R5 — 01/11/2026

**BORRADOR RETIRADO a las 19:07 CET.** Se publicaron tres baterías simultáneas.
Por petición de Dani, Claude centraliza una única serie en el hilo de Buzz
`2fb705767e834ac2e789c53f3bdb46023e8b6287f9430e4b6fe9200956441d3d`.
No ejecutar esta lista como una batería adicional. Se conserva como registro de
la propuesta retirada. Inicio de la prueba comunicado por Dani: 19:07:14 CET.

R5: `4f57ae3337a9ccba9ff08de0f125194e834b2279`, APK
`cbee2ace3ad963dd91bc3b169284e33cba0d320ce686f3864ee0271b938f5b31`.
La prueba empieza después del recibo de instalación. Dani activa Conversación;
el agente no inicia la escucha. Estar en un lugar tranquilo y mantener las gafas puestas.

Decir las preguntas con naturalidad; Conversación no exige una palabra de activación.
Se puede anteponer «Hermes» para distinguir esta prueba de una charla.
Esperar unos 20 s entre preguntas para separar la latencia de la cola de lectura de 12 s.
Anotar hora de inicio y final, números que no respondan y cualquier texto que dure muy poco.

## Cinco preguntas cortas

1. ¿Cuántos días tiene febrero en un año bisiesto?
2. ¿Cuál es la capital de Australia?
3. ¿Qué planeta es el más grande del sistema solar?
4. ¿En qué año llegó el hombre a la Luna?
5. ¿Cuántos gramos son una libra?

Son preguntas del guion anterior para facilitar una comparación con R4. No dicen
que el motor de identidad vaya a funcionar mejor; eso es precisamente lo que se mide.

## Dos controles de frase larga

6. Sin una pausa deliberada: «Si salgo de casa a las ocho y diez y tardo cuarenta y
   cinco minutos, ¿a qué hora llego?».
7. Con una pausa de aproximadamente un segundo en el punto indicado: «¿Qué
   diferencia hay [PAUSA] entre un huracán y un tifón, en una frase?».

La pausa del control 7 es voluntaria: comprobar si empieza a responder antes de
terminar la pregunta. No hace falta repetirlo si se corta; comunicarlo con el número.

## Lectura y resultado

Con una respuesta visible, seguir leyendo sin tocar durante al menos 12 s y anotar
si se retira antes. Si hay una pendiente, tocar puede adelantarla según la política aprobada.
Al terminar, poner Conversación OFF y avisar en el hilo con las horas y los casos fallidos.

Deepseek correlaciona los cinco casos cortos con R4: `silenceClosures`, `maxWindowMs`,
etiquetas `portador/otro/desconocido`, texto reconocido y tiempos disponibles de
`conv timing`/`conv presented`. Solo se compara fin de voz cuando su marca es válida;
VAD antiguo y respuestas esperando lectura se informan aparte. Siete preguntas son
un ensayo funcional breve, no una estimación robusta de percentiles.

No solicita fotos, avisos, correo, domótica ni escritura de memoria persistente.
Si la identidad o la transcripción empeoran, el retorno es la APK R4 completa;
no mezclar DEX y metadatos entre versiones.
