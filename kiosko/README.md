# CIRA Kiosko — Documentación técnica completa

Experiencia táctil de kiosko para el asistente virtual **CIRA** de la Cámara Petrolera de Venezuela. Diseñado para pantallas verticales de evento/stand, sin dependencias de CDN externas.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Estructura de archivos](#2-estructura-de-archivos)
3. [Requisitos del sistema](#3-requisitos-del-sistema)
4. [Cómo ejecutar el kiosko](#4-cómo-ejecutar-el-kiosko)
5. [Flujo de navegación](#5-flujo-de-navegación)
6. [Configuración del widget de chat](#6-configuración-del-widget-de-chat)
7. [Sistema de inactividad (Idle Manager)](#7-sistema-de-inactividad-idle-manager)
8. [Ajustes de visualización y escala](#8-ajustes-de-visualización-y-escala)
9. [Animaciones — ajuste y control](#9-animaciones--ajuste-y-control)
10. [Ajustes de tipografía y botones](#10-ajustes-de-tipografía-y-botones)
11. [Variables CSS — referencia rápida](#11-variables-css--referencia-rápida)
12. [Problemas comunes y soluciones](#12-problemas-comunes-y-soluciones)
13. [Consideraciones de rendimiento](#13-consideraciones-de-rendimiento)
14. [Modo kiosko en Chrome/Edge](#14-modo-kiosko-en-chromeedge)

---

## 1. Visión general

El sistema está compuesto por **tres páginas HTML** completamente autónomas que se comunican entre sí mediante navegación normal. Todo el CSS, JS e imágenes se sirven localmente desde la carpeta `./kiosko`. No se requiere conexión a internet para el front-end (sí para el webhook de n8n).

| Página | Archivo | Función |
|---|---|---|
| Landing | `index.html` | Bienvenida, avatar animado, acceso al bot |
| Chat | `bot.html` | Interfaz de conversación con CIRA |
| Ayuda | `ayuda.html` | Guía de uso para el visitante |

---

## 2. Estructura de archivos

```
kiosko/
├── index.html                  ← Landing page con avatar animado
├── bot.html                    ← Página del chat embebido
├── ayuda.html                  ← Guía de uso en tarjetas
├── README.md                   ← Esta documentación
└── assets/
    ├── css/
    │   └── kiosk.css           ← Sistema de diseño completo (único archivo CSS)
    ├── js/
    │   ├── kiosk.js            ← Transiciones de página + anti-zoom táctil
    │   ├── idle-manager.js     ← Temporizador de inactividad configurable
    │   └── chat-widget-kiosk.js← Widget de chat local (sin CDN)
    └── img/
        ├── cirabot.png         ← Avatar del bot (copiado desde raíz del repo)
        └── campet-logo.png     ← Logo corporativo (copiado desde raíz del repo)
```

### Responsabilidad de cada archivo JS

**`kiosk.js`**
- Aplica transición fade-in al cargar cada página
- Intercepta clicks en enlaces internos para hacer fade-out antes de navegar
- Bloquea pinch-zoom y doble-tap zoom (comportamiento kiosko)
- Expone `window.KioskNav` con métodos `goTo()`, `home()`, `bot()`, `help()`

**`idle-manager.js`**
- Detecta interacción del usuario (touch, mouse, teclado, scroll)
- Reinicia el contador con cada interacción
- Muestra overlay de aviso N segundos antes del timeout
- Ejecuta el callback `onIdle` cuando se agota el tiempo
- Expone `IdleManager.init()`, `IdleManager.extend()`, `IdleManager.destroy()`

**`chat-widget-kiosk.js`**
- Versión local del widget (sin CDN)
- Solo modo inline (no bubble)
- Genera sesión fresca en cada visita (no persiste en `localStorage`)
- Expone `window.CiraKiosk.reset()` para limpiar el chat
- Expone `window.sendPrompt()` para compatibilidad con tarjetas del bot
- Inyecta sus propios estilos CSS en `<head>` al inicializarse

---

## 3. Requisitos del sistema

### Hardware recomendado para kiosko
- Pantalla: 1080×1920 px (Full HD vertical) o superior
- Touch: capacitivo de 10 puntos o más
- RAM: mínimo 4 GB para navegador kiosko
- Conexión: WiFi o Ethernet al servidor n8n (solo para el webhook)

### Software
- Cualquier navegador moderno: Chrome 90+, Edge 90+, Firefox 88+, Safari 14+
- Para kiosko real: Chrome o Edge en modo `--kiosk`
- No requiere Node.js, npm ni ningún build tool

---

## 4. Cómo ejecutar el kiosko

### Opción A — Servidor HTTP local (recomendada para producción en evento)

Evita problemas de CORS con `fetch()` al usar `file://`.

**Con Python (disponible por defecto en Windows 10/11):**
```bash
cd ruta/a/kiosko
python -m http.server 8080
```
Luego abre: `http://localhost:8080/index.html`

**Con Node.js:**
```bash
npx serve kiosko -p 8080
```

**Con VS Code (extensión Live Server):**
Click derecho en `index.html` → "Open with Live Server"

### Opción B — Abrir directamente como archivo

```
Doble clic en index.html
```
Funciona para navegar entre páginas. El chat puede tener limitaciones de CORS dependiendo del navegador y la configuración del servidor n8n.

### Opción C — Servidor estático en producción

Copia toda la carpeta `kiosko/` al servidor web y apunta el navegador a `index.html`. No requiere servidor backend (el backend es el webhook de n8n).

---

## 5. Flujo de navegación

```
index.html (Landing)
    │
    ├─ [Iniciar conversación] ──────────────► bot.html
    │                                             │
    ├─ [¿Cómo funciona?] ──► ayuda.html          ├─ [Nueva]   → resetea chat (misma página)
    │                            │                ├─ [Ayuda]   → ayuda.html
    │                            ├─ [Usar CIRA] → bot.html    └─ [Inicio]  → index.html
    │                            └─ [Inicio]   → index.html
    │
    └─ Inactividad 120s → recarga index.html

bot.html — Temporizadores de inactividad:
    ├─ 75 s sin interacción → muestra overlay de aviso con cuenta regresiva 15 s
    ├─ 90 s sin interacción → limpia chat + redirige a index.html
    └─ [Continuar conversación] → cancela el timer y oculta el overlay

ayuda.html — Inactividad 120s → redirige a index.html (sin overlay)
```

---

## 6. Configuración del widget de chat

El widget se configura en `bot.html` mediante el objeto global `window.ChatWidgetConfig`:

```javascript
window.ChatWidgetConfig = {
  // URL del webhook de n8n — ÚNICO parámetro obligatorio
  webhookUrl: 'https://vmi2945958.contaboserver.net/webhook/cira-botV2',

  // Ruta local al avatar (relativa al HTML que lo carga)
  avatar: 'assets/img/cirabot.png',

  // Modo de display — solo 'inline' está soportado en la versión kiosko
  mode: 'inline',

  // Selector CSS del contenedor donde se monta el chat
  mountSelector: '#cira-chat-kiosk',

  // Personalización de colores
  style: {
    primaryColor: '#faa819'  // Color dorado de la marca CPV
  }
};
```

### Cambiar el webhook

Si el servidor n8n cambia de URL, solo hay que editar la línea `webhookUrl` en `bot.html`.

### Cambiar el color primario

Modificar `primaryColor` en la config cambia: botón enviar, color de links en respuestas, burbujas del usuario, borde del avatar en el chat. El color del sistema de diseño (botones CTA, glow, etc.) se controla por separado en `kiosk.css` con `--clr-primary`.

---

## 7. Sistema de inactividad (Idle Manager)

### Parámetros configurables

Cada página inicializa el `IdleManager` con valores propios. Para ajustar los tiempos, editar el bloque `<script>` al final del HTML correspondiente:

**bot.html** — Configuración más estricta (resetea la sesión)
```javascript
IdleManager.init({
  timeout:     90000,   // Tiempo total en ms antes de ejecutar onIdle (default: 90 s)
  warningAt:   15000,   // Ms ANTES del timeout en que aparece el overlay de aviso (default: 15 s)
  warningEl:   document.getElementById('idle-overlay'),   // Elemento overlay (puede ser null)
  countdownEl: document.getElementById('idle-countdown'), // Span con la cuenta regresiva
  onIdle: function () {
    if (window.CiraKiosk) window.CiraKiosk.reset(); // Limpia el chat
    window.location.href = 'index.html';             // Vuelve al inicio
  }
});
```

**index.html y ayuda.html** — Configuración permisiva (solo recarga/redirige)
```javascript
IdleManager.init({
  timeout:  120000,   // 2 minutos
  warningAt: 20000,   // 20 s de aviso (sin overlay, solo callback)
  onIdle: function () { location.reload(); }
});
```

### Tiempos recomendados según contexto

| Situación | timeout | warningAt |
|---|---|---|
| Stand con alta rotación | 60000 (1 min) | 10000 |
| Stand con consultas largas | 120000 (2 min) | 20000 |
| Presentación permanente | 300000 (5 min) | 30000 |
| Modo demo sin reset | No inicializar IdleManager | — |

### Deshabilitar el idle completamente

Comentar o eliminar el bloque `IdleManager.init(...)` en la página deseada. El overlay de `bot.html` permanecerá oculto porque la clase `idle-visible` nunca se agrega.

---

## 8. Ajustes de visualización y escala

Esta es la sección más importante si el kiosko **no se ve correctamente** en la pantalla del evento.

### 8.1 — El texto se ve muy pequeño

La tipografía base es `16px`. Para escalar TODO el sistema proporcionalmente, cambiar el `font-size` del elemento `html` en `kiosk.css`:

```css
/* kiosk.css — línea ~77 */
html {
  font-size: 18px;  /* Aumentar de 16px a 18px o 20px para pantallas grandes */
}
```

Dado que todas las fuentes usan `rem`, este único cambio escala todo el sistema.

### 8.2 — Los botones son muy pequeños para la pantalla táctil

Aumentar las variables de tamaño mínimo en la sección `:root` de `kiosk.css`:

```css
/* kiosk.css — sección :root */
--btn-min-h:   80px;    /* Default: 64px — altura mínima de botones estándar */
--btn-cta-h:  100px;    /* Default: 80px — altura del botón CTA principal */
--btn-nav-h:   60px;    /* Default: 48px — altura de botones de navegación */
```

### 8.3 — El avatar se ve muy pequeño o muy grande

Ajustar en la sección `.avatar-wrapper` y `.avatar-img` de `kiosk.css`:

```css
/* kiosk.css — sección Avatar */
.avatar-wrapper {
  width: 280px;   /* Default: 224px */
  height: 280px;  /* Default: 224px */
}

.avatar-img {
  width: 256px;   /* Default: 200px */
  height: 256px;  /* Default: 200px */
}
```

> **Importante:** mantener `avatar-wrapper` siempre ~24px más grande que `avatar-img` para que los anillos de onda tengan espacio de origen.

### 8.4 — La landing no cabe en pantalla (contenido cortado)

Si el gap entre secciones es muy grande, reducirlo en `.landing-main`:

```css
/* kiosk.css */
.landing-main {
  gap: 20px;      /* Default: 36px — reducir si no cabe todo */
  padding: 16px 32px;  /* Default: 28px 40px */
}
```

### 8.5 — La barra de navegación es muy alta o muy baja

```css
/* kiosk.css — sección :root */
--nav-h: 70px;   /* Default: 80px */
```

### 8.6 — El chat ocupa demasiado o demasiado poco espacio

El chat en `bot.html` ocupa todo el espacio disponible entre la nav y el borde inferior. Si necesitas ajustar, modificar el padding del pie de input en `chat-widget-kiosk.js` (sección `injectCSS`):

```javascript
// chat-widget-kiosk.js — dentro de injectCSS(), buscar:
'.ck-foot{padding:14px 18px;...'
// Aumentar el padding para más espacio visual en el área de input
```

### 8.7 — Pantalla horizontal (landscape) en lugar de vertical

El diseño está optimizado para portrait. Si la pantalla es landscape, ajustar:

```css
/* kiosk.css — .landing-main */
.landing-main {
  flex-direction: row;        /* Cambia de columna a fila */
  justify-content: space-evenly;
  align-items: center;
}

/* Y reducir el avatar */
.avatar-wrapper { width: 180px; height: 180px; }
.avatar-img     { width: 160px; height: 160px; }
```

### 8.8 — Pantallas de alta densidad (4K, Retina)

El sistema usa `rem` y `px` que escalan bien. Si las imágenes se ven pixeladas:
- Reemplazar `cirabot.png` por una versión de 600×600 px o mayor
- El logo `campet-logo.png` es PNG; si se ve borroso usar versión SVG

### 8.9 — El logo no aparece o se corta

```css
/* kiosk.css */
.logo-img {
  height: 56px;   /* Default: 50px — ajustar según proporción del logo */
  max-width: 200px;  /* Agregar para evitar que desborde en nav estrecha */
}
```

### 8.10 — La burbuja de descripción desborda

```css
/* kiosk.css */
.description-bubble {
  max-width: 500px;    /* Default: 620px — reducir si la pantalla es más angosta */
  padding: 16px 22px;  /* Default: 22px 32px */
}
```

---

## 9. Animaciones — ajuste y control

### 9.1 — Ondas concéntricas del avatar (latido)

Las ondas están definidas en `kiosk.css`. Tres anillos (`avatar-ring`, `avatar-ring-2`, `avatar-ring-3`) ejecutan la misma animación `ripplePulse` con delays escalonados de 0.8 s.

**Para hacer las ondas más rápidas o lentas:**
```css
/* kiosk.css — sección .avatar-ring */
.avatar-ring {
  animation: ripplePulse 2.4s cubic-bezier(0.20, 0.60, 0.40, 1) infinite;
  /*                     ^^^^
     Cambiar: 1.6s = más rápido (agresivo)
               2.4s = velocidad actual (natural)
               3.2s = más lento (suave)
  */
}
```

**Para ajustar qué tan lejos se expanden las ondas:**
```css
/* kiosk.css — @keyframes ripplePulse */
@keyframes ripplePulse {
  0%   { transform: scale(0.95); opacity: 0.75; }
  100% { transform: scale(2.10); opacity: 0;    }
  /*                       ^^^^
     Cambiar: 1.60 = ondas cortas y compactas
               2.10 = expansión actual (recomendada)
               2.80 = ondas muy largas
  */
}
```

**Para añadir o quitar anillos:**
- Agregar más divs con clase `avatar-ring avatar-ring-N` en `index.html`
- Agregar en CSS: `.avatar-ring-4 { animation-delay: 2.40s; }` (múltiplos de 0.8 s)
- Para dos anillos: eliminar el tercer div de `index.html`

### 9.2 — Flotación del avatar

```css
/* kiosk.css — @keyframes avatarFloat */
@keyframes avatarFloat {
  0%, 100% { transform: translateY(0px);   }
  50%       { transform: translateY(-11px); }
  /*                                 ^^^
     Cambiar: -5px  = movimiento muy sutil
              -11px = movimiento actual
              -18px = movimiento pronunciado
  */
}
```

Para cambiar la velocidad del float, modificar la duración en `.avatar-img`:
```css
.avatar-img {
  animation:
    avatarPopIn  0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both,
    avatarFloat  4s ease-in-out 1.1s infinite;
    /*           ^^
       4s = velocidad actual
       6s = más lento y soñador
       2s = más enérgico
    */
}
```

### 9.3 — Desactivar animaciones completamente

Para desactivar todas las animaciones (útil en hardware antiguo o si causan mareo):

```css
/* Agregar al final de kiosk.css */
* {
  animation: none !important;
  transition: none !important;
}
```

O activar el modo de movimiento reducido en el sistema operativo — el CSS ya incluye `@media (prefers-reduced-motion: reduce)` que detiene todas las animaciones automáticamente.

### 9.4 — Animación de entrada (pop-in)

El avatar aparece con un efecto de resorte al cargar la página:
```css
/* kiosk.css — @keyframes avatarPopIn */
@keyframes avatarPopIn {
  from { opacity: 0; transform: scale(0.55) translateY(18px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
}
```
Para eliminar solo el pop-in y mantener el float:
```css
.avatar-img {
  animation: avatarFloat 4s ease-in-out 0s infinite; /* Quitar avatarPopIn */
}
```

---

## 10. Ajustes de tipografía y botones

### Fuentes

El sistema usa la pila de fuentes del sistema operativo (sin descarga externa):
```css
--font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Arial, sans-serif;
```

Para usar una fuente específica (ej. descargada localmente):
```css
/* Agregar al inicio de kiosk.css */
@font-face {
  font-family: 'MiFuente';
  src: url('assets/fonts/MiFuente-Regular.woff2') format('woff2');
}

/* Luego en :root */
--font: 'MiFuente', system-ui, sans-serif;
```

### Tamaños de texto

Todos los tamaños se definen como variables en `:root`:
```css
--fz-xs:  0.85rem;   /* Botones nav, texto secundario */
--fz-sm:  1rem;      /* Texto estándar */
--fz-md:  1.15rem;   /* Descripción, subtítulos */
--fz-lg:  1.4rem;    /* Botón CTA, énfasis */
--fz-xl:  2rem;      /* Títulos de sección */
--fz-xxl: 2.8rem;    /* No se usa actualmente — disponible */
```

Para una pantalla muy grande (ejemplo: 55"), escalar toda la tipografía:
```css
/* Reemplazar los valores de :root */
--fz-xs:  1rem;
--fz-sm:  1.2rem;
--fz-md:  1.4rem;
--fz-lg:  1.7rem;
--fz-xl:  2.4rem;
```

---

## 11. Variables CSS — referencia rápida

Todas las variables están en la sección `:root` de `kiosk.css` (primeras ~60 líneas).

| Variable | Valor default | Descripción |
|---|---|---|
| `--clr-primary` | `#faa819` | Dorado de marca — botones, glow, accents |
| `--clr-primary-dark` | `#d4890c` | Dorado oscuro — estado :active |
| `--clr-primary-glow` | `rgba(250,168,25,0.32)` | Transparencia para efectos de luz |
| `--clr-bg-deep` | `#0d1117` | Fondo más oscuro (página bot) |
| `--clr-bg-main` | `#0f172a` | Fondo principal (landing, ayuda) |
| `--clr-bg-nav` | `#1e293b` | Fondo de la barra de navegación |
| `--clr-bg-card` | `rgba(30,41,59,0.88)` | Fondo de tarjetas y burbuja |
| `--clr-text` | `#f1f5f9` | Texto principal (casi blanco) |
| `--clr-text-muted` | `#94a3b8` | Texto secundario (gris azulado) |
| `--clr-border` | `rgba(255,255,255,0.08)` | Bordes sutiles |
| `--nav-h` | `80px` | Altura de la barra de navegación |
| `--foot-h` | `52px` | Altura del footer |
| `--btn-min-h` | `64px` | Altura mínima botones estándar |
| `--btn-cta-h` | `80px` | Altura botón CTA principal |
| `--btn-nav-h` | `48px` | Altura botones de navegación |
| `--r-sm` | `8px` | Radio de borde pequeño |
| `--r-md` | `14px` | Radio de borde mediano |
| `--r-lg` | `24px` | Radio de borde grande |
| `--r-pill` | `100px` | Botones redondeados (pill) |
| `--shadow-btn` | `0 4px 18px rgba(250,168,25,0.35)` | Sombra dorada botones |

---

## 12. Problemas comunes y soluciones

### El chat no responde / no se envían mensajes

**Causa más probable:** el navegador bloquea `fetch()` hacia el servidor n8n por CORS o por usar `file://`.

**Soluciones:**
1. Servir el kiosko desde un servidor HTTP local (ver sección 4 opción A)
2. Verificar que el servidor n8n permite CORS desde el origen del kiosko
3. Abrir la consola del navegador (F12 → Console) y buscar errores `CORS` o `fetch failed`

### El overlay de inactividad no desaparece al tocar

**Causa:** el evento touch puede no estar llegando al documento si hay un elemento encima.

**Solución:** asegurarse de que el botón "Continuar conversación" llama a `IdleManager.extend()` y que el overlay tiene `pointer-events: none` cuando está oculto (ya está así por defecto con la clase `idle-visible`).

### El avatar no aparece

**Causas posibles:**
- La imagen `cirabot.png` no está en `assets/img/`
- La ruta en `bot.html` dentro de `ChatWidgetConfig.avatar` no es correcta

**Solución:** verificar que el archivo existe con la ruta exacta `kiosko/assets/img/cirabot.png`. El `<img>` tiene `onerror="this.style.display='none'"` así que falla silenciosamente.

### Las ondas del avatar no se ven

**Causas posibles:**
- El navegador no soporta CSS `@keyframes` con `will-change` (muy raro)
- El elemento `.avatar-wrapper` tiene `overflow: hidden`

**Solución:** el wrapper debe tener `overflow: visible` (es el default). Si se ve afectado, revisar que no haya reglas heredadas que lo cambien.

### La página no llena toda la pantalla

**Causa:** el navegador está en modo ventana, no en kiosko.

**Solución:**
- Usar el modo kiosko de Chrome (ver sección 14)
- O presionar F11 para pantalla completa manual

### Los botones de navegación están muy juntos o se superponen

**Causa:** la resolución de pantalla es menor a 1080px de ancho.

**Solución:** reducir el font-size de los botones de nav y/o ocultar los labels en pantallas pequeñas:
```css
@media (max-width: 900px) {
  .btn-label { display: none; }
  .btn-nav   { padding: 10px 14px; }
}
```

### El chat muestra el texto muy pequeño en las respuestas del bot

Las respuestas del bot se renderizan como HTML. El tamaño de fuente del chat está controlado en `chat-widget-kiosk.js` dentro de `injectCSS()`. Buscar:
```javascript
'.ck-bubble{padding:13px 17px;...font-size:1.05rem;...'
```
Cambiar `1.05rem` a `1.15rem` o más según sea necesario.

### El logo de CAMPET aparece demasiado grande en la nav

```css
/* kiosk.css */
.logo-img {
  height: 42px;     /* Reducir de 50px */
  max-width: 160px; /* Agregar límite de ancho */
}
```

### La sesión no se reinicia entre usuarios

Por diseño, el widget genera una sesión nueva cada vez que `CiraKiosk.reset()` es llamado o cuando se recarga la página. Si el idle manager está desactivado, los usuarios compartirán contexto de conversación.

**Verificar** que `IdleManager.init()` está presente en `bot.html` y que el callback llama a `CiraKiosk.reset()`.

### Las transiciones entre páginas se ven en negro un momento

Esto ocurre si `kiosk.js` no se carga antes de que el DOM esté listo. El script usa `document.readyState` para manejar esto. Si persiste:
- Verificar que `<script src="assets/js/kiosk.js">` está al final del `<body>`
- No mover el script al `<head>`

---

## 13. Consideraciones de rendimiento

### Animaciones GPU

Las animaciones del avatar usan exclusivamente `transform` y `opacity`, las únicas dos propiedades que los navegadores modernos animan en el hilo del compositor GPU (sin afectar el hilo principal). El `will-change: transform, opacity` en `.avatar-ring` pre-promueve los elementos a su propia capa de composición antes de que comience la animación, eliminando el primer frame de latencia.

**No usar** `width`, `height`, `top`, `left`, `margin` o `background` en keyframes de animación continua, ya que disparan Layout y Paint en el hilo principal.

### Imagen del avatar

`cirabot.png` (710 KB) es una imagen grande. Para kiosko local esto no es problema ya que se carga desde disco. Si se nota lentitud en el primer render del avatar, crear una versión optimizada:

```bash
# Con ImageMagick (opcional)
magick cirabot.png -resize 300x300 -quality 85 cirabot-kiosk.png
```

Y actualizar la ruta en `bot.html` y `kiosk.css`.

### Memoria del navegador en kiosko 24/7

Si el kiosko corre ininterrumpidamente durante días, el navegador puede acumular memoria. Estrategias:
1. Configurar Chrome para reiniciarse automáticamente cada 24 h (Task Scheduler en Windows)
2. El `IdleManager` limpia el chat con `CiraKiosk.reset()` en cada inactividad, liberando nodos DOM

---

## 14. Modo kiosko en Chrome/Edge

### Windows

```batch
# Crear acceso directo con estos argumentos:
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --no-first-run ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-restore-session-state ^
  --kiosk-printing ^
  "http://localhost:8080/index.html"
```

### Configuraciones útiles adicionales

| Flag | Efecto |
|---|---|
| `--start-fullscreen` | Pantalla completa sin modo kiosko estricto |
| `--disable-pinch` | Deshabilita zoom por pellizco a nivel del navegador |
| `--overscroll-history-navigation=0` | Evita navegar atrás con swipe |
| `--disable-features=Translate` | Evita popup de traducción |
| `--app=URL` | Abre como "aplicación" (sin barra de herramientas) |

### Salir del modo kiosko

- `Alt+F4` para cerrar la ventana
- `Ctrl+Alt+Del` en Windows para acceder al administrador de tareas

Para proteger el kiosko de salidas accidentales, configurar las políticas de grupo de Windows o usar una solución de kiosko management como **Kioware**, **SiteKiosk** o **Google Kiosk App** (Chrome Enterprise).

---

## Contacto y mantenimiento

- **Repositorio:** `chatwidgetcira` — rama `development`
- **Webhook n8n:** `https://vmi2945958.contaboserver.net/webhook/cira-botV2`
- **Color primario:** `#faa819`
- **Última actualización:** Abril 2026
