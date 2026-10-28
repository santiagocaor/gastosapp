# 📱 GastosApp - Control de Gastos y Presupuestos

Aplicación web moderna y responsive para la gestión de finanzas personales, registro de gastos e ingresos, control de presupuestos por categorías y análisis estadístico.

Diseño concebido e iterado con **Google Stitch** (`stitch.withgoogle.com`) y desarrollado como una Single Page Application (SPA) ligera, rápida y sin dependencias pesadas.

---

## ✨ Características

- 📊 **Dashboard Financiero Completo**:
  - Balance total disponible con opción para alternar privacidad (`$2,450.00` ↔ `••••••••`).
  - Desglose de ingresos vs. gastos del mes y cálculo de ahorro (+8.4%).
  - Barra de consumo presupuestario global con estimación de días y saldo restante.
- ➕ **Registro de Movimientos**:
  - Clasificación por tipo: Gasto, Ingreso y Transferencia.
  - Selector interactivo de moneda (USD, EUR, MXN).
  - Categorías y subcategorías dinámicas (Alimentación, Transporte, Vivienda, Ocio, Salud, Educación).
  - Métodos de pago (Visa Débito, Efectivo, Tarjeta de Crédito).
  - Soporte para notas de concepto, simulación de comprobante/recibo y gastos recurrentes.
- 📈 **Estadísticas y Análisis**:
  - Gráfico Donut SVG interactivo con arcos proporcionales calculados en vivo.
  - Ritmo de gasto diario y comparativas mensuales.
  - Leyenda detallada por categoría con montos y porcentajes.
- 🏷️ **Gestión de Categorías y Presupuestos**:
  - Asignación y edición de techos presupuestarios por categoría.
  - Alertas automáticas de consumo crítico (*"¡Casi al tope!"*).
  - Acordeón de subcategorías y buscador en tiempo real.
- 💾 **Persistencia Local**:
  - Todos los datos se sincronizan automáticamente en el navegador mediante `localStorage`.

---

## 🛠️ Tecnologías

- **HTML5 & Vanilla JavaScript**: Lógica reactiva modular sin frameworks pesados.
- **Tailwind CSS**: Tokens y paleta cromática extraída directamente del Design System de Stitch (Verde esmeralda Material 3).
- **Tipografías e Iconografía**: Manrope, JetBrains Mono y Google Material Symbols Outlined.
- **Backend / Dev Server**: Servidor estático nativo en Node.js (0 dependencias externas).

---

## 🚀 Instalación y Uso Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/santiagocaor/gastosapp.git
   cd gastosapp
   ```

2. **Iniciar la aplicación**:
   ```bash
   npm start
   # o directamente:
   node server.js
   ```

3. **Abrir en el navegador**:
   Visita [http://localhost:3000](http://localhost:3000)

---

## 📁 Estructura del Proyecto

```text
├── assets/
│   └── logo.svg                 # Logo oficial vectorial de GastosApp
├── stitch_export/               # Pantallas originales descargadas desde Stitch
│   ├── inicio.html
│   ├── registrar_gasto.html
│   ├── categorias_presupuestos.html
│   ├── estadisticas.html
│   └── logo.svg
├── index.html                   # SPA unificada interactiva
├── app.js                       # Estado global, cálculos reactivos y navegación
├── styles.css                   # Animaciones, transiciones y estilos visuales
├── server.js                    # Servidor HTTP ligero en Node.js
├── package.json
└── README.md
```

---

## 📄 Licencia

MIT © 2024
