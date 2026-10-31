# 加油: estrategia de aprendizaje y nuevos modos

Fecha: 24 de octubre de 2026. Este documento parte de lo que la app ya hace (repaso espaciado en `progressStore.ts`, escritura con hanzi-writer en `Trazos.tsx`, 617 caracteres HSK 1-3 con glosa y palabra de ejemplo) y de la investigación previa en `docs/research/feature-ideas.md`. No repite lo que allí se decidió (audio, categorías, ocho momentos de recompensa, rangos, duelo por enlace); lo usa como base. Todos los caracteres que se citan se han comprobado contra `src/data/hsk1-3.json`. Donde un carácter que haría falta no está en la lista se dice, porque condiciona el diseño.

El prototipo visual está en `docs/vision/prototype.html` y las reglas de dibujo (sprites, paleta, animaciones, accesibilidad) en `docs/vision/art-direction.md`.

## 1. Cómo se aprenden bien los caracteres

Seis cosas que la investigación sostiene y que deciden el diseño de cada modo. Las referencias de este apartado son las clásicas de cada tema y se citan sin enlace; las fuentes históricas del apartado 4 sí están enlazadas y comprobadas.

Recuperar vale más que releer. Intentar recordar un carácter (ver la glosa y producir el carácter, o verlo y producir el significado) fija más que volver a mirarlo. Roediger y Karpicke (2006) midieron en torno a un 56 % de retención a la semana con pruebas frente a un 40 % con relectura. La app ya lo hace en Entrenamiento (recordar, destapar, calificar). La regla para todo modo nuevo es que si el usuario no produce nada de memoria, no es un repaso.

Espaciar. Cepeda y otros (2006, metaanálisis de 254 estudios) confirman que el mismo número de repasos repartidos en días rinde más que juntos. `schedule()` ya aplica intervalos 1, 3, luego por facilidad; `practice()` protege el calendario de los atracones. La regla es que ningún modo nuevo llama a `grade()` si el carácter no está `isDue()`. Esa línea ya existe en `Trazos.tsx` y se copia tal cual.

Escribir a mano fija la forma. Guan, Liu, Chan, Ye y Perfetti (2011) encontraron que estudiantes de chino como lengua extranjera que escribían a mano reconocían mejor la forma de los caracteres que los que solo los tecleaban. Escribir obliga a mirar cada trazo. La app ya tiene Calcar y De memoria; los duelos y la historia reutilizan ese mismo lienzo.

Componentes y radicales son el alfabeto. Shen y Ke (2007) siguieron a estudiantes universitarios y vieron que el conocimiento de los radicales crece con el nivel y predice cuántos caracteres se reconocen. De los 617 caracteres, 36 llevan el radical 口, 26 el radical 人, 23 木, 20 心, 19 言, 16 水 y 16 手. Y hay series fonéticas completas dentro de la lista: 青 aparece en 请 清 晴 睛 情 (las cinco están en HSK 1-3); 马 en 妈 吗; 门 en 们 问 间 闻. Enseñar eso de forma explícita convierte cada carácter nuevo en una combinación de piezas conocidas.

Historias y mnemotecnia, con cuidado. Kuo y Hooper (2004) compararon formas de aprender caracteres y las mnemotecnias generadas por el propio estudiante superaron a las dadas y a la traducción simple. Pero la mayoría de los caracteres son fonosemánticos (una parte da el sentido y otra el sonido), no dibujos. La regla es contar la etimología real solo donde es real (日 月 山 水 人 口 大 小 上 下 火 鸟 鱼 马 目 手 son pictogramas o indicadores reconocidos); todo lo demás se marca como "truco para recordar", no como historia del carácter.

Mezclar e integrar en palabras. Rohrer y Taylor (2007) mostraron que intercalar tipos de problema rinde más en la prueba final que bloquearlos, aunque parezca más difícil durante el estudio. Y un carácter suelto es poco útil; la app ya tiene 549 palabras de ejemplo con glosa. La regla es que cada modo mezcla reconocer, escribir y leer en palabra, y usa las palabras de ejemplo como texto mínimo con sentido.

## 2. El ciclo diario

Hoy la portada propone una cosa (la cola del día). La propuesta es que siga siendo así y que los modos nuevos se cuelguen de ese ciclo, nunca en paralelo. Entre 8 y 15 minutos.

1. Repaso del día (lo que ya existe). Vencidos primero, nuevos después, 20 tarjetas. Los caracteres con `canWrite()` vuelven como tarjetas de escritura. Es el único sitio que introduce caracteres nuevos salvo la historia (apartado 4).
2. Escritura de los débiles. Los `isWeak()` de la sesión (fallados y con intervalo menor de 7) se escriben una vez De memoria. Ya existe el atajo en el resumen; pasa a ser el paso dos del ciclo, no un botón opcional.
3. Misterio del día (apartado 6.1). Un minuto. Formar una palabra de ejemplo con caracteres ya vistos.
4. Un extra a elegir, cinco minutos. Un duelo, una escena de historia o una sesión de alquimia. Todos repasan con `practice()` salvo lo que esté vencido.

Mochi, el compañero, está presente en los cuatro pasos y cierra el día con su reacción al objetivo cumplido (anillo ensō, ya especificado en feature-ideas 4.7).

Lo que no cambia: `NEW_PER_DAY = 10`, `DAILY_GOAL = 20`, el dominio a 21 días. Los modos nuevos no tocan esas constantes.

## 3. Mochi, el compañero

### Quién es

Mochi (墨池, mòchí, la poza del tintero donde se mezcla la tinta) es una gota de tinta viva que nació en el tintero del usuario el día que escribió su primer carácter. Es redonda, de tinta `--ink` con brillos de papel, ojos grandes y mejillas rosadas. Es curiosa y un poco torpe, se asoma a los caracteres, se mancha, se emociona con las montañas (山 es su carácter favorito). No regaña nunca. Cuando el usuario falla, Mochi mira el carácter, no al usuario.

Decisión sobre feature-ideas 5. Aquel documento proponía un sello personal en lugar de una mascota. El dueño pide ahora una criatura. Para no tener dos sistemas de progreso, los rangos de caligrafía de aquel documento pasan a ser las formas de Mochi. El sello sobrevive como objeto que Mochi lleva en su última forma y estampa en los momentos de recompensa.

### Formas, ligadas a caracteres dominados

El dominio es `isMastered()` (intervalo de 21 días o más). Solo eso hace crecer a Mochi. No crece por sesiones, toques ni tiempo en la app.

| Forma | Nombre | Dominados | Qué cambia en el sprite |
| --- | --- | --- | --- |
| 1 | 墨点 Gota | 0 | Gota de tinta de 12 px, ojos y mejillas |
| 2 | 墨童 Aprendiz | 25 | 16 px, brazos cortos, pincel con mango dorado |
| 3 | 书生 Estudiante | 100 | 20 px, gorro de letrado con cuenta de jade, rollo bajo el brazo |
| 4 | 秀才 Letrado | 300 | 24 px, mangas largas, medallón de sello rojo, rollo flotante |
| 5 | 翰林 Académico | 617 | 28 px, gorro alto con oro, sello en la mano, aureola de gotas de tinta |

25 dominados llega hacia la tercera o cuarta semana de uso constante (hay que pasar un intervalo de 21 días). Eso está bien, porque la primera evolución coincide con el momento en que más gente abandona. 100 llega hacia el tercer mes, 300 en torno al sexto. 617 es el final del HSK 3 y tarda lo que tarde.

La racha no cambia la forma. Da accesorios, que Mochi conserva aunque la racha se rompa (lo que se ganó se ganó):

| Racha | Accesorio |
| --- | --- |
| 7 días | Farolillo de papel (el mismo del hito de racha de feature-ideas 4.8) |
| 30 días | Bufanda roja |
| 100 días | Cuenta de jade colgando del pincel |
| 365 días | Sello dorado con el nombre del usuario |

### Cómo reacciona en cada pantalla

En Home, Mochi está sentada junto al anillo del día. Respira (sube y baja un píxel cada dos segundos), parpadea a intervalos irregulares, y mira al botón principal cuando hay tarjetas vencidas. Si el objetivo está cumplido, duerme sobre el anillo cerrado.

En Entrenamiento, Mochi es pequeña (16 px escalados) en la esquina inferior, para no competir con la tarjeta. Con "Bien", asiente. Con "Difícil", ladea la cabeza. Con "Otra vez", se asoma al carácter y aparece una gota de sudor; a los tres "Otra vez" seguidos saca un rollo con el radical del carácter marcado en dorado. Nada de esto suena ni interrumpe; dura menos de 400 ms.

En Escribir, Mochi observa el pincel: su mirada sigue el dedo (dos frames, ojos a la izquierda o a la derecha según dónde esté el trazo). Un trazo correcto, nada. Un error, Mochi se sobresalta un píxel con la sacudida de la cuadrícula que ya existe. Cero errores De memoria, salta dos veces y suelta tres gotas de tinta (es el momento 4 de feature-ideas, ya diseñado; Mochi se suma a él, no lo sustituye).

Cuando un carácter pasa a dominado (momento 6 de feature-ideas), Mochi lo estampa con su sello en la cuadrícula del nivel. Si con ese carácter se alcanza un umbral de forma, hay evolución: fundido a blanco de papel, salpicadura de tinta, la nueva forma aparece y Mochi se mira las manos nuevas. Es la única animación larga (unos 2,5 s) y ocurre cuatro veces en toda la vida del usuario.

Vuelta tras una pausa. Si han pasado tres días o más sin repasar, Mochi está dormida bajo una manta de papel con tres "z" en píxeles. Al tocarla, se despierta, se estira y dice "Te esperaba. Hoy hay N vencidos, vamos poco a poco". No pierde forma ni accesorios. Para detectar la pausa hace falta guardar `lastActiveDay` en `DailyLog`, que hoy no existe (`currentDaily()` descarta la racha anterior sin recordar la fecha). Ver el apartado de datos.

### Datos y construcción

Todo lo que Mochi necesita ya está en `progressStore`, salvo dos campos:

- Forma: cuenta de `isMastered()` sobre los 617.
- Reacciones: eventos ya existentes (`grade`, `recordStrokes`, `onMistake`, `onComplete`).
- Accesorios: `daily.streak` más un `longestStreak` nuevo, porque un accesorio ganado no debe perderse al romper la racha.
- Pausa: `lastActiveDay` nuevo.

Los sprites son cinco formas de 12 a 28 px definidas como arrays de strings con un mapa de caracteres a color (así los cambios de color por tema claro y oscuro son un mapa distinto, no sprites distintos). Renderizado en canvas con `imageSmoothingEnabled = false`, escala entera (`Math.floor(cssPx * devicePixelRatio / gridSize)`) y desplazamiento por píxeles enteros del sprite, nunca por transform fraccionario. Un único bucle `requestAnimationFrame` compartido con las demás animaciones, que se detiene con `prefers-reduced-motion`.

Esfuerzo M. Sin dependencias. Sin coste.

MVP: forma 1 y 2, respiración y parpadeo, reacciones a "Bien" y "Otra vez", evolución a los 25 dominados. Las formas 3 a 5 pueden llegar después, porque ningún usuario las alcanza antes de tres meses.

## 4. Modo historia: la escritura china en ocho capítulos

### Para qué sirve

Dos propósitos de aprendizaje. Primero, dar contexto a los caracteres más antiguos (que son los pictogramas, los que más se parecen a un dibujo) en el momento en que se introducen. Segundo, ser la vía de entrada de palabras y frases cortas: cada escena tiene dos o tres líneas en español con los caracteres objetivo dentro, y una línea en chino de dos a cuatro caracteres que el usuario ya puede leer. Es la primera lectura real de la app.

También enseña historia, pero esa es la recompensa, no el objetivo que mide la app.

### Cómo se juega

Un capítulo tiene de tres a cinco escenas. Cada escena es una ilustración en píxel art, un cuadro de diálogo con texto en español (de 40 a 80 palabras) y entre uno y tres caracteres objetivo resaltados en rojo sello. Tocar un carácter abre su tarjeta pequeña (pinyin, glosa, palabra de ejemplo, audio). La escena termina con una micro-prueba: ver la glosa y elegir el carácter entre tres, o calcar el carácter si es la primera vez que se ve.

Al final del capítulo, una "página de pergamino" con los caracteres del capítulo escritos en WenKai, el texto en chino de las escenas, y la fecha o periodo. Mochi aparece vestida con algún detalle de la época (un gorro de funcionario Qin, un sombrero de viajero de la ruta de la seda), solo en esa página.

### Cómo encaja con el repaso espaciado

La historia es la segunda vía para introducir caracteres nuevos, junto a la cola del día. Un carácter nuevo visto en una escena se marca como introducido en el momento de la micro-prueba, con `grade(char, 'good')` si acierta, igual que hace hoy la tarjeta "Lo tengo". Eso consume `NEW_PER_DAY` y hace que el carácter vuelva mañana en la cola normal. Un capítulo no introduce más de cinco nuevos por sesión; si el cupo diario está gastado, la escena se lee igual pero los caracteres quedan "para mañana" y el capítulo no se da por terminado hasta que se introduzcan.

Un carácter ya visto que aparece en una escena se repasa con `practice()` en la micro-prueba. La lectura de la escena no cuenta como repaso (no se produce nada de memoria).

El capítulo siguiente se abre cuando el anterior está terminado y al menos el 70 % de sus caracteres tiene `interval >= 3` (dos aciertos). Así el modo no corre por delante de la memoria.

### Los capítulos

Cada capítulo tiene su lista de caracteres comprobada contra los datos, con el nivel HSK entre paréntesis. Las notas de rigor dicen dónde se simplifica.

1. Cangjie y las huellas de los pájaros. Leyenda. Cangjie, escriba del Emperador Amarillo, ve huellas de pájaros en la nieve y entiende que una marca puede significar una cosa. Caracteres: 人(1) 口(3) 日(2) 月(1) 山(3) 水(1) 大(1) 小(1) 上(1) 下(1) 天(1) 火(2). Escenas: las huellas, el sol y la luna, la montaña y el agua, la persona grande y la pequeña. Sobre el rigor, Cangjie es un personaje legendario, no histórico. El Xunzi (siglo III a.C.) lo cita como uno de muchos que escribían y el único cuyo nombre quedó; el prefacio del Shuowen Jiezi (año 100) es el que cuenta que vio huellas de pezuñas y garras y creó los caracteres. Los cuatro ojos son iconografía de estelas y grabados posteriores, no parte de la historia original. La nieve es un añadido nuestro para la ilustración. La escena lo dice así: "Cuentan que...". 木 no está en la lista HSK 1-3, así que el árbol no aparece como carácter en este capítulo aunque sea uno de los pictogramas clásicos; se usa 树 en el capítulo 6 con la advertencia de que no es un pictograma.

2. Los huesos que hablan. Shang tardío, hacia 1250 a 1046 a.C., Anyang. Los adivinos del rey escriben preguntas en caparazones de tortuga y omóplatos de buey, los calientan y leen las grietas. Caracteres: 天(1) 雨(1) 年(1) 牛(2) 羊(2) 马(3) 鱼(2) 问(2) 月(1) 星(1) 今(1) 明(1) 雪(2) 风(3). Escenas: la pregunta "¿lloverá hoy?" (今日雨), el sacrificio de bueyes y ovejas, el rey de caza, la cosecha del año. Sobre el rigor, 王 (rey) y 田 (campo) no están en la lista, así que "el rey" queda en español. 电 y 风 en los huesos tenían formas muy distintas de las actuales (电 era 申, el rayo); el capítulo muestra la forma antigua del carácter junto a la moderna solo para 日 月 雨 牛 羊 马 鱼, cuyos dibujos oraculares se reconocen bien. Las inscripciones se reconocieron como escritura en 1899 (Wang Yirong); la historia de que las encontró en un remedio de farmacia es una anécdota sin confirmar y la escena no la cuenta como hecho. Luo Zhenyu localizó el yacimiento de Anyang en 1908 y las excavaciones de la Academia Sinica empezaron en 1928.

3. Un solo país, una sola escritura. Qin, 221 a.C. El primer emperador unifica los reinos y ese mismo año ordena unificar pesos, medidas, ejes de carro y escritura; su canciller Li Si sistematiza el sello pequeño (小篆) eliminando variantes. Caracteres: 国(1) 字(1) 书(1) 写(1) 文(3) 车(1) 路(2) 同(1) 长(2) 城(3) 一(1) 百(2) 千(2) 万(3) 法(3). La frase 车同轨，书同文字 del Shiji ("carros con el mismo eje, escritos con los mismos caracteres") se muestra con 车 同 书 文 en tinta y el resto en gris. Sobre el rigor, 皇 帝 秦 no están en la lista, el emperador se nombra en español. Al mismo tiempo que el sello pequeño se extendía la escritura de los escribas (隶书), más rápida, de la que desciende la escritura actual; la tradición hace al sello pequeño su antecesor y algunos estudiosos lo discuten, así que el capítulo dice "al mismo tiempo" y no "de ahí salió". La Gran Muralla Qin unió muros anteriores; la que se visita hoy es sobre todo Ming (siglos XIV a XVII).

4. Papel y pincel. Han, año 105. Cai Lun presenta al emperador un papel hecho de corteza, cáñamo y redes viejas. Caracteres: 纸(2) 笔(2) 画(3) 读(1) 学(1) 书(1) 字(1) 写(1) 本(1) 黑(2) 白(2). Escenas: antes del papel (bambú y seda), la receta de Cai Lun, el pincel y la tinta negra sobre el papel blanco (黑 白), el primer libro (书本). Sobre el rigor, existe papel anterior a Cai Lun (fragmentos del siglo II a.C., como el mapa de Fangmatan); Cai Lun mejoró el proceso y lo hizo barato. 墨 (tinta) e 印 no están en la lista. Este capítulo presenta la cuadrícula 米字格 como objeto histórico: los calígrafos la usan para aprender proporciones, y es la misma que la app dibuja.

5. La ruta de la seda. Han a Tang, siglos II a.C. a IX. Un mercader sale de Chang'an hacia el oeste con seda y vuelve con caballos. Caracteres: 路(2) 马(3) 茶(1) 西(1) 东(1) 钱(1) 买(1) 卖(2) 城(3) 远(2) 走(2) 船(3) 客(1) 店(1) 商(1). Escenas: comprar y vender (买 卖, y el truco de recordar que 卖 es 买 con algo encima: vender es comprar con un sombrero), la posada (客店), el camino largo (路远), el barco en la ruta del sur. Sobre el rigor, 丝 (seda) y 海 (mar) no están en la lista. El nombre "ruta de la seda" se atribuye al geógrafo Ferdinand von Richthofen (1877), aunque un artículo de 2019 encuentra usos anteriores, así que la escena dice "el nombre lo popularizó un geógrafo alemán en el siglo XIX" y no "lo inventó". Eran muchas rutas, por tierra y por mar; las marítimas crecieron sobre todo con Tang, Song y Yuan. El comercio de té por caballos (la ruta del té y los caballos, entre Yunnan, Sichuan y el Tíbet) es de Tang y Song; la escena del té se sitúa en Tang y dice que es otra ruta, no la del oeste.

6. Una noche en Chang'an. Tang, siglo VIII. Li Bai mira la luna desde su cama y piensa en su tierra. Caracteres: 床(2) 前(1) 明(1) 月(1) 是(1) 地(3) 上(1) 头(3) 望(2) 思(2) 故(3) 春(3) 花(3) 酒(3). Escena central: el poema 静夜思 con los caracteres de la lista en tinta y los que no están (光 疑 霜 举 低 乡) en gris claro, y la traducción línea a línea. El usuario lee de verdad 床前明月 y 望明月, que son dos tercios del poema. Sobre el rigor, la versión que se recita hoy (床前明月光 ... 举头望明月) no es la de las ediciones antiguas. Las ediciones Song y el Quan Tangshi dicen 床前看月光 y 举头望山月; la lectura 明月 aparece a mediados de Ming en la antología de Li Panlong según el cotejo de Morise Juzo (otra fuente la sitúa ya en Qing, en Shen Deqian) y se extendió con el 唐诗三百首 (Qing). La escena muestra la versión popular y una nota con la antigua. 地 está glosada en la app como partícula (慢慢地); aquí es "suelo" (地上) y la escena lo aclara con esa segunda lectura. 诗 (poema) no está en la lista. Que el poema se escribiera en Chang'an es una licencia: no se sabe dónde lo compuso.

7. Mil caracteres de barro. Song, entre 1041 y 1048. Bi Sheng talla caracteres sueltos en arcilla cocida y los ordena en una bandeja de hierro para imprimir, según cuenta Shen Kuo en el Mengxi Bitan, la única fuente que existe sobre él. Caracteres: 字(1) 书(1) 块(1) 千(2) 万(3) 百(2) 第(2) 报(2) 纸(2) 店(1) 钱(1) 新(2). Escenas: el taller de bloques de madera, la idea de Bi Sheng (un 块 por carácter), ordenar los tipos (第一, 第二), la librería (书店) y el periódico (报纸). Sobre el rigor, la impresión con planchas de madera era anterior (el Sutra del Diamante de 868, hoy en la British Library, es el libro impreso completo con fecha más antiguo que se conserva; hubo impresos anteriores sin fecha) y siguió siendo la dominante en China; los tipos móviles nunca la sustituyeron, porque con miles de caracteres distintos salía más caro. Gutenberg (hacia 1450) lo desarrolló por separado. 印 no está en la lista. Que Bi Sheng fuera un artesano sin rango es lo que dice Shen Kuo (布衣); nada más se sabe de su vida.

8. Caracteres nuevos para todos. 1956. El Consejo de Estado publica el Esquema de simplificación de caracteres para que más gente aprenda a leer. Caracteres: 马(3) 门(2) 车(1) 书(1) 国(1) 学(1) 东(1) 见(1) 写(1) 电(1) 话(1) 飞(1) 机(1) 长(2) 时(1) 间(2) 汉(1) 语(1). Este capítulo usa el campo `traditional` que ya existe en los datos (310 de los 617 caracteres cambian): cada escena muestra la pareja 馬→马, 門→门, 車→车, 書→书, 國→国 y pregunta cuál es la simplificada. Explica por qué la app enseña 马 y el hueso oracular mostraba un caballo con crines. Sobre el rigor, el esquema es de 1956 (borrador de 1955), la Tabla general de 1964, un segundo esquema de 1977 fue retirado en 1986 y ese mismo año se publicó la tabla definitiva, casi idéntica a la de 1964. Taiwán, Hong Kong y Macao siguen con los tradicionales. Muchas formas simplificadas vienen de la escritura cursiva (草书) o de variantes populares anteriores, no se inventaron de cero; la escena lo dice con 马 y 门, cuyas formas simplificadas ya se escribían a mano siglos antes.

Capítulos posibles después: Confucio y los clásicos (HSK tiene 老 师 学 生), la invención de la brújula y la pólvora (Song), Zheng He y los barcos del tesoro (Ming, 船 海 falta).

### Fuentes consultadas para los capítulos

Consultadas el 24 de octubre de 2026. Donde solo hay fuente secundaria se dice.

- Capítulo 1. Prefacio del Shuowen Jiezi y versiones Han de la leyenda, resumidas en [Wikipedia, Cangjie](https://en.wikipedia.org/wiki/Cangjie); inscripción de la estela de Cangjie con los cuatro ojos en unos [apuntes de Stanford](https://web.stanford.edu/class/chingen73n/lecture5_files/v3_slide0033.htm). La cita del Xunzi, capítulo Jiebi, es "故好書者眾矣，而倉頡獨傳者，壹也" ("muchos amaban la escritura, pero solo Cangjie fue transmitido, por su constancia"), comprobada en [Wikisource](https://zh.wikisource.org/wiki/%E8%8D%80%E5%AD%90/%E8%A7%A3%E8%94%BD%E7%AF%87). El Xunzi no habla de huellas ni de invención; esa parte es del Shuowen.
- Capítulo 2. Fechas 1250 a 1046 a.C., reconocimiento de 1899, Luo Zhenyu en 1908 y excavaciones de 1928 en [World History Encyclopedia, Oracle Bones](https://www.worldhistory.org/Oracle_Bones/) y [Wikipedia, Oracle bone](https://en.wikipedia.org/wiki/Oracle_bone), que califica de leyenda la anécdota de la farmacia.
- Capítulo 3. Papel de Li Si y la discusión sobre el origen de la escritura de escribas en [Wikipedia, Small seal script](https://en.wikipedia.org/wiki/Small_seal_script). La frase está en el Shiji, capítulo 6 (Anales de Qin Shi Huang), en el año 26 del reinado (221 a.C.): "一法度衡石丈尺。車同軌。書同文字。", comprobada en [Wikisource](https://zh.wikisource.org/wiki/%E5%8F%B2%E8%A8%98/%E5%8D%B7006). Por eso la escena fecha el decreto en 221 a.C. y no en 220.
- Capítulo 4. Fragmento de Fangmatan (179 a 141 a.C.), hallazgos de Dunhuang y Yumen, y el papel de Cai Lun como mejora y no invención en [Wikipedia, History of paper](https://en.wikipedia.org/wiki/History_of_paper) y [Wikipedia, Fangmatan](https://en.wikipedia.org/wiki/Fangmatan).
- Capítulo 5. Atribución a Richthofen en [World History Encyclopedia, Silk Road](https://www.worldhistory.org/Silk_Road/); la objeción documentada en [Mertens, "Did Richthofen Really Coin the Silk Road?", The Silk Road 17 (2019)](https://edspace.american.edu/silkroadjournal/wp-content/uploads/sites/984/2020/02/2-Mertens-Did-Richthofen-Really-Coin-the-Silk-Road.pdf). La ruta del té y los caballos no se verificó en fuente primaria; es conocimiento general y la escena la trata como contexto, no como dato central.
- Capítulo 6. Variantes del poema y su cronología en dos artículos de [chinawriter.com.cn (2020, Fan Ziye)](https://www.chinawriter.com.cn/n1/2020/1116/c404064-31932366.html) y [chinawriter.com.cn (2023, Chen Shangjun, sobre el cotejo de 38 versiones de Morise Juzo)](https://www.chinawriter.com.cn/n1/2023/0828/c442005-40064843.html). Son fuentes secundarias que citan las ediciones; no se consultaron las ediciones.
- Capítulo 7. Mengxi Bitan como única fuente, fechas 1041 a 1048 y arcilla cocida en [Wikipedia, Bi Sheng](https://en.wikipedia.org/wiki/Bi_Sheng). El Sutra del Diamante (British Library Or.8210/P.2) lleva colofón del 11 de mayo de 868 y se encontró en las cuevas de Mogao, Dunhuang, en 1900; la British Library lo describe como el libro impreso completo con fecha más antiguo que se conserva, no como el primer impreso ([Bodleian, Cabinet](https://www.cabinet.ox.ac.uk/worlds-earliest-dated-printed-book-diamond-sutra-868-ce), [History of Information](https://historyofinformation.com/detail.php?id=207)). La escena usa esa formulación exacta.
- Capítulo 8. Esquema de 1956, tabla de 1964, segundo esquema de 1977 retirado en 1986 y tabla final en [Wikipedia, Chinese Character Simplification Scheme](https://en.wikipedia.org/wiki/Chinese_Character_Simplification_Scheme) y [Wikipedia, General List of Simplified Chinese Characters](https://en.wikipedia.org/wiki/General_List_of_Simplified_Chinese_Characters).

Antes de publicar cualquier capítulo, una persona con formación en historia china debería leer el texto final. Este documento fija los hechos que el texto puede afirmar y los que debe presentar como leyenda o licencia.

### Qué hace falta

- Texto: 8 capítulos por 4 escenas por 60 palabras, unas 2.000 palabras de español, más 8 frases cortas en chino. Un día de escritura y una revisión de rigor histórico.
- Arte: una ilustración en píxel art por capítulo (fondo de 128 por 72 píxeles lógicos, escalado por 3 en 390 px de ancho), más Mochi con un detalle de época. El prototipo muestra la del capítulo 1.
- Código: un `story.json` con escenas, caracteres y micro-pruebas; una página `Historia.tsx` que reutiliza `Card`, `StrokeCanvas` y las funciones del `progressStore`; estado `story: { chapter, scene }` en `localStorage`.
- Nada de red. Unos 100 KB de JSON y PNG.

Esfuerzo L por el contenido, M por el código.

MVP: capítulos 1 y 2 (pictogramas y huesos, que son donde la historia más ayuda a recordar), sin ilustración animada, con la micro-prueba de elegir entre tres.

## 5. Duelos de tinta: magos que escriben

### Para qué sirve

Escritura de memoria bajo presión suave, con el significado del carácter delante. Un hechizo es un carácter, así que para lanzarlo hay que escribirlo bien, y para elegir cuál lanzar hay que saber qué significa (el agua apaga el fuego). Eso junta las dos cosas que más cuestan, producir la forma y asociarla al sentido, y las repite muchas veces en una sesión de cinco minutos sin que se note como repaso.

### Elementos con los caracteres que existen

El ciclo clásico de los cinco elementos (木火土金水) no se puede usar entero: 木, 土 y 金 no están en HSK 1-3. Se usa un anillo de cuatro con los caracteres que sí hay y que mantienen la lógica:

| Elemento | Carácter | Vence a | Por qué |
| --- | --- | --- | --- |
| Agua | 水 (1) | 火 | El agua apaga el fuego |
| Fuego | 火 (2) | 树 | El fuego quema el árbol |
| Árbol | 树 (3) | 山 | Las raíces parten la montaña |
| Montaña | 山 (3) | 水 | La montaña contiene el agua |

Un hechizo del elemento ganador hace el doble de daño; del perdedor, la mitad. Esto obliga a leer el elemento del enemigo (su carácter aparece en su pecho) y a recordar el significado del propio.

Alrededor del anillo, hechizos neutros que no tienen ventaja pero sí efecto, y que amplían el vocabulario de la naturaleza:

| Hechizo | Efecto |
| --- | --- |
| 电 (1) rayo | Daño rápido, el tiempo de escritura se reduce a la mitad |
| 风 (3) viento | Empuja: el enemigo pierde su siguiente turno si se escribe sin errores |
| 雨 (1) lluvia | Daño pequeño en dos turnos |
| 雪 (2) nieve | Congela: el enemigo tarda un turno más en atacar |
| 心 (3) corazón | Cura un tercio de la vida |
| 门 (2) puerta | Escudo que bloquea el siguiente golpe |
| 大 (1) / 小 (1) | Modificadores: se escriben antes de otro hechizo y lo agrandan o lo encogen (daño por 1,5 o coste por 0,5) |

Un jugador de HSK 1 tiene al principio 水 电 雨 大 小; el fuego llega con HSK 2 y el árbol, la montaña, el viento y el corazón con HSK 3. La baraja de hechizos de un usuario son los caracteres de esta tabla que tiene `canWrite()` (dos aciertos). No hay compras ni desbloqueos por puntos, porque un hechizo se gana aprendiendo el carácter.

### El turno

1. El enemigo muestra su elemento y anuncia su próximo ataque (su carácter en grande durante un segundo; leerlo es parte del juego).
2. El jugador elige hechizo de su baraja (de 3 a 7 botones con el carácter y, en los primeros niveles, la glosa debajo; a partir del nivel 3 solo el carácter).
3. Escribe el carácter en una cuadrícula 米字格 de 160 px con el mismo `StrokeCanvas` en modo `write`, sin guía, con un reloj de arena de 12 segundos (20 en el nivel 1).
4. Resultado. Con cero errores, hechizo a plena potencia con la animación completa (el carácter sale de la cuadrícula, se convierte en el elemento y golpea). Uno o dos errores, 70 % de daño y animación corta. Tres o más errores o tiempo agotado, el hechizo se deshace en humo y el enemigo ataca.
5. El enemigo ataca. El jugador puede bloquear reconociendo el significado: aparecen tres glosas en español y hay que tocar la del carácter del enemigo en dos segundos. Acierto, bloquea la mitad del daño.

Una partida son de 4 a 8 turnos, unos tres minutos.

### Enemigos

Criaturas de píxel art de 24 px cuyo nombre es una palabra real o casi real con caracteres de la lista, para que el nombre también enseñe:

| Orden | Enemigo | Elemento | Vida | Lo que enseña |
| --- | --- | --- | --- | --- |
| 1 | 雨猫, el gato de la lluvia | 雨 (neutro, para aprender sin contraataque) | 30 | 猫(1) 雨(1) |
| 2 | 火猫, el gato de fuego | 火 | 40 | Primer uso del anillo: 水 lo apaga |
| 3 | 山羊, la cabra de la montaña (山羊 es "cabra" de verdad) | 山 | 50 | 树 contra 山; 羊(2) |
| 4 | 风鸟, el pájaro del viento | 风 | 50 | Bloqueo de significado más rápido |
| 5 | 雪鱼, el pez de nieve | 雪 y 水 | 60 | Congela; hay que gestionar turnos |
| 6 | 火马, el caballo de fuego | 火 | 70 | Dos ataques por turno |
| 7 | 老树, el árbol viejo | 树 | 90 | Cura; obliga a 火 repetido |
| 8 | 书生, el estudiante sombrío | Sin elemento | 100 | Sus hechizos son los caracteres `isWeak()` del jugador |

El jefe es el punto de diseño más importante: el estudiante sombrío lanza los caracteres que el usuario ha fallado más, y para bloquearlos hay que reconocerlos y para derrotarlo hay que escribirlos. Pierde quien no repasa sus débiles. Se puede repetir cada día con los débiles de ese día.

La curva de dificultad es que la vida sube, el tiempo de escritura baja de 20 a 10 segundos, la tolerancia del quiz (`leniency` de hanzi-writer, hoy 1,1) baja a 1,0 en los niveles 5 a 8, y las glosas bajo los hechizos desaparecen. No hay números de nivel del jugador, porque la fuerza del jugador es su baraja, y la baraja es lo que sabe escribir.

### Cómo encaja con el repaso espaciado

- Cada hechizo escrito llama a `recordStrokes(char, mistakes)` (sube `strokeRuns`, mejora `strokeBest`).
- Si el carácter está `isDue()`, además `grade(char, memoryGrade(mistakes))`, con la misma función de `Trazos.tsx` (0 errores bien, 1 o 2 difícil, 3 o más otra vez). Si no, `practice(char, mistakes <= 2)`.
- El bloqueo por significado (elegir entre tres) solo llama a `practice()`. Reconocer entre tres opciones es más fácil que recordar y no debe mover intervalos aunque el carácter esté vencido.
- Un duelo nunca introduce caracteres nuevos. Los enemigos con caracteres que el usuario no ha visto (por ejemplo 猫 en HSK 1 recién empezado) muestran el nombre en español hasta que el carácter entre por la cola del día.
- Límite: un carácter no se puede lanzar más de dos veces por duelo, para que no se gane repitiendo 水.

### Dos jugadores

En el orden que recomendó feature-ideas 5, sin servidor:

1. Pásame el móvil. Los dos se enfrentan en el mismo teléfono por turnos. Cada uno tiene su propia baraja si hay dos perfiles, o la misma si no. Un turno es escribir el hechizo; el otro jugador no mira. Funciona offline del todo.
2. Reto por enlace con semilla. `?duelo=semilla&nivel=4`: los dos juegan contra la misma secuencia de enemigos con los mismos ataques, y se devuelven el enlace con la puntuación (daño total, errores, tiempo). Web Share para enviarlo. Ya estaba diseñado; aquí solo cambia el contenido del reto.
3. En directo por WebRTC (Trystero) después, si lo anterior se usa.

### Qué hace falta

- `spells.json` con los 12 hechizos (carácter, elemento, efecto, nivel) y `enemies.json` con los 8 enemigos.
- Sprites: 8 enemigos de 24 px con dos frames (reposo, golpe), el mago del jugador, 5 efectos de elemento (bola de fuego, chorro de agua, hoja, roca, rayo) de 8 a 12 px con 3 o 4 frames. Unas 30 piezas de píxel art pequeñas.
- Página `Duelo.tsx` con máquina de estados (elegir, escribir, resolver, enemigo, bloquear), reutilizando `StrokeCanvas` y las reglas de `progressStore`.
- Efectos: sacudida de pantalla (transform en el contenedor, 6 frames), partículas en canvas, número de daño en WenKai que sube y se desvanece. Todo con el bucle compartido de Mochi.
- Sonido opcional, con el interruptor de ajustes que feature-ideas 4 ya proponía.

Esfuerzo M para el modo solo, S más para pásame el móvil y reto por enlace, L para el directo.

MVP: cuatro enemigos (雨猫, 火猫, 山羊, 书生), el anillo de cuatro elementos más 电 y 心, sin modificadores, sin bloqueo por significado (el enemigo simplemente ataca). Un solo jugador. Eso ya prueba si escribir bajo tiempo engancha.

## 6. Otros modos

### 6.1 Misterio del día

Un minuto al día. La app toma una palabra de ejemplo de los datos (de las 549, elige una cuyos caracteres estén todos vistos) y muestra la glosa en español más los caracteres desordenados mezclados con dos distractores de la misma categoría. Hay que tocarlos en orden. Ejemplo: "cumpleaños", piezas 日 生 月 人, respuesta 生日. Al acertar, suena la palabra y se ve el pinyin con tonos.

Sirve para pasar del carácter a la palabra, que es donde el chino real empieza. Cuenta como `practice()` de cada carácter de la palabra. Una variante semanal da una frase de tres o cuatro palabras de ejemplo encadenadas.

Esfuerzo S. Solo datos existentes. Es el modo con mejor relación valor y esfuerzo del documento.

### 6.2 Alquimia de radicales

Una mesa de laboratorio con piezas (componentes) que se arrastran a un caldero. Dos piezas correctas forman un carácter que se revela con la animación de trazos. Tres familias para empezar, todas comprobadas en los datos:

- Series fonéticas: 青 da 请 清 晴 睛 情 (las cinco en HSK 1-3; el componente de la izquierda da el sentido: 讠 hablar, 氵 agua, 日 sol, 目 ojo, 忄 corazón). Es la lección más útil del chino en una sola pantalla: el mismo sonido qing, cinco sentidos.
- 马 da 妈 (女 + 马, mamá) y 吗 (口 + 马, partícula de pregunta). 门 da 们 问 间 闻.
- Compuestos de sentido: 女 + 子 = 好, 日 + 月 = 明, 人 + 木 = 休 (木 no está en la lista, pero como pieza sí puede aparecer con su nombre), 人 + 人 = 从, 日 + 青 = 晴.

Cada combinación muestra una línea de qué aporta cada pieza y, para las fonéticas, dice claramente "青 da el sonido, no el sentido". Así el modo enseña a adivinar caracteres nuevos.

En el repaso, el carácter formado se repasa con `practice()` si ya está visto. Si no, la alquimia puede introducirlo con el cupo de `NEW_PER_DAY`, igual que la historia, porque un carácter aprendido por sus piezas se recuerda mejor que uno suelto.

Hace falta una tabla de descomposición. Make Me a Hanzi (`dictionary.txt`) la tiene para todos los caracteres, con la misma licencia de los datos de trazos que la app ya usa; hay que comprobarlo y generar un `components.json` solo con los 617 más sus piezas. Esfuerzo M.

### 6.3 El jardín de tinta

Un jardín en píxel art donde cada carácter dominado es una planta y cada radical una parcela. Las plantas de los caracteres vencidos se marchitan un poco (hojas que caen); tocar una abre su escritura De memoria, que si está vencida llama a `grade()`. Un carácter con `lapses` recientes aparece como un brote que hay que regar. No hay monedas ni compras, porque el jardín es el calendario de repasos dibujado.

Su valor es que hace visible el olvido, que es el concepto que la gente no entiende del repaso espaciado. El riesgo es convertirse en una lista de tareas con culpa. Se evita porque las plantas nunca mueren, solo se encogen, y Mochi riega ella sola las que lleven más de 60 días sin tocar (es decir, las excluye del jardín visible hasta que vuelvan a la cola).

Esfuerzo M. Mejor después de que Mochi y los duelos existan, porque usa los mismos sprites y bucle.

### 6.4 Dictado de tinta

Suena la palabra (con el audio pregenerado de feature-ideas 1) y hay que escribir el carácter sin verlo. Es el repaso más difícil posible, del sonido a la forma. Solo para caracteres con `strokeBest === 0`. Cuenta como `grade()` si está vencido. Esfuerzo S una vez exista el audio. Sin audio, no existe.

### 6.5 Caligrafía lenta

Sin puntuación. Un carácter grande, un pincel que deja tinta con el grosor según la velocidad del dedo (más lento, más tinta), un fondo de papel y la respiración de Mochi como metrónomo. Tres minutos. No cuenta para nada en el calendario. Valor de aprendizaje bajo y valor de hábito alto, porque es lo que abrir la app cuando no apetece repasar. Esfuerzo S.

## 7. Prioridad y orden de construcción

Valor de aprendizaje de 1 a 5 (cuánto repaso real genera y qué principio del apartado 1 cubre), esfuerzo en la escala S, M, L de feature-ideas.

| Modo | Valor | Esfuerzo | Principios que cubre | Depende de |
| --- | --- | --- | --- | --- |
| Misterio del día | 4 | S | Palabras, recuperación, mezcla | Nada |
| Mochi (MVP, formas 1 y 2) | 3 | M | Hábito, feedback sin castigo | `lastActiveDay`, `longestStreak` |
| Duelos (MVP solo) | 5 | M | Escritura de memoria, significado, débiles | `StrokeCanvas` tal cual |
| Alquimia de radicales | 5 | M | Componentes, series fonéticas | `components.json` |
| Historia (capítulos 1 y 2) | 4 | L | Mnemotecnia real, lectura mínima | Texto revisado |
| Duelos: pásame el móvil y enlace | 3 | S | Motivación social | Duelos MVP |
| Jardín de tinta | 3 | M | Visualiza el olvido | Mochi |
| Dictado de tinta | 4 | S | Sonido a forma | Audio (feature-ideas 1) |
| Historia (capítulos 3 a 8) | 3 | L | Lectura, tradicional frente a simplificado | Historia MVP |
| Mochi (formas 3 a 5, accesorios) | 2 | M | Hábito a largo plazo | Mochi MVP |
| Caligrafía lenta | 1 | S | Hábito | Nada |
| Duelo en directo (WebRTC) | 2 | L | Motivación social | Enlace con semilla |

Orden propuesto, en bloques de unas dos semanas cada uno:

1. Misterio del día y Mochi MVP. Dos modos pequeños que cambian la sensación diaria sin tocar el calendario. Se añaden los dos campos a `DailyLog`.
2. Duelos MVP. Es la apuesta grande del dueño y la que más escritura de memoria genera. Se mide una sola cosa, cuántas escrituras De memoria por día hace un usuario antes y después.
3. Alquimia de radicales con las tres familias. Si funciona, se amplían las series fonéticas a todas las de la lista.
4. Historia, capítulos 1 y 2, con la ilustración del prototipo. Mochi con gorro de época.
5. Pásame el móvil y reto por enlace para los duelos. Dictado si el audio ya existe.
6. Jardín, formas 3 a 5 de Mochi, capítulos 3 a 8. Para entonces hay usuarios con 100 dominados y datos de qué modos usan.

Lo que se mide en todo momento, con los datos locales que ya existen, son los repasos calificados por día (`daily.reviewed`), escrituras De memoria sin error (`strokeBest === 0`), caracteres dominados por semana y días seguidos (`streak`). Un modo que no mueve ninguna de esas cuatro cifras se quita, por bonito que sea.

## 8. Cambios de datos que hacen falta

Pequeños, todos en `progressStore.ts` y compatibles con lo guardado:

- `DailyLog.lastActiveDay: string` para detectar pausas (Mochi dormida) y `DailyLog.longestStreak: number` para que los accesorios no se pierdan.
- Un contador `masteredCount` derivado, no guardado, para la forma de Mochi.
- Estado de los modos en claves propias de `localStorage`: `jiayou-story`, `jiayou-duel`, `jiayou-garden`. Nunca dentro de `hsk-flashcards-stats`, para que borrar el progreso de un modo no toque el calendario.
- Tres ficheros JSON nuevos en `src/data/`: `spells.json`, `story.json`, `components.json`. Todos entran en el precache por `globPatterns`.

Ningún modo nuevo necesita red ni cuenta.
