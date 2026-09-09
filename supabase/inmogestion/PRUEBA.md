# Prueba del panel de gestión

Los 4 SQL ya están aplicados (`01`→`04`). El panel se abre en `gestion.html`
(o desde `admin.html` → "Abrir gestión"). Se entra con el mismo usuario y
contraseña que ya usás en el panel web.

## Circuito completo, paso a paso

1. **Configuración** (menú lateral) → cargá razón social, domicilio, teléfono,
   matrícula. Ajustá la comisión de administración y la mora si querés.

2. **Personas** → *Nueva persona* (F2). Cargá un **propietario** y, aparte, un
   **inquilino**. Con el nombre alcanza para guardar.

3. **Inmuebles** → *Nuevo inmueble*. Cargá calle y número.
   - Pestaña **Propietarios**: agregá el propietario al **100 %** (tiene que
     sumar 100 para poder liquidar después).
   - Pestaña **Precios y web**: cargá el precio de alquiler. Si querés que
     aparezca en el sitio, tildá "Mostrar en la web pública".
   - Guardá. Volvé a abrirlo → pestaña **Fotos** para subir fotos.

4. **Alquileres** → *Nuevo contrato*.
   - Elegí el inmueble y el inquilino, fechas (ej. un año), día de vencimiento,
     monto mensual. Para la primera prueba dejá **"Sin ajuste"**.
   - Guardá → tiene que **generar todas las cuotas** del contrato. Se ven en la
     pestaña "Cuotas".
   - El inmueble pasa a estado **alquilada** solo.

5. **Cobranzas** → pestaña "Por cobrar" → clic en el inquilino → tildá una o
   varias cuotas → *Registrar cobro de lo seleccionado* → elegí fecha y medio
   de pago → **Confirmar**.
   - En el detalle del cobro (pestaña "Historial de cobros") probá
     **"Imprimir recibo"**.

6. **Liquidaciones** → *Nueva liquidación* → elegí el inmueble y el **período**
   de la cuota que cobraste (ej. `2026-09`) → **Generar**.
   - Abrí la liquidación → *Pagar al propietario* → **"Imprimir recibo"**.

7. **Caja** → tienen que aparecer el ingreso del cobro y el egreso de la
   liquidación, con el cajón por medio de pago arriba.

## Qué mirar si algo falla

- Si una pantalla queda en "Cargando…" o tira un cartel rojo: abrí la consola
  del navegador (**F12** → pestaña "Console") y copiá el error completo.
- Los errores de las funciones SQL vienen en español ("Cargá el monto…",
  "El inmueble está…") — esos son esperables y dicen qué corregir.
- Un error tipo `permission denied` o `row-level security` = falta correr algún
  SQL o el usuario no está logueado.
- Un error `function ... does not exist` = falta correr `03_funciones.sql`.

## Todavía no implementado (a propósito)

Ajuste por IPC (variación), liquidación garantizada, estados del cheque.
Ver `PLAN.md`.
