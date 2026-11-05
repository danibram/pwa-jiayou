# Editor independiente de contenidos

## Objetivo

Editar en el ordenador el vocabulario, los caracteres y los temas de Jiāyóu mediante una UI independiente. Guardar borradores y promoverlos a la siguiente versión del contenido desde el propio editor, de modo que un commit y un despliegue lleven la corrección a la app instalada.

La app de estudio conserva su código, navegación y comportamiento. Los datos siguen empaquetados en el build: una versión nueva del contenido llega con la actualización normal de la PWA, que la app ya ofrece con un aviso. La descarga selectiva de contenido sin actualizar la app queda fuera de este trabajo.

## Implementación

1. Crear el editor en `apps/editor/`, con entrada, estilos, configuración y comandos propios. Reutilizar las dependencias instaladas del repo.
2. Cargar una copia editorial de los datos base. Mantener identificadores y lecturas originales al corregir traducciones.
3. Ofrecer búsqueda y formularios de vocabulario, caracteres y temas, con asignaciones independientes para palabras y caracteres.
4. Guardar borradores en el navegador y permitir exportarlos e importarlos. Mostrar las diferencias campo a campo y los errores antes de promover.
5. Promover desde el editor: el servidor de desarrollo de Vite escribe los archivos del repo en sus formatos actuales, sube `content/version.json`, regenera el índice de búsqueda y refresca la base del editor. Git es la revisión; el despliegue publica. Sin servidor (build estático) queda la descarga del archivo y `npm --prefix editor run promote`.
6. Mostrar la versión del contenido en la app (Opciones) para saber qué edición lleva cada build.
7. Comprobar edición, persistencia, promoción y la versión de contenido con pruebas independientes y revisión visual de escritorio.

## Reparto

- Terra de datos implementa formatos, validación y generación.
- Terra de interfaz implementa el editor y el guardado del borrador.
- Terra de revisión comprueba la compatibilidad de los archivos y los riesgos de pérdida de datos.
- El agente principal integra el editor independiente, documenta su uso y verifica el conjunto.

## Condiciones de aceptación

- El editor arranca con un comando propio y no aparece dentro de la app.
- Una corrección conserva el identificador de la entrada.
- El borrador sobrevive a recargar y se puede trasladar mediante un archivo.
- La vista de cambios muestra las correcciones campo a campo antes de promoverlas, junto con los archivos que se escribirán.
- Las importaciones inválidas o de otra versión no sustituyen el borrador sin revisión.
- Promover valida todo antes de escribir y solo toca los archivos de datos del repo. Un borrador sin cambios no se promueve.
- Cada promoción sube el número de versión del contenido, que la app muestra en Opciones.
- Cada palabra va en HSK 1 a 6 o en Extra, y puede cambiar de lista sin perder su identificador. Extra es una lista de estudio de la app; "Mis palabras" desaparece porque todo el vocabulario sale del editor.

## Evolución posterior

La futura API podrá sustituir la carga y el guardado de archivos. Esta versión no incluye cuentas, sincronización entre dispositivos, creación automática de PR ni descarga de contenido independiente del build de la app.
