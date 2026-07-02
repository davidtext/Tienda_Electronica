// ==========================================
// LÓGICA DE VALIDACIÓN (TEXTOS ROJOS Y SWEETALERT)
// ==========================================
function validarFormularioUsuario(prefijo) {
    let valido = true;
    let camposFaltantes = [];

    // Limpiamos los errores visuales
    const campos = ['nombre', 'apellido', 'dni', 'email', 'rol'];
    campos.forEach(c => document.getElementById(`${prefijo}_${c}`).classList.remove('is-invalid'));

    // 1. Validar Nombre y Apellido
    if (!document.getElementById(`${prefijo}_nombre`).value.trim()) {
        document.getElementById(`${prefijo}_nombre`).classList.add('is-invalid');
        camposFaltantes.push('Nombre');
        valido = false;
    }
    if (!document.getElementById(`${prefijo}_apellido`).value.trim()) {
        document.getElementById(`${prefijo}_apellido`).classList.add('is-invalid');
        camposFaltantes.push('Apellido');
        valido = false;
    }

    // 2. Validar DNI
    const inpDni = document.getElementById(`${prefijo}_dni`);
    if (!inpDni.value.trim() || !/^\d{7,11}$/.test(inpDni.value.trim())) {
        inpDni.classList.add('is-invalid');
        camposFaltantes.push('DNI válido (7 a 11 números)');
        valido = false;
    }
    
    // 3. Validar Email
    const inpEmail = document.getElementById(`${prefijo}_email`);
    if (!inpEmail.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inpEmail.value.trim())) {
        inpEmail.classList.add('is-invalid');
        camposFaltantes.push('Email válido');
        valido = false;
    }

    // 4. Validar Rol
    if (!document.getElementById(`${prefijo}_rol`).value) {
        document.getElementById(`${prefijo}_rol`).classList.add('is-invalid');
        camposFaltantes.push('Rol en el sistema');
        valido = false;
    }

    if (!valido) {
        Swal.fire({
            icon: 'warning',
            title: 'Formulario Incompleto',
            html: `Por favor, revisa los campos en rojo.<br><br><b>Faltan o están incorrectos:</b><br>${camposFaltantes.join(', ')}`
        });
    }

    return valido;
}

// ==========================================
// 1. CREAR NUEVO USUARIO
// ==========================================
document.getElementById('formNuevoEmpleado').addEventListener('submit', function (e) {
    e.preventDefault();

    if (!validarFormularioUsuario('nuevo', false)) return;

    const datos = {
        nombre: document.getElementById('nuevo_nombre').value.trim(),
        apellido: document.getElementById('nuevo_apellido').value.trim(),
        dni: document.getElementById('nuevo_dni').value.trim(),
        email: document.getElementById('nuevo_email').value.trim(),
        rol_id: document.getElementById('nuevo_rol').value
    };

    fetch('/usuarios/crear-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    }).then(res => res.json()).then(data => {
        if (data.status === 'success') {
            Swal.fire('¡Éxito!', data.message, 'success').then(() => location.reload());
        } else Swal.fire('Error', data.message, 'error');
    });
});

// ==========================================
// 2. ABRIR MODAL EDITAR
// ==========================================
function abrirModalEditar(id_usuario, empleado_id, nombre, apellido, dni, email, rol_id) {
    // Limpiar errores visuales
    ['nombre', 'apellido', 'dni', 'email', 'rol'].forEach(c => document.getElementById(`edit_${c}`).classList.remove('is-invalid'));

    document.getElementById('edit_id').value = id_usuario;
    document.getElementById('edit_empleado_id').value = empleado_id;
    document.getElementById('edit_nombre').value = nombre;
    document.getElementById('edit_apellido').value = apellido;
    document.getElementById('edit_dni').value = dni;
    document.getElementById('edit_email').value = email;
    document.getElementById('edit_rol').value = rol_id;

    new bootstrap.Modal(document.getElementById('modalEditarUsuario')).show();
}

// ==========================================
// 3. GUARDAR EDICIÓN
// ==========================================
document.getElementById('formEditarUsuario').addEventListener('submit', function (e) {
    e.preventDefault();

    if (!validarFormularioUsuario('edit', true)) return;

    const datos = {
        id_usuario: document.getElementById('edit_id').value,
        empleado_id: document.getElementById('edit_empleado_id').value,
        nombre: document.getElementById('edit_nombre').value.trim(),
        apellido: document.getElementById('edit_apellido').value.trim(),
        dni: document.getElementById('edit_dni').value.trim(),
        email: document.getElementById('edit_email').value.trim(),
        rol_id: document.getElementById('edit_rol').value
    };

    fetch('/usuarios/editar-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    }).then(res => res.json()).then(data => {
        if (data.status === 'success') {
            Swal.fire('¡Actualizado!', data.message, 'success').then(() => location.reload());
        } else Swal.fire('Error', data.message, 'error');
    });
});

// ==========================================
// 4. BORRAR Y REINICIAR (MANTENIDOS)
// ==========================================
function borrarUsuario(id) {
    Swal.fire({
        title: '¿Desactivar usuario?',
        text: "Perderá acceso al sistema de inmediato.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Sí, desactivar'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch('/usuarios/borrar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
            }).then(res => res.json()).then(data => {
                if (data.status === 'success') Swal.fire('Desactivado', data.message, 'success').then(() => location.reload());
                else Swal.fire('Error', data.message, 'error');
            });
        }
    });
}

function reiniciarUsuario(id, email) {
    Swal.fire({
        title: '¿Reiniciar Contraseña?',
        text: "Su clave temporal será su email.",
        icon: 'info',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        confirmButtonText: 'Sí, reiniciar'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch('/usuarios/reiniciar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, email })
            }).then(res => res.json()).then(data => {
                if (data.status === 'success') Swal.fire('Reiniciado', data.message, 'success');
                else Swal.fire('Error', data.message, 'error');
            });
        }
    });
}