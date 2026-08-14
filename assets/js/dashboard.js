/**
 * SCRIPT DASHBOARD (versión GitHub Pages)
 */

document.addEventListener('DOMContentLoaded', function() {
    
    // Exigir sesión activa (reemplaza require_login() de PHP)
    Auth.exigirLogin();
    
    // Mostrar nombre del usuario en el menú
    const nombreEl = document.getElementById('dropdown-usuario-nombre');
    if (nombreEl) nombreEl.textContent = Auth.getUsuarioActual();
    
    // ================================================
    // MENÚ HAMBURGUESA
    // ================================================
    
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    
    if (hamburgerBtn && dropdownMenu) {
        hamburgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('open');
            hamburgerBtn.classList.toggle('active');
        });
        
        document.addEventListener('click', function(e) {
            if (!dropdownMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                dropdownMenu.classList.remove('open');
                hamburgerBtn.classList.remove('active');
            }
        });
    }
    
    // Cerrar sesión
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('¿Desea cerrar sesión?')) {
                Auth.cerrarSesion();
            }
        });
    }
    
    // ================================================
    // SELECCIÓN DE TIPO DE CONTEO
    // ================================================
    
    document.querySelectorAll('.btn-select').forEach(boton => {
        boton.addEventListener('click', function(e) {
            e.preventDefault();
            const tipo = this.getAttribute('data-tipo');
            window.location.href = `conteo.html?tipo=${tipo}`;
        });
    });
    
});
