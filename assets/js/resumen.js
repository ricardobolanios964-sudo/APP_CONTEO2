/**
 * SCRIPT RESUMEN DE CONTEOS (versión GitHub Pages)
 */

document.addEventListener('DOMContentLoaded', () => {
    
    Auth.exigirLogin();
    
    const params = new URLSearchParams(window.location.search);
    let sucursalActual = (params.get('sucursal') || 'mercado').toLowerCase();
    if (!['mercado', 'farmacia'].includes(sucursalActual)) sucursalActual = 'mercado';
    
    // Marcar el tab correcto al cargar
    document.querySelectorAll('.resumen-filter-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.sucursal === sucursalActual);
    });
    
    cargarResumen(sucursalActual);
    
    document.querySelectorAll('.resumen-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const nuevaSucursal = tab.dataset.sucursal;
            if (nuevaSucursal === sucursalActual) return;
            
            sucursalActual = nuevaSucursal;
            
            document.querySelectorAll('.resumen-filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            history.replaceState(null, '', 'resumen.html?sucursal=' + sucursalActual);
            
            mostrarSkeleton();
            cargarResumen(sucursalActual);
        });
    });
    
    function mostrarSkeleton() {
        document.getElementById('resumen-data-container').innerHTML = `
            <div class="resumen-skeleton">
                <div class="skeleton-block skeleton-total"></div>
                <div class="skeleton-block skeleton-row"></div>
                <div class="skeleton-block skeleton-row"></div>
                <div class="skeleton-block skeleton-row"></div>
            </div>
        `;
    }
    
    async function cargarResumen(sucursal) {
        const container = document.getElementById('resumen-data-container');
        
        try {
            const gid = sucursal === 'mercado' ? CONFIG.GID_INVENTARIO_MER : CONFIG.GID_INVENTARIO_FAR;
            const resultado = await SheetsAPI.getConteosPorUsuario(gid);
            
            if (!resultado.success) {
                container.innerHTML = renderPendiente(sucursal, resultado.mensaje);
                return;
            }
            
            const usuarioActual = Auth.getUsuarioActual().toLowerCase();
            const nombresSucursal = sucursal === 'mercado' ? 'Mercado' : 'Farmacia';
            
            let html = `
                <div class="resumen-total-card">
                    <span class="resumen-total-label">Total de conteos en ${nombresSucursal}</span>
                    <span class="resumen-total-number">${resultado.total}</span>
                </div>
            `;
            
            const entradas = Object.entries(resultado.conteos);
            
            if (entradas.length === 0) {
                html += `
                    <div class="resumen-empty-state">
                        <div class="resumen-pending-icon">📭</div>
                        <p>Todavía no hay conteos registrados en ${nombresSucursal}.</p>
                    </div>
                `;
            } else {
                html += `<div class="resumen-ranking-card"><p class="resumen-preview-label">Conteos por usuario</p>`;
                entradas.forEach(([nombreUsuario, cantidad]) => {
                    const esYo = nombreUsuario === usuarioActual;
                    html += `
                        <div class="resumen-user-row ${esYo ? 'es-yo' : ''}">
                            <span class="resumen-user-avatar">👤</span>
                            <span class="resumen-user-name">
                                ${escapeHtml(nombreUsuario)}
                                ${esYo ? '<span class="resumen-tag-tu">Tú</span>' : ''}
                            </span>
                            <span class="resumen-user-count">${cantidad} conteos</span>
                        </div>
                    `;
                });
                html += `</div>`;
            }
            
            container.innerHTML = html;
            
        } catch (error) {
            console.error('Error cargando resumen:', error);
            container.innerHTML = renderPendiente(sucursal, error.message || 'Error de conexión al cargar los datos');
        }
    }
    
    function renderPendiente(sucursal, mensaje) {
        return `
            <div class="resumen-pending-card">
                <div class="resumen-pending-icon">📊</div>
                <h2>Aquí verás el resumen por usuario</h2>
                <p>
                    Al seleccionar <strong>Mercado</strong>, los datos vienen de tu hoja 
                    <code>INVENTARIO_MER</code>. Al seleccionar <strong>Farmacia</strong>, 
                    vienen de <code>INVENTARIO_FAR</code>.
                </p>
                <div class="resumen-pending-note">
                    <strong>⚙️ Falta un paso para activarlo:</strong>
                    <p>${escapeHtml(mensaje)}</p>
                </div>
            </div>
        `;
    }
    
    function escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
    
});
