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

- [x] **Fase 1 — Esquema**
  - `01_schema.sql` — tablas del nucleo, indices y vistas (`v_cuota_saldo`, `v_morosidad`, `v_propiedad_listado`), portadas de las migraciones 001..020 de InmoGestion.
  - `02_rls.sql` — RLS: todo el panel restringido a usuarios autenticados.
  - **Pendiente**: correr los dos archivos en Supabase (SQL Editor) y confirmar que no hay errores.
- [ ] **Fase 2 — Shell del panel**
  - Rediseñar `admin.html` con menu lateral tipo software de escritorio (grilla densa + ficha lateral).
  - No perder lo actual: alta de propiedades web, "mis propiedades", destacadas, mensajes de contacto.
- [ ] **Fase 3 — Personas + Inmuebles**
  - CRUD con baja logica, propietarios con %, fotos (bucket `property-photos`).
- [ ] **Fase 4 — Contratos + Cuotas**
  - RPC `crear_contrato` (contrato + garantes + generacion de cuotas por adelantado).
  - Ajustes: porcentaje fijo e indice tipo coeficiente (ICL/UVA/CER/CASA_PROPIA).
  - Rescision (anula cuotas futuras) y renovacion (contrato nuevo, el original queda `renovado`).
  - Estado del inmueble sincronizado con el contrato.
- [ ] **Fase 5 — Cobranzas**
  - RPC `registrar_cobro` (pago + imputaciones + recibo correlativo + movimiento de caja).
  - Mora por dia de atraso (config por contrato con default de instalacion).
  - Bonificaciones y excepciones de cobro por acuerdo informal.
  - Multi-medio de pago (`medio_pago_detalle`). Circuito de cheque.
  - Anulacion logica de cobros.
- [ ] **Fase 6 — Liquidaciones + Caja**
  - RPC `generar_liquidacion` (reparto por porcentaje de propietario, gastos, comision).
  - Liquidacion garantizada.
  - Caja diaria: cada cobro / pago de liquidacion / gasto / comision deja su movimiento.
- [ ] **Fase 7 — Recibos y contratos en PDF** (client-side).

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
