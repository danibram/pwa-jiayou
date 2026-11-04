# Critic loop del sistema de aprendizaje

Revisión del 4 de noviembre de 2026. Tres revisores independientes leyeron el código con un enfoque cada uno: memoria y calendario, aprendizaje de caracteres y recorrido del alumno. Ninguno vio los otros informes. Comprobé contra el código los hallazgos de severidad alta antes de incluirlos. Esta revisión no cambia el funcionamiento de la app.

| Enfoque | Hallazgos | Altos | Medios | Bajos |
| --- | --- | --- | --- | --- |
| Memoria y calendario | 11 | 3 | 6 | 2 |
| Caracteres | 9 | 3 | 4 | 2 |
| Recorrido del alumno | 12 | 3 | 6 | 3 |

Varios hallazgos coinciden entre revisores. Abajo aparecen una sola vez, con la severidad más alta que recibieron.

## Qué hace Tongtong con los caracteres

Comprobado en su diccionario público ([知道](https://www.tongtong.app/es/dictionary/知道-zhidao), [道](https://www.tongtong.app/es/dictionary/道-dao)):

- Cada palabra lleva una nota de formación (构词法). En 知道, los dos caracteres significan saber y se unen por coordinación.
- Cada carácter indica su tipo (形声 sonido y significado, 会意 ideograma compuesto) y se descompone en parte de significado y parte de sonido. En 道, la parte de significado es 行 calle y 止 pie.
- Avisa cuando la parte de sonido ya no coincide con la pronunciación actual.
- Lista los caracteres fáciles de confundir, por forma (逆 para 道) y por sonido (到, 盗).
- Añade notas de uso entre sinónimos (知道 frente a 认识 y 懂), clasificadores, rango de frecuencia y tres frases de ejemplo con audio.

La portada promete además una prueba de nivel de un minuto, tarjetas al borde de lo que sabes con un objetivo de retención del 90 %, un reloj de olvido por palabra (FSRS) y orden por frecuencia real. No probé esas funciones dentro de una cuenta.

## 1. Errores del sistema actual

Estos hallazgos describen fallos de lo que ya existe, no mejoras. Conviene arreglarlos antes de añadir nada.

| Sev | Hallazgo | Propuesta | Esf. |
| --- | --- | --- | --- |
| Alta | **Los caracteres nunca entran en el calendario.** El commit 081b9bf borró las tarjetas de caracteres que las rondas 2 y 3 del critic loop dieron por cerradas. Nada llama a `progressStore.introduce` ni a la cola de caracteres. `recordStrokes` no fija `due` y `practice` sale si el carácter es nuevo, así que un carácter escrito de memoria sigue siendo nuevo para siempre. Home promete "8 caracteres nuevos al día" ([progressStore.ts:23](../src/stores/progressStore.ts), [Trazos.tsx:174-178](../src/pages/Trazos.tsx), [progressStore.ts:252-287](../src/stores/progressStore.ts)). | Introducir los caracteres de una palabra cuando se aprende y meter en la sesión diaria dos o tres tarjetas "De memoria" de caracteres vencidos o con `canWrite`. Si se descarta, quitar el calendario de caracteres y el texto de los 8 al día. | M |
| Alta | **Una palabra puede quedar atrapada en intervalos de 1 día.** La facilidad solo baja: "Otra vez" resta 0,2 y "Difícil" 0,15, y "Bien" no suma nada. Los reintentos de la misma sesión vuelven a restar. Con facilidad por debajo de 1,5, `round(1 × ease)` da 1 para siempre ([schedule.ts:16-34](../src/domain/progress/schedule.ts)). | Con "Bien", crecer al menos a `interval + 1`. Ajustar facilidad solo con la primera respuesta del día. Devolver 0,05 de facilidad con cada "Bien", hasta 2,5. | S |
| Alta | **La carga de repasos queda oculta.** La cola corta los vencidos a 20 y Home muestra ese número, haya 20 o 200. "Más palabras" añade nuevas sin mirar los vencidos. A 20 nuevas al día salen unos 100 repasos diarios a los tres meses ([progressStore.ts:430-436](../src/stores/progressStore.ts), [Home.tsx:179-194](../src/pages/Home.tsx)). | Mostrar "20 de 140 pendientes" y servirlos en bloques. Bloquear "Más palabras" con vencidos sin hacer o con una previsión alta para mañana. Corregir el texto de ayuda que dice que los repasos de mañana siguen siendo pocos. | M |
| Alta | **"Ya la sé" gasta el cupo y empieza la escalera desde cero.** Califica "Bien" sobre una palabra nueva: cuenta como una de las 20 del día y vuelve mañana. Quien ya sabe HSK 1 y 2 tarda 15 días y cientos de repasos en saltárselos ([VocabularyReview.tsx:263-272](../src/pages/VocabularyReview.tsx), [progressStore.ts:414](../src/stores/progressStore.ts)). | Que no gaste cupo y entre con intervalo de 4 a 7 días. Si falla ese primer repaso, vuelve a la escalera normal. | S |
| Media | **El vencimiento cae a la hora exacta.** Una palabra estudiada a las 23:00 no sale en la sesión de las 9:00 del día siguiente. La cola de caracteres ya usa `startOfDay` ([schedule.ts:35](../src/domain/progress/schedule.ts), [progressStore.ts:432](../src/stores/progressStore.ts)). | Contar como vencido todo lo que vence antes de que acabe el día local. | S |
| Media | **Una sesión de tema puede enseñar 20 palabras nuevas de golpe.** Son unas 60 tarjetas, el doble que la sesión de Hoy, y vacían el cupo del día ([VocabularyReview.tsx:94-103](../src/pages/VocabularyReview.tsx)). | Usar el mismo tope de 10 y avisar en el botón de que gasta el cupo de hoy. | S |
| Media | **Los fallos fuera de calendario no adelantan el repaso.** Fallar en práctica libre una palabra con intervalo 50 la deja oculta 50 días. En Flojos, el reintento de cuatro tarjetas después basta para salir ([progressStore.ts:386-429](../src/stores/progressStore.ts)). | Que cualquier "Otra vez" traiga la palabra mañana como mucho. Que los reintentos no saquen de Flojos. | S |
| Media | **El ejemplo curado de cada carácter casi nunca se ve.** Existen 2.476 ejemplos, pero la ficha solo los muestra si ninguna palabra contiene el carácter ([CharacterDetailSheet.tsx:176](../src/components/CharacterDetailSheet.tsx)). | Mostrarlo siempre como primera fila, con audio. | S |
| Media | **El radical se muestra en forma tradicional.** 423 de los 2.650 caracteres muestran 言, 辵, 糸 o 門 aunque el glifo lleva 讠, 辶, 纟 o 门. 82 radicales no tienen glosa, y eso afecta al 27 % de los caracteres ([CharacterDetailSheet.tsx:96-168](../src/components/CharacterDetailSheet.tsx), `searchIndex.json`). | Una tabla fija de unos 200 radicales en su forma simplificada, con pinyin y glosa en español. | S |

## 2. Enseñar caracteres como Tongtong

| Sev | Hallazgo | Propuesta | Esf. |
| --- | --- | --- | --- |
| Alta | **No hay modelo de componentes.** Un carácter solo tiene radical, trazos, glosa y ejemplo ([types.ts:6-18](../src/types.ts)). El alumno nunca ve que 请, 清, 情, 晴 y 睛 comparten 青 por el sonido, así que memoriza cada carácter como un dibujo suelto. | Añadir por carácter `components`, `type` (象形, 指事, 会意, 形声), `semantic`, `phonetic` y una pista en español. En la ficha, una fila "Partes" con cada componente tocable, una etiqueta "pista de sonido" y un aviso cuando el sonido ya no coincide. | L |
| Media | **La página de palabra no explica cómo se forma.** Las fichas de 知 y 道 solo muestran el glifo, y la tarjeta revelada tampoco ([Vocabulario.tsx:378-390](../src/pages/Vocabulario.tsx), [VocabularyReview.tsx:504-507](../src/pages/VocabularyReview.tsx)). | Paso 1: la glosa corta de cada carácter bajo su ficha, que ya existe para los 2.650 ("知 saber + 道 camino"). Paso 2: un campo de formación por palabra, editable en el editor, empezando por HSK 1 y 2. | S, después L |
| Media | **No hay caracteres fáciles de confundir.** "Misma sílaba, otros tonos" descarta los homófonos del mismo tono, así que 到 no sale en 道. Tampoco hay parecidos por forma (己 已 巳, 未 末) ([ToneNeighbors.tsx:30](../src/components/ToneNeighbors.tsx)). | Una sección "Suena igual" con los homófonos de nivel igual o inferior. Una sección "Se parece a", calculada por componentes y trazos y completada con una lista curada. | S, después M |
| Media | **Trazos practica caracteres sueltos.** Para escribir 认识 hay que entrar dos veces. Los errores se señalan por número de trazo y no por componente ([Trazos.tsx:70-72, 419-426](../src/pages/Trazos.tsx)). | Un modo "palabra" que encadene sus caracteres con la palabra como pista. Agrupar errores por componente ("fallaste en 青"). | M |
| Baja | **No hay orden propio para los caracteres ni familias fonéticas.** | Una sección "Familia" en la ficha con los caracteres que comparten parte de sonido. Un desempate en el orden de palabras a favor de las que usan componentes ya conocidos. | M |
| Baja | **No hay historia ni mnemotecnia.** | Un campo de origen de una o dos frases, curado a mano y con fuente, para unos 300 caracteres básicos de tipo 象形 y 会意. | M |

**Datos y licencias.** Las descomposiciones, los tipos, las partes de significado y sonido, las series fonéticas y los homófonos se pueden calcular sin conexión para los 2.650 caracteres, en menos de 1 MB. Fuentes posibles:

- **Make Me a Hanzi `dictionary.txt`.** Trae descomposición, tipo y partes de significado y sonido. Su licencia es LGPL v3, y distribuirlo dentro de la PWA es una decisión que hay que documentar en `docs/licenses`.
- **Unihan.** Tiene licencia Unicode, que es permisiva, y aporta series fonéticas, pero no descomposición.
- **CJKVI IDS.** Deriva de CHISE. Hay que comprobar sus términos antes de usarlo.

Las pistas de Make Me a Hanzi están en inglés y a veces son etimología popular. Las pistas, las notas de formación, las notas de uso y la elección de confusiones necesitan curación en español. Ese trabajo encaja en el editor de contenidos.

## 3. Recorrido del alumno

| Sev | Hallazgo | Propuesta | Esf. |
| --- | --- | --- | --- |
| Alta | **La primera pantalla no orienta.** No explica qué es un nivel HSK. Marcar HSK 1 y 3 los alterna uno a uno desde el primer día ([Listas.tsx](../src/pages/Listas.tsx), [wordOrder.ts:32-35](../src/utils/wordOrder.ts)). | Dos entradas: "Empiezo de cero", que marca HSK 1, y "Ya sé algo", que permite marcar listas como conocidas con una comprobación de 20 palabras. Es el paso mínimo antes de la prueba de nivel propuesta en [tongtong.md](research/tongtong.md) §3. | S, después M |
| Media | **Las primeras palabras son partículas.** El orden por el carácter más raro pone primero 的, 一, 是, 不 y 了. 你 es la vigésima ([wordOrder.ts:20-31](../src/utils/wordOrder.ts)). | Un arranque curado de unas 30 palabras (saludos, pronombres, números) antes del orden por frecuencia, definido en el editor. | S |
| Media | **Inversa y audio se autoevalúan desde el segundo repaso.** "¿Cómo se escribe?" solo ofrece "Mostrar respuesta". Elegir entre cuatro, que se corrige solo, solo aparece en el primer recuerdo ([VocabularyReview.tsx:50-56](../src/pages/VocabularyReview.tsx)). | Usar elegir entre cuatro en las dos primeras repeticiones de inversa y audio, y la autoevaluación desde la tercera. Rotar la dirección por palabra, no por posición en la sesión. | S |
| Media | **Los temas casi desaparecen desde HSK 4.** Tienen tema 42 de 598 palabras de HSK 4 y 69 de 2.500 de HSK 6. | Etiquetar HSK 4 a 6 en el editor. Mientras tanto, ocultar los temas con menos de 10 palabras en las listas marcadas. | M |
| Media | **Volver tras una pausa no explica nada.** Las palabras nuevas desaparecen con 20 vencidos y nada lo dice. | "Las palabras nuevas vuelven cuando bajen los repasos" y una línea de bienvenida sin reproche tras tres días. | S |
| Media | **La palabra del día sale siempre de HSK 1** ([vocabularyStore.ts:73-76](../src/stores/vocabularyStore.ts)). | Elegirla entre las listas marcadas, priorizando una floja o la siguiente nueva, con "Aprender ahora". | S |
| Baja | **Extra se intercalará una de cada dos con HSK 1** cuando tenga palabras ([wordOrder.ts:10](../src/utils/wordOrder.ts)). | Darle una de cada cuatro nuevas o ponerla tras el nivel HSK más bajo. | S |
| Baja | **"También en" muestra palabras que el alumno no conoce** ([VocabularyReview.tsx:115-120](../src/pages/VocabularyReview.tsx)). | Preferir una palabra ya vista. | S |
| Baja | **HSK 4 a 6 llegan en el orden de la fuente** hasta que se descarga su paquete, porque el rango de frecuencia sale del paquete ([wordOrder.ts:13-23](../src/utils/wordOrder.ts)). | Incluir en el build un rango de frecuencia para todos los caracteres. | S |

## 4. Datos para medir y migrar a FSRS

| Sev | Hallazgo | Propuesta | Esf. |
| --- | --- | --- | --- |
| Media | **No se puede medir la retención.** Solo se guardan agregados por palabra. No quedan la fecha de cada respuesta, la nota, los días transcurridos ni el tipo de tarjeta ([types.ts](../src/domain/progress/types.ts)). Sin eso no se puede ajustar FSRS ni compararse con el 90 % de Tongtong. | Un registro de solo añadir: id, tipo, fecha, nota, dirección, si movió el calendario, días transcurridos e intervalo anterior. Se guarda aparte del estado e incluye la copia de seguridad en formato 4. | M |
| Media | **El intervalo ignora el tiempo real.** Una palabra recordada 30 días tarde recibe el intervalo de 8 × facilidad. "Repasar todo" califica antes de tiempo y da el intervalo completo ([schedule.ts:27](../src/domain/progress/schedule.ts)). | Guardar `lastReview` y crecer desde `max(intervalo, días transcurridos)`. En repasos anticipados, escalar el crecimiento o no mover el calendario. | S |
| Baja | **Las palabras de un mismo día vuelven juntas y en el mismo orden.** | Una dispersión de ±5 % en intervalos de 3 días o más, y barajar dentro del mismo día de vencimiento. | S |

## Qué conservar

- Las palabras nuevas entran en grupos de tres. Primero se piden en producción y el grupo anterior vuelve cuando el siguiente lo ha desplazado. Una sesión nunca abre con 20 presentaciones.
- Las nuevas ceden ante los vencidos, el fallo vuelve cuatro tarjetas después y la práctica libre no infla intervalos.
- La ficha de carácter es la misma desde cualquier entrada y enlaza carácter y palabras en las dos direcciones. Trazos sigue una progresión clara: Ver, Calcar y De memoria.
- Los límites se explican en español claro y los estados vacíos proponen el siguiente paso.

## Orden propuesto

1. **Arreglos del calendario,** todos de esfuerzo S: la trampa de facilidad, el vencimiento por día, el cupo de "Ya la sé" y de los temas, los fallos fuera de calendario y el total de pendientes visible.
2. **~~Caracteres de vuelta en el plan diario~~.** Descartado por decisión del dueño: la unidad de estudio es la palabra, de uno o varios caracteres. Los caracteres se enseñan como partes de la palabra, con su glosa bajo cada ficha, y no tienen calendario ni cupo propios.
3. **Registro de repasos,** para medir la retención antes de decidir sobre FSRS.
4. **Modelo de componentes y confusiones,** a partir de Make Me a Hanzi y Unihan, con pistas curadas en el editor.
5. **Entrada para quien ya sabe algo,** el arranque curado y las notas de formación de palabras.

## Hecho tras la revisión

Arreglos del calendario, aplicados con tests:

- "Bien" siempre alarga el intervalo y devuelve 0,05 de facilidad, así que ninguna palabra queda atrapada en un día.
- La facilidad cambia una vez al día. Los reintentos de la misma sesión y las respuestas del día en que se enseña una palabra solo reprograman.
- El vencimiento es por día local, no por hora.
- Un repaso tardío crece desde los días que pasaron de verdad, y uno anticipado no estira el intervalo.
- Un fallo fuera de calendario trae la palabra mañana como mucho, y en Flojos el reintento ya no la saca de la lista.
- "Ya la sé" no gasta el cupo y vuelve en cinco días.
- Un tema enseña como mucho diez palabras nuevas.
- Home muestra "20 de 140 repasos" y frena "Más palabras" si hay pendientes o si mañana pasa de 60 repasos.

El plan aparte de caracteres desaparece: ya no se promete "8 caracteres nuevos al día".

## Rondas visuales

Recorrí el flujo de un principiante en el navegador, a 390 × 844, y una revisora nueva juzgó cada ronda con las capturas.

### Ronda 1

| Sev | Hallazgo | Disposición |
| --- | --- | --- |
| Alta | Las respuestas segundos después de enseñar una palabra cuentan como nota y el resumen dice "9 Bien" | Hecho. No tocan la facilidad y el resumen lista las palabras nuevas en vez de calificarlas |
| Alta | La escucha cae sobre una palabra enseñada minutos antes y se autoevalúa | Hecho. Nunca sobre palabras de hoy, y con menos de tres repasos se responde eligiendo entre cuatro |
| Alta | HSK 1 empieza por 的, 一, 是, 不, 了, con partículas sin significado propio | Hecho. Arranque curado de 30 palabras (你好, 我, 你, 是, 不, 好, 谢谢…). Las partículas no se piden desde el español y muestran su ejemplo curado |
| Media | "Quedan 20" no baja con las tarjetas de enseñar | Hecho. Cuenta todas las tarjetas |
| Media | El resumen no dice qué se aprendió y prioriza la escritura | Hecho. Lista de palabras nuevas, "Mañana: N repasos" y "Volver al inicio" como acción principal |
| Media | Al fallar una opción no se ve qué era | Hecho. La opción fallada muestra su significado |
| Media | Tras elegir, la barra Olvidé, Casi y Bien parece pedir una nota | Hecho. Solo queda "Continuar" |
| Media | Se eligen niveles dos veces, y Extra vacía parece muerta | Pendiente. Extra se queda visible por decisión del dueño. La cuadrícula de niveles de Home queda para otra ronda |
| Baja | El tono neutro sin color parece un error | Pendiente |
| Baja | "Escribir" no explica qué hace | Hecho. "Cómo se escribe · toca un carácter", con la glosa de cada carácter |
| Baja | La hoja de carácter lleva insignia HSK | Pendiente |

También cambió la tarjeta inversa de las palabras jóvenes: con menos de tres repasos se responde eligiendo, como la escucha.

### Ronda 2

| Sev | Hallazgo | Disposición |
| --- | --- | --- |
| Alta | Ninguna palabra lleva una frase de ejemplo | Pendiente. Necesita un campo de frase en el editor y contenido revisado, empezando por HSK 1 |
| Alta | Nada trae al alumno de vuelta mañana | En parte. Home avisa "Practica hoy para llegar a N días seguidos". Los recordatorios con notificación quedan pendientes |
| Media | Tras un fallo al elegir, la pastilla "Casi" no explica nada | Hecho. "Tocaste 你 nǐ, «tú». 我 es «yo»." |
| Media | El resumen del primer día no destaca la palabra que costó | Hecho. Etiqueta "te costó" |
| Media | Home promete 10 repasos y el resumen cuenta 9 | Sin cambio. Una palabra ya se había repasado ese día en una sesión abandonada durante la prueba |
| Media | "También en" repite un componente de la palabra (好 en 你好) | Hecho. Solo muestra palabras que no son partes de la actual |
| Media | 一会儿 aparece entre las palabras con 儿 "hijo" | Hecho. El 儿 de erhua no cuenta como el mismo carácter |
| Baja | La hoja de carácter lleva insignia HSK | Hecho. Quitada |
| Baja | El botón de Home no dice cuánto dura la sesión | Hecho. "De HSK 1 · unos 5 min" y subtítulo más corto |
| Baja | Aparece una palabra no enseñada entre las opciones | Hecho. Con dos o más palabras vistas, solo se ofrecen esas |

### Ronda 3

| Sev | Hallazgo | Disposición |
| --- | --- | --- |
| Alta | Las palabras con uno o dos repasos aún se autoevalúan en la tarjeta de hanzi a significado | Hecho. Nueva tarjeta "Palabra → significado": se ve el hanzi y se elige su significado entre palabras ya vistas. La autoevaluación empieza en el tercer repaso |
| Media | Extra no está entre las fichas de nivel de Home | Pendiente. Extra está en el selector de listas y en Opciones |
| Media | El resumen del segundo día no celebra la palabra que costó ayer | Pendiente |
| Baja | "nǐhǎo" no marca el cambio de tercer tono que se oye | Pendiente. Hoy solo se marca el de 一 y 不 |
| Baja | 儿 se glosa como "hijo" | Pendiente. Es contenido que se corrige en el editor |
| Baja | "Has aprendido 10 palabras" tras una sola vez | Hecho. "Hoy has conocido 10 palabras" |

Además, la palabra del día sale de las listas que se estudian, con preferencia por una palabra en aprendizaje.

## Pendiente para otro trabajo

- **Frases de ejemplo por palabra.** Hace falta un campo en el editor y contenido revisado. Es la mejora de mayor efecto que queda.
- **Recordatorios.** Hacen falta notificaciones de la PWA, con permiso del alumno.
- **Registro de repasos.** Hace falta para medir la retención y decidir sobre FSRS.
- **Modelo de componentes y confusiones.** Los datos saldrían de Make Me a Hanzi y Unihan, con la licencia por decidir.
- **Entrada para quien ya sabe algo.** "Ya la conozco" por lista.
