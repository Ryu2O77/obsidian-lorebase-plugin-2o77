# Revisión siguiente (21): "Completed" ya no rellena los trofeos
- Elegir el estado **Completed** en un juego solo cambia el estado (y pone la fecha de fin si estaba vacía). Los trofeos solo se rellenan con el botón "Mark all trophies earned".

# Revisión siguiente (20): horas sin círculo
- En el panel Progress de juegos, **Hours played** ya no es un anillo (no tiene total): ahora es un contador con icono de reloj y las horas en grande. Los trofeos siguen con su anillo.

# Revisión siguiente (19): botón para sincronizar un juego con Steam
- En el editor de juegos, panel **Progress**, aparece el botón **"Sync hours & trophies from Steam"** (solo si el juego tiene `steamAppId`). Carga las horas y los logros de ese juego en los campos; se guardan al pulsar Save. Usa el Steam ID y la API key de Ajustes > Sync.

# Revisión siguiente (18): Steam sincroniza horas y logros
- **Horas:** al sincronizar con Steam, además de `playtime` (minutos) se guarda `hours_played` (horas con un decimal). Las notas que solo tienen `playtime` muestran las horas en el editor automáticamente.
- **Logros:** nueva opción **Achievements** en Ajustes > Sync > Steam data (desactivada por defecto). Guarda `trophies_current` y `trophies_total`. Necesita tu API key de Steam y que "Game details" sea público en tu perfil; los juegos sin logros se saltan. Se hace una petición por juego (5 a la vez).
- Funciona al importar, al actualizar duplicados y en la sincronización automática de playtime.

# Revisión siguiente (17): horas jugadas y trofeos en juegos
- El panel **Progress** del editor de juegos ahora tiene **Hours played** y **Trophies** (obtenidos / totales), con anillos de progreso como en libros .
- Botón **"Mark all trophies earned"**: completa los trofeos, pone el estado en Completed y la fecha de fin (hoy) si estaba vacía.
- Se guardan en la nota como `hours_played`, `trophies_current` y `trophies_total`.

# Revisión siguiente (16): estado "Played" en juegos
- Nuevo estado de juego **Played** (`status: played`) para juegos que ya jugaste pero no completaste. Aparece en el editor, la edición masiva, la creación manual, los filtros, la tarjeta (insignia morada), las estadísticas y las etiquetas personalizables de Ajustes.
- "Completed" (antes mostrado como "Played" en versiones muy viejas) sigue siendo `completed`.
- **Ojo:** las notas antiguas con `status: played` ahora se leen como "Played" (antes se leían como completadas). Las que usan `played: true` siguen contando como completadas.

# Revisión siguiente (15): agrupar por estado
- Nueva opción **Group > By status** en el menú de vista (juegos y el resto de categorías). Los grupos usan tus etiquetas de estado y siguen el orden de los estados (el botón de orden los invierte). Funciona en tarjetas y en tabla, y se guarda en las vistas guardadas.

# Revisión siguiente (14): fechas Día/Mes/Año y capítulos del mismo color que las páginas
- **Libros:** el anillo de "Current chapter" ahora usa el mismo color (cian) que "Current page".
- **Fechas en todos los editores:** se muestran y se escriben como `dd/mm/yyyy` (en ruso/ucraniano `dd.mm.yyyy`). Antes era `mm/dd/yyyy`. Afecta a Started, Finished y Release date en libros, manga, anime, películas, series y juegos.
- **Edición masiva y "Añadir como completado":** la fecha ya no usa el selector nativo del sistema; ahora es un campo `dd/mm/yyyy`.
- Lo que se guarda en las notas no cambia: sigue siendo `yyyy-mm-dd`.

# Revisión siguiente (11): el brillo de los favoritos ya no se sale del póster
Con "Progress footer" o "Title below" la tarjeta incluye el título y la barra bajo el póster, y el brillo rojo de los favoritos se dibujaba alrededor de toda la tarjeta, no solo del póster. Ahora el brillo va sobre el póster: en tarjetas con título debajo se aplica a la imagen, y en libros y manga con efecto de lomo se aplica a la portada (conservando su forma y sus sombras). Además esas tarjetas ya no recortan el brillo con su contención de pintado. Sin pie de página el resultado es el mismo de antes, y las tarjetas horizontales no cambian. Solo cambia `styles.css`; `main.js` queda idéntico.

# Revisión siguiente (10): consistencia entre categorías

## Medias estrellas en todas las categorías
- **Editor de anime y de juegos:** ahora aceptan media estrella (clic en la mitad izquierda de una estrella), igual que películas, series, libros y manga.
- **Juegos leen notas como 4,5:** antes una nota de 4,5 en un juego se truncaba a 4 al leerla.
- **Clic derecho:** la lista de medias estrellas (0,5 a 4,5) sale en todas las categorías. Antes faltaba en manga, anime y juegos.
- **Edición masiva:** de 0,5 a 5 en todas las categorías (antes anime, manga y juegos solo tenían notas enteras).
- **Tabla:** las notas a medias también se pueden poner en manga, anime y juegos.
- **Insignia de la tarjeta:** en modo emoji, una media estrella muestra el emoji y al lado el valor exacto (por ejemplo "4.5"). En modo estrellas ya se mostraba exacto.

## "Title below" es un interruptor aparte
Settings > personalización de tarjetas: **Card style** ahora solo elige entre "Hover preview" y "Progress footer", y "Title below" es un interruptor propio. Se pueden combinar: título abajo con barra de progreso, solo barra de progreso, solo título, o ninguno.
- Si ya tenías "Title below" como estilo, al abrir el plugin pasa solo a "Hover preview" con el interruptor activado (se ve igual que antes).
- En películas y juegos "Progress footer" sigue sin añadir nada (no tienen episodios ni páginas); el interruptor "Title below" sí funciona en todas.
- La altura de las tarjetas ya cuenta cada pie por separado, así que las filas no se montan. La vista previa de Ajustes sigue el mismo comportamiento.

## Idioma en la búsqueda de libros
En la ventana de búsqueda de libros con **Google Books** aparece el selector "Book language": limita los resultados a libros publicados en ese idioma (por defecto, cualquiera). No cambia la ficha de un libro ya añadido. **Hardcover** no lo muestra porque su búsqueda no tiene filtro de idioma que yo haya podido confirmar.

## Título original en libros y manga
- El editor de libros y manga muestra el título original en pequeño bajo el título, como ya hacían anime y películas, si la nota tiene `original_title`.
- Al vincular un manga con **AniList** o **MangaDex** se guarda el título original (nativo) en `original_title`. Hardcover, Google Books y MangaUpdates no lo entregan, así que en libros solo aparece si lo escribes tú en la nota.
- El buscador local de la biblioteca también busca por título original.

## Tabla: Creators editable en todas las categorías
- **Anime:** edita `studios`. **Juegos:** edita `developer`. Películas, series y libros siguen igual (director / autores).
- **Manga:** la columna combina autores y artistas. Al editarla, cada nombre se queda en el campo al que ya pertenecía y los nombres nuevos van a **autores**.
- **Columna nueva "Artists"** (solo aparece si hay manga en la biblioteca), para editar los artistas por separado.

## Pruebas
- Nuevo `tests/consistency.test.ts` (medias estrellas en juegos, título original, idioma de Google Books, columna Artists, alturas con "Title below").
- `tests/providerCompatibility.test.ts`: la lista de proveedores de anime ahora incluye TMDB, que ya estaba disponible; el test seguía esperando la lista vieja.

## Código
`modals/{AnimeEditModal,EditModal,ReadingEditModal,MassEditModal,IntegrationModals}.ts`, `views/library/{contextMenu,tableColumns,TableView,LayoutCalculator}.ts`, `views/LibraryView.ts`, `components/GameCard.ts`, `services/{GameService,ReadingService,IntegrationService}.ts`, `services/media/libraryViewState.ts`, `services/integrations/providers/{googlebooks,anilist,mangadex}.ts`, `settings/sections/general.ts`, `types/index.ts`, `constants.ts`, `main.ts` (migración), `localization/index.ts`, `styles.css`.

# Revisión siguiente (9): la descripción del hover ignoraba el ajuste de líneas
En tarjetas angostas (menos de ~230 px de ancho) una regla de estilo que agregué para ordenar el hover forzaba la descripción a 4 líneas, así que el ajuste de líneas de "Card customization" no tenía efecto en esas tarjetas. Ahora esa regla ya no fuerza el número de líneas y se respeta el valor que elijas (1 a 70). Solo cambia `styles.css`; `main.js` queda idéntico.
Archivo: `styles.css` (fuente en `src/styles.css`).

# Revisión siguiente (3): insignias, hover, atajo para ocultar y título debajo

- **Insignias en tarjetas pequeñas:** con un ancho de tarjeta menor a ~190 px el estado pasa solo a icono (igual que la opción "icon only" que ya existía), la nota y la tira de "Status for" se hacen más pequeñas y, por debajo de ~140 px, se simplifican aún más. Funciona con cualquier tamaño del slider porque se decide por el ancho real de cada tarjeta.
- **Hover:** en tarjetas de menos de ~230 px el título, el año y la descripción se apilan en vez de superponerse; se oculta el formato y, por debajo de ~165 px, también la descripción.
- **Atajo para ocultar** (menú del slider de tamaño): casillas "Hide status", "Hide rating" y "Hide Status for". Estado y nota usan los mismos ajustes que la pantalla de personalización de tarjetas (una sola fuente de verdad: si lo ocultas aquí, ahí también aparece desactivado). "Status for" tiene su propio ajuste.
- **Título debajo, como opción** (Settings > personalización de tarjetas > Card style > "Title below"): disponible en **todas** las categorías, también películas y juegos. Muestra el título (y el año) bajo el póster. Anime, series, libros y manga siguen teniendo además "Progress footer" con la barra de progreso. Por defecto no cambia nada. En horizontal no aplica.

# Revisión siguiente (2): pósters aplastados al achicar
Al achicar con el slider, las tarjetas se angostaban pero conservaban su altura mínima fija (380 px en el tamaño medio), así que el póster se recortaba y se veía aplastado. Ahora, por debajo de 1×, la tarjeta deja de usar esa altura mínima y la altura sale del ancho con la proporción del póster (2:3 por defecto, o la que hayas puesto en tamaño personalizado), y el cálculo de filas de la cuadrícula usa la misma regla, así que no se montan. En las tarjetas horizontales, ancho mínimo y alto ahora también escalan con el slider (antes la tarjeta no seguía al slider y las filas podían montarse).
Con 1× todo queda exactamente igual que antes. Archivos: `components/GameCard.ts`, `views/library/LayoutCalculator.ts`, `views/LibraryView.ts`.

# Revisión siguiente

## Buscador local: autores y directores
La barra de búsqueda de la biblioteca (la local, no la de TMDB) ahora busca también por **director** (películas y series), **autor** (libros y manga), **artista** (manga), **estudio** (anime) y **desarrollador** (juegos), además del título. El texto del buscador pasó a "Search title, author or director...". Ejemplo: escribir "sanderson" muestra los libros de Brandon Sanderson.

## Slider de tamaño: ahora también achica
Antes el slider solo podía agrandar. Causa: el número de columnas está limitado por el ajuste de columnas máximas (5 por defecto), y con 5 columnas las tarjetas ya ocupan todo el ancho, así que reducir el ancho mínimo no tenía efecto. Ahora, al bajar de 1×, el tope de columnas sube en proporción (hasta 12), el ancho mínimo permitido bajó de 120 a 72 px y la altura mínima de las tarjetas verticales también se reduce con el slider para que no queden altas y angostas. Con la pantalla de ejemplo de 1400 px: 0.6× pasa de 5 a 9 columnas.

## Código
- `services/media/libraryViewState.ts`: `matchesLocalSearch`; `services/media/filtering.ts` lo usa.
- `views/library/LayoutCalculator.ts`: tope de columnas según `cardScale`, `MIN_CARD_WIDTH_PX`, altura estática escalada.
- `localization/index.ts`: texto del buscador.
- Diff de esta revisión: `cambios-revision-2.patch`.

# Cambios de esta revisión

## Punto 5 (continuación): más edición en la tabla
- **Fecha, año y texto editables en la celda** de la vista de tabla (columnas Year, Started, Finished, y cualquier propiedad de nota de tipo texto/número/fecha). Clic para editar, Enter o clic fuera para guardar, Escape para cancelar.
- **Edición masiva de Platforms**: añadir/quitar valores (como ya existía para Tags), disponible para todas las categorías.

## 1. Medios relacionados: sugerencias automáticas
Al editar una película, serie, anime, libro o manga, si otra nota comparte **director** (películas/series) o **franquicia** (todas), aparece en una fila "Suggested" arriba de "Related media" con un botón `+` para añadirla con un clic. No se vincula nada solo; tú decides.

## 2. Buscar por director
En la búsqueda de TMDB (películas y series), si lo que escribes coincide con una persona, además de los resultados por título aparece su filmografía como director, etiquetada "Movie · Nombre" / "TV · Nombre" para distinguirla.

## 3. Tamaño de póster con slider
Nuevo control deslizante (0.6×–1.6×) dentro del mismo botón donde se cambia vertical/horizontal/tabla. Escala el ancho de la tarjeta manteniendo el aspect ratio del póster (en vertical, el alto se recalcula a partir del ratio; en horizontal, alto y ancho escalan juntos), así que no se deforma. Se guarda por biblioteca.

## Código
- Nuevo: `findRelatedSuggestions` en `services/media/insights.ts`.
- `services/integrations/providers/tmdb.ts`: `searchTmdbByDirector`.
- `views/library/LayoutCalculator.ts`: `cardScale` (0.6–1.6) aplicado a `minCardWidth` y a `getCardHeight` para horizontal.
- `views/library/TableView.ts` / `views/library/massEdit.ts`: edición de celda y platforms en edición masiva.
- `modals/RelatedMediaEditor.ts`, `VideoEditModal.ts`, `AnimeEditModal.ts`: fila de sugerencias.
- `components/Toolbar.ts`: slider en el dropdown de vista.

Ver `cambios-revision.patch` para el diff completo (no incluye `main.js`/`styles.css` compilados).

# Revisión siguiente (4): editar director/autor en la tabla
La columna "Creators" (directores/autores/estudios/desarrollador, según el tipo) ahora se puede editar directamente en la vista de tabla, como ya pasaba con Tags o Platforms, para **películas, series y libros**. En películas/series edita el campo `director`; en libros, `authors`. Para anime, manga y juegos sigue siendo solo de lectura ahí, porque esa columna combina más de un campo y editarla a ciegas podía mezclar datos.
Archivo: `views/LibraryView.ts`.

# Revisión siguiente (5)

## Bug corregido: no se veía la sinopsis al hacer hover en películas
Si tenías el estilo de tarjeta "Progress footer" activado, las películas (y juegos) caían a un estilo "solo título" porque no tienen episodios/páginas que mostrar en ese pie, y eso tapaba el overlay con la sinopsis. Ahora películas y juegos siempre usan el overlay normal (con sinopsis al pasar el mouse) salvo que elijas explícitamente el estilo "Title below".
Archivo: `components/GameCard.ts`.

## Anime: completar episodios de una temporada y nombres en el badge
- Al poner el estado de **una temporada individual** en "Completed" (en el editor de partes), ahora se rellenan sus episodios al total de esa temporada (antes solo pasaba con "Mark all episodes watched", que afecta a todas).
- El campo "Name" de cada parte ahora se refleja en su chip/badge (por ejemplo "Loguetown 3/3" en vez de "S7 3/3") si le pones un nombre; si lo dejas vacío, sigue mostrando "S7 3/3" como antes.
Archivo: `modals/AnimeEditModal.ts`.

## Mantener portada al cambiar de fuente de metadatos
Al usar "Change source" / relink en cualquier categoría, la ventana de búsqueda ahora tiene una casilla "Keep current poster". Si la marcas, el póster actual de la nota no se toca aunque cambies de proveedor o de idioma de metadatos.
Archivos: `modals/IntegrationModals.ts`, `services/IntegrationService.ts`, `services/integrations/types.ts`, `main.ts`.

## Pendiente (en progreso, no incluido aún en esta entrega)
Buscador de portadas por idioma para todas las categorías (menos juegos, que ya tienen SteamGridDB). Seguirá en la próxima revisión.

# Revisión siguiente (6): la vista previa de Ajustes no reflejaba el fix anterior
El panel "Card Customization" de Ajustes tiene su propio código de previsualización, separado de la tarjeta real, y se me había quedado con la misma lógica vieja: para la vista previa de "Movie" con estilo "Progress footer" seguía mostrando el título en una barra abajo en vez del overlay con sinopsis. Ahora la vista previa coincide con el comportamiento real (overlay salvo que elijas "Title below" explícitamente).
Archivo: `settings/sections/general.ts`.

# Revisión siguiente (7): vista previa de Ajustes mostraba la tarjeta vacía en estilo "Progress footer"/"Title"
No era el mismo bug de antes: esta vez la vista previa ocultaba por completo el overlay editable (título, descripción, año) cuando el estilo era "Progress footer" o "Title below", dejando la tarjeta en negro con solo la barra de abajo. Ahora el overlay se queda siempre visible y editable, y el footer/título simplemente se añade debajo, como en la tarjeta real.
Archivo: `settings/sections/general.ts`.

# Revisión siguiente (8): "Title below" / "Progress footer" no mostraban la sinopsis al hacer hover (tarjeta real)
Era el mismo problema que ya había corregido en la vista previa de Ajustes, pero en la **tarjeta real de la biblioteca**: con esos dos estilos, el overlay con sinopsis ni siquiera se creaba, solo existía la barra de abajo. Ahora el overlay con título/año/sinopsis se sigue mostrando al hacer hover igual que en el modo normal, y la barra de "Title below" o "Progress footer" se añade debajo del póster, sin reemplazar nada.
Archivo: `components/GameCard.ts`.

No convertí "Title below" en un interruptor aparte todavía (sigue siendo una opción del mismo menú que "Progress footer"): quería confirmar primero si con la sinopsis ya funcionando esto resuelve lo que necesitabas, porque separarlo en dos interruptores independientes es un cambio más grande (toca ajustes, tipos y la migración de lo que ya tengas guardado). Si lo sigues queriendo como interruptor aparte, lo hago en la próxima.

# Revisión siguiente (12): rediseño de "Personal Rating"
Estrellas más grandes (34px → 42px) y la nota en grande junto a ellas en la misma fila (antes iba en una línea aparte, pequeña, con mucho espacio vacío alrededor). El texto de ayuda pasa a una línea propia debajo. Mismo cambio en los cuatro editores (películas/series, juegos, libros/manga, anime) porque comparten esta plantilla.
Solo `styles.css` y las 4 plantillas HTML (`modals/{VideoEditModal,EditModal,ReadingEditModal,AnimeEditModal}.ts`); no toqué la lógica de guardado de la nota.

# Revisión siguiente (13): "Hover preview" y "Progress footer" ahora son interruptores, y shortcuts en el botón de vista

## Interruptores independientes
Antes "Hover preview"/"Progress footer" eran un único selector (uno excluía al otro). Ahora son dos interruptores independientes en Ajustes → Card Customization, igual que "Title below". Puedes combinarlos como quieras: por ejemplo Hover + Title below a la vez, o apagar Hover del todo y quedarte solo con el footer.
"Progress footer" sigue sin aparecer como opción para Movies/Games en Ajustes (no tienen episodios/páginas que mostrar ahí).

## Shortcuts en el botón de cambiar de vista
El botón de vertical/horizontal/tabla (donde ya estaba el slider de tamaño de póster) trae ahora 3 casillas rápidas: Hover preview, Progress footer y Title below, para no tener que entrar a Ajustes cada vez. **Progress footer no aparece en ese menú para Movies ni Games**, tal como pediste.

## Migración
Tus ajustes actuales se convierten solos la primera vez que abras el plugin: lo que tenías en "Progress footer" sigue en "Progress footer", "Hover" se mantiene activo (así no pierdes la sinopsis al hacer hover en ningún caso existente), y si alguna categoría tenía la vieja opción "Title" (de antes de que fuera un interruptor aparte) se respeta igual.

Archivos: `types/index.ts`, `constants.ts`, `main.ts` (migración), `components/GameCard.ts`, `views/library/LayoutCalculator.ts`, `views/LibraryView.ts`, `components/Toolbar.ts`, `components/toolbar/types.ts`, `settings/sections/general.ts`, `localization/index.ts`.
