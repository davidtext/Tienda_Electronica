// ==========================================
// MOTOR UNIVERSAL DE FORMATO DE MONEDA
// ==========================================
document.querySelectorAll('.input-precio').forEach(input => {
    input.addEventListener('input', function (e) {
        let valor = this.value.replace(/[^0-9,]/g, '');
        valor = valor.replace(/\./g, '');
        let partes = valor.split(',');
        partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        if (partes.length > 2) partes = [partes[0], partes.slice(1).join('')];
        if (partes[1] && partes[1].length > 2) partes[1] = partes[1].substring(0, 2);
        this.value = partes.join(',');
    });
});

function desformatearMoneda(valorString) {
    if (!valorString || valorString.trim() === '') return 0;
    let numeroLimpio = String(valorString).replace(/\./g, '').replace(',', '.');
    return parseFloat(numeroLimpio);
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
    }).format(valor);
}

// ==========================================
// FUNCIÓN 1: Agregar un producto al carrito
// ==========================================
function agregarAlCarrito(idProducto) {
    fetch('/carrito/agregar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto: idProducto })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'Producto agregado',
                    showConfirmButton: false,
                    timer: 1500
                });
                actualizarCarritoVisual();

                const element = document.getElementById('carritoOffcanvas');
                const instance = bootstrap.Offcanvas.getInstance(element) || new bootstrap.Offcanvas(element);
                instance.show();
            } else {
                Swal.fire('Atención', data.message, 'warning');
            }
        });
}

function eliminarDelCarrito(idProducto) {
    fetch('/carrito/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto: idProducto })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                actualizarCarritoVisual();
            }
        });
}

function vaciarCarrito() {
    Swal.fire({
        title: '¿Vaciar carrito?',
        text: "Se eliminarán todos los productos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, vaciar'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch('/carrito/vaciar', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') actualizarCarritoVisual();
                });
        }
    });
}

// ==========================================
// FUNCIÓN 4: Dibujar el carrito y actualizar contadores (CON BOTONES + y -)
// ==========================================
let totalActualNumero = 0; 

function actualizarCarritoVisual() {
    fetch('/carrito/ver')
        .then(response => response.json())
        .then(data => {
            const listaCarrito = document.getElementById('listaCarrito');
            const totalCarrito = document.getElementById('totalCarrito');
            const contadorFlotante = document.getElementById('contadorCarritoFlotante');

            let html = '';
            totalActualNumero = 0;
            let cantidadTotalArticulos = 0;

            if (!data.carrito || data.carrito.length === 0) {
                listaCarrito.innerHTML = '<div class="text-center mt-5"><i class="fa-solid fa-cart-shopping fa-3x text-light-emphasis mb-3"></i><p class="text-muted">El carrito está vacío.</p></div>';
                totalCarrito.innerText = formatearMoneda(0);
                if (contadorFlotante) contadorFlotante.innerText = 0;
                return;
            }

            data.carrito.forEach(item => {
                const subtotal = item.precio * item.cantidad;
                totalActualNumero += subtotal;
                cantidadTotalArticulos += item.cantidad;

                // Lógica Visual para ver si el producto tiene un descuento aplicado desde la BD
                const precioOrig = item.precio_original || item.precio;
                let visualPrecioHtml = '';
                
                if (precioOrig > item.precio) {
                    visualPrecioHtml = `
                        <small class="text-muted text-decoration-line-through d-block" style="font-size: 0.75rem;">${formatearMoneda(precioOrig)}</small>
                        <span class="text-success fw-bold">${formatearMoneda(item.precio)}</span>
                    `;
                } else {
                    visualPrecioHtml = `<span class="text-success fw-bold">${formatearMoneda(item.precio)}</span>`;
                }

                html += `
                <div class="card mb-2 border-secondary-subtle shadow-sm">
                    <div class="card-body p-3 bg-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div style="max-width: 80%;">
                                <h6 class="m-0 fw-bold text-body">${item.nombre}</h6>
                                
                                <!-- CONTENEDOR DE PRECIO Y BOTONES DE CANTIDAD -->
                                <div class="mt-2 d-flex align-items-center">
                                    <div class="me-3">${visualPrecioHtml}</div>
                                    
                                    <div class="d-flex align-items-center border border-secondary-subtle rounded">
                                        <button class="btn btn-sm btn-light border-0 py-0 px-2 fw-bold text-secondary" onclick="modificarCantidad(${item.id}, 'restar')">-</button>
                                        <span class="mx-2 fw-bold" style="font-size: 0.9rem;">${item.cantidad}</span>
                                        <button class="btn btn-sm btn-light border-0 py-0 px-2 fw-bold text-secondary" onclick="modificarCantidad(${item.id}, 'sumar')">+</button>
                                    </div>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-outline-danger border-0" onclick="eliminarDelCarrito(${item.id})">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                        <div class="d-flex justify-content-end mt-1 pt-1 border-top border-secondary-subtle">
                            <span class="fw-bold text-primary">Subt: ${formatearMoneda(subtotal)}</span>
                        </div>
                    </div>
                </div>
            `;
            });

            listaCarrito.innerHTML = html;
            totalCarrito.innerText = formatearMoneda(totalActualNumero);
            if (contadorFlotante) contadorFlotante.innerText = cantidadTotalArticulos;
        });
}

// ==========================================
// NUEVA FUNCIÓN: Sumar o Restar del Carrito Físico
// ==========================================
function modificarCantidad(id_producto, accion) {
    fetch('/carrito/modificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto: id_producto, accion: accion })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            actualizarCarritoVisual(); // Refrescamos el dibujo
        } else {
            Swal.fire('Atención', data.message, 'warning');
        }
    })
    .catch(error => console.error('Error al modificar cantidad:', error));
}

// ==========================================
// LÓGICA DEL MODAL DE COBRO MÚLTIPLE (CHECKOUT)
// ==========================================
let listaPagosVenta = [];
let montoRestanteCobro = 0;
let vueltoFinal = 0;
let descuentoActualCobro = 0; 

function abrirModalCobro() {
    if (totalActualNumero <= 0) return Swal.fire('Atención', 'No hay nada para cobrar', 'warning');

    const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('carritoOffcanvas'));
    if (offcanvas) offcanvas.hide();

    listaPagosVenta = [];
    descuentoActualCobro = 0;
    montoRestanteCobro = totalActualNumero;
    vueltoFinal = 0;

    // ¡ACÁ ESTABA EL ERROR! Ahora apunta al ID correcto del porcentaje
    document.getElementById('inputDescuentoPorcentaje').value = ''; 
    document.getElementById('modalSubtotalTexto').innerText = formatearMoneda(totalActualNumero);
    document.getElementById('modalDescuentoTexto').innerText = '- ' + formatearMoneda(0);
    document.getElementById('modalTotalCobroTexto').innerText = formatearMoneda(totalActualNumero);
    
    const inputMonto = document.getElementById('montoIngresarPago');
    inputMonto.value = totalActualNumero; 
    inputMonto.dispatchEvent(new Event('input')); 

    actualizarTablaPagosUI();
    new bootstrap.Modal(document.getElementById('modalCobro')).show();
}

// ==========================================
// APLICAR DESCUENTO GLOBAL EN PORCENTAJE (%)
// ==========================================
// ¡NUEVA VARIABLE GLOBAL! Guarda el número del % (Ej: 10)
let porcentajeDescuentoAplicado = 0; 

function aplicarDescuentoPorcentaje() {
    const porcentajeInput = document.getElementById('inputDescuentoPorcentaje').value;
    const porcentajeNum = parseInt(porcentajeInput) || 0;
    
    if (porcentajeNum < 0) return Swal.fire('Error', 'El descuento no puede ser negativo.', 'warning');
    if (porcentajeNum > 100) return Swal.fire('Error', 'El descuento no puede superar el 100%.', 'warning');
    
    // Guardamos el porcentaje en la memoria para usarlo en el ticket
    porcentajeDescuentoAplicado = porcentajeNum;

    // Matemática: Calculamos cuánto dinero equivale ese porcentaje del total
    descuentoActualCobro = (totalActualNumero * porcentajeNum) / 100;
    
    // Lo mostramos en la pantallita del resumen (Elegante: % y Pesos)
    if (porcentajeNum > 0) {
        document.getElementById('modalDescuentoTexto').innerHTML = `<span class="badge bg-danger me-2">${porcentajeNum}% OFF</span> - ${formatearMoneda(descuentoActualCobro)}`;
    } else {
        document.getElementById('modalDescuentoTexto').innerText = '- ' + formatearMoneda(0);
    }
    
    // Limpiamos el input para que quede prolijo
    document.getElementById('inputDescuentoPorcentaje').value = '';
    
    actualizarTablaPagosUI();
}

function agregarPagoALista() {
    const metodo = document.getElementById('selectMetodoPago').value;
    const monto = desformatearMoneda(document.getElementById('montoIngresarPago').value);

    if (isNaN(monto) || monto <= 0) return Swal.fire('Error', 'Ingrese un monto válido', 'error');

    if (metodo !== 'Efectivo' && monto > montoRestanteCobro) {
        return Swal.fire('Atención', 'Solo efectivo permite calcular vuelto.', 'warning');
    }

    listaPagosVenta.push({ metodo, monto });
    actualizarTablaPagosUI();
}

function quitarPagoDeLista(index) {
    listaPagosVenta.splice(index, 1);
    actualizarTablaPagosUI();
}

function actualizarTablaPagosUI() {
    const tabla = document.getElementById('tablaPagosAgregados');
    let html = '';
    let totalPagado = 0;

    listaPagosVenta.forEach((p, index) => {
        totalPagado += p.monto;
        html += `
            <tr>
                <td class="align-middle fw-bold small">${p.metodo}</td>
                <td class="text-end align-middle fw-bold">${formatearMoneda(p.monto)}</td>
                <td class="text-end">
                    <button class="btn btn-sm text-danger border-0 bg-transparent" onclick="quitarPagoDeLista(${index})">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tabla.innerHTML = html || '<tr><td colspan="3" class="text-center text-muted small py-3">No hay pagos registrados</td></tr>';

    const totalConDescuento = totalActualNumero - descuentoActualCobro;
    document.getElementById('modalTotalCobroTexto').innerText = formatearMoneda(totalConDescuento);

    montoRestanteCobro = totalConDescuento - totalPagado;

    if (montoRestanteCobro < 0) {
        vueltoFinal = Math.abs(montoRestanteCobro);
        montoRestanteCobro = 0;
    } else {
        vueltoFinal = 0;
    }

    const inputMonto = document.getElementById('montoIngresarPago');
    inputMonto.value = montoRestanteCobro > 0 ? montoRestanteCobro : 0;
    inputMonto.dispatchEvent(new Event('input')); 

    document.getElementById('textoMontoRestante').innerText = formatearMoneda(montoRestanteCobro);
    document.getElementById('textoVuelto').innerText = formatearMoneda(vueltoFinal);

    document.getElementById('btnConfirmarVentaFinal').disabled = (montoRestanteCobro > 0);
}

// ==========================================
// FUNCIÓN: Procesar Venta y Mostrar Ticket
// ==========================================
function procesarCobroFinal() {
    const clienteId = document.getElementById('idClienteSeleccionado').value;

    fetch('/carrito/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            listaPagos: listaPagosVenta,
            vuelto: vueltoFinal,
            cliente_id: clienteId,
            descuento: descuentoActualCobro,
            porcentaje_descuento: porcentajeDescuentoAplicado // <-- MANDAMOS EL PORCENTAJE A NODE
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const cobroModal = bootstrap.Modal.getInstance(document.getElementById('modalCobro'));
                if (cobroModal) cobroModal.hide();

                fetch('/ventas/ticket/datos/' + data.ticket)
                    .then(res => res.json())
                    .then(ticketData => {
                        // Reseteamos la memoria del porcentaje para la próxima venta
                        porcentajeDescuentoAplicado = 0; 
                        dibujarTicketEnModal(ticketData.ticket);
                    });
            } else {
                Swal.fire('Error', data.message, 'error');
            }
        });
}

let ticketActualIdParaEmail = null;
let emailClienteActual = '';

// ==========================================
// FUNCIÓN: Dibujar el HTML del Ticket en el Modal (ESTILO MERCADO LIBRE AUTOMÁTICO)
// ==========================================
function dibujarTicketEnModal(ticket) {
    const cabecera = ticket.cabecera;
    const detalles = ticket.detalles;

    ticketActualIdParaEmail = cabecera.id;
    emailClienteActual = cabecera.cli_email || '';

    let textoCliente = cabecera.cli_nombre === 'Consumidor' ? 'Consumidor Final' : `${cabecera.cli_nombre} ${cabecera.cli_apellido}`;
    let textoDniCliente = cabecera.cli_nombre === 'Consumidor' ? '' : `<p style="margin:0; font-size: 14px;">DNI/CUIL: ${cabecera.cli_dni}</p>`;

    let html = `
        <div style="padding: 20px;">
            <div style="text-align: center; border-bottom: 2px dashed #666; padding-bottom: 15px; margin-bottom: 15px;">
                <h4 style="margin:0; font-weight: bold; font-size: 22px;">TIENDA ELECTRÓNICA</h4>
                <p style="margin:0; font-size: 14px;">Av. Siempreviva 123</p>
                <p style="margin:0; font-size: 14px;">Ticket N°: ${cabecera.id}</p>
                <p style="margin:0; font-size: 14px;">Fecha: ${new Date(cabecera.fecha_hora).toLocaleString('es-AR')}</p>
                <p style="margin:0; font-size: 14px;">Cajero/a: ${cabecera.nombre} ${cabecera.apellido}</p>
                
                <p style="margin:10px 0 0 0; font-size: 14px; font-weight: bold;">Cliente: ${textoCliente}</p>
                ${textoDniCliente} 
            </div>
            
            <table style="width: 100%; font-size: 15px; margin-bottom: 15px; table-layout: fixed;">
                <tr style="border-bottom: 1px solid #666;">
                    <th style="text-align: left; padding-bottom: 5px; width: 50%;">Producto</th>
                    <th style="text-align: center; padding-bottom: 5px; width: 15%;">Cant</th>
                    <th style="text-align: right; padding-bottom: 5px; width: 35%;">Subt</th>
                </tr>
    `;

    detalles.forEach(item => {
        let nombreLimitado = item.producto.length > 25 ? item.producto.substring(0, 25) + "..." : item.producto;
        let detallePreciosHtml = '';

        // Si el producto tenía descuento general del catálogo, calculamos y mostramos el precio de lista tachado
        if (Number(item.descuento_catalogo) > 0) {
            // El precio de lista original antes de la oferta del catálogo
            const precioListaOriginal = item.precio_unitario / (1 - (item.descuento_catalogo / 100));
            
            detallePreciosHtml = `
                <span style="font-size: 11px; text-decoration: line-through; color: #888;">${formatearMoneda(precioListaOriginal)}</span> 
                <span style="color: #00a650; font-weight: bold; font-size: 12px;">(${Math.round(item.descuento_catalogo)}% OFF)</span><br>
                <span style="font-weight: bold;">${formatearMoneda(item.precio_unitario)}</span>
            `;
        } else {
            // Precio normal sin oferta previa
            detallePreciosHtml = `<span style="font-weight: bold;">${formatearMoneda(item.precio_unitario)}</span>`;
        }

        html += `
            <tr>
                <td colspan="3" style="font-size: 14px; padding-top: 10px; padding-bottom: 3px; font-weight: bold;">${nombreLimitado}</td>
            </tr>
            <tr>
                <td style="font-size: 12px; color: #666;">
                    ${item.sku}<br>
                    ${detallePreciosHtml}
                </td>
                <td style="text-align: center; font-weight: bold; align-content: center;">${item.cantidad}</td>
                <td style="text-align: right; font-weight: bold; align-content: center;">${formatearMoneda(item.cantidad * item.precio_unitario)}</td>
            </tr>
        `;
    });

    html += `
            </table>
            <div style="border-top: 2px dashed #666; padding-top: 15px; text-align: right;">
    `;

    // DESCUENTO GLOBAL POR PORCENTAJE (EL DE LA CAJA)
    if (Number(cabecera.descuento_aplicado) > 0) {
        const porcentajeCaja = Math.round((cabecera.descuento_aplicado * 100) / cabecera.total_venta);
        
        html += `<p style="margin:2px 0; font-size: 15px; color: #555;">Subtotal: ${formatearMoneda(cabecera.total_venta)}</p>`;
        html += `<p style="margin:2px 0; font-size: 15px; color: #d9534f; font-weight: bold;">Desc. Caja (${porcentajeCaja}% OFF): -${formatearMoneda(cabecera.descuento_aplicado)}</p>`;
        
        const totalFinalTicket = Number(cabecera.total_venta) - Number(cabecera.descuento_aplicado);
        html += `<h4 style="margin:5px 0 10px 0; font-weight: bold; font-size: 20px;">TOTAL: ${formatearMoneda(totalFinalTicket)}</h4>`;
    } else {
        html += `<h4 style="margin:0 0 10px 0; font-weight: bold; font-size: 20px;">TOTAL: ${formatearMoneda(cabecera.total_venta)}</h4>`;
    }

    html += `
                <p style="margin:0; font-size: 15px; font-weight: bold; text-decoration: underline;">Detalle de Pago:</p>
    `;

    ticket.pagos.forEach(p => {
        html += `<p style="margin:2px 0; font-size: 15px;">${p.metodo_pago}: ${formatearMoneda(p.monto)}</p>`;
    });

    if (cabecera.vuelto > 0) {
        html += `<p style="margin:5px 0 0 0; font-size: 16px; font-weight: bold;">Vuelto: ${formatearMoneda(cabecera.vuelto)}</p>`;
    }

    html += `
            </div>
            <div style="text-align: center; margin-top: 20px; font-size: 14px;">
                <p style="margin:0;">¡Gracias por su compra!</p>
            </div>
        </div>
    `;

    document.getElementById('zonaImpresionTicket').innerHTML = html;
    new bootstrap.Modal(document.getElementById('modalVerTicket')).show();
}

function imprimirTicketFisico() {
    const contenido = document.getElementById('zonaImpresionTicket').innerHTML;
    const ventanaImpresion = window.open('', '', 'width=350,height=600');
    ventanaImpresion.document.write('<html><head><title>Imprimir</title></head><body style="margin:0;">' + contenido + '</body></html>');
    ventanaImpresion.document.close();
    ventanaImpresion.focus();
    ventanaImpresion.print();
    ventanaImpresion.close();
}

// ==========================================
// BUSCADOR DE CLIENTES EN EL MODAL DE COBRO
// ==========================================
const inputBuscador = document.getElementById('buscadorCliente');
const listaResultados = document.getElementById('listaResultadosClientes');
const inputIdCliente = document.getElementById('idClienteSeleccionado');
const divClienteSeleccionado = document.getElementById('divClienteSeleccionado');
const textoNombreCliente = document.getElementById('textoNombreCliente');

inputBuscador.addEventListener('keyup', function () {
    let termino = this.value;
    if (termino.length < 2) return listaResultados.style.display = 'none';

    fetch('/api/clientes/buscar?q=' + termino)
        .then(res => res.json())
        .then(clientes => {
            listaResultados.innerHTML = '';
            if (clientes.length > 0) {
                listaResultados.style.display = 'block';
                clientes.forEach(cli => {
                    let li = document.createElement('li');
                    li.className = 'list-group-item list-group-item-action cursor-pointer';
                    li.innerHTML = `<span class="fw-bold">${cli.dni_cuil}</span> - ${cli.apellido}, ${cli.nombre}`;
                    li.onclick = () => seleccionarCliente(cli.id, `${cli.apellido}, ${cli.nombre}`);
                    listaResultados.appendChild(li);
                });
            } else {
                listaResultados.style.display = 'none';
            }
        });
});

function seleccionarCliente(id, nombreCompleto) {
    inputIdCliente.value = id;
    textoNombreCliente.innerText = nombreCompleto;
    divClienteSeleccionado.classList.remove('d-none');
    inputBuscador.value = '';
    inputBuscador.parentElement.classList.add('d-none');
    listaResultados.style.display = 'none';
}

function limpiarCliente() {
    inputIdCliente.value = '1';
    divClienteSeleccionado.classList.add('d-none');
    inputBuscador.parentElement.classList.remove('d-none');
}

// ==========================================
// FUNCIÓN: Crear Cliente Rápido (AHORA CON MANEJO DE ERRORES)
// ==========================================
function crearClienteRapido() {
    const esOscuro = document.documentElement.getAttribute('data-bs-theme') === 'dark';

    Swal.fire({
        title: 'Nuevo Cliente',
        background: esOscuro ? '#2b3035' : '#fff',
        color: esOscuro ? '#f8f9fa' : '#212529',
        html: `
            <input id="swal-nombre" class="form-control mb-3" placeholder="Nombre *" required>
            <input id="swal-apellido" class="form-control mb-3" placeholder="Apellido">
            <input id="swal-dni" class="form-control mb-3" type="number" placeholder="DNI / CUIL *" required>
            <input id="swal-email" class="form-control mb-1" type="email" placeholder="Email (Opcional)">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const nombre = document.getElementById('swal-nombre').value;
            const dni = document.getElementById('swal-dni').value;
            
            // Validamos del lado visual antes de enviarlo
            if (!nombre || !dni) {
                Swal.showValidationMessage('El nombre y el DNI son obligatorios');
                return false;
            }
            return {
                nombre: nombre,
                apellido: document.getElementById('swal-apellido').value || '',
                dni: dni,              // Lo mandamos como dni y como dni_cuil
                dni_cuil: dni,         // para asegurar que el controlador de clientes lo atrape
                email: document.getElementById('swal-email').value || '',
                telefono: '' 
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            fetch('/api/clientes/nuevo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.value)
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    // Si todo salió bien, lo autoseleccionamos
                    seleccionarCliente(data.id, `${result.value.apellido}, ${result.value.nombre}`);
                    Swal.fire({
                        icon: 'success', title: 'Cliente Agregado', toast: true,
                        position: 'top-end', showConfirmButton: false, timer: 2000,
                        background: esOscuro ? '#2b3035' : '#fff', color: esOscuro ? '#f8f9fa' : '#212529'
                    });
                } else {
                    // ¡NUEVO! ACÁ ESTABA EL ERROR. AHORA TE MUESTRA POR QUÉ FALLÓ.
                    Swal.fire('Error al crear cliente', data.message, 'error');
                }
            })
            .catch(err => {
                Swal.fire('Error de conexión', 'No se pudo comunicar con el servidor.', 'error');
            });
        }
    });
}

function enviarTicketPorEmail() {
    Swal.fire({
        title: 'Enviar Ticket',
        input: 'email',
        inputValue: emailClienteActual,
        showCancelButton: true,
        confirmButtonText: 'Enviar <i class="fa-solid fa-paper-plane"></i>'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            fetch('/api/ventas/enviar-ticket', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_venta: ticketActualIdParaEmail, email_destino: result.value })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') Swal.fire('¡Enviado!', data.message, 'success');
                    else Swal.fire('Error', data.message, 'error');
                });
        }
    });
}

document.addEventListener('DOMContentLoaded', actualizarCarritoVisual);