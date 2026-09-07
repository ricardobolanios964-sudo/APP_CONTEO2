/**
 * APP_CONTEO2 - Cierre de sesión
 * V2.4.1
 *
 * Modal simple y rápido. No utiliza animaciones de cierre
 * ni temporizadores antes de cancelar o cerrar sesión.
 */
document.addEventListener('DOMContentLoaded', function () {
    const btnLogout = document.getElementById('btn-logout');
    const modal = document.getElementById('modal-logout');
    const btnCancel = document.getElementById('btn-logout-cancel');
    const btnConfirm = document.getElementById('btn-logout-confirm');

    if (!btnLogout || !modal) return;

    function abrir() {
        modal.style.display = 'flex';
        if (btnCancel) btnCancel.focus();
    }

    function cerrar() {
        modal.style.display = 'none';
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
            Auth.cerrarSesion();
        });
    }

    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            cerrar();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            cerrar();
        }
    });
});
