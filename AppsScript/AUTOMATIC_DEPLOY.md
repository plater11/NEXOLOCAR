# Despliegue automático de Google Apps Script

GitHub es la fuente única de `AppsScript/Code.gs`. Cada `push` a `main` que cambie
`AppsScript/**` ejecuta `.github/workflows/deploy-apps-script.yml`, sube el código,
crea una versión inmutable y actualiza la implementación web existente. La URL
`/exec` se conserva, por lo que Vercel no necesita cambiar `APPS_SCRIPT_URL`.

## Configuración única

1. Habilitar **Google Apps Script API** en
   `https://script.google.com/home/usersettings`.
2. Instalar e iniciar sesión localmente:

   ```powershell
   npm install --global @google/clasp
   clasp login
   ```

3. En Apps Script, abrir **Configuración del proyecto** y copiar el **ID de script**.
4. En GitHub, abrir **Settings → Secrets and variables → Actions** y crear:

   - `CLASPRC_JSON`: contenido completo de `$HOME\.clasprc.json`.
   - `CLASP_JSON`: `{"scriptId":"ID_DE_SCRIPT","rootDir":"AppsScript"}`.
   - `APPS_SCRIPT_DEPLOYMENT_ID`: ID de la implementación web actual. Es el texto
     situado entre `/s/` y `/exec` en su URL.

5. Abrir **Actions → Deploy Apps Script → Run workflow** para comprobar la primera
   sincronización.

## Seguridad y operación

- Nunca confirmar `.clasprc.json` ni `.clasp.json`; contienen credenciales o IDs
  de configuración y están ignorados por Git.
- No editar `Code.gs` directamente en el editor web: el siguiente despliegue lo
  reemplazará con la versión de GitHub.
- Si el token OAuth se revoca, repetir `clasp login` y actualizar `CLASPRC_JSON`.
- El workflow no crea otra implementación; actualiza la existente para mantener
  estable la URL usada por Vercel.
