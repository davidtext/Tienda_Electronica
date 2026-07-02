// Referencias a los elementos del HTML
const inputBusqueda = document.getElementById('inputBusqueda');
const btnBuscar = document.getElementById('btnBuscar');
const panelIngreso = document.getElementById('panelIngreso');
const formIngresoStock = document.getElementById('formIngresoStock');

// ==========================================
// MOTOR UNIVERSAL DE FORMATO DE MONEDA
// ==========================================
document.querySelectorAll('.input-precio').forEach(input => {
    input.addEventListener('input', function (e) {
        // 1. Quitamos todo lo que no sea número o coma
        let valor = this.value.replace(/[^0-9,]/g, '');

        // 2. Quitamos los puntos viejos para recalcular
        valor = valor.replace(/\./g, '');

        // 3. Separamos los enteros de los decimales (si hay coma)
        let partes = valor.split(',');

        // 4. Le ponemos el punto de miles a los enteros
        partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");

        // 5. Evitamos que pongan más de una coma o más de 2 decimales
        if (partes.length > 2) partes = [partes[0], partes.slice(1).join('')];
        if (partes[1] && partes[1].length > 2) partes[1] = partes[1].substring(0, 2);

        // 6. Volvemos a armar el texto
        this.value = partes.join(',');
    });
});

// Función para "limpiar" el texto y convertirlo en número para la Base de Datos
function desformatearMoneda(valorString) {
    if (!valorString || valorString.trim() === '') return null;
    // Quitamos los puntos, y cambiamos la coma por punto para que Node/MySQL lo entiendan
    let numeroLimpio = valorString.replace(/\./g, '').replace(',', '.');
    return parseFloat(numeroLimpio);
}

// ==========================================
// 1. LÓGICA DE BÚSQUEDA (El Escáner)
// ==========================================
let buscando = false; // Variable ANTI-SPAM

btnBuscar.addEventListener('click', realizarBusqueda);

inputBusqueda.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        realizarBusqueda();
    }
});

function realizarBusqueda() {
    if (buscando) return;

    const termino = inputBusqueda.value.trim();
    if (termino === '') {
        Swal.fire('Atención', 'Debes ingresar un SKU o nombre para buscar', 'warning');
        return;
    }

    buscando = true;

    fetch('/stock/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termino: termino })
    })
        .then(response => response.json())
        .then(data => {
            buscando = false;

            if (data.status === 'success') {
                const producto = data.productos[0];

                document.getElementById('productoId').value = producto.id;
                document.getElementById('productoNombre').innerText = producto.nombre;
                document.getElementById('productoSku').innerText = producto.sku;
                document.getElementById('productoStock').innerText = producto.stock_actual;

                // AQUÍ ESTABA EL ERROR ANTES: MySQL lo devuelve como "precio", no "precio_venta"
                document.getElementById('precioActualTexto').innerText = producto.precio;

                panelIngreso.classList.remove('d-none');

                document.getElementById('cantidadIngreso').value = '';
                document.getElementById('costoIngreso').value = '';
                document.getElementById('nuevoPrecioVenta').value = '';
                document.getElementById('cantidadIngreso').focus();
            } else {
                panelIngreso.classList.add('d-none');
                Swal.fire('No encontrado', data.message, 'info');
            }
        })
        .catch(error => {
            buscando = false;
            console.error('Error:', error);
            Swal.fire('Error', 'Hubo un problema de conexión con el servidor.', 'error');
        });
}

// ==========================================
// 2. LÓGICA DE GUARDADO
// ==========================================
formIngresoStock.addEventListener('submit', function (e) {
    e.preventDefault();

    const id_producto = document.getElementById('productoId').value;
    const cantidad = parseInt(document.getElementById('cantidadIngreso').value);

    // USAMOS EL DESFORMATEADOR EN LUGAR DE PARSEFLOAT
    const precio_costo = desformatearMoneda(document.getElementById('costoIngreso').value);
    const nuevo_precio_venta = desformatearMoneda(document.getElementById('nuevoPrecioVenta').value);

    if (isNaN(cantidad) || cantidad <= 0) return Swal.fire('Error', 'La cantidad debe ser mayor a 0.', 'warning');
    if (isNaN(precio_costo) || precio_costo < 0) return Swal.fire('Error', 'El precio de costo no puede ser menor a 0.', 'warning');
    if (nuevo_precio_venta !== null && nuevo_precio_venta <= 0) return Swal.fire('Error', 'El nuevo precio de venta debe ser mayor a 0.', 'warning');

    if (precio_costo === 0) {
        Swal.fire({
            title: '¿Costo cero?',
            text: 'Estás ingresando mercadería con costo $0. ¿Estás seguro?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, es correcto'
        }).then((result) => {
            if (result.isConfirmed) enviarDatos(id_producto, cantidad, precio_costo, nuevo_precio_venta);
        });
    } else {
        enviarDatos(id_producto, cantidad, precio_costo, nuevo_precio_venta);
    }
});

function enviarDatos(id_producto, cantidad, precio_costo, nuevo_precio_venta) {
    fetch('/stock/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto, cantidad, precio_costo, nuevo_precio_venta })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                Swal.fire({
                    title: '¡Ingreso Exitoso!',
                    text: data.message,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    formIngresoStock.reset();
                    panelIngreso.classList.add('d-none');
                    inputBusqueda.value = '';
                    inputBusqueda.focus();
                });
            } else {
                Swal.fire('Error', data.message, 'error');
            }
        });
}