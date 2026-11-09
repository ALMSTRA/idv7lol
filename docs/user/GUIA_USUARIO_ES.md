# idv7lol Studio — guía de usuario (español)

idv7lol Studio es un editor de escritorio para Windows con el que diseñas tu propio cuadro de
instrumentos para un BMW con iDrive 7. Trabajas sobre un lienzo de 1920×720 píxeles que
representa el cluster, pruebas con un simulador integrado, validas contra los límites reales del
renderer del coche y exportas un paquete que la app idv7lol del coche carga. No necesitas saber
GLSL, RAMSES ni JavaScript.

> Aviso: idv7lol es software experimental y no oficial. No está afiliado a BMW. Prueba siempre
> con el coche aparcado, mantén a la vista los testigos de fábrica y lee `SECURITY.md`.

## Pasos básicos

1. Abre idv7lol Studio y elige una plantilla (Performance, Modern, Classic), el ejemplo mínimo
   o un lienzo vacío.
2. Arrastra un componente desde la **Biblioteca** (por ejemplo _Tacómetro_) al lienzo.
3. Cámbialo de tamaño con las asas blancas y muévelo arrastrando.
4. En el **Inspector** cambia colores, marcas, aguja… y comprueba la **Señal** (ya viene
   vinculado a `engine.rpm`).
5. Pulsa **Simular**: el coche virtual mueve el tacómetro. Prueba escenarios (ciudad, circuito,
   pérdida de señal…).
6. Pulsa **Validar**: corrige los errores (rojo) y lee los avisos (naranja).
7. **Guardar** (`.idv7theme`).
8. **Build & Deploy → Compilar tema** y **Exportar bundle…**. La instalación en el coche se
   explica en [DEPLOYMENT.md](DEPLOYMENT.md) (en inglés).

## La ventana

- **Barra superior**: el menú **Archivo** (Nuevo, Abrir, Guardar, Guardar como, Añadir imágenes,
  Exportar PNG), Guardar, Deshacer/Rehacer, Añadir imágenes, Simular, Validar, Compilar, botones para
  mostrar u ocultar los paneles y el menú **…** con idioma, tema claro/oscuro y ayuda. Arrastra el
  borde de un panel para cambiar su tamaño. En ventanas pequeñas, los paneles laterales se abren
  sobre el lienzo.
- **Biblioteca** (izquierda): indicadores circulares y de barra, lecturas digitales, tarjetas,
  marcha, shift lights, reloj, testigos, panel de estado, texto, formas y decoración. Arrastra al
  lienzo o haz clic para añadir en el centro.
- **Lienzo** (centro): zoom con Ctrl+rueda o los botones − / +, **Ajustar a la ventana**
  (Ctrl+0); desplazar con espacio+arrastrar o rueda; selección múltiple con Mayús; marco de
  selección arrastrando en vacío; alinear y distribuir con la barra flotante; agrupar con
  Ctrl+G. El ajuste (snap) engancha a la retícula y a los bordes y centros de otros componentes
  (guías magenta).
- **Zonas reservadas** (botón ▦): en naranja las zonas donde el cluster de fábrica dibuja encima
  (cubierta superior con testigos, marco de la marcha a la derecha, caja eDrive, franja inferior
  de testigos); en rojo las esquinas del cristal, donde nada es visible; en azul la ventana del
  mapa de serie, solo informativa. No pongas información esencial en zonas de fábrica.
- **Inspector** (derecha): nombre, posición, tamaño, rotación, ancla, opacidad; **Señal**
  (señal del catálogo, unidad, rango, suavizado y qué mostrar si no hay dato: guiones, ocultar,
  último valor o cero); **Propiedades** del tipo de componente; **Mostrar solo cuando**
  (condición sobre una señal); **Animaciones**.
- **Capas**: orden de dibujo (arriba = encima), renombrar con doble clic, ojo y candado, y el
  coste en capas del renderer del coche (límite 64 por app; mantente por debajo de 48).
- **Paletas**: conjuntos de colores. Tokens obligatorios: `background`, `surface`, `text`,
  `text-muted`, `accent`, `track`, `success`, `warning`, `danger`. Puedes asignar una paleta a
  cada modo de conducción (ECO PRO, COMFORT, SPORT, SPORT+…); el coche cambia sola.
- **Simulador** (abajo): escenario o control manual (acelerador, freno, palanca, modo de caja,
  marcha manual, modo de conducción, crucero, temperatura exterior, contacto, intermitentes).
  En la tabla de señales, ✎ fuerza un valor y ⚡ hace que la señal falte, para comprobar los
  fallbacks. _Pérdida de comunicación_ congela todo.
- **Validación**: se ejecuta sola mientras editas. Haz clic en un hallazgo para seleccionar el
  componente.
- **Animación**: clips con duración, curva, repetición y pistas con fotogramas clave. En el coche
  se reproducen las pistas de rotación y escala en el renderer y las de color las actualiza la
  app; la opacidad aún no.
- **Build & Deploy**: la escalera de estado distingue _Vista previa disponible_, _Validación
  superada_, _Paquete compilado_, _Bundle exportado_ y _Probado en el vehículo_ (esto último
  solo lo puedes marcar tú, con el coche aparcado).

## Imágenes

Añade imágenes de tu PC con el botón **Añadir imágenes**, arrastrando archivos al lienzo o a la
biblioteca, o pegando con Ctrl+V. Sirven PNG, JPEG, WebP, GIF, SVG, BMP y AVIF, y quedan guardadas
dentro del tema. Haz doble clic en una imagen, o pulsa **Editar imagen**, para abrir el editor:

- **Ajustes**: brillo, contraste, saturación, temperatura y tono. Doble clic en un nombre lo restablece.
- **Estilos**: Noche, Neón, Mono, Cálido, Frío, Intenso y Suave con un clic.
- **Recortar**: arrastra el marco, elige proporción, gira y voltea.
- **Quitar fondo**: haz clic en el color a quitar o usa **Detectar el fondo**.
- **Pincel**: borra a mano o recupera lo borrado; las teclas `[` y `]` cambian el tamaño.
- **Efectos**: desenfoque, nitidez, viñeta, esquinas, blanco y negro, invertir y colorear.

La vista **En tu cuadro** muestra la imagen en su sitio mientras editas. La edición no destruye el
original: **Restablecer todo** vuelve a él. Ctrl+Z deshace y Esc cancela.

## Animaciones y vídeo

Los GIF, los WebP animados, los APNG y los vídeos cortos (MP4 o WebM) se importan como animaciones. De
un vídeo se conservan los primeros 12 segundos, hasta 15 fotogramas por segundo y sin sonido. En el
Inspector se ajusta la velocidad, y en el editor de imagen se recorren los fotogramas. En el coche
todos los fotogramas comparten una sola textura, así que las animaciones grandes o largas pierden
nitidez, y Validación te avisa. Las animaciones no se han probado en un vehículo.

## Atajos

| Acción                              | Atajo                    |
| ----------------------------------- | ------------------------ |
| Guardar / Guardar como              | Ctrl+S / Ctrl+Mayús+S    |
| Abrir / Nuevo                       | Ctrl+O / Ctrl+N          |
| Deshacer / Rehacer                  | Ctrl+Z / Ctrl+Y          |
| Duplicar / Copiar / Pegar           | Ctrl+D / Ctrl+C / Ctrl+V |
| Seleccionar todo / quitar selección | Ctrl+A / Esc             |
| Mover 1 px / 10 px                  | Flechas / Mayús+flechas  |
| Agrupar / desagrupar                | Ctrl+G / Ctrl+Mayús+G    |
| Ajustar a la ventana                | Ctrl+0                   |
| Simular (pausa/continúa)            | F5                       |

## Diferencias entre la vista previa y el coche

La vista previa la dibuja el motor del Studio en Canvas 2D. El coche dibuja cada pieza como un
shader en la GPU del cluster (RAMSES): el suavizado de bordes, el brillo y la tipografía (un
atlas de fuente Barlow) se parecen pero no son idénticos. Los degradados usan solo el primer y
el último color, los arcos elípticos se dibujan circulares, el recorte de grupos no se aplica y
las sombras no existen en el coche; el validador avisa en cada caso.

## Estado del proyecto

Todo lo descrito funciona en el Studio y en las pruebas automáticas. La app del coche existe y
está probada con un cliente simulado, pero **todavía no se ha probado en un vehículo real**.
Consulta `docs/PROJECT_STATUS.md` antes de instalar.
