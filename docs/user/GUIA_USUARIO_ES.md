# Guía de usuario de idv7lol Studio

idv7lol Studio es un editor de escritorio para Windows y macOS con el que diseñas tu propio tablero de
instrumentos para un BMW con iDrive 7. Trabajas sobre un lienzo de 1920×720 píxeles que
representa el cluster, lo pruebas con el simulador integrado, lo validas contra los límites reales
del renderer del auto y exportas un paquete que carga la app idv7lol del auto. No necesitas saber
GLSL, RAMSES ni JavaScript.

> Aviso: idv7lol es software experimental y no oficial. No está afiliado a BMW. Prueba siempre
> con el auto estacionado, mantén a la vista los testigos de fábrica y lee `SECURITY.md`.

**En Mac:** hay una versión para Mac con Apple silicon o Intel (macOS 10.15 o más nuevo). Está
compilada pero todavía no se ha probado en un Mac. Como no está notarizada por Apple, la primera
vez macOS pide permiso: en macOS 14 o anterior, clic derecho sobre la app > **Abrir**; en macOS 15,
ábrela una vez y luego ve a **Ajustes del Sistema > Privacidad y seguridad > Abrir igualmente**.
Los detalles están en `docs/user/INSTALL_MAC.md`.

## Pasos básicos

1. Abre idv7lol Studio y elige una plantilla (Performance, Modern, Classic, Night Minimal, Rally
   Dash, Supercar Track, Volt Runner), el ejemplo mínimo
   o un lienzo vacío.
2. Arrastra un componente de la **Biblioteca** al lienzo, por ejemplo el _Tacómetro_.
3. Muévelo arrastrando y cambia su tamaño con las asas blancas.
4. En el **Inspector** cambia colores, marcas, aguja… Revisa también la **Señal**: el tacómetro
   ya viene vinculado a `engine.rpm`.
5. Presiona **Simular** y el auto virtual mueve el tacómetro. Prueba los escenarios (ciudad,
   circuito, pérdida de señal…).
6. Presiona **Validar**. Corrige los errores (en rojo) y lee los avisos (en naranja).
7. Guarda con **Guardar** (`.idv7theme`).
8. En **Compilar y enviar**, usa **Compilar tema** y después **Exportar bundle…**. Cómo instalarlo en
   el auto está en [DEPLOYMENT.md](DEPLOYMENT.md) (en inglés).

## La ventana

- La barra superior tiene el menú **Archivo** (Nuevo, Abrir, Guardar, Guardar como, Añadir
  imágenes, Exportar PNG), Guardar, Deshacer/Rehacer, Añadir imágenes, Simular, Validar, Compilar,
  botones para mostrar u ocultar los paneles y el menú **…** con idioma, tema claro/oscuro y ayuda.
  Arrastra el borde de un panel para cambiarle el tamaño. En ventanas pequeñas, los paneles
  laterales se abren encima del lienzo.
- La **Biblioteca** (izquierda) trae indicadores circulares y de barra, lecturas digitales,
  tarjetas, marcha, shift lights, reloj, testigos, panel de estado, texto, formas y decoración.
  Arrastra al lienzo o haz clic para agregar en el centro.
- En el **Lienzo** (centro) haces zoom con Ctrl+rueda o los botones − / +, y **Ajustar a la
  ventana** es Ctrl+0. Te desplazas con espacio+arrastrar o con la rueda. Shift sirve para la
  selección múltiple, y arrastrar sobre un área vacía dibuja un marco de selección. La barra
  flotante alinea y distribuye, y Ctrl+G agrupa. El ajuste (snap) engancha a la cuadrícula y a los
  bordes y centros de otros componentes (guías magenta).
- **Zonas reservadas** (botón ▦): en naranja, las zonas donde el cluster de fábrica dibuja encima
  (cubierta superior con testigos, marco de la marcha a la derecha, caja eDrive, franja inferior
  de testigos). En rojo, las esquinas del vidrio, donde no se ve nada. En azul, la ventana del
  mapa de serie, que es solo informativa. No pongas información esencial en las zonas de fábrica.
  En el auto el diseño termina en y 646, para que se vea la franja inferior propia del auto
  (marcha, modo de manejo, autonomía, hora, temperatura exterior): algunos KOMBI, entre ellos los
  de los autos M, dejan recuadros negros encima de un diseño que la tapa, hasta reiniciar la
  unidad. Lo que quede por debajo se recorta. El ajuste **Bottom strip > Covered by the layout** de
  la app del auto lo dibuja completo.
- El **Inspector** (derecha) muestra nombre, posición, tamaño, rotación, ancla y opacidad. Además
  tiene **Señal** (señal del catálogo, unidad, rango, suavizado y qué mostrar si no hay dato:
  guiones, ocultar, último valor o cero), **Propiedades** del tipo de componente, **Mostrar solo
  cuando** (una condición sobre una señal) y **Animaciones**.
- En **Capas** ves el orden de dibujo (lo de arriba queda encima), renombras con doble clic, usas
  el ojo y el candado, y ves cuánto cuesta cada componente en capas del renderer del auto (límite
  64 por app; mejor quedarse por debajo de 48).
- Las **Paletas** son conjuntos de colores. Tokens obligatorios: `background`, `surface`, `text`,
  `text-muted`, `accent`, `track`, `success`, `warning`, `danger`. Puedes asignar una paleta a
  cada modo de manejo (ECO PRO, COMFORT, SPORT, SPORT+…) y en el auto la paleta cambia sola.
- El **Simulador** (abajo) corre un escenario o el control manual (acelerador, freno, palanca,
  modo de caja, marcha manual, modo de manejo, crucero, temperatura exterior, encendido,
  direccionales). En la tabla de señales, ✎ fuerza un valor y ⚡ hace que la señal falte, para
  revisar los fallbacks. _Pérdida de comunicación_ congela todo.
- La **Validación** corre sola mientras editas. Haz clic en un hallazgo para seleccionar el
  componente.
- **Animación**: clips con duración, curva, repetición y pistas con fotogramas clave. En el auto,
  el renderer reproduce las pistas de rotación y escala, y la app actualiza las de color. La
  opacidad todavía no.
- **Compilar y enviar**: la escalera de estado distingue _Vista previa disponible_, _Validación
  superada_, _Paquete compilado_, _Bundle exportado_ y _Probado en el vehículo_ (esto último
  solo lo puedes marcar tú, con el auto estacionado).

## Imágenes

Agrega imágenes desde tu PC con el botón **Añadir imágenes**, arrastrando archivos al lienzo o a
la biblioteca, o pegando con Ctrl+V. Sirven PNG, JPEG, WebP, GIF, SVG, BMP y AVIF, y quedan
guardadas dentro del tema. Haz doble clic en una imagen, o presiona **Editar imagen**, para abrir
el editor:

- **Ajustes**: brillo, contraste, saturación, temperatura y tono. Doble clic en un nombre lo restablece.
- **Estilos**: Noche, Neón, Mono, Cálido, Frío, Intenso y Suave con un clic.
- **Recortar**: arrastra el marco, elige la proporción, gira y voltea.
- **Quitar fondo**: haz clic en el color que quieres quitar o usa **Detectar el fondo**.
- **Pincel**: borra a mano o recupera lo borrado; las teclas `[` y `]` cambian el tamaño.
- **Efectos**: desenfoque, nitidez, viñeta, esquinas, blanco y negro, invertir y colorear.

La vista **En tu cuadro** muestra la imagen en su lugar mientras editas. La edición no toca el
original: **Restablecer todo** vuelve a él. Ctrl+Z deshace y Esc cancela.

## Animaciones y video

Los GIF, los WebP animados, los APNG y los videos cortos (MP4 o WebM) se importan como animaciones.
De un video se conservan los primeros 12 segundos, hasta 15 fotogramas por segundo y sin sonido. La
velocidad se ajusta en el Inspector, y en el editor de imagen puedes recorrer los fotogramas. En el
auto todos los fotogramas comparten una sola textura, así que las animaciones grandes o largas
pierden nitidez; Validación te avisa. Las animaciones no se han probado en un vehículo.

## Atajos

| Acción                              | Atajo                    |
| ----------------------------------- | ------------------------ |
| Guardar / Guardar como              | Ctrl+S / Ctrl+Shift+S    |
| Abrir / Nuevo                       | Ctrl+O / Ctrl+N          |
| Deshacer / Rehacer                  | Ctrl+Z / Ctrl+Y          |
| Duplicar / Copiar / Pegar           | Ctrl+D / Ctrl+C / Ctrl+V |
| Seleccionar todo / quitar selección | Ctrl+A / Esc             |
| Mover 1 px / 10 px                  | Flechas / Shift+flechas  |
| Agrupar / desagrupar                | Ctrl+G / Ctrl+Shift+G    |
| Ajustar a la ventana                | Ctrl+0                   |
| Simular (pausa/continúa)            | F5                       |

## Llevar tu tema al auto con una USB

Necesitas idv7lol 0.2.0 o más nuevo instalado en el auto.

1. En el Studio abre **Compilar y enviar**, pulsa **Compilar tema** y luego **Guardar para el auto
   (USB)**. Elige tu memoria USB: el tema se guarda en `idv7lol/themes/` dentro de ella.
2. Con la app idv7lol abierta en el auto, conecta la memoria. En unos segundos la app encuentra el
   tema, lo revisa y lo instala. En su pantalla te dice qué instaló o por qué rechazó un archivo.
3. Pulsa **Next theme** hasta que aparezca tu tema. El tablero no cambia hasta que lo eliges.
4. Para borrarlo, muéstralo y pulsa **Remove USB theme**. Los temas que vienen con la app no se borran. Si el
   archivo sigue en la memoria, se vuelve a instalar la próxima vez que la conectes.

La app revisa cada tema antes de instalarlo y los paquetes no traen código gráfico propio. Caben
hasta 20 temas. Esto todavía no se ha probado en un auto.

## Compartir tu tema con la comunidad

No necesitas un auto para diseñar ni para compartir. Haz clic en una parte vacía del lienzo y
llena **Datos del tema** en el Inspector: nombre, un id propio, tu nombre como autor y una
descripción. Luego **Archivo > Compartir con la comunidad…** revisa que no haya errores, guarda el
tema (`<id>.idv7theme.json`) y una imagen (`<id>.png`) en la carpeta que elijas y abre el
formulario de GitHub en el navegador. Adjunta ahí los dos archivos. El Studio no sube nada por su
cuenta.

## Diferencias entre la vista previa y el auto

La vista previa la dibuja el motor del Studio en Canvas 2D. El auto dibuja cada pieza como un
shader en la GPU del cluster (RAMSES), así que el suavizado de bordes, el brillo y la tipografía
(un atlas de la fuente Barlow) se parecen pero no son idénticos. Los degradados usan solo el primer
y el último color, los arcos elípticos se dibujan circulares, el recorte de grupos no se aplica y
las sombras no existen en el auto. El validador avisa en cada caso.

## Estado del proyecto

Todo lo descrito funciona en el Studio y en las pruebas automáticas. La app del auto **ya se probó
en un auto**: en un X4 M Competition 2021 (iDrive 7) se instaló desde MGU Store, dibujó los temas
Performance y Supercar Track y, al apagarla, volvió el tablero de fábrica. Los temas por USB, las
imágenes y las animaciones todavía no se han probado en un auto. Revisa `docs/PROJECT_STATUS.md`
antes de instalar.

**Antes de instalar MGU Store, ojo:** el flasheo que activa el SSH borra la codificación del head
unit. Se pierden sus ajustes (idioma, mosaicos, pantalla y lo codificado con BimmerCode), el Store
no deja instalar nada ("coding is missing: it holds default values") hasta volver a codificar
(con BimmerCode o E-Sys), y casi siempre se borran las llaves de BMW Digital Key. Activar el modo
debug también reinicia el perfil de conductor, la memoria del asiento y la sesión de BMW ID. Haz
un respaldo de la codificación antes, ten a la mano cómo recodificar y flashea una sola vez: si
el SSH falla después, usa los pasos de enable o persist de la herramienta, que no flashean. Los
detalles están en `docs/user/DEPLOYMENT.md`.

Al agregar la fuente `ALMSTRA/idv7lol` en MGU Store sirven dos canales: **Releases**, el que el
Store elige primero, que instala un paquete ya armado (todavía no probado en un auto), o **Branch**
con `main`, que arma la app en el auto con el código más reciente (ya probado). El canal Tags no
muestra idv7lol, porque ignora las versiones preliminares como `v0.2.0-beta.3`.
