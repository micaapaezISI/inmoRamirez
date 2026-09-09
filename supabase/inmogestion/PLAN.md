# InmoGestion dentro del panel de Inmobiliaria Ramirez

Port del nucleo de **InmoGestion** (Node + SQLite, `C:\Users\paezm\Downloads\inmogestion-main\inmogestion-main`)
al panel de administracion del sitio, sobre **Supabase** (Postgres + Auth + Storage),
sin servidor propio.

## Decisiones tomadas

| Tema | Decision |
|---|---|
| Enfoque | Portar modulo por modulo a Supabase dentro de `admin.html` (no desplegar la app Node aparte). |
| Alcance | **Nucleo primero**: personas, inmuebles, contratos, cuotas, cobranzas, liquidaciones, caja. Informes / importacion / agenda / ventas / licenciamiento quedan para despues. |
| Destino | Solo para Inmobiliaria Ramirez (no es una version SaaS). |
| Usuarios | Un unico login de Supabase Auth. Sin roles ni permisos por modulo (eso queda para una fase futura). Por eso se omiten `usuario`, `usuario_permiso`, `auditoria` y las columnas `usuario_id`. |
| Datos | El panel arranca **vacio**. No se migra la base de la inmobiliaria de San Pedro. |
| Transacciones | Toda operacion multi-tabla (alta de contrato + cuotas, cobro + imputacion + caja, liquidacion) va como **funcion Postgres (RPC)**, porque Supabase no tiene transacciones del lado del cliente. |
| Montos | Centavos enteros (`bigint`), igual que InmoGestion. La conversion en el front reusa el criterio de `src/utils/dinero.js`. |
| PDF (recibos/contratos) | Generacion client-side (jsPDF/pdfmake). Fase 7. |
| Tabla publica | El sitio publico sigue leyendo `properties` (esquema en ingles). Unificar con `propiedad` es una fase posterior. |

## Fases

- [x] **Fase 1 — Esquema** (`01_schema.sql`, `02_rls.sql`) — aplicado en Supabase.
- [x] **Fase 2 — Shell del panel** — `gestion.html` (app full-screen, look de InmoGestion),
  `css/gestion.css` (portada de `estilos.css`), `js/gestion/core.js` (capa compartida:
  formato, avisos, ficha lateral, diálogo, grilla, RPC), `js/gestion/app.js` (login con
  Supabase Auth, navegación, atajos). Link desde `admin.html`. El panel web actual queda igual.
- [x] **Fase 3 — Personas + Inmuebles** — `js/gestion/personas.js`, `js/gestion/inmuebles.js`.
  CRUD con baja lógica, roles calculados, propietarios con %.
  Pendiente: fotos del inmueble, sincronización `propiedad` ↔ `properties` (web).
- [x] **Fase 4 — Contratos + Cuotas** — `js/gestion/contratos.js` + RPC en `03_funciones.sql`:
  `crear_contrato`, `generar_cuotas_contrato` (adelantado, ajuste porcentaje e índice
  coeficiente, se detiene si falta el valor del índice), `rescindir_contrato`, `renovar_contrato`.
  Pendiente: ajuste IPC (variación), cláusulas, contrato en PDF.
- [x] **Fase 5 — Cobranzas** — `js/gestion/cobranzas.js` + RPC `registrar_cobro`
  (pago + imputaciones + recibo correlativo + movimiento de caja), `anular_cobro`,
  `bonificar_cuota`. Mora por día (config por contrato). Excepción de cobro: la RPC la
  aplica si hay una fila activa; falta la pantalla para cargarla. Multi-medio parcial.
  Pendiente: circuito de cheque, comprobantes adjuntos.
- [x] **Fase 6 — Liquidaciones + Caja** — `js/gestion/liquidaciones.js`, `js/gestion/caja.js`
  + RPC `generar_liquidacion` (reparto por %, comisión, gastos), `pagar_liquidacion`,
  `anular_liquidacion`. Gastos de inmueble. Caja con cajón por medio de pago.
  Pendiente: liquidación garantizada.
- [x] **Fase 7 — Recibos y contrato en PDF** — `js/gestion/pdf.js` (jsPDF client-side).
  "Imprimir recibo" en el detalle de un cobro y en una liquidación pagada;
  "Imprimir contrato" (borrador de locación) en la ficha del contrato.
- [x] **Fase 8 — Fotos + sincronización con la web** —
  `04_sync_web.sql`: trigger que publica en la tabla `properties` (que lee el
  sitio) todo inmueble con "Mostrar en la web pública" tildado, y lo saca si
  se destilda o se da de baja. Las filas viejas de `properties` (cargadas a
  mano) no se tocan: la sync usa la columna nueva `properties.propiedad_id`.
  Fotos del inmueble: subida al bucket `property-photos` con portada y orden,
  en la pestaña "Fotos" de la ficha.
- [x] **Excepciones de cobro** — pantalla para cargarlas y anularlas en la
  ficha del contrato. La RPC `registrar_cobro` ya las aplicaba.

### Todavía pendiente
- Ajuste por índice de tipo "variación" (IPC) — falta la fórmula de composición.
- Liquidación garantizada (pagar al propietario aunque el inquilino no haya pagado).
- Circuito de estados del cheque (`pago_cheque`).
- Contrato en PDF: es un borrador, no reemplaza el contrato profesional.

## Cómo aplicar (orden)

En el SQL Editor de Supabase, uno por uno: `01_schema.sql`, `02_rls.sql`,
`03_funciones.sql`, `04_sync_web.sql`. Todos son idempotentes (se pueden volver
a correr).

## Reglas de negocio de referencia (en el repo de InmoGestion)

- `reglas-negocio-alquileres.md` — generacion de cuotas, ajustes, rescision, renovacion.
- `reglas-negocio-cobranzas.md` — mora, medios de pago, bonificaciones, excepciones, recibos.
- `reglas-negocio-liquidacion.md` — reparto a propietarios, liquidacion garantizada.
- `CLAUDE.md` — reglas no negociables (centavos, sin DELETE, español rioplatense).

## Como aplicar el esquema (Fase 1)

1. Supabase Dashboard -> SQL Editor -> New query.
2. Pegar y correr `01_schema.sql`.
3. Pegar y correr `02_rls.sql`.
4. Verificar en Table Editor que aparecen las tablas `persona`, `propiedad`, `contrato`, `cuota`, etc.
