# 📦 Farmacia Bolaños - Inventario (versión GitHub Pages)

Esta es la versión 100% estática (HTML + CSS + JavaScript) de la app,
adaptada para funcionar en GitHub Pages sin necesidad de PHP.

## ⚠️ Recuerda el detalle de seguridad importante

Esta versión NO tiene servidor detrás. Toda la lógica (login, búsqueda,
guardado) corre directo en el navegador. Esto significa:

- El login sigue funcionando normal para el uso diario
- PERO alguien técnico podría, en teoría, encontrar la URL de tu Apps
  Script en el código y escribir datos directo, sin pasar por tu app

Si esto es un problema para ti, la alternativa es usar un hosting real
con PHP (como Render, InfinityFree, etc.) donde esa URL nunca se expone
al navegador.

## 🚀 Cómo publicarla en GitHub Pages

### 1. Sube esta carpeta completa a tu repositorio

Arrastra **todo el contenido** de esta carpeta (`inventario_pages/`)
directo a la raíz de tu repositorio en GitHub (no metida dentro de otra
carpeta - los archivos `index.html`, `dashboard.html`, etc. deben quedar
en la raíz).

### 2. Activa GitHub Pages

1. En tu repositorio, ve a **Settings** (Configuración)
2. En el menú izquierdo, click en **Pages**
3. En "Source", selecciona la rama **main** (o **master**) y la carpeta **/ (root)**
4. Click **Save**
5. Espera 1-2 minutos

### 3. Accede a tu app

GitHub te va a dar una URL como:
```
https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/
```

Esa es tu app funcionando en internet, gratis, para siempre.

## ✅ Qué funciona igual que la versión PHP

- Login con usuario/contraseña (respetando mayúsculas)
- Contraseña temporal `000000` → pide crear una nueva
- Búsqueda en tiempo real (código, nombre, marca, categoría, código de barras)
- Escáner de código de barras con la cámara
- Formulario de conteo completo (rueda de fecha, precios, observaciones)
- Aviso de "producto ya contado"
- Animaciones de envío y éxito
- Resumen de Conteos con filtro Mercado/Farmacia
- Generar Reportes (descarga CSV)
- Todo el diseño y estilos, sin cambios

## 🔧 Si algo no funciona

Abre las herramientas de desarrollador del navegador (F12) → pestaña
"Console" y revisa si hay errores en rojo. Los más comunes:

- **"Failed to fetch"**: revisa que tu Google Sheet esté compartido como
  "Cualquiera con el enlace puede ver"
- **Error de CORS al guardar**: es normal a veces, la app ya está
  preparada para asumir éxito en ese caso (igual que hacía la versión PHP)
