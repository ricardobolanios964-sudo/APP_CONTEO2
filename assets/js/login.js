/**
 * SCRIPT LOGIN (versión GitHub Pages)
 * Igual comportamiento que la versión PHP, pero validando directo
 * contra Google Sheets desde el navegador (Auth.validarLogin).
 */

document.addEventListener('DOMContentLoaded', function() {
    
    // Si ya hay sesión activa, saltar directo al dashboard
    if (Auth.estaLogueado()) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    const form = document.getElementById('login-form');
    const usuario = document.getElementById('usuario');
    const contraseña = document.getElementById('contraseña');
    const togglePassword = document.getElementById('toggle-password');
    const btnLogin = document.getElementById('btn-login');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.getElementById('btn-loader');
    const alertError = document.getElementById('alert-error');
    const errorText = document.getElementById('error-text');
    
    if (togglePassword) {
        togglePassword.addEventListener('click', function(e) {
            e.preventDefault();
            const tipo = contraseña.type === 'password' ? 'text' : 'password';
            contraseña.type = tipo;
            this.textContent = tipo === 'password' ? '👁️' : '👁️‍🗨️';
        });
    }
    
    usuario.addEventListener('blur', function() {
        document.getElementById('error-usuario').textContent = this.value.trim() ? '' : 'Usuario requerido';
    });
    
    contraseña.addEventListener('blur', function() {
        document.getElementById('error-contraseña').textContent = this.value ? '' : 'Contraseña requerida';
    });
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validar_formulario()) return;
        
        btnLogin.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
        alertError.style.display = 'none';
        
        try {
            const resultado = await Auth.validarLogin(usuario.value.trim(), contraseña.value);
            
            if (resultado.success) {
                mostrar_success('¡Bienvenido!');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 150);
            } else if (resultado.requiere_cambio) {
                mostrarFormularioCambioPassword(resultado.usuario);
                btnLogin.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
            } else {
                mostrar_error(resultado.error);
                btnLogin.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
            }
        } catch (error) {
            console.error('Error:', error);
            mostrar_error('Error de conexión. Intente nuevamente.');
            btnLogin.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    });
    
    // ================================================
    // FORMULARIO: CREAR CONTRASEÑA (primer ingreso)
    // ================================================
    
    const formCambio = document.getElementById('cambio-password-form');
    const btnVolverLogin = document.getElementById('btn-volver-login');
    
    function mostrarFormularioCambioPassword(nombreUsuario) {
        form.style.display = 'none';
        formCambio.style.display = 'flex';
        formCambio.style.flexDirection = 'column';
        document.getElementById('cambio-usuario').value = nombreUsuario;
        document.getElementById('nueva-password').focus();
    }
    
    if (btnVolverLogin) {
        btnVolverLogin.addEventListener('click', () => {
            formCambio.style.display = 'none';
            form.style.display = 'flex';
            form.style.flexDirection = 'column';
            document.getElementById('alert-error-cambio').style.display = 'none';
        });
    }
    
    if (formCambio) {
        formCambio.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const nueva = document.getElementById('nueva-password').value;
            const repetir = document.getElementById('repetir-password').value;
            const usuarioCambio = document.getElementById('cambio-usuario').value;
            const alertCambio = document.getElementById('alert-error-cambio');
            const errorTextCambio = document.getElementById('error-text-cambio');
            
            document.getElementById('error-nueva-password').textContent = '';
            document.getElementById('error-repetir-password').textContent = '';
            alertCambio.style.display = 'none';
            
            if (nueva.length < 4) {
                document.getElementById('error-nueva-password').textContent = 'Mínimo 4 caracteres';
                return;
            }
            if (nueva !== repetir) {
                document.getElementById('error-repetir-password').textContent = 'No coincide con la nueva contraseña';
                return;
            }
            
            const btnCambiar = document.getElementById('btn-cambiar-password');
            const btnTextCambio = btnCambiar.querySelector('.btn-text');
            const btnLoaderCambio = document.getElementById('btn-loader-cambio');
            
            btnCambiar.disabled = true;
            btnTextCambio.style.display = 'none';
            btnLoaderCambio.style.display = 'flex';
            
            try {
                const resultado = await Auth.cambiarPassword(usuarioCambio, nueva, repetir);
                
                if (resultado.success) {
                    formCambio.innerHTML = `
                        <div class="primer-ingreso-banner" style="background:#ECFDF5;">
                            <span class="primer-ingreso-icon">✅</span>
                            <div>
                                <strong>¡Contraseña creada!</strong>
                                <p>Ingresando a tu cuenta...</p>
                            </div>
                        </div>
                    `;
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 700);
                } else {
                    alertCambio.style.display = 'block';
                    errorTextCambio.textContent = resultado.error;
                    btnCambiar.disabled = false;
                    btnTextCambio.style.display = 'inline';
                    btnLoaderCambio.style.display = 'none';
                }
            } catch (error) {
                console.error('Error:', error);
                alertCambio.style.display = 'block';
                errorTextCambio.textContent = 'Error de conexión. Intenta de nuevo.';
                btnCambiar.disabled = false;
                btnTextCambio.style.display = 'inline';
                btnLoaderCambio.style.display = 'none';
            }
        });
    }
    
    function validar_formulario() {
        let valido = true;
        document.getElementById('error-usuario').textContent = '';
        document.getElementById('error-contraseña').textContent = '';
        
        if (!usuario.value.trim()) {
            document.getElementById('error-usuario').textContent = 'Usuario requerido';
            valido = false;
        }
        if (!contraseña.value) {
            document.getElementById('error-contraseña').textContent = 'Contraseña requerida';
            valido = false;
        }
        return valido;
    }
    
    function mostrar_error(mensaje) {
        alertError.style.display = 'block';
        alertError.classList.remove('alert-success');
        alertError.classList.add('alert-error');
        errorText.textContent = mensaje;
        errorText.style.whiteSpace = 'pre-wrap';
        errorText.style.fontSize = '0.85rem';
        alertError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    function mostrar_success(mensaje) {
        alertError.style.display = 'block';
        alertError.classList.remove('alert-error');
        alertError.classList.add('alert-success');
        errorText.textContent = mensaje;
    }
    
});
