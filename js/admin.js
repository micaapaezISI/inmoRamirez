/* =====================================================================
   INMOBILIARIA RAMIREZ — Panel admin (conectado a Supabase)
   ---------------------------------------------------------------------
   - Login con email/password (Supabase Auth). Solo un usuario logueado
     puede crear, editar o borrar propiedades (ver políticas RLS en
     supabase/schema.sql). El usuario admin se crea a mano desde el
     dashboard de Supabase (Authentication → Users → Add user).
   - Las fotos se suben al bucket "property-photos" de Supabase Storage
     y se guardan como URLs públicas en la columna "images".
   ===================================================================== */

const STORAGE_BUCKET = "property-photos";

document.addEventListener("DOMContentLoaded", () => {
  const pmRoot = document.querySelector("[data-pm-root]");
  if (!pmRoot) return;

  const photoManager = createPhotoManager(pmRoot);

  const loginWrap = document.getElementById("admin-login-wrap");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const panel = document.getElementById("admin-panel");
  const logoutBtn = document.getElementById("admin-logout");

  const form = document.getElementById("admin-property-form");
  const resultBox = document.getElementById("admin-result");
  const listBox = document.getElementById("admin-properties-list");
  const submitBtn = document.getElementById("admin-submit-btn");
  const cancelEditBtn = document.getElementById("admin-cancel-edit");

  let editingId = null;

  function showLoggedIn() {
    loginWrap.style.display = "none";
    panel.style.display = "block";
    loadPropertiesList();
  }

  function showLoggedOut() {
    loginWrap.style.display = "block";
    panel.style.display = "none";
  }

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) showLoggedIn();
    else showLoggedOut();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showLoggedIn();
    else showLoggedOut();
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const data = new FormData(loginForm);
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (error) {
      loginError.textContent = "No se pudo ingresar: " + error.message;
      loginError.style.display = "block";
    } else {
      loginForm.reset();
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
  });

  function startEdit(property) {
    editingId = property.id;
    form.elements.title.value = property.title || "";
    form.elements.operation.value = property.operation || "venta";
    form.elements.type.value = property.type || "casa";
    form.elements.bedrooms.value = property.bedrooms || 0;
    form.elements.bathrooms.value = property.bathrooms || 0;
    form.elements.area.value = property.area || "";
    form.elements.zone.value = property.zone || "Centro";
    form.elements.address.value = property.address || "";
    form.elements.currency.value = property.currency || "USD";
    form.elements.price.value = property.price || "";
    form.elements.description.value = property.description || "";
    form.elements.amenities.value = (property.amenities || []).join(", ");

    photoManager.setImages((property.images || []).map((url) => ({ url, name: url.split("/").pop() })));

    submitBtn.textContent = "Actualizar propiedad";
    cancelEditBtn.style.display = "inline-block";
    resultBox.style.display = "none";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stopEdit() {
    editingId = null;
    form.reset();
    photoManager.reset();
    submitBtn.textContent = "Guardar propiedad";
    cancelEditBtn.style.display = "none";
  }

  cancelEditBtn.addEventListener("click", stopEdit);

  async function loadPropertiesList() {
    listBox.innerHTML = `<p style="color:var(--color-text-light);">Cargando…</p>`;
    const { data, error } = await supabaseClient.from("properties").select("*").order("created_at", { ascending: false });
    if (error) {
      listBox.innerHTML = `<p style="color:var(--color-danger);">No se pudo cargar la lista: ${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      listBox.innerHTML = `<p style="color:var(--color-text-light);">Todavía no hay propiedades cargadas.</p>`;
      return;
    }
    listBox.innerHTML = data
      .map(
        (p) => `
      <div style="display:flex; align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid var(--color-border);">
        <div style="width:64px; height:48px; border-radius:6px; overflow:hidden; flex-shrink:0; background:var(--color-bg-alt);">
          ${p.images && p.images[0] ? `<img src="${p.images[0]}" alt="" style="width:100%; height:100%; object-fit:cover;">` : ""}
        </div>
        <div style="flex:1; min-width:0;">
          <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.title}</strong>
          <span style="color:var(--color-text-light); font-size:0.85rem;">${operationLabel(p.operation)} · ${typeLabel(p.type)} · ${p.currency} ${p.price.toLocaleString("es-AR")}</span>
        </div>
        <button type="button" class="btn btn-sm btn-dark" data-edit-id="${p.id}">Editar</button>
        <button type="button" class="btn btn-sm" style="background:var(--color-danger); color:#fff;" data-delete-id="${p.id}">Eliminar</button>
      </div>`
      )
      .join("");

    listBox.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const property = data.find((p) => p.id === parseInt(btn.dataset.editId, 10));
        if (property) startEdit(property);
      });
    });

    listBox.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = parseInt(btn.dataset.deleteId, 10);
        if (!confirm("¿Eliminar esta propiedad? No se puede deshacer.")) return;
        const { error: deleteError } = await supabaseClient.from("properties").delete().eq("id", id);
        if (deleteError) {
          alert("No se pudo eliminar: " + deleteError.message);
          return;
        }
        if (editingId === id) stopEdit();
        loadPropertiesList();
      });
    });
  }

  async function uploadNewImages(images) {
    const folder = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const urls = [];
    for (const img of images) {
      if (!img.url.startsWith("blob:")) {
        urls.push(img.url);
        continue;
      }
      const blob = await fetch(img.url).then((r) => r.blob());
      const ext = (img.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${folder}/${urls.length + 1}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
      });
      if (error) throw error;
      const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    const title = (data.get("title") || "").trim();
    const currency = data.get("currency") === "ARS" ? "ARS" : "USD";
    const price = parseFloat(data.get("price")) || 0;
    const amenities = (data.get("amenities") || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    submitBtn.disabled = true;
    submitBtn.textContent = editingId ? "Actualizando…" : "Guardando…";

    try {
      const images = await uploadNewImages(photoManager.getImages());

      const payload = {
        title,
        operation: data.get("operation"),
        type: data.get("type"),
        zone: data.get("zone"),
        address: (data.get("address") || "").trim(),
        currency,
        price,
        bedrooms: parseInt(data.get("bedrooms"), 10) || 0,
        bathrooms: parseInt(data.get("bathrooms"), 10) || 0,
        area: parseFloat(data.get("area")) || 0,
        description: (data.get("description") || "").trim(),
        amenities,
        images,
      };

      const { error } = editingId
        ? await supabaseClient.from("properties").update(payload).eq("id", editingId)
        : await supabaseClient.from("properties").insert(payload);

      if (error) throw error;

      resultBox.style.display = "block";
      resultBox.innerHTML = `
        <div class="admin-card" style="border-color: var(--color-secondary); background: var(--color-bg-alt);">
          <h2>✅ Propiedad ${editingId ? "actualizada" : "publicada"}</h2>
          <p><strong>${title}</strong> ya está guardada en Supabase y visible en el sitio.</p>
        </div>`;
      resultBox.scrollIntoView({ behavior: "smooth", block: "start" });

      stopEdit();
      loadPropertiesList();
    } catch (err) {
      resultBox.style.display = "block";
      resultBox.innerHTML = `
        <div class="admin-card" style="border-color: var(--color-danger);">
          <h2>❌ No se pudo guardar</h2>
          <p>${err.message || err}</p>
        </div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingId ? "Actualizar propiedad" : "Guardar propiedad";
    }
  });
});
