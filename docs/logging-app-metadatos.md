# Brief para la app de análisis (Cloudflare): leer los metadatos nuevos

## Qué cambió
El flujo del bot ahora registra **todas** las salidas (no solo resultados) y guarda muchos
campos nuevos **dentro de la columna `metadata` (jsonb)** de la tabla `audit_log_entries`
en Supabase. **No se agregaron columnas** — todo lo nuevo vive en `metadata`.

Tabla `audit_log_entries`:
`id, fecha_creacion, session_id, pregunta_usuario, respuesta_ia, tokens_usados,
metadata (jsonb), error_log, output`

## Claves dentro de `metadata` (filas nuevas)

| Clave | Tipo | Uso |
|---|---|---|
| `resultado_tipo` | text | **segmentador principal**: `results` \| `conversation` \| `sin_resultados` \| `comando` \| `comando_error` |
| `needs_clarification` | bool | ambigüedad real |
| `query_intent` | text | SECTOR/SERVICE/COMPANY/RIF/CITY/MIXED |
| `where_clause` | text | SQL generado (revela brechas de vocabulario en `sin_resultados`) |
| `resultados_encontrados` | int | nº de empresas devueltas |
| `tiempo_respuesta_ms` | int | latencia real |
| `ip` | text | IP del cliente (para geo) |
| `user_agent` | text | UA crudo (para device/browser/OS) |
| `accept_language`, `sec_ch_ua_platform`, `sec_ch_ua_mobile` | text | señales de cliente |
| `ua_hints` | obj | client hints estructurados (platform, model…) — preferir sobre `user_agent` |
| `page_url`, `page_title`, `referrer` | text | página donde ocurrió la consulta |
| `utm_source/medium/campaign` | text | atribución |
| `visitor_id` | text | visitante persistente (distinto de `session_id`) |
| `msg_index` | int | nº de mensaje dentro de la sesión (profundidad) |
| `widget_mode`, `screen`, `viewport`, `timezone`, `connection`, `dpr` | text | contexto de dispositivo |
| `wp_user_id`, `wp_user_role`, `wp_page_id` | — | usuario de WordPress (si está logueado) |
| `modelo`, `ejecucion_id`, `longitud_caracteres` | — | ya existían |

## ⚠️ Compatibilidad con filas viejas
- Las filas antiguas SOLO tienen: `modelo, origin, referer, ejecucion_id, x-forwarder-for,
  longitud_caracteres`. Las claves nuevas son `NULL` en ellas.
- **La IP cambió de clave**: viejo `x-forwarder-for` → nuevo `ip`. Siempre usar
  `COALESCE(metadata->>'ip', metadata->>'x-forwarder-for')`.
- Antes no existía `resultado_tipo`; para filas viejas hay que inferirlo con las heurísticas
  del brief `diagnostico-filtros-falsos-positivos.md`. Para filas nuevas, **usar
  `resultado_tipo` directamente** y retirar las heurísticas de texto.

---

## Paso 1 · Vista SQL que aplana `metadata` en columnas (lo más útil)
Crear esta vista en Supabase; la app consulta `v_logs` en vez de abrir el jsonb cada vez.
```sql
CREATE OR REPLACE VIEW v_logs AS
SELECT
  id, fecha_creacion, session_id, pregunta_usuario, respuesta_ia, output, error_log, tokens_usados,
  -- outcome
  metadata->>'resultado_tipo'                              AS resultado_tipo,
  (metadata->>'needs_clarification')::boolean              AS needs_clarification,
  metadata->>'query_intent'                                AS query_intent,
  metadata->>'where_clause'                                AS where_clause,
  NULLIF(metadata->>'resultados_encontrados','')::int      AS resultados_encontrados,
  NULLIF(metadata->>'tiempo_respuesta_ms','')::int         AS tiempo_respuesta_ms,
  -- red / cliente
  COALESCE(metadata->>'ip', metadata->>'x-forwarder-for')  AS ip,
  metadata->>'user_agent'                                  AS user_agent,
  metadata->>'accept_language'                             AS accept_language,
  metadata->>'sec_ch_ua_platform'                          AS ua_platform,
  metadata->>'sec_ch_ua_mobile'                            AS ua_mobile,
  metadata->'ua_hints'                                     AS ua_hints,
  metadata->>'origin'                                      AS origin,
  COALESCE(metadata->>'referer', metadata->>'referrer')    AS referer,
  -- widget / pagina
  metadata->>'page_url'                                    AS page_url,
  metadata->>'page_title'                                  AS page_title,
  metadata->>'utm_source'                                  AS utm_source,
  metadata->>'utm_medium'                                  AS utm_medium,
  metadata->>'utm_campaign'                                AS utm_campaign,
  metadata->>'visitor_id'                                  AS visitor_id,
  NULLIF(metadata->>'msg_index','')::int                   AS msg_index,
  metadata->>'widget_mode'                                 AS widget_mode,
  metadata->>'screen'                                      AS screen,
  metadata->>'viewport'                                    AS viewport,
  metadata->>'timezone'                                    AS timezone,
  metadata->>'connection'                                  AS connection,
  -- wordpress
  NULLIF(metadata->>'wp_user_id','')::int                  AS wp_user_id,
  metadata->>'wp_user_role'                                AS wp_user_role,
  metadata                                                 AS metadata_raw
FROM audit_log_entries;
```
> Si `metadata` estuviera almacenada como **text** (no jsonb), reemplazar `metadata->>...`
> por `(metadata::jsonb)->>...` en toda la vista.

---

## Paso 2 · Geolocalización de IP (en Cloudflare)
`request.cf` **NO sirve** aquí: geolocaliza la IP de quien abre el dashboard, no la IP
guardada del visitante. Hay que resolver la IP almacenada. Opciones:

- **Recomendado**: enriquecer por lotes las IPs distintas con un servicio (ej. `ip-api.com/batch`
  — gratis, 100 IPs/petición, sin key; o `ipinfo.io` con token) y **cachear** en una tabla:
  ```sql
  CREATE TABLE IF NOT EXISTS ip_geo (
    ip text PRIMARY KEY, pais text, region text, ciudad text, isp text, actualizado timestamptz DEFAULT now()
  );
  ```
  Luego en el dashboard: `LEFT JOIN ip_geo g ON g.ip = v.ip`. Evita llamadas repetidas.
- **In-house**: cargar MaxMind GeoLite2 en Cloudflare **D1/KV** y resolver sin API externa.

Proceso sugerido (Worker/cron): `SELECT DISTINCT ip FROM v_logs WHERE ip NOT IN (SELECT ip FROM ip_geo)`
→ batch al servicio → `UPSERT ip_geo`.

## Paso 3 · Device / navegador / OS
- Preferir `ua_hints` (ya estructurado) cuando exista; si es NULL, parsear `user_agent`.
- En Workers funciona `ua-parser-js`. Derivar `device_type` (mobile/desktop) también desde
  `ua_mobile` (`?1`=móvil, `?0`=desktop) y el `viewport`.

---

## Paso 4 · Consultas listas para el dashboard

**Distribución de outcomes (métrica base):**
```sql
SELECT resultado_tipo, COUNT(*) FROM v_logs
WHERE fecha_creacion >= now() - interval '30 days'
GROUP BY resultado_tipo ORDER BY 2 DESC;
```

**Latencia p50/p95:**
```sql
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY tiempo_respuesta_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY tiempo_respuesta_ms) AS p95
FROM v_logs WHERE tiempo_respuesta_ms IS NOT NULL;
```

**Consultas sin resultado (ahora directo, ya no heurística) + cruce con catálogo:**
```sql
SELECT trim(pregunta_usuario) AS termino, COUNT(*) AS veces,
  EXISTS (SELECT 1 FROM sectors  s WHERE lower(s.name) LIKE '%'||lower(trim(pregunta_usuario))||'%') AS es_sector,
  EXISTS (SELECT 1 FROM services v WHERE lower(v.name) LIKE '%'||lower(trim(pregunta_usuario))||'%') AS es_servicio
FROM v_logs
WHERE resultado_tipo = 'sin_resultados' AND trim(coalesce(pregunta_usuario,'')) <> ''
GROUP BY trim(pregunta_usuario)
ORDER BY (es_sector OR es_servicio) DESC, veces DESC;
```

**Ambigüedad real:**
```sql
SELECT * FROM v_logs WHERE resultado_tipo='conversation' AND needs_clarification IS TRUE;
```

**Top páginas donde se usa el bot:**
```sql
SELECT page_url, COUNT(*) FROM v_logs WHERE page_url IS NOT NULL GROUP BY page_url ORDER BY 2 DESC LIMIT 20;
```

**Profundidad de conversación (embudo por msg_index):**
```sql
SELECT msg_index, COUNT(*) FROM v_logs WHERE msg_index IS NOT NULL GROUP BY msg_index ORDER BY msg_index;
```

**Visitantes únicos vs. sesiones:**
```sql
SELECT COUNT(DISTINCT visitor_id) AS visitantes, COUNT(DISTINCT session_id) AS sesiones,
       COUNT(*) AS mensajes FROM v_logs WHERE visitor_id IS NOT NULL;
```

**Dispositivo:**
```sql
SELECT CASE WHEN ua_mobile='?1' THEN 'movil' ELSE 'desktop' END AS tipo, COUNT(*)
FROM v_logs GROUP BY 1;
```

**Tokens / costo por día:**
```sql
SELECT date_trunc('day', fecha_creacion) AS dia, SUM(tokens_usados) AS tokens, COUNT(*) AS consultas
FROM v_logs GROUP BY 1 ORDER BY 1;
```

---

---

## Paso 5 · Acceso directo desde Cloudflare (la app lee Supabase directo)

La app consume Supabase directamente, así que:

- **Lecturas simples / filtros** (listados, buscar por `resultado_tipo`, `session_id`, rango de
  fechas): consultar la vista vía **PostgREST** — `GET /rest/v1/v_logs?resultado_tipo=eq.sin_resultados&order=fecha_creacion.desc`.
  Las vistas del schema `public` se exponen automáticamente (solo lectura).
- **Agregaciones** (percentiles, GROUP BY, cruces con `sectors`/`services`): PostgREST **no** las
  hace bien. Dos caminos:
  1. **RPC** — encapsular cada consulta agregada del Paso 4 en una función Postgres y llamarla
     por `POST /rest/v1/rpc/<fn>`. Ejemplo:
     ```sql
     CREATE OR REPLACE FUNCTION stats_outcomes(dias int DEFAULT 30)
     RETURNS TABLE(resultado_tipo text, total bigint)
     LANGUAGE sql STABLE AS $$
       SELECT resultado_tipo, COUNT(*) FROM v_logs
       WHERE fecha_creacion >= now() - (dias || ' days')::interval
       GROUP BY resultado_tipo ORDER BY 2 DESC
     $$;
     ```
     Llamada: `POST /rest/v1/rpc/stats_outcomes` con `{ "dias": 30 }`.
  2. **SQL directo** — conectar a Postgres con un driver (`postgres`/`pg`) a través de
     **Cloudflare Hyperdrive** y correr el SQL del Paso 4 tal cual. Más flexible para el dashboard.
- **Credenciales**: usar el **`service_role` key** solo del lado servidor (Worker), nunca en el
  cliente. Con `service_role` se saltan las RLS; si usas `anon`, la vista necesitará políticas de
  lectura. La vista hereda permisos del owner — si la tabla tiene RLS, crea la vista con
  `security_invoker=on` o exponla por RPC `SECURITY DEFINER` controlada.

Recomendación: **vista `v_logs` + funciones RPC** para los paneles agregados (portátil, sin
gestionar conexiones), y Hyperdrive solo si necesitas SQL ad-hoc pesado.

---

## Resumen para el agente del IDE
1. Crear la vista `v_logs` (Paso 1) y apuntar TODO el dashboard a ella.
2. Para filas nuevas usar `resultado_tipo` directo; retirar las heurísticas de texto del brief
   anterior (dejarlas solo para filas < fecha de despliegue del logging nuevo).
3. Usar siempre `COALESCE(ip, x-forwarder-for)` para la IP.
4. Añadir enriquecimiento geo por IP (tabla `ip_geo` + servicio/MaxMind) — no usar `request.cf`.
5. Derivar device/browser/OS de `ua_hints`/`user_agent`.
6. Nuevos paneles: outcomes, latencia p50/p95, sin-resultado (cruce catálogo), ambigüedad,
   páginas, profundidad, visitantes únicos, dispositivo, tokens.
