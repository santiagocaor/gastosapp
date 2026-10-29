# 📱 GastosApp - Control de Gastos y Presupuestos

Aplicación web *mobile-first* para finanzas personales: registra gastos e ingresos en pesos colombianos (COP), controla presupuestos mensuales por categoría y analiza en qué se va el dinero. Funciona sola en el navegador y, si quieres, se sincroniza con tu Google Sheet **BDGastosApp** a través de Google Apps Script.

Diseño concebido con **Google Stitch** (`stitch.withgoogle.com`) y desarrollado como una SPA en JavaScript puro, sin dependencias ni paso de compilación.

---

## ✨ Características

- 📊 **Inicio**
  - Balance total acumulado (con modo privacidad), ingresos y gastos del mes y tasa de ahorro.
  - Selector de mes para revisar meses anteriores.
  - Barra de presupuesto global con lo que queda y los días restantes del mes.
  - Movimientos del mes: toca uno para **editarlo** o usa la papelera para borrarlo.
- ➕ **Registrar**
  - Gastos por macro-categoría → subcategoría → concepto (Necesidades, Deseos, Deudas, Ahorros, Inversiones).
  - Ingresos por tipo → concepto.
  - **Fecha editable** (para registrar movimientos de días anteriores) y nota opcional.
  - Atajo para convertir un monto de CAD a COP con la tasa del día.
- 📈 **Estadísticas**
  - Periodos: últimos 7 días, mes, año y todo el historial.
  - Comparación real con el periodo anterior equivalente, ingresos, ahorro neto y ritmo de gasto diario.
  - Donut por categoría, barras de ingresos vs. gastos de los últimos 6 meses y top 5 de conceptos.
- 🏷️ **Categorías**
  - Buscador (ignora tildes), filtros por presupuesto y detalle de subcategorías y conceptos.
  - **Conceptos propios**: añade subcategorías/conceptos nuevos desde la app (botón *Nueva*).
- 💰 **Presupuesto**
  - Límites mensuales editables en línea por macro-categoría, estado de cada uno y proyección de cierre de mes.
- 🔔 **Alertas** de categorías cerca del tope o excedidas, gastos mayores que ingresos y registros sin sincronizar.
- 💱 **Conversor COP ⇄ CAD** con tasa de mercado en vivo (open.er-api.com, con respaldo en exchangerate-api.com).
- 💾 **Datos**
  - Todo se guarda en el navegador (`localStorage`).
  - Respaldo e importación en JSON y exportación a CSV desde *Ajustes*.
- 📲 **PWA**: instalable en el celular y con caché sin conexión (service worker).

---

## 🔄 Sincronización con Google Sheets

1. Publica tu Google Apps Script como aplicación web y copia la URL (`https://script.google.com/macros/s/.../exec`).
2. En la app abre **Ajustes** (⚙️) y pega la URL.

Cómo funciona:

- Cada registro nuevo se envía por `POST` al script. Si no hay conexión queda **pendiente** (icono ☁️ tachado) y se reintenta solo al recuperar la red, o manualmente con *Reenviar pendientes*.
- Al conectar Sheets por primera vez también se envían los registros creados en la app que nunca se habían enviado.
- *Cargar desde Google Sheets* reemplaza los datos locales por los de la hoja, **conservando y reenviando** los pendientes.
- Editar o borrar un registro que ya está en Sheets solo lo cambia en la app; en la hoja hay que corregirlo a mano.
- Como el envío usa `mode: "no-cors"`, la app detecta fallos de red pero no errores internos del script.

El script debe responder al `GET` con `{ "gastos": [[fecha, valor, macro, sub, concepto, nota], ...], "ingresos": [[fecha, valor, tipo, concepto, nota], ...] }` (la primera fila de cada lista son los encabezados).

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
