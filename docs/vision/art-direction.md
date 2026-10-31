# 加油: dirección de arte en píxel

Reglas de dibujo y animación para Mochi, los duelos, las escenas de historia y las recompensas. Es el documento que sigue quien programe `prototype.html` y los modos de `strategy.md`, y quien dibuje sprites nuevos. Todo lo que aquí se fija tiene un motivo, que el píxel art se vea como parte de la app de papel de arroz y tinta, y no como un juego pegado encima.

## 1. Idea de estilo: sumi-e en píxeles

La app es papel claro, tinta, un rojo de sello, un verde jade y un dorado. El píxel art se somete a eso.

- El fondo de cualquier escena es papel, nunca un cielo azul. El cielo es papel; la noche es papel oscuro del tema oscuro.
- Las figuras de tinta (Mochi, el mago, las montañas) son siluetas sólidas de tinta con brillos del color del papel. Sin contorno negro alrededor de todo, que es el tic del píxel art genérico. El contorno se usa solo donde una forma clara toca otra clara.
- Pocos colores. Una escena usa como máximo 12 colores: la rampa de tinta (3 valores), papel (2 valores), un acento (sello o dorado) y los colores propios de la escena (nieve, fuego, agua).
- Las formas son redondas y gordas. Una cabeza ocupa al menos el 40 % de la altura del personaje. Ojos grandes, boca mínima, mejillas rosadas en los aliados; los enemigos no tienen mejillas.
- Nada brilla con degradados. Si algo brilla, son dos píxeles del color claro.

## 2. Paleta

Mapa de letras a color. Todos los sprites de este documento usan estas letras, así que un sprite es un array de strings y la paleta un objeto. El tema oscuro cambia el objeto, no los sprites.

| Letra | Nombre | Claro | Oscuro | Uso |
| --- | --- | --- | --- | --- |
| `.` | transparente | | | |
| `k` | tinta | `#1f1a17` | `#1f1a17` | Cuerpo de Mochi, mago, montañas cercanas |
| `K` | tinta clara | `#453b35` | `#5a4f48` | Sombra en tinta, gorros, montañas medias, ojo cerrado |
| `h` | brillo de tinta | `#6a5d55` | `#857870` | Dos píxeles de reflejo en la tinta |
| `w` | papel | `#f4efe6` | `#f0e9de` | Fondos, puños, piel del mago |
| `W` | blanco | `#ffffff` | `#ffffff` | Blanco del ojo |
| `R` | mejilla | `#e9a39b` | `#d98c86` | Mejillas de aliados |
| `r` | sello | `#be3428` | `#e25c4c` | Sello, insignias de enemigo, daño recibido |
| `g` | oro | `#b0843a` | `#d6ac62` | Mangos, bandas de gorro, recompensas |
| `G` | oro claro | `#dcbb73` | `#ead3a0` | Brillo del oro |
| `j` | jade | `#2c785a` | `#60b68e` | Hojas, fajín, vida del jugador |
| `J` | jade claro | `#7cbf9e` | `#9fd6bb` | Brillo de hoja |
| `t` | pergamino | `#d9c3a0` | `#c4ad88` | Rollos, madera clara |
| `n` | madera | `#7a5a3c` | `#8b6a4a` | Troncos, patas, mesa |
| `o` | fuego | `#e0742a` | `#f08a3e` | Fuego, gato de fuego |
| `y` | llama clara | `#f2c14e` | `#f6cf6c` | Centro del fuego, rayo |
| `b` | agua | `#3a7fb5` | `#5fa1d6` | Agua, lluvia, sudor |
| `B` | agua clara | `#9fd0ee` | `#bfe1f5` | Brillo del agua, hielo |
| `s` | nieve | `#e4ebee` | `#cfd8dd` | Nieve, aliento, niebla |
| `p` | sombra morada | `#5e4a7d` | `#7d69a0` | Enemigo final, humo de hechizo fallido |

Dos reglas de tema oscuro. La tinta `k` no se invierte: Mochi sigue siendo oscura. Para que se lea sobre el fondo oscuro (`--paper` oscuro es `#141110`), en tema oscuro todo sprite de tinta se dibuja con un borde de un píxel en `w` al 35 % de opacidad, y Mochi siempre se apoya en una superficie `--raised` (`#3e3730`), nunca directamente sobre el fondo. Los colores de tono (`--tone-1` a `--tone-5`) no se usan en píxel art, para que el pinyin siga siendo lo único coloreado por tono.

## 3. Render: píxeles enteros o nada

- Cada sprite tiene un tamaño lógico en píxeles (12, 16, 20, 24, 28). Se pinta en un canvas con `width = cssPx * devicePixelRatio`, `imageSmoothingEnabled = false` y la escala `Math.floor(canvas.width / tamañoLógico)`. El resto se reparte como margen. CSS `image-rendering: pixelated`.
- Movimientos por píxeles lógicos enteros. Un rebote es desplazar el sprite 1 o 2 píxeles lógicos, no `translateY(1.5px)`. Prohibido `transform: scale()` sobre un canvas de sprites: emborrona.
- Un solo bucle `requestAnimationFrame` para toda la pantalla, con tiempo acumulado; cada animación es un objeto con `update(dt)`. El bucle se para cuando no hay animaciones activas y bajo `prefers-reduced-motion`.
- Las partículas (gotas, chispas) se dibujan como cuadrados de 1 a 3 píxeles lógicos alineados a la rejilla. Partículas redondas antialiadas rompen el estilo.
- El texto dentro de escenas (números de daño, "5 seguidos") no es píxel art: usa WenKai o Fraunces como el resto de la app. El contraste entre tipografía fina y sprites gordos es parte de la identidad.

## 4. Mochi

Gota de tinta viva. Nombre por 墨池 (la poza del tintero). Cinco formas ligadas a caracteres dominados (ver `strategy.md`, apartado 3). Sin contorno, ojos de 2x2 con pupila abajo a la derecha, mejillas `R`, boca de un píxel marcada con `m` (se dibuja según el humor, ver 4.7).

### 4.1 Forma 1, 墨点 Gota, 12x12

```
.....k......
....kkk.....
...khkkk....
..khhkkkk...
.kkkkkkkkk..
.kkWWkWWkk..
.kkWkkWkkk..
kkkkkkkkkkk.
kRkkkmkkkRk.
.kkkkkkkkk..
..kkkkkkk...
...kkkkk....
```

Silueta: gota con punta arriba, más ancha que alta en la mitad inferior. Se dibuja a escala 8 en Home (96 px CSS) y a escala 5 en Entrenamiento (60 px).

### 4.2 Forma 2, 墨童 Aprendiz, 16x16

```
.......k........
......kkk.......
.....khkkk......
....khhkkkk.....
...kkkkkkkkk....
...kkkkkkkkk...G
..kkWWkkkWWkk..g
..kkWkkkkWkkk..g
..kkkkkkkkkkk..g
.kkRkkkmkkkRkkkk
.kkkkkkkkkkkkk.k
kkkkkkkkkkkkkkk.
.kkkkkkkkkkkkk..
..kkkkkkkkkkk...
...kkkkkkkkk....
....kkkkkkk.....
```

Gana un brazo derecho que sostiene un pincel vertical (mango `g`, extremo `G`, punta `k`). El pincel es el objeto que la identifica. En Escribir, la punta del pincel gotea un píxel `k` cada 3 segundos.

### 4.3 Forma 3, 书生 Estudiante, 20x20

```
......KKKKKKK.......
.....KKKKjKKKK......
.....KKKKKKKKK......
....ggggggggggg.....
....kkkkkkkkkkk.....
...kkhhkkkkkkkkk....
...kkhkkkkkkkkkk....
..kkkWWkkkkkWWkkk...
..kkkWkkkkkkWkkkk...
..kkkkkkkkkkkkkkk...
.kkkRkkkkmkkkkRkkkww
.kkkkkkkkkkkkkkkkktw
.kkkkkkkkkkkkkkkkktw
kkkkkkkkkkkkkkkkkktw
kkkkkkkkkkkkkkkkkktw
.kkkkkkkkkkkkkkkkkww
.kkkkkkkkkkkkkkkkk..
..kkkkkkkkkkkkkkk...
...kkkkkkkkkkkkk....
.....kkkkkkkkk......
```

Gorro de letrado en tinta clara `K` con una cuenta de jade y banda dorada; rollo de pergamino bajo el brazo derecho (columnas 18 y 19). El gorro es lo que separa la silueta de la forma 2 a tamaño pequeño.

### 4.4 Forma 4, 秀才 Letrado, 24x24

```
........KKKKKKKK........
.......KKKKKKKKKK.......
.......KKKKjKKKKK.......
.......KKKKKKKKKK.......
......ggggggggggggg.....
......kkkkkkkkkkkkk.....
.....kkhhkkkkkkkkkkk....
.....kkhkkkkkkkkkkkk....
....kkkkWWkkkkkkWWkkkk..
....kkkkWkkkkkkkWkkkkk..
....kkkkkkkkkkkkkkkkkk..
....kkkRkkkkkmkkkkkRkk..
.....kkkkkkkkkkkkkkkk...
.....kkkkkkkkkkkkkkkk...
...kkkkkkkkkkkkkkkkkkkk.
..kkkkkkkkkkrrkkkkkkkkk.
.kkkkkkkkkkkrrkkkkkkkkkk
.wwkkkkkkkkkkkkkkkkkkkww
..kkkkkkkkkkkkkkkkkkkk..
...kkkkkkkkkkkkkkkkkk...
...kkkkkkkkkkkkkkkkkk...
....kkkkkkkkkkkkkkkk....
.....kkkkkkkkkkkkkk.....
......kkkkkkkkkkkk......
```

Mangas anchas con puños de papel, medallón de sello `rr` en el pecho. Un rollo flotante de 4x6 (`wtt w` en vertical, igual que el de la forma 3) orbita a su izquierda y sube y baja 1 píxel en fase opuesta a la respiración.

### 4.5 Forma 5, 翰林 Académico, 28x28

```
...........KKKKKK...........
..........KKKKKKKK..........
..........KKGGGGKK..........
..........KKKKKKKK..........
.......KKKKKKKKKKKKKK.......
......gKKKKKKKKKKKKKKg......
......gggggggggggggggg......
.......kkkkkkkkkkkkkk.......
......kkhhkkkkkkkkkkkk......
......kkhkkkkkkkkkkkkk......
.....kkkkWWkkkkkkWWkkkk.....
.....kkkkWkkkkkkkWkkkkk.....
.....kkkkkkkkkkkkkkkkkk.....
.....kkkRkkkkkmkkkkkRkk.....
......kkkkkkkkkkkkkkkk......
......kkkkkkkkkkkkkkkk......
....kkkkkkkkkkkkkkkkkkkk....
...kkkkkkkkkkggkkkkkkkkkk...
..kkkkkkkkkkkkggkkkkkkkkkk..
.kkkkkkkkkkkkkggkkkkkkkkkkk.
.wwkkkkkkkkkkkkkkkkkkkkkrr..
.wwkkkkkkkkkkkkkkkkkkkkkrr..
..kkkkkkkkkkkkkkkkkkkkkkkk..
...kkkkkkkkggggggkkkkkkkk...
...kkkkkkkkkkkkkkkkkkkkkk...
....kkkkkkkkkkkkkkkkkkkk....
.....kkkkkkkkkkkkkkkkkk.....
.......kkkkkkkkkkkkkk.......
```

Gorro alto con alas doradas (el de los académicos Hanlin), botonadura y dobladillo de oro, el sello `rr` en la mano derecha. Alrededor, una aureola de 8 gotas de tinta de 1 píxel que giran una vuelta cada 6 s a 3 píxeles del contorno. En la pantalla de dominio, Mochi estampa ese sello sobre el carácter (ver 8.1).

### 4.6 Accesorios de racha

Capas que se pintan encima del sprite base, en coordenadas relativas a la cabeza para que sirvan en las cinco formas:

- 7 días, farolillo: 3x4 (`.r.` / `rgr` / `rrr` / `.g.`) colgando de un hilo `K` a la derecha de la cabeza; oscila 1 píxel cada 1,5 s.
- 30 días, bufanda: dos filas `rr...rr` bajo la cabeza con un extremo que cuelga 3 píxeles.
- 100 días, cuenta de jade: un píxel `j` con brillo `J` al final del hilo del pincel (formas 2 a 5) o sobre la cabeza (forma 1).
- 365 días, sello dorado: el medallón `rr` pasa a `gG`.

### 4.7 Animaciones de Mochi

Todas por desplazamiento entero del sprite y cambio de frame; ningún tween de escala.

| Estado | Frames | Tiempo | Detalle |
| --- | --- | --- | --- |
| Reposo | 2 | 2000 ms por ciclo | Frame A en posición; frame B 1 px más abajo con la fila superior repetida (la gota se achata). Cambio a los 1000 ms. La boca `m` es un píxel `K`. |
| Parpadeo | 1 | 120 ms | Cada 2,5 a 5 s (aleatorio). Píxeles `W` y la pupila pasan al color del cuerpo; la fila inferior del ojo pasa a `K`. Un 10 % de las veces, doble parpadeo con 150 ms entre medias. |
| Mirada | 2 | instantáneo | Pupila 1 px a la izquierda o derecha. En Escribir sigue la posición del dedo. |
| Contento | 6 | 520 ms | Salto de 2 px (0 a 120 ms, arriba y abajo), salto de 3 px (160 a 340 ms), 3 gotas `k` de 1 px salen hacia arriba y caen (gravedad 40 px/s² lógicos). Boca sonrisa: píxeles (x-1, y-1), (x, y), (x+1, y-1). Mejillas `R` dos tonos más vivas. |
| Ánimo | 3 | 700 ms | Cuerpo desplazado 1 px a la derecha (ladea), pupilas hacia el carácter, una gota de sudor `b` de 1x2 nace junto al ojo derecho y cae 4 px en 600 ms. Boca recta. No hay frown: Mochi no se enfada. |
| Tres fallos seguidos | 4 | 900 ms | Igual que Ánimo y, a los 400 ms, saca un rollo 4x6 con el radical del carácter escrito en dorado (texto WenKai de 10 px superpuesto, no píxel). |
| Subida de forma | 5 fases | 2500 ms | 0 a 200: fundido a papel al 60 % sobre el sprite. 200 a 800: salpicadura de 20 gotas `k` (ver 8.3). 800 a 1000: el sprite nuevo aparece revelándose desde la columna central hacia fuera (2 columnas por frame). 1000 a 1800: la forma nueva se mira las manos (pupilas abajo 1 px, cabeza 1 px abajo). 1800 a 2500: Contento. |
| Dormida | 2 | 3000 ms por ciclo | Ojos cerrados, una manta `w` cubre el tercio inferior con borde `t`, tres "z" en píxeles (3x3: `kk.` / `.k.` / `.kk` invertido) suben 6 px y se desvanecen escalonadas 800 ms. Al tocarla se estira (sprite 1 px más alto durante 300 ms, eso se consigue repitiendo la fila del medio), parpadea dos veces y pasa a Reposo. |
| Dominio de carácter | 4 | 600 ms | Mochi se desplaza 2 px hacia la cuadrícula, aparece el sello (8.1) sobre el carácter, Mochi vuelve. En las formas 1 a 4 el sello aparece solo; en la 5 sale de su mano. |

Prioridad si coinciden: Subida de forma > Dominio > Contento > Ánimo > Mirada > Parpadeo > Reposo. Un estado nuevo de prioridad menor espera a que acabe el actual.

## 5. Duelos de tinta

### 5.1 Escena

Canvas lógico de 128x72 píxeles, escala entera según el ancho (a 358 px CSS y DPR 3 sale escala 8, 1024 px de dispositivo, centrado con margen de papel). Suelo: una banda de tinta clara `K` de 4 px de alto con hierba de píxeles `j` sueltos. Fondo: papel con dos montañas en `K` al 40 % y una en `h` al 25 %, sin contorno. La cuadrícula 米字格 de escritura va fuera del canvas, en HTML/SVG como en la app, de 160 px, con las diagonales en `#c85446` al 25 %.

El jugador está a la izquierda mirando a la derecha; el enemigo a la derecha mirando a la izquierda. Los dos se dibujan sobre la línea del suelo, a 20 px de sus bordes. Las barras de vida van en HTML encima del canvas, con número y carácter del elemento, nunca solo color.

### 5.2 El mago del jugador, 24x24

```
.........kkkkk..........
........kkkkkkk.........
........kkkkkkk.........
.......kkkkkkkkk........
.......kkkkkkkkk........
.....ggggggggggggg......
......wwwwwwwwwww.......
......wwkWwwwWkww.......
......wwwwwwwwwww.......
......wwRwwwwwRww.......
.......wwwwwwwww........
......kkkkkkkkkkk.......
.....kkkkkkkkkkkkk......
....kkkkkkkkkkkkkkk.....
....kkkkkjjjjjkkkkk.....
...kkkkkkkkkkkkkkkkk..G.
...wwkkkkkkkkkkkkkww.g..
...kkkkkkkkkkkkkkkkkkg..
....kkkkkkkkkkkkkkk..k..
....kkkkkkkkkkkkkkk.....
....kkkkkkkkkkkkkkk.....
....kkkkkkkkkkkkkkk.....
....kkkkkkkkkkkkkkk.....
....kkkkkkkkkkkkkkk.....
```

Gorro alto de tinta con banda dorada, cara de papel, fajín de jade, túnica de tinta hasta el suelo, pincel como varita en la mano derecha. Frames: reposo (2, respiración de 1 px), lanzar (3: brazo del pincel sube 2 px, el pincel apunta al enemigo en horizontal, una gota `k` sale de la punta), recibir golpe (2: sprite 1 px atrás y 2 px abajo, ojos cerrados `K`), victoria (Contento de Mochi aplicado al mago). Si el usuario tiene Mochi, ella va sentada sobre el hombro izquierdo a su escala 4 (forma 1 ocupa 48 px de dispositivo), y celebra con él.

Los dos jugadores de "pásame el móvil" usan el mismo sprite con fajín distinto: jade para el primero, sello para el segundo.

### 5.3 Enemigos

Todos de 24x24, dos frames de reposo (respiración o cola), un frame de ataque (inclinación de 2 px hacia el jugador) y un frame de golpe (2 px atrás, destello: todo el sprite en `w` durante 2 frames). El carácter de su elemento va en una insignia `rr` de 2x2 en el pecho; el carácter grande se escribe en WenKai sobre la barra de vida.

雨猫, el gato de la lluvia, elemento neutro. Silueta de gato sentado, cuerpo `b` con vientre `B`, orejas triangulares, cola enroscada; sobre él una nubecilla `s` de 8x3 de la que caen 3 gotas `b` en bucle de 900 ms.

火猫, el gato de fuego:

```
.....oo.........oo......
.....ooo.......ooo......
.....oooo.....oooo......
.....oooooooooooooo.....
....oooooooooooooooo....
....ookWoooooooWkoo.....
....ooooooooooooooo.....
....ooooookkkooooooo....
.....oooooooooooooo.....
......oooooooooooo......
.......oooyyyyoo........
......ooyyyyyyyyoo......
.....oooyyyrryyyooo.....
.....oooyyyrryyyooo.....
.....oooyyyyyyyyooo.....
.....ooooyyyyyyoooo.....
......oooooooooooo......
......ooo......ooo..oo..
......ooo......ooo.oo...
......ooo......oooooo...
......nnn......nnn......
........................
........................
........................
```

Cuerpo `o`, vientre `y`, patas `n`, insignia `rr`. Encima de la cabeza, una llama de 6x5 en tres frames (ver 6.1) que arde en bucle de 450 ms. Al recibir 水, la llama desaparece 2 segundos y sale una voluta `s` de humo.

山羊, la cabra de la montaña. Silueta cuadrada y baja en `K` con cuernos curvos `t`, barba de 2 px, ojos rectangulares de pupila horizontal (como las cabras). Lleva una piedra `K`/`k` de 6x5 sobre el lomo. Reposo: mastica (la fila de la boca alterna 1 px).

风鸟, el pájaro del viento. Pájaro redondo de 16x14 en `s` con alas `w`, que vuela a 10 px del suelo: el sprite sube y baja 2 px en 800 ms y las alas tienen 3 frames (arriba, medio, abajo) a 120 ms por frame. Deja tras de sí dos trazos `s` de 1x4 que se desvanecen.

雪鱼, el pez de nieve. Pez de 20x12 en `B` con escamas `s`, flotando dentro de una gota de agua `b` de 24x20 que lo envuelve (el agua es la que respira, 1 px). Al atacar, lanza cristales `B` de 2x2 en diagonal.

火马, el caballo de fuego. El más alto, 24x24 completos, caballo en `k` (sí, de tinta: es el 马 del hueso oracular) con crines de fuego `o`/`y` de 3 frames y cascos `n`. Dos ataques por turno, así que su frame de ataque se reproduce dos veces con 300 ms entre medias.

老树, el árbol viejo. Tronco `n` con cara (dos ojos `W` hundidos en 2 huecos `k` y una boca de corteza), copa `j`/`J` de 20x10 con 3 hojas que caen en bucle lento (3 s). Cuando se cura, la copa gana 2 px de alto durante 1,5 s.

书生, el estudiante sombrío. Es el mago del jugador en espejo, con la túnica en `p` en lugar de tinta, la cara en `K` y sin pupilas (solo `W`). Su pincel escribe en el aire los caracteres débiles del jugador, y el carácter aparece en WenKai sobre él, en `p`, trazo a trazo, antes del ataque. No tiene frame de victoria, porque cuando gana se desvanece.

### 5.4 Escalado de dificultad en lo visual

Nada de números de nivel en pantalla. La dificultad se ve en el enemigo (vida en la barra, velocidad de sus frames de ataque: 600 ms en el 1, 300 ms en el 8) y en el reloj de arena de escritura (un dibujo de 8x12 en `t` cuyos granos `g` caen de arriba abajo en el tiempo disponible).

## 6. Lenguaje visual de los elementos

Los hechizos son caracteres; cada uno tiene un icono de 8x8 para los botones, una animación de proyectil y un color. Se definen los cinco elementos clásicos aunque la app solo tenga 火 水 树 山 en HSK 1-3, para que 木 金 土 estén listos cuando haya niveles superiores (en HSK 1-3 el árbol es 树 y la tierra es 山).

### 6.1 Iconos de 8x8

火 fuego, colores `o` `y`:

```
...o....
..oo....
..oyo...
.ooyyo..
.oyyyyo.
.oyyyyo.
..oyyo..
...oo...
```

Para animarla, la llama tiene tres frames. El frame 2 mueve la punta 1 px a la derecha; el frame 3 la baja 1 px y ensancha la base.

水 agua, colores `b` `B`:

```
...b....
...b....
..bBb...
..bBbb..
.bBbbbb.
.bbbbbb.
..bbbb..
...bb...
```

木 y 树 madera, colores `j` `J`:

```
.....j..
....jJ..
...jJJj.
..jJJjj.
..jJjjj.
.jjjjjj.
.jjjj...
jj......
```

土 y 山 tierra, colores `K` `k`:

```
........
...KK...
..KKkK..
.KKkkKK.
.KkkkkK.
KKkkkkKK
KKKKKKKK
........
```

金 metal, colores `g` `G`:

```
...G....
..GGg...
.GGggg..
GGgggggg
.Ggggg..
..ggg...
...g....
........
```

电 rayo, colores `y` `G`:

```
....yy..
...yy...
..yyyy..
.yyyy...
...yy...
..yy....
.yy.....
y.......
```

Los demás neutros: 风 son tres trazos `s` curvos de 8x8 que se desplazan; 雨 son cuatro gotas `b` de 1x2 en diagonal; 雪 es un copo `B` de 6 brazos; 心 es un corazón `r` de 7x6 con brillo `R`; 门 es una puerta `t` de 6x8 con marco `n`; 大 y 小 son el propio carácter en WenKai sobre fondo `g` claro, sin icono de píxel.

### 6.2 El lanzamiento, paso a paso

Es la misma secuencia para todos los hechizos; cambia el proyectil.

1. Escritura (variable, 10 a 20 s). El usuario escribe en la cuadrícula 米字格 con hanzi-writer. Los trazos son de tinta, como en Escribir.
2. Tinta viva (300 ms). Al completar el último trazo, el carácter escrito se levanta de la cuadrícula: el SVG del carácter se traslada 24 px hacia arriba con `cubic-bezier(.3,.7,.3,1)` y pierde opacidad de 1 a 0 mientras aparece en su sitio el proyectil del elemento, que crece de 4x4 a 8x8 en 3 frames.
3. Vuelo (400 ms). El proyectil cruza del jugador al enemigo (unos 80 px lógicos) con velocidad constante y una estela de 4 partículas por frame del color claro del elemento, que viven 200 ms. 火 oscila 1 px arriba y abajo; 水 va en arco (parábola de 10 px de altura); 树 gira (4 frames de hoja); 山 es una roca que cae desde arriba sobre el enemigo en lugar de volar; 电 no vuela: aparece un zigzag `y` de 2 px de grosor del cielo al enemigo durante 80 ms, dos veces.
4. Impacto (350 ms). El enemigo destella `w` 2 frames, retrocede 2 px y vuelve. 12 a 24 partículas del color del elemento salen en abanico de 120 grados hacia el lado contrario al jugador, velocidad 60 a 120 px/s lógicos, gravedad 200 px/s², vida 300 a 500 ms. La sacudida de pantalla desplaza el contenedor del canvas 4, -3, 2, -1, 0 px en 5 frames (unos 160 ms). Número de daño en WenKai 28 px, color `r` si hay ventaja de elemento y `k` si no, que sube 16 px y se desvanece en 600 ms con `ease-out`. Con ventaja, además, aparece "水 apaga 火 ×2" en Fraunces 13 px bajo la barra de vida del enemigo durante 1,2 s.
5. Hechizo fallido (3 o más errores o tiempo agotado). El carácter escrito se emborrona. Cada trazo se desplaza 1 a 2 px al azar en 3 frames (120 ms), la cuadrícula pulsa en `r` al 20 % una vez (200 ms), y del centro sube una voluta de humo `p` de 3 partículas de 2x2 que crecen a 3x3 y se desvanecen en 700 ms. Mochi hace Ánimo. No hay sonido de fallo, solo falta el sonido de impacto.

Potencia parcial (1 o 2 errores): mismo flujo, proyectil de 6x6 en lugar de 8x8, 8 partículas en vez de 12 a 24, sin sacudida.

### 6.3 Ataque del enemigo y bloqueo

El enemigo anuncia su ataque y su carácter aparece en WenKai 40 px sobre su cabeza, en `k`, durante 1000 ms. Si hay bloqueo por significado, debajo salen tres glosas en español como botones durante 2000 ms. Si acierta, una puerta 门 de píxeles `t` 12x16 se cierra delante del jugador (2 frames, 120 ms), el proyectil enemigo choca con 6 partículas `s` y el daño se reduce a la mitad; la puerta se abre y desaparece en 300 ms. Si falla o no hay bloqueo, el proyectil llega, el jugador hace su frame de golpe, sacudida de 2 px (la mitad que la del enemigo, porque el golpe propio se siente menos espectacular a propósito) y número de daño en `r`.

## 7. Escenas de historia

### 7.1 Formato

Canvas lógico de 128x72, misma regla de escala que los duelos. Debajo, el cuadro de diálogo en HTML (fondo `--surface`, borde `--line`, texto Figtree 15 px, caracteres objetivo en WenKai 22 px y color `r`, con subrayado de puntos `g` para indicar que se tocan). El texto aparece con efecto de máquina de escribir a 28 caracteres por segundo; tocar el cuadro lo completa de golpe.

Cada escena se compone de capas, de atrás hacia delante: papel; lejanía en `h` al 25 % (montañas, murallas); medio en `K`; suelo y personajes en `k` y colores de escena; partículas (nieve, hojas, chispas) delante de todo. El papel se ve siempre al menos en un 40 % del lienzo: las escenas respiran, no se llenan.

Paleta por escena: la rampa de tinta, papel, un acento y hasta 6 colores propios. Ejemplos: capítulo 1, nieve `s`, un ave `k` con pico `g`; capítulo 2, hueso `t`, fuego de adivinación `o` `y`; capítulo 5, arena `t`, seda `r`, camello `n`; capítulo 6, noche en papel oscuro `#2a241f` con luna `w` y farolillos `o`; capítulo 7, arcilla `n`, tinta `k`, papel `w`.

### 7.2 Personajes de época

16 px de ancho por 24 de alto, misma construcción que el mago (cabeza grande de papel, cuerpo de tinta o de color de escena, sin contorno). Cangjie lleva túnica `t` con cinturón `n`, pelo recogido `k`, y, como guiño a la iconografía, dos pares de ojos (dos filas de ojos de 1x1 en lugar de 2x2); la escena dice que lo pintaban así. El adivino Shang tiene túnica `k` con rombos `t`; el emperador Qin, túnica `k` con una banda `g` y el gorro plano con cuentas colgando (4 hilos `g` de 1x3); el mercader de la ruta de la seda, túnica `r` y un camello `n` de 24x20; Li Bai, túnica `w` y copa `t`; Bi Sheng, delantal `n` y bandeja `K` con 12 tipos `t` de 2x2; la escena de 1956, una pizarra `K` con 馬 y 马 en WenKai.

Mochi aparece solo en la página final de cada capítulo con un accesorio de época (gorro Qin, sombrero de viaje `t` de 10x3, pincel de Li Bai) dibujado como capa sobre su forma actual.

### 7.3 Animación en escenas

Poca y en bucle lento, para que el texto se lea. Como máximo tres cosas se mueven: una partícula ambiental (nieve a 6 px/s, hojas a 10 px/s con oscilación de 1 px, chispas que suben), un personaje que respira (1 px cada 2 s) y un elemento narrativo (el ave que camina y deja huellas de 3x3 `K` cada 600 ms; la grieta del hueso que avanza 1 px por frame; el papel que se levanta de la cuba). Cuando el usuario toca un carácter resaltado, la escena se oscurece al 60 % y la tarjeta del carácter se abre encima; la escena se congela mientras tanto.

Escena 1 del capítulo 1, como referencia: papel; tres montañas `h` al fondo; suelo de nieve `s` ondulado; un árbol `k` desnudo a la izquierda de 20x30 (es decoración, no el carácter 木); Cangjie a la derecha agachado (frame de 16x20); un ave `k` de 6x5 en dos frames que camina de derecha a izquierda y deja huellas; nieve cayendo, 14 copos de 1 px. Cuando el ave ha dejado tres huellas, el diálogo dice: "Cuentan que Cangjie miró las huellas en la nieve y pensó: si una marca puede decir 'pájaro', una marca puede decir cualquier cosa." Los resaltados en esa escena son 人 y 山; 鸟 solo se ofrece si el usuario está en HSK 3.

## 8. Recompensas de tinta

Las tres del prototipo, con tiempos. Son las de `feature-ideas.md`, apartado 4; aquí se fija el detalle para que se programen iguales en todas partes.

### 8.1 Sello

Un cuadrado `r` de 64 px con el texto en WenKai (太棒了 en la sesión perfecta, el carácter dominado en el dominio) en `w`, bordes irregulares con `feTurbulence baseFrequency="0.9"` y `feDisplacementMap scale="2.5"`, opacidad final 0,92 para que el papel se vea a través.

| Tiempo | Qué pasa | Curva |
| --- | --- | --- |
| 0 a 140 ms | Cae: escala 1,45 a 0,96, rotación de 14° a 8°, opacidad 0 a 1 | `cubic-bezier(.2,.9,.3,1.25)` |
| 140 a 240 ms | Asienta: escala 0,96 a 1, rotación fija en 8° | `ease-out` |
| 240 ms | Golpe: vibración de 15 ms en Android, sonido de sello si está activo, 6 motas `r` de 1 px saltan 4 px alrededor y caen | |
| 240 a 1400 ms | Se queda | |
| 1400 a 1800 ms | Se desvanece (en el dominio no se desvanece: queda como sello pequeño en la esquina de la casilla) | `ease-in` |

### 8.2 Ensō

Círculo SVG de radio 46 en un `viewBox` de 100, dibujado con dos trazos superpuestos para que parezca pincel: uno de grosor 7 en `k` y otro de grosor 4,5 en `k` desplazado 0,8 unidades, con `stroke-linecap="round"`. Empieza a las 8 en punto y gira en sentido horario; se detiene a un 12 % de cerrar, que es lo que hace a un ensō un ensō. `stroke-dasharray` igual a la longitud, `stroke-dashoffset` de la longitud a 0,12 de la longitud en 700 ms con `cubic-bezier(.4,0,.2,1)`. Al terminar, en la punta final nacen 2 gotas `k` de 1,5 px que caen 10 px en 400 ms. En Home, el anillo del objetivo diario se transforma en este ensō cuando llega a 20 repasos; el número del centro pasa a "Hecho" en Fraunces.

### 8.3 Salpicadura de tinta

Canvas sobre el elemento que la provoca. Entre 12 y 20 partículas `k`, tamaño 2 a 5 px CSS (alineadas a 1 px), nacen en el punto del último trazo con velocidad inicial de 180 a 320 px/s y ángulo de 90° ± 60° hacia arriba, gravedad 900 px/s², vida 450 a 700 ms, opacidad lineal de 1 a 0 en el último tercio. Tres de ellas (las más grandes) dejan una mancha de 3 px que se queda 2 s y se desvanece. Al mismo tiempo, el carácter escrito pasa de `--ink` al 75 % a `--ink` al 100 % en 300 ms, como si el papel lo empapara. Duración total 800 ms. Nunca más de una salpicadura a la vez en pantalla.

### 8.4 Trazo de pincel bajo "Bien"

Es el más frecuente y debe ser casi invisible: una línea SVG de 32x4 en `j`, grosor variable (path con dos curvas, grueso en el arranque, fino al final), dibujada con `stroke-dashoffset` en 200 ms `ease-out`, que se queda bajo el carácter hasta la siguiente tarjeta. Sin partículas, sin sonido.

## 9. Accesibilidad

- `prefers-reduced-motion: reduce` apaga el bucle de animación. Mochi se dibuja en su frame de reposo A y cambia de humor sin transición; los proyectiles no vuelan, el impacto se muestra como estado final (partículas no, destello del enemigo sí pero de un solo frame de 100 ms, número de daño sin desplazamiento); la sacudida de pantalla no existe; las recompensas aparecen con un fundido de 150 ms y sin movimiento; la subida de forma es un corte directo con el texto "Mochi ha crecido". El efecto máquina de escribir se sustituye por el texto completo.
- Sin destellos repetidos. El único fundido a claro (subida de forma) ocurre una vez, dura 200 ms y no supera el 60 % de opacidad. El destello `w` del enemigo al recibir daño dura 2 frames y no se repite más de una vez por segundo. Nada parpadea más de 3 veces por segundo.
- Sacudida de pantalla con amplitud máxima de 4 px CSS y 160 ms; en el ajuste de la app puede apagarse por separado del resto de animaciones ("Vibración de pantalla").
- Contraste. La tinta sobre papel da 14:1. En tema oscuro, el borde de papel de un píxel alrededor de los sprites de tinta garantiza que se recorten sobre `--raised`. Los iconos de elementos van siempre con su carácter en texto al lado: ningún botón de hechizo es solo un dibujo.
- La vida nunca es solo color: barra más número más carácter. La ventaja de elemento se dice en texto ("水 apaga 火 ×2"), no solo con el número en rojo.
- Toque. Botones de hechizo de 56 px de alto como mínimo; los caracteres resaltados en los diálogos tienen un área de toque de 44 px aunque el glifo mida 22.
- Lectores de pantalla. Cada canvas lleva `role="img"` y un `aria-label` que cambia con el estado ("Mochi, forma Aprendiz, contenta"; "El gato de fuego recibe 24 de daño"). Los números de daño se anuncian en una región `aria-live="polite"` que agrupa los eventos de cada turno en una frase.
- Sonido opcional y apagado por defecto, con el interruptor de ajustes que ya propuso `feature-ideas.md`. Ningún estado depende del sonido.

## 10. Lo que no se hace

- No se usan sprites de terceros ni paquetes de píxel art genérico; todo sale de estas reglas, para que Mochi no se parezca a ninguna otra mascota.
- No hay contornos negros, degradados, sombras suaves ni brillos especulares en los sprites.
- No hay cielo azul, hierba verde plana ni césped de videojuego. Papel, tinta y un acento.
- No se escala con `transform` ni se dibujan sprites a escalas fraccionarias.
- No hay confeti. Las celebraciones son tinta, sello y pincel.
- Nada se mueve en la pantalla de repaso salvo Mochi en su esquina y el trazo verde bajo "Bien". La calma de la tarjeta manda.
