/**
 * SCRIPT REPORTES (versión GitHub Pages)
 * Genera el CSV directo en el navegador (antes lo streameaba PHP) y
 * dispara la descarga con un Blob - mismo formato y separador (;)
 * que ya validamos que funciona bien en Excel.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    Auth.exigirLogin();
    
    let sucursalActual = 'mercado';
    
    const opciones = document.querySelectorAll('.reporte-opcion-card');
    const btnDescargar = document.getElementById('btn-descargar-reporte');
    const btnTexto = document.getElementById('btn-descargar-texto');
    const btnSpinner = document.getElementById('btn-descargar-spinner');
    
    opciones.forEach(opcion => {
        opcion.addEventListener('click', () => {
            sucursalActual = opcion.dataset.sucursal;
            
            opciones.forEach(o => o.classList.remove('active'));
            opcion.classList.add('active');
            
            const nombreBonito = sucursalActual === 'mercado' ? 'Mercado' : 'Farmacia';
            btnTexto.textContent = `⬇️ Descargar Reporte de ${nombreBonito}`;
        });
    });
    
    if (btnDescargar) {
        btnDescargar.addEventListener('click', async () => {
            btnDescargar.disabled = true;
            btnTexto.style.display = 'none';
            btnSpinner.style.display = 'inline-block';
            
            try {
                const gid = sucursalActual === 'mercado' ? CONFIG.GID_INVENTARIO_MER : CONFIG.GID_INVENTARIO_FAR;
                const resultado = await SheetsAPI.getDatosReporte(gid);
                
                if (!resultado.success) {
                    alert('No se pudo generar el reporte: ' + resultado.mensaje);
                    return;
                }
                
                const csv = construirCSV(resultado.filas);
                descargarCSV(csv, `Reporte_Conteo_${sucursalActual === 'mercado' ? 'Mercado' : 'Farmacia'}_${fechaHoy()}.csv`);
                
            } catch (error) {
                console.error(error);
                alert('Ocurrió un error al generar el reporte: ' + error.message);
            } finally {
                btnDescargar.disabled = false;
                btnTexto.style.display = 'inline';
                btnSpinner.style.display = 'none';
            }
        });
    }
    
    function construirCSV(filas) {
        const encabezados = [
            'Codigo Producto', 'Codigo Ubicacion', 'Posicion', 'Cantidad Contada',
            'Codigo Empleado Contó', 'Fecha Hora Contado', '# de Lote', '# de Serie', 'Observaciones'
        ];
        
        const escaparCampo = (valor) => {
            const texto = String(valor ?? '');
            if (texto.includes(';') || texto.includes('"') || texto.includes('\n')) {
                return `"${texto.replace(/"/g, '""')}"`;
            }
            return texto;
        };
        
        // Punto y coma como separador (así lo abre bien Excel en español)
        let csv = encabezados.map(escaparCampo).join(';') + '\r\n';
        
        filas.forEach(f => {
            csv += [
                f.codigo_producto, f.codigo_ubicacion, f.posicion, f.cantidad_contada,
                f.codigo_empleado, f.fecha_hora_contado, f.lote, f.serie, f.observaciones
            ].map(escaparCampo).join(';') + '\r\n';
        });
        
        return csv;
    }
    
    function descargarCSV(contenido, nombreArchivo) {
        // BOM UTF-8 para que Excel muestre bien tildes/eñes
        const bom = '\uFEFF';
        const blob = new Blob([bom + contenido], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombreArchivo;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        
        URL.revokeObjectURL(url);
    }
    
    function fechaHoy() {
        const hoy = new Date();
        return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }
    
});
