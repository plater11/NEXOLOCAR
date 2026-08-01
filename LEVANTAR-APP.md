# Levantar NexoVenta v45

## Requisitos
- Node.js 22 o superior

## Ejecución local
1. Abrir una terminal en esta carpeta.
2. Ejecutar:

```bash
npm install --registry=https://registry.npmjs.org
npm run dev
```

3. Abrir en el navegador:

```text
http://localhost:3000
```

## Publicar en Vercel
1. Subir esta carpeta a un repositorio de GitHub.
2. Importar el repositorio en Vercel.
3. Framework: Next.js.
4. Build command: `npm run build`.
5. Output: configuración automática de Next.js.

## Nota
Se eliminó el lock anterior porque apuntaba a un registro interno no disponible. Al ejecutar `npm install` se generará uno nuevo desde npm público.
