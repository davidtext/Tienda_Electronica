// ==========================================
// MOTOR DE INICIALIZACIÓN UNIVERSAL (Bfcache Blindado)
// ==========================================
// Usamos 'pageshow' en lugar de 'DOMContentLoaded' porque este evento se ejecuta 
// SIEMPRE, incluso si el usuario vuelve atrás usando la flecha del navegador.
window.addEventListener('pageshow', () => {
    cargarCarritoPublico();
});

// Función 1: Traer el carrito desde Node.js
function cargarCarritoPublico() {
    fetch('/api/tienda/carrito/ver')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                renderizarCarrito(data.carrito);
            }
        })
        .catch(error => console.error('Error al cargar carrito:', error));
}

// Función 2: Agregar un producto (Con actualización automática)
function agregarAlCarritoPublico(id_producto) {
    fetch('/api/tienda/carrito/agregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto: id_producto })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Actualizamos los numeritos y el panel
            renderizarCarrito(data.carrito);
            
            // Magia: Abrimos el panel lateral automáticamente
            const offcanvasElement = document.getElementById('carritoPublicoOffcanvas');
            const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasElement) || new bootstrap.Offcanvas(offcanvasElement);
            bsOffcanvas.show();

        } else {
            Swal.fire('Atención', data.message, 'warning');
        }
    })
    .catch(error => console.error('Error:', error));
}

// Función 3: Vaciar todo
function vaciarCarritoPublico() {
    Swal.fire({
        title: '¿Vaciar carrito?',
        text: "Se eliminarán todos los productos seleccionados.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, vaciar'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch('/api/tienda/carrito/vaciar', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        // Vaciamos visualmente forzando los contadores a 0
                        const badgeNavbar = document.getElementById('contadorCarritoPublico');
                        const badgeFlotante = document.getElementById('contadorCarritoFlotante');
                        
                        if (badgeNavbar) badgeNavbar.innerText = '0';
                        if (badgeFlotante) badgeFlotante.innerText = '0';
                        
                        // Llamamos a la función de dibujo mandando un carrito vacío
                        renderizarCarrito([]); 
                        
                        // Opcional: Mostramos un mensajito de éxito rápido
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'Carrito vaciado',
                            showConfirmButton: false,
                            timer: 1500
                        });
                    }
                })
                .catch(error => console.error('Error al vaciar:', error));
        }
    });
}

// ==========================================
// FUNCIÓN 4: Dibujar el carrito y SINCRO DE GLOBOS NOTIFICADORES
// ==========================================
function renderizarCarrito(carrito) {
    const contenedor = document.getElementById('listaCarritoPublico');
    const badgeNavbar = document.getElementById('contadorCarritoPublico');
    const badgeFlotante = document.getElementById('contadorCarritoFlotante'); // ¡NUEVO! Captura el globo de abajo
    const textoTotal = document.getElementById('totalCarritoPublico');
    
    let cantidadTotal = 0;
    let precioTotal = 0;

    // Caso: Carrito Vacío
    if (!carrito || carrito.length === 0) {
        if (badgeNavbar) badgeNavbar.innerText = '0';
        if (badgeFlotante) badgeFlotante.innerText = '0'; // ¡NUEVO! Resetea el de abajo
        if (textoTotal) textoTotal.innerText = '$0.00';
        
        contenedor.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fa-solid fa-cart-arrow-down fa-3x mb-3 text-secondary"></i>
                <h6>Tu carrito está vacío</h6>
                <p class="small">¡Agregá productos para empezar tu compra!</p>
            </div>`;
        return;
    }

    // Caso: Carrito con productos (Calculamos totales)
    let html = '';
    carrito.forEach(item => {
        cantidadTotal += item.cantidad;
        precioTotal += (item.precio * item.cantidad);
        
        html += `
            <div class="card mb-2 border-0 shadow-sm bg-body">
                <div class="card-body p-2 d-flex align-items-center">
                    <img src="${item.imagen}" style="width: 50px; height: 50px; object-fit: contain;" class="rounded border border-secondary-subtle me-2">
                    <div class="flex-grow-1">
                        <h6 class="m-0 text-truncate text-body" style="max-width: 150px; font-size: 0.9rem;">${item.nombre}</h6>
                        <small class="text-muted d-block">$${Number(item.precio).toLocaleString('es-AR')}</small>
                        
                        <div class="d-flex align-items-center mt-1">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" onclick="modificarCantidad(${item.id}, 'restar')">-</button>
                            <span class="mx-2 fw-bold" style="font-size: 0.9rem;">${item.cantidad}</span>
                            <button class="btn btn-sm btn-outline-secondary py-0 px-2 fw-bold" onclick="modificarCantidad(${item.id}, 'sumar')">+</button>
                        </div>

                    </div>
                    <div class="fw-bold text-success text-end">
                        $${Number(item.precio * item.cantidad).toLocaleString('es-AR')}
                    </div>
                </div>
            </div>`;
    });

    // Pintamos los numeritos sincronizados en ambas alertas de la pantalla
    if (badgeNavbar) badgeNavbar.innerText = cantidadTotal;
    if (badgeFlotante) badgeFlotante.innerText = cantidadTotal; // ¡NUEVO! Sincronización perfecta de impacto
    
    if (textoTotal) textoTotal.innerText = '$' + Number(precioTotal).toLocaleString('es-AR');
    contenedor.innerHTML = html;
}

// Función: Sumar o restar cantidades
function modificarCantidad(id_producto, accion) {
    fetch('/api/tienda/carrito/modificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto: id_producto, accion: accion })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            renderizarCarrito(data.carrito);
        } else {
            Swal.fire('Atención', data.message, 'warning');
        }
    });
}

// Función 5: Iniciar la compra
function iniciarCheckout() {
    window.location.href = '/tienda/checkout';
}