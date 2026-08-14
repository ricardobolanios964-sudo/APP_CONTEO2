/**
 * AUTH.JS
 * Reemplaza el sistema de sesiones de PHP ($_SESSION). Usa sessionStorage
 * del navegador (se borra al cerrar la pestaña, igual que una sesión PHP
 * normal se pierde si se cierra el navegador).
 */

const Auth = {

    estaLogueado() {
        return sessionStorage.getItem('bolanos_logueado') === 'true';
    },

    getUsuarioActual() {
        return sessionStorage.getItem('bolanos_usuario') || '';
    },

    iniciarSesion(usuario) {
        sessionStorage.setItem('bolanos_logueado', 'true');
        sessionStorage.setItem('bolanos_usuario', usuario);
        sessionStorage.setItem('bolanos_login_time', Date.now().toString());
    },

    cerrarSesion() {
        sessionStorage.clear();
        window.location.href = 'index.html';
    },

    /**
     * Llamar al inicio de cada página protegida (dashboard, conteo,
     * resumen, reportes). Si no hay sesión, manda de vuelta al login.
     */
    exigirLogin() {
        if (!this.estaLogueado()) {
            window.location.href = 'index.html';
        }
    },

    /**
     * Valida usuario/contraseña contra la hoja USUARIOS.
     * Usuario: comparación EXACTA (respeta mayúsculas/minúsculas).
     * Contraseña temporal "000000": pide crear una nueva.
     */
    async validarLogin(usuario, contrasena) {
        let usuarios;
        try {
            usuarios = await SheetsAPI.getUsuarios();
        } catch (e) {
            return { success: false, error: 'Usuario o contraseña incorrectos' };
        }

        if (!usuarios || usuarios.length === 0) {
            return { success: false, error: 'Usuario o contraseña incorrectos' };
        }

        for (const u of usuarios) {
            if (u.usuario === usuario) {

                if (u.contrasena.trim() === '000000') {
                    if (contrasena === '000000') {
                        return { success: false, requiere_cambio: true, usuario };
                    }
                    return { success: false, error: 'Usuario o contraseña incorrectos' };
                }

                if (u.contrasena === contrasena) {
                    this.iniciarSesion(usuario);
                    return { success: true };
                }
            }
        }

        return { success: false, error: 'Usuario o contraseña incorrectos' };
    },

    async cambiarPassword(usuario, nueva, repetir) {
        if (!nueva || nueva.length < 4) {
            return { success: false, error: 'La contraseña debe tener al menos 4 caracteres' };
        }
        if (nueva !== repetir) {
            return { success: false, error: 'Las contraseñas no coinciden' };
        }
        if (nueva === '000000') {
            return { success: false, error: 'Elige una contraseña distinta a la temporal' };
        }

        const resultado = await SheetsAPI.cambiarPassword(usuario, nueva);

        if (!resultado.success) {
            return { success: false, error: resultado.mensaje || 'No se pudo cambiar la contraseña' };
        }

        this.iniciarSesion(usuario);
        return { success: true };
    },
};
