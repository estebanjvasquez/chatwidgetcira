# CIRA Bot — Asistente Virtual de la Cámara Petrolera de Venezuela

Chatbot conversacional para búsqueda de empresas afiliadas a la Cámara Petrolera de Venezuela (CPV). Permite a los usuarios consultar el directorio de afiliados por sector, servicio, ciudad, nombre o RIF a través de lenguaje natural.

---

## Tabla de contenidos

- [Arquitectura general](#arquitectura-general)
- [Requisitos](#requisitos)
- [Estructura de archivos](#estructura-de-archivos)
- [Base de datos](#base-de-datos)
- [Flujo n8n](#flujo-n8n)
  - [Rama principal — Consulta de empresas](#rama-principal--consulta-de-empresas)
  - [Rama de comandos administrativos](#rama-de-comandos-administrativos)
  - [Detalle de nodos](#detalle-de-nodos)
- [Sistema de aprendizaje](#sistema-de-aprendizaje)
  - [Comandos disponibles](#comandos-disponibles)
- [Chat Widget](#chat-widget)
  - [Instalación](#instalación)
  - [Configuración](#configuración)
  - [Modos de visualización](#modos-de-visualización)
  - [Funciones internas](#funciones-internas)
- [Credenciales requeridas en n8n](#credenciales-requeridas-en-n8n)

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                     USUARIO                             │
│           (navegador web / WordPress)                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP POST (chatInput, sessionId)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              chat-widget-v2.js (CDN)                    │
│   Renderiza el chat, detecta saludos localmente,        │
│   expone window.sendPrompt() para tarjetas clicables    │
└──────────────────────┬──────────────────────────────────┘
                       │ POST /webhook/cira-botV2
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  n8n (Self-Hosted)                      │
│                                                         │
│  Webhook → Pre-Processing → Admin Password              │
│                                   │                     │
│                            Detect Command               │
│                           ┌───────┴──────┐              │
│                     Comando?          Consulta          │
│                           │               │             │
│                   Validate Password  Load Learnings     │
│                   ┌───────┴────┐          │             │
│                 OK           Error   Build Prompt       │
│                   │                       │             │
│             Route Command         Intent Agent          │
│            ┌──┬──┴──┐                    │             │
│        INSERT LIST DELETE        Parse Intent JSON      │
│                               ┌──────────┴──────────┐  │
│                           Search Ready?          Conversational│
│                               │                    │   │
│                          MySQL Query          Respond  │
│                          ┌────┴────┐                   │
│                       Vacío    Con datos               │
│                          │         │                   │
│                      No Results  Format Cards          │
│                                    │                   │
│                               Final Respond            │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
              { output: HTML, type: 'results'|'conversation' }
```

---

## Requisitos

| Componente | Versión mínima | Notas |
|---|---|---|
| n8n | 2.12+ | Self-hosted |
| MySQL | 5.7+ | Base de datos principal (ChatView) |
| PostgreSQL / Supabase | — | Memoria de sesión + tabla `agent_learnings` |
| Google Gemini API | — | Modelo `gemma-4-31b-it` para el agente |

---

## Estructura de archivos

```
/
├── chat-widget-v2.js      # Widget de chat (CDN: jsdelivr/GitHub)
├── cira-botV4.json        # Flujo n8n completo (importar en n8n)
└── README.md
```

---

## Base de datos

### MySQL — Vista principal

El bot consulta la vista `ChatView` con las siguientes columnas:

| Columna | Tipo | Descripción |
|---|---|---|
| `name` | VARCHAR | Nombre de la empresa |
| `Sector` | TEXT | Sectores (múltiples, separados por coma) |
| `Servicios` | TEXT | Servicios ofrecidos (múltiples, separados por coma) |
| `state` | VARCHAR | Estado/provincia |
| `CIUDAD` | VARCHAR | Ciudad |
| `phone` | VARCHAR | Teléfono de contacto |
| `rif` | VARCHAR | RIF (identificador único) |
| `street` | VARCHAR | Dirección |
| `website` | VARCHAR | Sitio web |

> **Importante:** Las columnas `Sector` y `Servicios` contienen múltiples valores separados por coma. Las búsquedas sobre estas columnas siempre deben usar `LIKE`, nunca `=`.

### MySQL — Tablas de catálogo

| Tabla | Columna clave | Uso |
|---|---|---|
| `sectors` | `name` | Catálogo de sectores disponibles |
| `services` | `name` | Catálogo de servicios disponibles |

### PostgreSQL / Supabase — Memoria y aprendizajes

**Tabla `chat_memory`** — gestionada automáticamente por n8n para memoria de sesión.

**Tabla `agent_learnings`** — aprendizajes del agente (crear manualmente):

```sql
CREATE TABLE agent_learnings (
  id         SERIAL PRIMARY KEY,
  categoria  VARCHAR(50) NOT NULL,
  instruccion TEXT NOT NULL,
  activo     SMALLINT DEFAULT 1,
  creado_en  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_learnings_activo ON agent_learnings(activo);

COMMENT ON COLUMN agent_learnings.categoria   IS 'SQL | SINONIMO | INTENCION | COMPORTAMIENTO';
COMMENT ON COLUMN agent_learnings.instruccion IS 'Instrucción que el agente debe seguir';
COMMENT ON COLUMN agent_learnings.activo      IS '1 = activo, 0 = desactivado';
```

---

## Flujo n8n

### Rama principal — Consulta de empresas

```
Webhook (POST /cira-botV2)
  ↓
Pre-Procesing2
  Extrae chatInput y sessionId del body del request.
  ↓
Admin Password (Set)
  Define la clave administrativa. Único lugar donde se configura.
  ↓
Detect Command
  Analiza el chatInput. Determina si es un comando / o una consulta normal.
  ↓
Is Command? (IF)
  TRUE  → Rama de comandos administrativos
  FALSE → Load Learnings
  ↓
Load Learnings (Postgres SELECT)
  SELECT categoria, instruccion FROM agent_learnings WHERE activo = 1
  ↓
Build System Prompt (Code)
  Construye el system prompt base + inyecta los aprendizajes activos
  al final como sección "== APRENDIZAJES Y CORRECCIONES ACTIVAS =="
  ↓
Interactive Intent Agent1 (LangChain Agent)
  Modelo: gemma-4-31b-it
  Memory: Postgres (sessionId_intent)
  Tools: Catalog Sectores, Catalog Servicios
  Recibe el system prompt dinámico desde Build System Prompt.
  ↓
Parse Intent JSON1 (Code)
  Limpia el output del agente (strip markdown, sanitizar claves con \n,
  JSON.parse, regex de rescate). Emite isSearchReady: 'true'|'false'.
  ↓
Is Search Ready?1 (IF)
  TRUE  → MySQL Query2
  FALSE → Respond Conversation1 (respuesta conversacional)
  ↓
MySQL Query2
  SELECT name, Sector, Servicios, state, CIUDAD, phone, rif, street, website
  FROM ChatView WHERE {whereClause} LIMIT 100
  ↓
If1 (IF — detecta resultados vacíos)
  TRUE  (sin resultados) → Code in JavaScript → Respond Conversation4
  FALSE (con resultados) → Format Cards1
  ↓
Format Cards1 (Code)
  Genera HTML de tarjetas según queryIntent:
  - COMPANY / RIF  → tarjeta completa (todos los datos)
  - Resto          → lista de nombres clicables con sendPrompt()
  ↓
Final Respond1
  Devuelve { output: HTML, type: 'results' }
```

### Rama de comandos administrativos

```
Validate Password (IF)
  Compara payload.password con adminPassword del nodo Set.
  TRUE  → Route Command
  FALSE → Wrong Password → Respond Wrong Password

Route Command (Switch)
  Output 0 (aprender) → INSERT Learning  → Format Save OK  → Respond Save OK
  Output 1 (listar)   → SELECT Learnings → Format List     → Respond List
  Output 2 (borrar)   → UPDATE Learning  → Format Delete OK → Respond Delete OK
```

### Detalle de nodos

| Nodo | Tipo | Descripción |
|---|---|---|
| Webhook | n8n Webhook | POST `/cira-botV2`, CORS `*` |
| Pre-Procesing2 | Code | Extrae `chatInput` y `sessionId` |
| Admin Password | Set | Define `adminPassword` (clave administrativa) |
| Detect Command | Code | Detecta `/aprender`, `/listar-aprendizajes`, `/borrar-aprendizaje` |
| Is Command? | IF | Bifurca entre comandos y consultas normales |
| Validate Password | IF | Valida la clave antes de ejecutar cualquier comando |
| Wrong Password | Code | Genera mensaje de error HTML |
| Route Command | Switch | Enruta al comando correcto según `commandType` |
| INSERT Learning | Postgres | Inserta aprendizaje en `agent_learnings` |
| Format Save OK | Code | Genera confirmación visual con ID asignado |
| SELECT Learnings List | Postgres | Lista todos los aprendizajes activos |
| Format Learnings List | Code | Genera tabla HTML con ID, categoría, instrucción y fecha |
| UPDATE Disable Learning | Postgres | Desactiva un aprendizaje (`activo = 0`) |
| Format Delete OK | Code | Confirma la desactivación |
| Load Learnings | Postgres | Carga aprendizajes activos antes de cada consulta |
| Build System Prompt | Code | Ensambla prompt base + aprendizajes dinámicos |
| Interactive Intent Agent1 | LangChain Agent v1.7 | Interpreta la intención, genera `whereClause` |
| Google Gemini Chat Model4 | Gemini (`gemma-4-31b-it`) | Modelo del Intent Agent |
| Postgres Memory Intent1 | Postgres Chat Memory | Memoria por sesión (`sessionId_intent`) |
| Catalog Sectores | mySqlTool | `SELECT * FROM sectors ORDER BY name` |
| Catalog Servicios | mySqlTool | `SELECT * FROM services ORDER BY name` |
| Parse Intent JSON1 | Code | Parser robusto del output del agente |
| Is Search Ready?1 | IF | `String(isSearchReady) === 'true'` |
| Respond Conversation1 | respondToWebhook | Respuesta conversacional (no hay búsqueda) |
| MySQL Query2 | MySQL | Consulta principal sobre `ChatView` |
| If1 | IF | Detecta resultados vacíos (`Object.keys($json).length === 0`) |
| Code in JavaScript | Code | Mensaje HTML de sin resultados con datos de contacto CPV |
| Respond Conversation4 | respondToWebhook (`allIncomingItems`) | Devuelve mensaje sin resultados |
| Format Cards1 | Code | Genera HTML de tarjetas / lista clicable |
| Final Respond1 | respondToWebhook | `{ output: HTML, type: 'results' }` |

---

## Sistema de aprendizaje

El agente puede acumular instrucciones correctivas que se inyectan dinámicamente en su system prompt en cada ejecución. Esto permite corregir comportamientos sin modificar el flujo.

Los aprendizajes se almacenan en la tabla `agent_learnings` de Supabase y se cargan en cada request mediante el nodo **Load Learnings**. El nodo **Build System Prompt** los concatena al final del prompt bajo la sección:

```
== APRENDIZAJES Y CORRECCIONES ACTIVAS ==
1. [SQL] ...
2. [SINONIMO] ...
```

### Categorías recomendadas

| Categoría | Cuándo usarla |
|---|---|
| `SQL` | Corregir cómo se construye el WHERE para ciertos términos |
| `SINONIMO` | Enseñar equivalencias (ej: "lago" = ciudades del Zulia) |
| `INTENCION` | Corregir cómo se interpreta una consulta ambigua |
| `COMPORTAMIENTO` | Cambiar cómo responde el agente en ciertos contextos |

### Comandos disponibles

Todos los comandos requieren la clave administrativa configurada en el nodo **Admin Password**.

---

#### `/aprender`

Guarda una nueva instrucción correctiva.

**Sintaxis:**
```
/aprender [clave] [CATEGORÍA]: [instrucción]
```

**Ejemplos:**
```
/aprender CIRA2024 SQL: cuando el usuario escriba "lago" buscar LOWER(CIUDAD) LIKE LOWER('%maracaibo%') OR LOWER(CIUDAD) LIKE LOWER('%cabimas%') OR LOWER(CIUDAD) LIKE LOWER('%lagunillas%'), nunca buscar "lago" literalmente

/aprender CIRA2024 SINONIMO: "costa oriental" y "COL" se refieren a ciudades del estado Anzoátegui: Barcelona, Puerto La Cruz, Anaco

/aprender CIRA2024 INTENCION: cuando el usuario pregunte por "mantenimiento" consultar AMBAS columnas Sector y Servicios con OR

/aprender CIRA2024 COMPORTAMIENTO: si el usuario escribe solo un número de más de 6 dígitos, tratarlo como RIF parcial con LIKE, no como teléfono
```

**Respuesta exitosa:**
```
✅ Aprendizaje guardado #5
[SQL]
cuando el usuario escriba "lago"...
```

---

#### `/listar-aprendizajes`

Muestra todos los aprendizajes activos con su ID, categoría, instrucción y fecha de creación.

**Sintaxis:**
```
/listar-aprendizajes [clave]
```

**Ejemplo:**
```
/listar-aprendizajes CIRA2024
```

**Respuesta:** tabla HTML con todos los aprendizajes activos. Cada entrada incluye al pie: `Para borrar: /borrar-aprendizaje {id} [clave]`

---

#### `/borrar-aprendizaje`

Desactiva un aprendizaje por su ID (no lo elimina físicamente, solo pone `activo = 0`).

**Sintaxis:**
```
/borrar-aprendizaje [id] [clave]
```

**Ejemplo:**
```
/borrar-aprendizaje 3 CIRA2024
```

**Respuesta:**
```
🗑️ Aprendizaje #3 desactivado correctamente.
```

> Para reactivar un aprendizaje desactivado, actualiza directamente en Supabase: `UPDATE agent_learnings SET activo = 1 WHERE id = 3;`

---

#### Cambiar la clave administrativa

Abre el nodo **Admin Password** en n8n y modifica el campo `adminPassword`. Es el único lugar donde vive la clave.

---

## Chat Widget

Archivo: `chat-widget-v2.js`
CDN: `https://cdn.jsdelivr.net/gh/{usuario}/{repo}@main/chat-widget-v2.js`

### Instalación

Agrega el siguiente bloque HTML donde quieras mostrar el chat:

```html
<!-- Modo inline (embebido en un contenedor) -->
<div id="cira-chat"></div>
<style>
  #cira-chat { height: 600px; }
</style>
<script>
window.ChatWidgetConfig = {
  webhookUrl:    "https://tu-servidor.com/webhook/cira-botV2",
  avatar:        "https://tu-servidor.com/images/cirabot.png",
  mode:          "inline",
  mountSelector: "#cira-chat",
  style:         { primaryColor: "#faa819" }
};
</script>
<script src="https://cdn.jsdelivr.net/gh/usuario/repo@main/chat-widget-v2.js?v=10"></script>
```

Para modo flotante (burbuja en esquina inferior derecha):

```html
<script>
window.ChatWidgetConfig = {
  webhookUrl: "https://tu-servidor.com/webhook/cira-botV2",
  avatar:     "https://tu-servidor.com/images/cirabot.png",
  mode:       "bubble",
  style:      { primaryColor: "#faa819" }
};
</script>
<script src="https://cdn.jsdelivr.net/gh/usuario/repo@main/chat-widget-v2.js?v=10"></script>
```

### Configuración

Todas las opciones se pasan a través de `window.ChatWidgetConfig`:

| Propiedad | Tipo | Requerido | Descripción |
|---|---|---|---|
| `webhookUrl` | string | ✅ | URL del webhook n8n |
| `avatar` | string | ✅ | URL de la imagen del avatar del bot |
| `mode` | string | — | `"bubble"` (default) o `"inline"` |
| `mountSelector` | string | Solo inline | Selector CSS del contenedor (ej: `"#cira-chat"`) |
| `style.primaryColor` | string | — | Color principal en hex (default: `#faa819`) |

### Modos de visualización

**Bubble** — botón flotante `💬` en la esquina inferior derecha. Al hacer clic abre una ventana de 380×650px. En móvil ocupa el 75% del alto de la pantalla.

**Inline** — el chat se incrusta dentro del elemento definido por `mountSelector`. La altura se controla con CSS en el contenedor. Recomendado para embeber en páginas de WordPress u otros CMS.

### Funciones internas

#### `sendMsg(text?)`

Función principal de envío. Acepta texto explícito (usado internamente por `sendPrompt`) o lee del textarea si no recibe argumento.

Flujo interno:
1. Detecta idioma del texto (`detectLang`)
2. Muestra el mensaje del usuario en el chat
3. Si es saludo → responde localmente sin llamar al webhook
4. Muestra spinner de carga
5. Activa aviso de consulta lenta a los 45 segundos
6. Llama al webhook con `{ chatInput, sessionId }`
7. Muestra la respuesta del bot (admite HTML)

#### `sendPrompt(text)`

Función global expuesta en `window.sendPrompt`. Permite que el HTML generado por las tarjetas de resultados dispare nuevas consultas al hacer clic.

```javascript
// Ejemplo de uso desde HTML de tarjeta (generado por Format Cards1 en n8n)
onclick="sendPrompt('dame información sobre la empresa Holanda de Venezuela C.A.')"
```

Cuando se llama:
1. Hace scroll al fondo del chat
2. Llama a `sendMsg(text)` con el texto especificado
3. El usuario ve su "mensaje" aparecer en el chat y el bot responde con la tarjeta de detalle

#### `isGreeting(text)`

Detecta si el mensaje es un saludo simple para responder localmente sin llamar al webhook.

Condiciones para ser considerado saludo:
- Máximo 3 palabras
- El texto completo debe ser solo el saludo (con puntuación opcional al final)
- Palabras reconocidas: `hola`, `hello`, `hi`, `hey`, `buenas`, `buenas tardes`, `buenas noches`, `buenas días`

> **Importante:** La detección usa `$` al final del regex para evitar falsos positivos. Palabras como `Holanda`, `Highland`, `Heyden` o `Buenos Aires` **no** son detectadas como saludos y pasan correctamente al webhook.

#### `linkify(text)`

Convierte emails y teléfonos en texto plano a enlaces HTML clicables:
- Emails → `<a href="mailto:...">`
- Teléfonos (7+ dígitos, con o sin `+`) → `<a href="tel:...">`

Los enlaces usan el `primaryColor` configurado. Preserva los `data:` URIs que puedan venir en las respuestas del bot.

#### Gestión de sesión

El `sessionId` se genera una vez con `crypto.randomUUID()` y se persiste en `localStorage` con la clave `cira_sid`. Esto permite que la memoria de conversación en Postgres se mantenga entre recargas de página.

#### Detección de idioma

El widget detecta automáticamente si el usuario escribe en español o inglés basándose en palabras clave del mensaje. Afecta los textos del spinner, el aviso de consulta lenta y el mensaje de bienvenida.

---

## Credenciales requeridas en n8n

| ID en flujo | Nombre en n8n | Tipo | Usado en |
|---|---|---|---|
| `AVBzCxKUEcj6pnBN` | Google Gemini(PaLM) Campet | Google PaLM API | Intent Agent, modelo Gemma |
| `ENVCUL4fXzhWWdRN` | Postgres account | PostgreSQL | Memoria de sesión, aprendizajes |
| `rV49Noas0cPLJHOy` | MySQL Campet | MySQL | ChatView, catálogos de sectores/servicios |

> Para importar el flujo: en n8n ir a **Workflows → Import from file**, seleccionar `cira-botV4.json`. Las credenciales se asignan por ID — si los IDs no coinciden con tu instancia, reasignarlas manualmente en cada nodo afectado.
