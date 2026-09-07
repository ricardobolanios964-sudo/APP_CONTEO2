/**
 * APP_CONTEO2 - Cierre de sesión profesional
 */
document.addEventListener('DOMContentLoaded', function () {
    const btnLogout = document.getElementById('btn-logout');
    const modal = document.getElementById('modal-logout');
    const btnCancel = document.getElementById('btn-logout-cancel');
    const btnConfirm = document.getElementById('btn-logout-confirm');
    const userName = document.getElementById('logout-user-name');

    if (!btnLogout || !modal) return;

    if (userName && typeof Auth !== 'undefined') {
        userName.textContent = Auth.getUsuarioActual() || 'usuario';
    }

    function abrir() {
        if (userName && typeof Auth !== 'undefined') {
            userName.textContent = Auth.getUsuarioActual() || 'usuario';
        }
        modal.style.display = 'flex';
        requestAnimationFrame(function () {
            modal.classList.add('logout-modal-open');
        });
        if (btnCancel) btnCancel.focus();
    }

    function cerrar() {
        modal.classList.remove('logout-modal-open');
        setTimeout(function () {
            modal.style.display = 'none';
        }, 180);
    }

    btnLogout.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        abrir();
    });

    if (btnCancel) {
        btnCancel.addEventListener('click', function () {
            cerrar();
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', function () {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<span class="logout-spinner"></span> Cerrando sesión...';

            setTimeout(function () {
                Auth.cerrarSesion();
            }, 350);
        });
    }

    modal.addEventListener('click', function (e) {
        if (e.target === modal) cerrar();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            cerrar();
        }
    });
});
