# Investigación: cinco ideas para 加油

Fecha: 24 de octubre de 2026. Todo lo que sigue se ha comprobado contra el código del repositorio y contra fuentes primarias consultadas en esa fecha. Donde una cifra no se pudo verificar se dice.

## Resumen

| Tema | Recomendación | Esfuerzo | Coste | Efecto offline |
| --- | --- | --- | --- | --- |
| 1. Tercer tono | Pregenerar con Azure TTS los 617 caracteres y 549 palabras con el pinyin forzado por SSML, tras una prueba de una hora contra grabaciones humanas de audio-cmn | M | 0 (plan gratuito) | Mejora: mismo audio en todos los móviles; unos 4 MB por voz |
| 2. Voz femenina y masculina | Dos voces de Azure (XiaoxiaoNeural, YunxiNeural) y ajuste "femenina, masculina, alternar" | S tras el 1 | 0 | Unos 8 a 9 MB con las dos, o la segunda bajo demanda |
| 3. Categorías | `categories.json` propio con 22 categorías: gramaticales desde la lista HSK 3.0 con categoría gramatical, semánticas propuestas por un LLM y revisadas a mano; repaso por tema con `buildQueue` | M | 0 | Unos 10 KB de JSON |
| 4. Animaciones | CSS, WAAPI, SVG y un canvas pequeño con sello, pincel y gotas de tinta en ocho momentos raros; sin Lottie ni Rive; vibración solo en Android | M | 0 | Ninguno, o 50 a 100 KB si hay sonidos |
| 5. Juego y duelo | Rangos ligados a caracteres dominados, tres modos de juego y, como primera versión de duelo, "pásame el móvil" más retos asíncronos por enlace con semilla; WebRTC con Trystero después | S a M (v1), L (en directo) | 0 | V1 funciona offline salvo compartir el enlace |

## 1. El tercer tono suena raro

### Por qué pasa

El tercer tono solo tiene su forma completa de "baja y sube" (214 en las letras tonales de Chao) cuando va aislado o antes de una pausa. Xu (1997) mide que en aislamiento cae al f0 más bajo de los cuatro tonos en mitad de la vocal "y luego sube bruscamente hasta el final de la sílaba", que esa subida final "suele faltar en posiciones no prepausales" y que es el tono más largo, 349 ms de media frente a 214 ms del cuarto ([Journal of Phonetics, PDF](https://www.homepages.ucl.ac.uk/~uclyyix/yispapers/Xu_JP97.pdf)). En el habla corrida se queda en medio tercer tono (21, solo baja) y delante de otro tercer tono se convierte en algo parecido al segundo (35) ([He, Wang y Wayland 2016, PDF](https://slam.lin.ufl.edu/wp-content/uploads/sites/106/2020/03/paper10.pdf)).

Las voces del sistema que usa `src/utils/speech.ts` están hechas para leer frases, donde lo normal es el medio tercer tono. Con un carácter suelto tienden a producir la variante corta y a recortar la subida. No encontré ningún estudio que lo mida en motores de TTS concretos, así que esto es una explicación plausible y no un hecho comprobado. En el código hay dos factores más. `utterance.rate = 0.8` estira la sílaba de forma artificial, y la voz elegida es "la primera zh-CN que haya", que cambia según el móvil. Como prueba barata, el dueño puede decir "好。" con punto final y `rate = 1` y ver si la voz del dispositivo baja y sube.

Las palabras de ejemplo tienen además sandhi. 一个 se dice yí ge y 不好 bù hǎo, y dos terceros tonos seguidos cambian el primero. Por eso no sirve pegar grabaciones de sílabas sueltas para las palabras: cada palabra necesita su propio audio.

### Cuántos audios hacen falta

Lo conté sobre los datos de la app. Los 617 caracteres usan 448 sílabas con tono distintas, y con las palabras de ejemplo suben a 496. Hay 549 palabras de ejemplo distintas y 128 caracteres de tercer tono. No hacen falta las ~1.300 sílabas del mandarín: unas 450 para los caracteres sueltos y 549 grabaciones de palabras. Cada carácter tiene un solo pinyin en los datos, y `docs/critic-loop.md` ya señala dudas en 长, 得, 谁 y 绩, así que los audios conviene nombrarlos por carácter y generarlos desde el pinyin revisado, no compartirlos por sílaba a ciegas.

### Opciones con grabaciones humanas

- [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) es la única colección sistemática y con licencia que permite incluirla en la app. El README dice "CC-by-sa" y no hay fichero LICENSE aparte. Tiene 1.707 sílabas con tono grabadas por Chen Wang y unas 8.600 palabras y caracteres del HSK 2000 leídos por Yue Tan (procedentes del proyecto Shtooka), en MP3 a 18, 24 y 64 kbps. Crucé sus nombres de fichero con los datos de la app. Cubre 439 de las 448 sílabas (faltan ju4 y los neutros de 的 了 吗 么 们 呢 着 子, porque el proyecto borró casi todos los ficheros de tono 5), 521 de los 617 caracteres como palabra leída por Yue Tan y 384 de las 549 palabras de ejemplo. El README no dice el sexo de ninguno de los dos hablantes; hay que escucharlos. CC BY-SA exige atribución y que los audios modificados se publiquen con la misma licencia, lo que no afecta al código de la app.
- Wikimedia Commons: la subcategoría Lingua Libre en mandarín tiene 4.108 ficheros de muchos hablantes, casi todos palabras, con licencia por fichero ([Commons](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-cmn)). No es un conjunto sistemático.
- Tatoeba: frases, con licencias por grabación que incluyen CC BY-NC ([FAQ](https://en.wiki.tatoeba.org/articles/show/faq)). Common Voice: frases. Ninguna sirve para sílabas sueltas.
- Forvo: la API comercial cuesta 28,95 USD al mes y exige atribución ([planes](https://api.forvo.com/plans-and-pricing/)). No pude leer sus condiciones sobre guardar audios (Cloudflare bloqueó la página), y una API de pago mensual no encaja con una app offline sin backend.

### Opciones con TTS neuronal

| Servicio | Voces zh-CN | Control de tono | Plan gratuito y precio | ¿Se pueden guardar los audios? |
| --- | --- | --- | --- | --- |
| Azure AI Speech | Femeninas XiaoxiaoNeural, XiaoyiNeural, XiaochenNeural...; masculinas YunxiNeural, YunjianNeural, YunyangNeural ([lista](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)) | `<phoneme alphabet="sapi" ph="hao 3">`, tonos 1 a 5 ([documentación](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets)) | 0,5 M caracteres al mes gratis; 15 USD por millón en Neural ([precios](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)). Cada hanzi cuenta doble y el SSML cuenta ([documentación](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech)) | Solo una respuesta de moderador de 2020 dice que sí ([Q&A](https://learn.microsoft.com/en-ca/answers/questions/98761/azure-text-to-speech-saving-files-and-distrbuting)); no es una cláusula contractual |
| Google Cloud TTS | Standard y WaveNet cmn-CN A y D femeninas, B y C masculinas; Chirp 3 HD con 14 femeninas y 16 masculinas ([lista](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types)) | `<phoneme alphabet="pinyin" ph="hao3">` en cmn-CN ([documentación](https://docs.cloud.google.com/text-to-speech/docs/phonemes)); en Chirp 3 HD el SSML está en vista previa y no documenta pinyin ([Chirp 3 HD](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd)) | WaveNet 4 M gratis al mes; Chirp 3 HD 1 M gratis y luego 30 USD por millón ([precios](https://cloud.google.com/text-to-speech/pricing?hl=en)) | No encontré cláusula específica; no verificado |
| Amazon Polly | Solo Zhiyu, femenina ([lista](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html)) | `x-amazon-pinyin` con tonos ([tabla](https://docs.aws.amazon.com/polly/latest/dg/ph-table-mandarin.html)) | Neural 1 M al mes gratis el primer año ([precios](https://aws.amazon.com/polly/pricing/)) | Sí, "el resultado te pertenece" y se puede cachear ([FAQ](https://aws.amazon.com/polly/faqs/)) |
| ElevenLabs | No comprobado | No comprobado | El plan gratuito es solo no comercial ([precios](https://elevenlabs.io/pricing)) | Conservas los derechos del resultado ([condiciones](https://elevenlabs.io/terms-of-use)) |
| OpenAI | Voces multilingües | Sin SSML ni fonemas | tts-1 a 15 USD por millón ([precios](https://developers.openai.com/api/docs/pricing)) | Obliga a avisar de que la voz es sintética, y tts-1, tts-1-hd y gpt-4o-mini-tts se retiran el 6 de enero de 2027 ([guía](https://developers.openai.com/api/docs/guides/text-to-speech)) |

El trabajo completo son unos 2.000 hanzi por voz (617 caracteres más unas 1.280 letras de las palabras de ejemplo). En Azure eso son unos 4.000 caracteres facturables más el marcado SSML, que mi estimación sitúa en torno a 100.000 por voz. Cabe de sobra en el plan gratuito de Azure y de Google, así que el coste real es cero.

### Tamaño offline y formato

Opus solo funciona en Safari de iOS de forma completa desde la 18.4; antes dependía del contenedor (CAF, WebM) y tenía regresiones ([caniuse](https://caniuse.com/opus), [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)). MP3 y AAC funcionan desde iOS 4. Usar MP3 o AAC mono a 32 kbps.

Estimación propia: 617 caracteres de 0,7 s y 549 palabras de 1,1 s a 32 kbps son unos 4 MB por voz, unos 8 a 9 MB con dos voces. A 24 kbps, unos 3,3 MB por voz. Como referencia, las sílabas MP3 de audio-cmn a 24 kbps pesan 4,6 KB de media con el silencio incluido. Hoy los trazos ocupan 2,4 MB en `public/strokes`. Para el precache hay que añadir `mp3` (o `m4a`) a `globPatterns` en `vite.config.ts`; alternativa más ligera: precachear una voz y servir la otra con una regla `CacheFirst` que la guarda al primer uso.

### Recomendación

Generar una vez, con un script local, los 617 caracteres y las 549 palabras con Azure, una voz femenina (XiaoxiaoNeural) y una masculina (YunxiNeural o YunjianNeural), forzando el pinyin con `alphabet="sapi"` para que el tono y la lectura de los polífonos los decidan los datos revisados y no el modelo. Las palabras se envían con el sandhi escrito (yi2 ge4). Exportar a MP3 o AAC mono de 32 kbps en `public/audio/f/` y `public/audio/m/`, y que `speak()` reproduzca el fichero y use Web Speech solo si falta.

Antes de comprometerse, una prueba de una hora: generar 20 caracteres de tercer tono con las dos voces de Azure y compararlos con las grabaciones humanas de audio-cmn. Si Azure también recorta la subida en sílabas aisladas, el plan B es usar audio-cmn para los caracteres sueltos (cubre 439 de 448 sílabas; las 9 que faltan, con TTS) y Azure solo para las palabras y la segunda voz.

Elijo Azure porque tiene a la vez voces de los dos sexos, control de tono documentado para chino con pinyin numerado, coste cero para este volumen y una sola fuente de voz coherente para caracteres y palabras. Google es una alternativa equivalente con WaveNet (pinyin documentado) si se prefiere su cuenta. Polly queda fuera por tener una sola voz, y OpenAI por no permitir controlar el tono y retirar sus modelos en enero de 2027.

### Esfuerzo, coste y efecto offline

Esfuerzo M. Incluye el script de generación (Node o Python con el SDK de Azure), la revisión auditiva de al menos los 128 caracteres de tercer tono, el módulo de audio con caída a Web Speech y los cambios en el precache. Coste cero dentro del plan gratuito; hace falta una cuenta de Azure con tarjeta. Offline mejora, porque hoy depende de qué voz tenga el móvil y después sonará igual en todos. La app crece unos 4 MB por voz.

### Preguntas para el dueño

- ¿Aceptas una cuenta de Azure (o Google) solo para generar los audios una vez?
- ¿Prefieres voz humana aunque sea de un solo hablante y no cubra todas las palabras, o dos voces sintéticas coherentes? La prueba de una hora lo decide.
- Los neutros (的, 了, 吗...) aislados no existen en el habla. ¿Se leen en forma de cita (de, le, ma con tono neutro) o se reproducen solo dentro de su palabra de ejemplo?
- ¿Revisamos antes los pinyin dudosos de 长, 得, 谁 y 绩 para no grabar errores?

## 2. Voz femenina y masculina

### Recomendación

Generar las dos voces de Azure del punto 1 y añadir en ajustes un selector "Voz: femenina, masculina, alternar", guardado en `localStorage`. En modo alternar, la voz depende del carácter y de la sesión, no de cada pulsación, para que un mismo carácter suene igual mientras se repasa y cambie al día siguiente.

### Qué opciones dan las dos voces

- Azure: sí, varias de cada sexo en zh-CN ([lista](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)).
- Google: sí, cmn-CN-Wavenet-A y D femeninas, B y C masculinas, y 30 voces Chirp 3 HD ([lista](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types)).
- Amazon Polly: no, solo Zhiyu ([lista](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html)).
- audio-cmn: dos hablantes distintos (Chen Wang en sílabas, Yue Tan en palabras), pero cada uno cubre una parte distinta y el README no dice su sexo. No da dos voces para el mismo audio.
- Web Speech: `SpeechSynthesisVoice` no expone el sexo, solo `name`, `lang`, `localService`, `voiceURI` y `default` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice)). En iOS han existido Ting-Ting y Yu-shu (femeninas) y Li-mu (masculina), pero la única fuente que encontré es un listado de la época de iOS 10 ([iphoneaddict.fr](https://iphoneaddict.fr/apps/economie-entreprise/speakchinese-2-free-pinyin-8-chinese-voices.html)); la lista actual de iOS y Android no está verificada. Elegir voz por nombre sería frágil.

### Cómo se elige

- Ajuste nuevo `voz: 'f' | 'm' | 'alternar'` en una clave propia, por ejemplo `hsk-flashcards-settings`, junto a `hsk-flashcards-stats`. `docs/critic-loop.md` ya dejó pendiente una pantalla de ajustes (el interruptor de colores de tono), así que puede nacer con estas dos opciones.
- Alternar: `voz = hash(carácter + fecha) % 2`. Simple, estable en la sesión y equilibrado a lo largo de los días.
- En la tarjeta de carácter nuevo, un toque largo en el altavoz reproduce las dos voces seguidas. Es la forma más directa de "hacer el oído" y sirve también para el modo de tonos del punto 5.

### Esfuerzo, coste y efecto offline

Esfuerzo S una vez hecho el punto 1, porque el script genera las dos voces en la misma pasada y el selector es un ajuste más. Coste cero. Offline, el audio se duplica de 4 a 8 o 9 MB, salvo que la segunda voz se guarde al primer uso.

### Preguntas para el dueño

- ¿Por defecto alternar, o una voz fija que el usuario cambia?
- ¿Las dos voces precacheadas desde la instalación (unos 8 a 9 MB) o la segunda bajo demanda?

## 3. Categorías semánticas para repasar por temas

### Recomendación

Construir un fichero propio `src/data/categories.json` con unas 22 categorías (cada carácter puede estar en varias), generado en dos pasadas: primero las clases gramaticales que salen de forma mecánica de la lista oficial del HSK 3.0 con categoría gramatical, y después los campos semánticos propuestos por un LLM a partir de las glosas en español que ya existen, con una revisión humana de las 617 filas. Repasar por categoría reutiliza `progressStore.buildQueue()` tal cual.

### Por qué

Ningún conjunto de datos abierto da campos semánticos por carácter para este nivel.

- La lista HSK 3.0 limpia de [ivankra/hsk30](https://github.com/ivankra/hsk30) trae 11.092 palabras con categoría gramatical (N, V, Adj, Adv, Pron, Num, M, Prep, Conj, Aux, Int...), pero ninguna columna de tema. Su README dice que el código es MIT y que los CSV derivan de repositorios MIT y de un documento del Ministerio de Educación chino que "dependiendo de la ley china podría ser dominio público". Sirve para sacar numerales, clasificadores, pronombres y partículas, pero etiqueta palabras, no caracteres: 好 aparece como adjetivo en 好 y dentro de 你好.
- [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) es CC BY-SA 4.0 (exige atribución y compartir igual las mejoras) y no tiene categoría gramatical ni campos semánticos.
- El léxico chino de USAS (etiquetas semánticas de Lancaster) está en [UCREL/Multilingual-USAS](https://github.com/UCREL/Multilingual-USAS) bajo CC BY-NC-SA 4.0. Tiene campos semánticos, pero la licencia no comercial y "compartir igual" lo hacen incómodo, y sus etiquetas (A1.1.1, B1...) son demasiado finas para un estudiante de HSK 1.
- El 同义词词林 (扩展版) de la universidad HIT clasifica palabras por significado, pero no encontré una página oficial con su licencia; solo reimplementaciones de terceros como [bububa/cilin](https://pkg.go.dev/github.com/bububa/cilin). Sin verificar, mejor no usarlo.
- Unihan no tiene campos semánticos útiles aquí.

El estándar oficial GF0025-2021 sí da los temas por nivel, y conviene alinear las categorías con ellos. Según la copia del texto alojada en [tuttocina.it](https://www.tuttocina.it/HSK/NuovoHSK-lineamenti.pdf): nivel 1 "个人信息、日常起居、饮食、交通、兴趣爱好"; nivel 2 "基本社交、家庭生活、学习安排、购物、用餐、个人感受"; nivel 3 "出行经历、课程情况、文体活动、节日习俗、教育、职业". Ojo, la app usa 617 caracteres (174 + 173 + 270 en `src/data/hsk1.json`, `hsk2.json`, `hsk3.json`), que no coinciden con los 900 caracteres que ese estándar fija para el nivel 3, así que los temas sirven de guía y no como lista cerrada.

Comprobé que los caracteres de ejemplo de cada grupo existen en los datos: los nueve interrogativos (什么谁哪怎几多吗呢), los 18 numerales, los siete colores (红白黑黄绿蓝色), 16 partes del cuerpo (头手口眼睛耳鼻脚腿身体心脸嘴牙发), 16 clasificadores frecuentes. Faltan algunos esperables como 糖 y 猴, lo que confirma que las categorías tienen que salir de los datos y no de una lista genérica.

### Categorías propuestas

Gramaticales (sacadas de la categoría gramatical del HSK 3.0 y revisadas):

1. Números y cantidades: 一 二 十 百 千 万 两 半 第
2. Clasificadores: 个 本 只 张 件 条 块 双 位 次 辆 杯 碗 瓶
3. Interrogativos: 什 么 谁 哪 怎 几 多 吗 呢
4. Pronombres y personas: 我 你 他 她 它 们 自 己 别
5. Partículas y palabras de gramática: 的 了 着 过 得 地 吧 把 被 比 就 才 都 也 还 又 再

Semánticas (propuestas por el LLM, revisadas a mano):

6. Familia y relaciones: 爸 妈 哥 姐 弟 妹 儿 子 女 奶 爷 叔 阿 姨 朋 友
7. Cuerpo y salud: 头 手 口 眼 睛 耳 鼻 脚 腿 身 体 脸 嘴 牙 病 医 药 疼
8. Comida y bebida: 吃 喝 饭 菜 茶 水 米 面 包 鸡 蛋 鱼 肉 果 苹 奶
9. Animales y plantas: 狗 猫 马 鸟 牛 羊 鱼 熊 花 草 树
10. Colores: 红 白 黑 黄 绿 蓝 色
11. Tiempo, fechas y horas: 年 月 日 天 时 候 点 分 钟 早 晚 午 今 明 昨 星 期 周
12. Lugar y dirección: 上 下 左 右 前 后 里 外 东 西 南 北 中 边 旁
13. Casa y objetos: 家 房 门 桌 椅 床 灯 电 脑
14. Ropa, dinero y compras: 衣 服 裤 鞋 帽 买 卖 钱 元 贵
15. Transporte y viajes: 车 船 飞 机 路 站 坐 骑 旅
16. Escuela y trabajo: 学 校 老 师 书 课 考 试 题 字 工 作
17. Naturaleza y clima: 天 气 冷 热 雨 雪 风 晴 阴 山 河
18. Verbos de movimiento y acción: 去 来 走 跑 回 到 进 出 拿 放 给
19. Verbos de percepción, mente y habla: 看 见 听 说 话 想 知 道 认 识 觉 懂 记 忘 问 答 叫
20. Cualidades y opuestos: 好 大 小 多 少 高 快 慢 新 旧 长 短 难 容 易
21. Emociones y gustos: 喜 欢 爱 高 兴 怕 哭 笑 累
22. Ocio, deporte y fiestas: 玩 唱 歌 跳 舞 球 游 泳 影 节

Las listas son ilustrativas; el reparto final sale del paso de generación. Un carácter como 天 cae en "Tiempo" y en "Naturaleza", 鱼 en "Comida" y "Animales". Los caracteres sin significado propio (么, 们) solo van en su categoría gramatical.

### Forma de los datos

Un fichero aparte, para no mezclar categorías con las glosas curadas:

```json
{
  "version": 1,
  "categories": [
    { "id": "colores", "es": "Colores", "zh": "颜色", "kind": "semantica", "chars": ["红", "白", "黑", "黄", "绿", "蓝", "色"] },
    { "id": "interrogativos", "es": "Interrogativos", "zh": "疑问词", "kind": "gramatica", "chars": ["什", "么", "谁", "哪", "怎", "几", "多", "吗", "呢"] }
  ]
}
```

`characterStore` construye al cargar un mapa inverso carácter → ids. Un test de Vitest comprueba que todo carácter de la lista existe en `hsk1-3`, que cada uno de los 617 tiene al menos una categoría y que ningún id se repite. El JSON pesa unos 10 KB y ya entra en el precache, porque `globPatterns` de `vite.config.ts` incluye `json`.

### Cómo encaja con la repetición espaciada

`Entrenamiento.tsx` ya recibe una prop `pool` ('all', 'more' o la cola del día) y `progressStore.buildQueue(chars)` acepta cualquier subconjunto. Repasar "Colores" sería:

1. Filtrar los caracteres de la categoría.
2. `buildQueue(filtrados)` devuelve primero los que tocan hoy (se califican con `grade`, cuentan para el calendario) y después los nuevos de la categoría.
3. Completar la sesión con los ya vistos que no tocan, calificados con `practice()`, que registra el acierto sin mover intervalos. Es la misma regla que ya protege el modo 'all' contra el atracón.

En la pantalla de inicio bastaría una fila "Por temas" con chips que muestren vistos y dominados por categoría (`isSeen`, `isMastered`).

### Esfuerzo, coste y efecto offline

Esfuerzo M. Son medio día de código (fichero, mapa inverso, nuevo `pool`, chips) y dos o tres horas de revisión humana de 617 filas. Coste cero si el LLM se usa dentro de una sesión ya pagada; unos céntimos por API. Offline sin cambios, unos 10 KB más de JSON precacheado.

### Preguntas para el dueño

- ¿Las categorías gramaticales (partículas, clasificadores) se quedan junto a las semánticas o van en una sección "Gramática" aparte?
- ¿Repasar por tema puede introducir caracteres nuevos o solo repasa los ya vistos? Introducirlos consume el cupo diario `NEW_PER_DAY = 10`.
- ¿Quién hace la revisión humana? Las glosas ya están marcadas en `docs/critic-loop.md` como revisadas solo de forma mecánica.

## 4. Animaciones de recompensa con estética de tinta

### Recomendación

Hacer las recompensas con CSS, Web Animations API y SVG en línea usando los tokens que ya existen (`--seal`, `--jade`, `--gold`, los cuatro tonos), más un canvas pequeño para salpicaduras de tinta. Sin Lottie ni Rive salvo que un diseñador entregue animaciones hechas. Vibración solo en Android, sonido opcional y todo desactivado o reducido con `prefers-reduced-motion`. Ocho momentos concretos, raros y ligados a aprendizaje real, no a cada toque.

### Qué hacen otras apps

- Duolingo publicó que quienes llegan a una racha de 7 días tienen 3,6 veces más probabilidades de terminar el curso, que una nueva animación tras extender la racha subió un 1,7 % la proporción de usuarios nuevos que seguían activos a los 7 días, y que permitir dos "protectores de racha" subió un 0,38 % los usuarios activos diarios ([blog de Duolingo, 31 de enero de 2022](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)). Son datos internos de la propia empresa, sin revisión externa.
- Duolingo usa Rive con máquinas de estado para animar a sus personajes ([blog de Duolingo sobre visemas](https://blog.duolingo.com/world-character-visemes)). Es una inversión de equipo de animación, no un patrón para una app de una persona.
- Skritter, la referencia en escritura de caracteres, se limita a racha diaria, objetivo de tarjetas y un aviso al cumplirlo ([documentación de Skritter](https://docs.skritter.com/article/262-streaks-goals-and-progress), [blog, julio de 2021](https://blog.skritter.com/2021/07/study-streaks-daily-goals-and-new-progress-screens-on-skritter-mobile/)). No encontré documentadas animaciones de celebración.
- En Anki existe el complemento Puppy Reinforcement, una recompensa visual durante el repaso, pero su página en AnkiWeb no cargó y no pude verificar con qué frecuencia ni cómo la muestra.

### Qué dice la evidencia

- El metaanálisis de Sailer y Homner (2020, Educational Psychology Review) encuentra efectos pequeños de la gamificación: g = 0,49 en resultados cognitivos, 0,36 en motivación y 0,25 en conducta, y solo el cognitivo se mantiene en los estudios más rigurosos ([Springer](https://link.springer.com/article/10.1007/s10648-019-09498-w)).
- Hamari, Koivisto y Sarsa (2014) concluyen que los efectos son positivos pero "dependen mucho del contexto y de los usuarios" ([Aalto](https://research.aalto.fi/fi/publications/does-gamification-work-a-literature-review-of-empirical-studies-o/)).
- Deci, Koestner y Ryan (1999), 128 estudios: las recompensas tangibles y esperadas reducen la motivación intrínseca (d entre -0,28 y -0,40 según la contingencia), mientras que el feedback positivo la aumenta (d = 0,33 en conducta libre, 0,31 en interés declarado) ([Psychological Bulletin 125(6), PDF](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)).

Para esta app eso se traduce en tres reglas. La celebración tiene que decir algo cierto sobre el aprendizaje ("este carácter ya lo escribes de memoria") y no premiar el simple hecho de tocar. Tiene que ser rara para no convertirse en ruido. Y no conviene prometer premios por adelantado ("haz 20 y ganas X"), que es justo lo que el metaanálisis asocia a perder interés.

### Técnica para una PWA

- CSS y WAAPI (`element.animate()`) cubren sellos, trazos y anillos sin dependencias. SVG con `stroke-dashoffset` dibuja un trazo de pincel; un filtro `feTurbulence` + `feDisplacementMap` da borde de tinta corrida.
- Lottie: `lottie-web` 5.13.0 pesa 75 kB gzip ([bundlephobia](https://bundlephobia.com/package/lottie-web)); `@lottiefiles/dotlottie-web` 32,3 kB gzip ([bundlephobia](https://bundlephobia.com/package/@lottiefiles/dotlottie-web)), más los ficheros de animación. Rive: `@rive-app/canvas` 67,6 kB gzip ([bundlephobia](https://bundlephobia.com/package/@rive-app/canvas)), y bundlephobia no indica si el WASM va aparte, que es lo que hay que comprobar antes de usarlo offline. Todo funcionaría offline si se añade al precache, pero duplica el peso de la app actual por unas pocas animaciones.
- Partículas: `canvas-confetti` 1.9.4 pesa 4,2 kB gzip ([bundlephobia](https://bundlephobia.com/package/canvas-confetti)) y admite formas propias, así que puede soltar gotas de tinta en lugar de confeti. Escribirlo a mano en 60 líneas de canvas también es razonable.
- Vibración: la Vibration API no existe en Safari de iOS en ninguna versión y sí en Chrome para Android y Samsung Internet ([caniuse](https://caniuse.com/vibration)). El truco de iOS de pulsar por código un `<input type="checkbox" switch>` para provocar el háptico funcionó desde iOS 17.4/18. En enero de 2025 WebKit cerró como resuelto un bug que pedía exigir un gesto del usuario ([bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)), aunque la página no confirma el comportamiento final, y el autor de `ios-haptics` dice que Apple lo cerró en iOS 26.5 ([README](https://unpkg.com/ios-haptics@3.1.1/README.md)); no encontré nota oficial de Apple que lo confirme. No merece la pena. Basta `navigator.vibrate?.(12)` en Android y nada en iOS.
- Sonido: muestras cortas (un golpe de sello, un roce de pincel) de 5 a 15 KB en el precache, reproducidas con Web Audio; interruptor en ajustes.
- Movimiento reducido: `prefers-reduced-motion: reduce` es Baseline desde enero de 2020 ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)). Con esa preferencia, cada momento se queda en un cambio de color o un fundido sin desplazamiento.

### Ocho momentos para esta app

1. Calificar "Bien" en `Entrenamiento.tsx`: un trazo de pincel en `--jade` se dibuja bajo el carácter en 200 ms. Nada más; es el momento más frecuente y debe ser casi invisible.
2. Cinco aciertos seguidos sin "Otra vez" en la sesión: tres gotas de tinta caen sobre el contador "4 / 11 caracteres" y aparece "5 seguidos" en `--gold`. Se reinicia con un fallo y no vuelve a salir hasta el siguiente múltiplo de cinco.
3. Sesión sin fallos en `ScoreModal.tsx` (el caso 太棒了): un sello rojo `--seal` con 太棒了 en WenKai cae girado 8 grados, escala de 1,2 a 1 con un rebote corto y deja una textura de tinta irregular. Golpe de sello sonoro si el sonido está activo; vibración de 15 ms en Android.
4. Escritura de memoria con cero errores en `Trazos.tsx` (cuando `strokeBest` llega a 0): el carácter pasa de gris a tinta como si empapara el papel (filtro de desplazamiento animado) y una salpicadura de 12 a 20 gotas sale del último trazo.
5. Primer carácter que pasa a escribirse de memoria (`canWrite` cambia a verdadero): la tarjeta muestra un pincel pequeño que se moja en el tintero, con el texto "Ya puedes escribirlo".
6. Carácter dominado (el intervalo cruza los 21 días de `isMastered`): en la cuadrícula del nivel ese carácter recibe un sello diminuto en la esquina, estampado con un pulso. Ocurre una vez por carácter, así que es la recompensa más significativa.
7. Objetivo diario cumplido (`DAILY_GOAL = 20`): el anillo de Home se cierra como un 円相 (ensō), un círculo de pincel que no termina de cerrar, dibujado con `stroke-dashoffset`.
8. Hitos de racha (7, 30, 100 días): el chip de racha de `Home.tsx` se convierte un día en un farolillo de papel que se enciende en `--gold`. Encaja con el dato de Duolingo sobre animaciones de hito.

### Esfuerzo, coste y efecto offline

Esfuerzo M, con un módulo `rewards.ts` con las ocho funciones, unos pocos SVG y un canvas, más el interruptor de sonido. Coste cero. Offline sin cambios si no se usan dependencias externas; con sonidos, 50 a 100 KB más en el precache (hay que añadir la extensión de audio a `globPatterns`).

### Preguntas para el dueño

- ¿Sonido activado por defecto o apagado hasta que el usuario lo encienda?
- ¿Te vale vibración solo en Android, sabiendo que en iPhone no hay manera fiable?
- ¿Quieres que dibujemos el sello (un 印 con tu nombre o con 加油) o usamos texto WenKai dentro de un marco?

## 5. Niveles, modos de juego y duelo entre dos móviles

### Recomendación

En tres pasos, sin servidor propio en ninguno:

1. Un nivel de "pincel" que solo sube con aprendizaje real (caracteres dominados y escritos de memoria), con un avatar que es un sello personal que se completa, no una mascota con ropa.
2. Tres modos de juego con los datos actuales: reconocimiento rápido, tonos y escritura contrarreloj.
3. Para jugar entre dos personas, empezar por "pásame el móvil" en el mismo dispositivo y por retos asíncronos con enlace: el reto se genera a partir de una semilla en la URL, los dos juegan las mismas preguntas y comparten la puntuación por el menú de compartir. El duelo en directo por WebRTC queda para una segunda versión, con Trystero sobre Nostr o MQTT como señalización gratuita.

### Niveles y avatar

`progressStore` ya guarda todo lo necesario: `reps`, `interval`, `strokeBest`, `strokeRuns` por carácter y la racha diaria. Propuesta:

- Puntos de tinta (XP): 1 por repaso calificado, 3 por escritura de memoria sin errores, 10 cuando un carácter pasa a dominado (`isMastered`). Las prácticas libres (`practice()`) no dan puntos, igual que ya no mueven intervalos, para que repetir lo fácil no compense.
- Rangos con nombre propio de caligrafía: 墨童 (aprendiz de tinta), 书生 (estudiante), 秀才, 举人, 进士, 翰林. Cada rango exige un número de caracteres dominados (por ejemplo 25, 75, 150, 300, 450, 617), no solo XP, así que no se sube por volumen.
- Avatar: un sello cuadrado con el nombre del usuario en caracteres que va ganando trazos, borde y color a medida que sube de rango, y una "hoja de caligrafía" con los caracteres dominados escritos en WenKai. Es un registro visible de lo aprendido, que es lo que pide el dueño con "registro del nivel".

### Modos de juego con los datos actuales

- Reconocimiento rápido (60 segundos): un carácter y cuatro glosas; las opciones falsas salen de la misma categoría del punto 3 para que no sean obvias.
- Tonos: suena el carácter (con el audio del punto 1) y se elige el tono entre cuatro; el tono se saca de los diacríticos de `pinyin`, sin datos nuevos. Hay 128 caracteres de tercer tono en la lista, el más difícil de oír. Variante: emparejar 4 caracteres con 4 contornos tonales dibujados.
- Escritura contrarreloj: hanzi-writer ya cuenta errores en el modo de prueba que usa `Trazos.tsx`; se puntúa tiempo más errores sobre caracteres con `canWrite`.
- Duelo de memoria: los dos jugadores escriben el mismo carácter a partir de la glosa y el audio; gana quien termine con menos errores.

Todos alimentan el calendario igual que hoy: si el carácter toca, `grade`; si no, `practice`.

### Jugar entre dos móviles

Lo que se comprobó:

- WebRTC necesita un canal de señalización que no define el estándar ([webrtc.org](https://webrtc.org/getting-started/peer-connections)); los canales de datos funcionan en todos los navegadores desde enero de 2020 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel)).
- Si alguno de los dos está tras un NAT simétrico hace falta un servidor TURN que retransmita ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols)). No encontré cifras primarias de cuántas operadoras móviles lo provocan. Cloudflare da 1.000 GB al mes gratis de TURN con cuenta ([precios](https://developers.cloudflare.com/realtime/pricing/)) y Metered Open Relay 20 GB al mes con registro ([Open Relay](https://www.metered.ca/tools/openrelay/)). Un duelo de texto gasta kilobytes, así que el coste es cero, pero añade una cuenta y una clave.

Opciones de señalización (precios y límites del plan gratuito vistos el 24 de octubre de 2026):

| Opción | Plan gratuito | Pega para esta app |
| --- | --- | --- |
| Trystero ([GitHub](https://github.com/dmotz/trystero)) | Sin cuenta: usa relés públicos de Nostr, BitTorrent o MQTT. MIT, 25,9 kB gzip ([bundlephobia](https://bundlephobia.com/package/trystero)) | Depende de relés de terceros sin garantía; el README no dice nada de iOS |
| PeerJS cloud ([peerjs.com](https://peerjs.com/peerserver)) | Gratis, MIT, 29,7 kB gzip | No publica límites ni SLA |
| Firebase Spark ([precios](https://firebase.google.com/pricing)) | Realtime Database: 100 conexiones simultáneas, 360 MB al día | Cuenta de Google y SDK pesado |
| Supabase Free ([precios](https://supabase.com/pricing), [límites](https://supabase.com/docs/guides/realtime/limits)) | 200 conexiones, 2 M mensajes al mes | El proyecto se pausa tras una semana sin uso |
| Cloudflare Durable Objects ([precios](https://developers.cloudflare.com/durable-objects/platform/pricing/)) | En el plan Workers Free, 100.000 peticiones al día | Es desplegar un Worker, un servidor en la práctica |
| Liveblocks ([precios](https://liveblocks.io/pricing)) | 10 conexiones por sala | Uso comercial solo con marca de agua visible |
| Ably / Pusher ([Ably](https://ably.com/pricing), [Pusher](https://pusher.com/channels/pricing/)) | 6 M mensajes al mes / 200.000 al día | Cuenta y clave en el cliente |

Emparejar por QR: generar el código cuesta 4,3 kB con `uqr` (MIT, [bundlephobia](https://bundlephobia.com/package/uqr)). Leerlo es más caro, porque `BarcodeDetector` está desactivado por defecto en Safari de iOS hasta la 27.2 ([caniuse](https://caniuse.com/mdn-api_barcodedetector)), así que habría que añadir `qr-scanner` de Nimiq (MIT, 16,3 kB gzip, [GitHub](https://github.com/nimiq/qr-scanner)). Es más sencillo que el QR contenga un enlace con el código de sala y que el otro móvil lo abra con la cámara del sistema, sin escáner en la app. La cámara dentro de una PWA instalada en iOS funciona desde iOS 13.4 ([WebKit 185448](https://bugs.webkit.org/show_bug.cgi?id=185448)), con regresiones posteriores que no pude verificar.

Web Bluetooth queda descartado. No existe en Safari ni en Firefox ([caniuse](https://caniuse.com/web-bluetooth)) y la especificación solo permite a la web actuar como central, no anunciarse como periférico, así que dos navegadores no pueden hablarse por Bluetooth ([W3C, 2022](https://lists.w3.org/Archives/Public/public-web-bluetooth-log/2022May/0007.html)).

En cuanto a privacidad, los candidatos mDNS ocultan la IP local, pero la IP pública sí llega al otro jugador ([IETF](https://datatracker.ietf.org/doc/html/draft-ietf-mmusic-mdns-ice-candidates)). Trystero cifra los datos de extremo a extremo, pero su README avisa de que un operador de relé puede descifrar la negociación a partir de los identificadores de app y sala si no se pone contraseña. Una nota de privacidad debería decir que el rival ve tu IP pública, qué servicio de señalización se usa y qué ve, y si interviene un TURN.

El reto asíncrono por enlace evita todo esto. Web Share está en Safari de iOS desde la 12.2 ([caniuse](https://caniuse.com/web-share)), así que `navigator.share({ url })` con `?reto=semilla&modo=tonos` funciona sin servidor. Las dos personas juegan las mismas 20 preguntas generadas por un PRNG con esa semilla y comparan puntuaciones devolviéndose el enlace con el resultado. Se puede hacer trampa leyendo el código, igual que en cualquier juego sin servidor, y para un concurso entre amigos da igual.

### Esfuerzo, coste y efecto offline

- Niveles y avatar: M. Coste cero. Offline sin cambios (todo en `localStorage`).
- Modos de juego: M por modo; tonos depende del audio del punto 1.
- Pásame el móvil y reto por enlace: S a M. Coste cero. Funciona offline salvo el acto de compartir el enlace.
- Duelo en directo con Trystero: L, sobre todo por las pruebas entre redes móviles y el posible TURN. Coste cero o casi; requiere red en los dos móviles.

### Preguntas para el dueño

- ¿Con quién jugarías primero, alguien sentado al lado (pásame el móvil) o alguien a distancia (enlace)?
- ¿Aceptas depender de relés públicos de terceros para el modo en directo, o prefieres una cuenta gratuita de Cloudflare con TURN?
- ¿El rango debe verse en Home o queda en una pantalla de perfil aparte, para no romper la calma de la portada?
- ¿Los nombres de rango en chino clásico (秀才, 进士) te gustan o prefieres algo más cercano en español?
