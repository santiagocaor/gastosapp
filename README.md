# 📱 GastosApp - Control de Gastos y Presupuestos

Aplicación web *mobile-first* para finanzas personales: registra gastos e ingresos en dólares canadienses (CAD) o pesos colombianos (COP), controla presupuestos mensuales por categoría y analiza en qué se va el dinero. Funciona sola en el navegador y, si quieres, se sincroniza con tu Google Sheet **BDGastosApp** a través de Google Apps Script.

Diseño concebido con **Google Stitch** (`stitch.withgoogle.com`) y desarrollado como una SPA en JavaScript puro, sin dependencias ni paso de compilación.

---

## ✨ Características

- 📊 **Inicio**
  - Balance acumulado (con modo privacidad) y el resultado del mes, ingresos y gastos del mes y tasa de ahorro.
  - Selector de mes para revisar meses anteriores (también lo usan Movimientos, Estadísticas y Presupuesto).
  - Barra de presupuesto global con lo que queda y los días restantes del mes.
  - Recurrentes por confirmar, conversor de divisas plegable y los últimos 5 movimientos.
  - **Impuestos Quebec** (plegable, como el conversor): escribe el precio en CAD y calcula TPS/GST 5 % (federal) + TVQ/QST 9,975 % (provincial) y el total, con un botón para copiarlo.
- ➕ **Registrar**
  - Gastos por macro-categoría → subcategoría → concepto (Necesidades, Deseos, Deudas, Ahorros, Inversiones).
  - Ingresos por tipo → concepto.
  - **Monto en CAD o COP** (CAD por defecto) con la equivalencia en la otra moneda.
  - **Medio de pago** de cada gasto: Débito, Efectivo o Tarjeta de crédito (se recuerda el último usado).
  - **Fecha editable** (para registrar movimientos de días anteriores) y nota opcional.
  - **Repetir cada mes**: convierte el movimiento en recurrente.
- 🔁 **Movimientos recurrentes** (arriendo, nómina, suscripciones, cuota de la TC)
  - 🔔 *Proponer*: cada mes aparece en Inicio para **Registrar**, revisarlo (✏️) u **Omitir**.
  - ⚡ *Automático*: se registra solo el día indicado (si no abriste la app, se ponen al día los meses vencidos, hasta 12).
  - Desde *Ajustes → Movimientos recurrentes* se cambia el monto, el modo, se pausa o se elimina.
  - Cada mes genera un movimiento con id fijo (`rec_<plantilla>_<AAAA-MM>`), así nunca se duplica aunque uses varios dispositivos.
  - Con el script v7 los recurrentes se guardan en la pestaña **Recurrentes** de la hoja: son los mismos en todos tus dispositivos.
- 💵 **Dos monedas**
  - Los movimientos en CAD guardan el **monto original y la tasa del día**; `Valor` queda en COP para los totales y la hoja.
  - El botón **CAD/COP** de la cabecera cambia la moneda en que se ven todos los montos. En CAD, lo registrado en CAD se suma exacto; lo registrado en COP se convierte con la tasa de hoy.
  - Los presupuestos quedan fijos en la moneda en que los edites.
- 📈 **Estadísticas**
  - Periodos: últimos 7 días, mes, año y todo el historial.
  - Comparación real con el periodo anterior equivalente, ingresos, ahorro neto y ritmo de gasto diario.
  - Donut por categoría, barras de ingresos vs. gastos de los últimos 6 meses y top 5 de conceptos.
- 🧾 **Movimientos**
  - Todo el historial con buscador (concepto, nota o categoría, sin importar tildes).
  - Filtros por tipo (gastos/ingresos), categoría, medio de pago, **concepto** (se ajusta a la categoría elegida) y periodo (mes elegido o todo), con totales de lo filtrado.
  - Agrupado por mes con el neto de cada uno; toca un movimiento para editarlo.
- 💰 **Presupuesto**
  - Límites mensuales editables en línea por macro-categoría, estado de cada uno y proyección de cierre de mes.
  - Con el script v7 los límites se guardan en la pestaña **Presupuestos** de la hoja y se comparten entre dispositivos.
  - Catálogo de subcategorías y conceptos dentro de cada categoría, con buscador; toca un concepto para registrarlo.
  - **Conceptos propios**: botón *Concepto* para añadir subcategorías/conceptos nuevos.
  - Los conceptos largos se muestran con un nombre corto (p. ej. “Restaurantes y bares”); en la hoja se guarda el nombre completo.
- 🔔 **Alertas** de categorías cerca del tope o excedidas, gastos mayores que ingresos y registros sin sincronizar.
- 💱 **Conversor COP ⇄ CAD** con tasa de mercado en vivo (es la tasa que usan los registros en CAD) (open.er-api.com, con respaldo en exchangerate-api.com).
- 💾 **Datos**
  - Todo se guarda en el navegador (`localStorage`); con Google Sheets conectado, los movimientos, presupuestos y recurrentes también quedan en la hoja.
  - Respaldo e importación en JSON y exportación a CSV desde *Ajustes*.
- 📲 **PWA**: instalable en el celular y con caché sin conexión (service worker).

---

## 🔄 Sincronización con Google Sheets

La sincronización es **en ambos sentidos**: lo que crees, edites o borres en la app llega a la hoja, y lo que cambies en la hoja (o desde otro dispositivo) aparece en la app. Desde el script **v7** esto incluye los **presupuestos** y los **movimientos recurrentes**.

### Instalar el script

> Haz una copia de la hoja antes de pasar a la v4 (*Archivo → Hacer una copia*): la primera sincronización convierte la columna Valor a CAD.

1. Abre tu hoja **BDGastosApp** → *Extensiones* → *Apps Script*.
2. **Guarda una copia de tu script actual** (por si acaso) y reemplaza el contenido de `Code.gs` por [`apps-script/Code.gs`](apps-script/Code.gs).
3. Si tus pestañas no se llaman `Registro de Gastos`, `Registro de Ingresos`, `BDGastos` y `BDIngresos`, ajusta `CONFIG.SHEETS` y `CONFIG.CATALOG` al inicio del archivo.
4. Publica: *Implementar* → *Administrar implementaciones* → ✏️ editar la implementación actual → *Versión: nueva versión* → *Implementar*. Así la URL no cambia. (Si es la primera vez: *Nueva implementación* → *Aplicación web*, ejecutar como **tú**, acceso **cualquier usuario**.)
5. En la app abre **Ajustes** (⚙️), pega la URL y pulsa *Guardar y verificar*. Debe decir “Sincronización completa”.

6. **Prepara la hoja (una vez):** recarga la hoja y usa el menú **GastosApp → Preparar hoja para la app**. Sin borrar ni mover datos:
   - crea las pestañas que falten (Registro de Gastos, Registro de Ingresos, BDGastos, BDIngresos, Presupuestos, Recurrentes) con sus encabezados;
   - agrega al final las columnas que falten (Medio de pago, ID, Moneda, Monto original, Tasa CAD→COP);
   - fija la fila de encabezados y da formato de fecha y número;
   - pone listas desplegables en modo *advertencia* donde no hay ninguna (categorías desde BDGastos/BDIngresos y medio de pago) y avisa si alguna de las tuyas *rechaza* valores;
   - crea la pestaña **Resumen** (gastos por mes y macro-categoría, ingresos por mes) con fórmulas `QUERY`.

   Se puede ejecutar de nuevo cuando quieras: lo que ya está bien no se toca.

Opcional: pon una clave en `CONFIG.TOKEN` y escríbela en el campo *Clave del script* de la app para que nadie más pueda escribir en tu hoja aunque conozca la URL.

### Cómo funciona

- **Funciona con Tablas de Google Sheets** (o rangos normales): cada columna se ubica por su encabezado en la fila 1 (acepta variantes como “Concepto de Gasto” o “Macro-categoría”), así que puedes reordenarlas o agregar otras. Los registros nuevos van en la primera fila vacía de la Tabla.
- **Tus categorías salen de la hoja:** la app lee **BDGastos** (Macro-categoría · Subcategoría · Concepto) y **BDIngresos** (Tipo de ingreso · Concepto). Lo que agregues o borres ahí aparece en la app al sincronizar; las macro-categorías nuevas reciben su ícono y color. El botón *+ Concepto* de la app también agrega la fila a BDGastos.
- **Listas desplegables:** si la hoja rechaza un valor (por ejemplo una categoría que borraste), la fila no queda a medias, el registro queda marcado en rojo y la campana dice qué valor y en qué columna; al editarlo a uno válido se envía.

- **Tarjeta de crédito:** cada compra con la TC se registra como gasto en su categoría el día de la compra, con medio de pago *Tarjeta de crédito*. El pago de la tarjeta a fin de mes **no** es un gasto (solo mueve dinero de la cuenta a la tarjeta); en *Deudas → Tarjetas de crédito → Intereses y cargos TC* registra solo intereses, cuota de manejo o cargos del banco. En *Movimientos* filtra por “Tarjeta de crédito” para ver cuánto llevas cargado.
- **La hoja está en CAD.** La columna **Valor (CAD)** guarda el monto en dólares canadienses; al final de cada pestaña se agregan **ID**, **Moneda** (en qué moneda se registró), **Monto original** (en esa moneda), **Tasa CAD→COP** y **Medio de pago** (se buscan por encabezado, así que puedes moverlas).
- **Migración automática (una vez):** al sincronizar por primera vez con el script v4, las filas que estaban en COP se convierten a CAD con la tasa del día; su monto exacto en COP queda en *Monto original*. Las registradas en CAD recuperan su monto original exacto.
- **Puedes editar la hoja a mano:** *Valor (CAD)* manda. Si lo cambias, la app ajusta el monto original; una fila nueva escrita a mano se toma como CAD y recibe su id.
- Hacia la app el script entrega el valor en COP y en CAD, así una versión vieja de la app abierta en otro dispositivo no muestra cifras erradas.
- Con un script anterior la app sigue funcionando (con un script anterior a la v6, con su catálogo propio y conservando moneda y medio de pago en el dispositivo; con la v6, con presupuestos y recurrentes solo en el dispositivo), y la campana avisa para actualizarlo a la v7.
- La app envía `POST` con JSON en `text/plain` (sin preflight CORS), lee la respuesta y solo marca un cambio como enviado cuando el script confirma `ok`.
- Sin conexión, los cambios quedan **pendientes** (☁️ tachado) y se envían solos al volver la red o al abrir la app; también con *Reenviar pendientes*.
- La app se sincroniza sola al abrirse y al volver a ella (como máximo cada 2 minutos), o con *Sincronizar ahora*.
- Primero se envían los cambios locales y luego se descarga la hoja, de modo que nada pendiente se pisa.
- *Vaciar registros* solo borra los datos del dispositivo; la hoja no se toca.
- Con el **script antiguo** la app sigue funcionando en modo compatible (solo envía registros nuevos) y muestra un aviso para actualizarlo.

### Presupuestos y recurrentes en la hoja (v7)

- **Presupuestos** (`Macro-categoría | Límite | Moneda`): una fila por macro-categoría con su límite mensual en la moneda en que lo editaste (CAD o COP).
- **Recurrentes** (`ID | Tipo | Macro-categoría / Tipo de ingreso | Subcategoría | Concepto | Nota | Monto | Moneda | Medio de pago | Día | Modo | Activo | Último mes`): una fila por plantilla. *Modo* es `Proponer` o `Automático`; *Último mes* (`AAAA-MM`) es el último mes ya registrado u omitido, y evita que otro dispositivo vuelva a proponerlo.
- Las pestañas se crean solas la primera vez que la app envía algo (o con *Preparar hoja*). Las columnas se ubican por encabezado, igual que en los registros, y funcionan como Tabla de Google Sheets.
- **Puedes editarlas a mano:** cambia un límite, pausa un recurrente (*Activo* = `No`) o agrega una fila; una fila sin ID recibe uno y, si no tiene *Último mes*, se propone desde el mes en curso. Borrar una fila borra ese recurrente en todos los dispositivos.
- **Regla de conflictos — lo último que llega a la hoja gana:** cada cambio hecho en la app se envía al momento (o queda pendiente sin conexión, como los movimientos). Al sincronizar, la hoja manda, salvo lo que el dispositivo aún no ha enviado. Los presupuestos viajan como un conjunto: el dispositivo que envía después deja los suyos. El *Último mes* nunca retrocede: si un dispositivo ya registró u omitió un mes más reciente, ese valor se conserva.
- **Primera sincronización con la v7:** si la pestaña Presupuestos está vacía, se suben los límites de la app (si ya tiene datos, se toman los de la hoja). Los recurrentes de cada dispositivo se **suman** a los de la hoja, así no se pierde ninguno; si quedó alguno repetido, bórralo en un dispositivo y desaparece en los demás.
- Si vacías a mano la pestaña Presupuestos, el siguiente dispositivo que sincronice la vuelve a llenar con sus límites.

Acciones del script (`POST`): `ping`, `list` (registros, catálogo, presupuestos y recurrentes), `catalog`, `addCatalog`, `upsert` (crea o actualiza por `id`), `delete`, `setBudgets`, `upsertRecurring` y `deleteRecurring`. El `GET` sin clave devuelve el listado.

---

## 🛠️ Tecnologías

- **HTML5 y JavaScript** sin frameworks.
- **Tailwind CSS (CDN)** con la paleta del Design System de Stitch (verde esmeralda Material 3).
- **Manrope, JetBrains Mono y Material Symbols Outlined**.
- **Servidor estático en Node.js** sin dependencias.

---

## 🚀 Uso local

```bash
npm start
```

Luego abre [http://localhost:3000](http://localhost:3000). El servidor solo entrega archivos del proyecto (bloquea rutas fuera de la carpeta y archivos ocultos como `.git`).

---

## 📁 Estructura del proyecto

```text
├── assets/
│   ├── logo.svg                 # Logo vectorial
│   ├── icon-192.png             # Iconos PWA
│   └── icon-512.png
├── apps-script/
│   └── Code.gs                  # Script para Google Sheets (sincronización en ambos sentidos)
├── stitch_export/               # Pantallas originales de Stitch (referencia de diseño)
├── index.html                   # SPA: vistas, modales y configuración de Tailwind
├── app.js                       # Estado, cálculos, render, sincronización y conversor
├── styles.css                   # Animaciones y transiciones
├── sw.js                        # Service worker (red primero, caché de respaldo)
├── manifest.webmanifest         # Manifiesto PWA
├── server.js                    # Servidor HTTP estático
├── package.json
└── README.md
```

---

## 📄 Licencia

MIT © 2024
