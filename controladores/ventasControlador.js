import VentaModel from '../modelos/ventas.js'
import AuditoriaModel from '../modelos/auditoria.js';
import nodemailer from 'nodemailer';
import pool from '../modelos/conexion.js'; // <-- ¡IMPORTANTE! Agregamos el pool de conexión

const ventasControlador = {

  // Mostrar la página de la tabla de historial y caja
  mostrarHistorial: async (req, res) => {
    // 1. Atrapamos los filtros si el usuario buscó algo
    const busqueda = req.query.busqueda || '';
    const fecha = req.query.fecha || '';

    // 2. Lógica de Paginación
    const limite = 15; // Mostramos 15 ventas por página
    const paginaActual = parseInt(req.query.pagina) || 1;
    const offset = (paginaActual - 1) * limite;

    // 3. Pedimos los datos a la base de datos
    const totalVentas = await VentaModel.contarHistorial(busqueda, fecha);
    const totalPaginas = Math.ceil(totalVentas / limite);
    const historial = await VentaModel.obtenerHistorialPaginado(busqueda, fecha, limite, offset);
    const cajaHoy = await VentaModel.obtenerResumenCajaHoy();

    // 4. Armamos la URL base para que la paginación no borre la búsqueda
    let urlBase = '?';
    if (busqueda) urlBase += `busqueda=${busqueda}&`;
    if (fecha) urlBase += `fecha=${fecha}&`;

    res.render('historial', {
      usuario: req.session.usuario,
      ventas: historial,
      cajaHoy: cajaHoy,

      // Enviamos los datos para pintar el menú
      busquedaActual: busqueda,
      fechaActual: fecha,
      paginaActual: paginaActual,
      totalPaginas: totalPaginas,
      urlBase: urlBase
    });
  },

  // ==========================================
  // FUNCIÓN: Ver el Ticket (Dibuja el HTML para imprimir)
  // ==========================================
  verTicket: async (req, res) => {
    const id_venta = req.params.id; // Atrapamos el número 75 de la URL

    // Le pedimos al modelo que traiga toda la info de ese ticket
    const ticketData = await VentaModel.obtenerTicketVenta(id_venta);

    if (!ticketData) {
      return res.status(404).send('<h3>Error: El ticket no existe o fue eliminado.</h3>');
    }

    // Le pasamos los datos al archivo ticket.ejs para que los dibuje
    res.render('ticket', {
      ticket: ticketData
    });
  },

// API para el Botón del Pánico (Anular y gestionar RMA)
  anularVentaAPI: async (req, res) => {
    const id_venta = req.params.id;
    const motivo = req.body.motivo || 'normal'; // Atrapamos el motivo de la vista
    const usuarioActual = req.session.usuario;

    // VALIDACIÓN DE SEGURIDAD
    if (usuarioActual.rol_id != 1) {
      return res.json({
        status: 'error',
        message: 'Acceso Denegado: Solo el Administrador puede anular ventas y devolver dinero.'
      });
    }

    // Le pasamos el ID y el MOTIVO al modelo
    const exito = await VentaModel.anularVenta(id_venta, motivo);

    if (exito) {
      // ==========================================
      // REGISTRO DE AUDITORÍA INTELIGENTE
      // ==========================================
      let textoMotivo = 'Cambio Normal (Regresó a Stock Activo)';
      if (motivo === 'falla') textoMotivo = 'Falla de Fábrica (Se envió a Stock Defectuoso)';
      if (motivo === 'dano') textoMotivo = 'Daño en Envío (Se envió a Stock Defectuoso)';

      await AuditoriaModel.registrar(
        usuarioActual.id,
        'ANULAR',
        'ventas',
        id_venta,
        `Anuló la venta N° ${id_venta}. Gestión: ${textoMotivo}`
      );

      res.json({ status: 'success', message: 'Venta anulada. El stock fue redirigido exitosamente según el motivo.' });
    } else {
      res.json({ status: 'error', message: 'No se pudo anular la venta. Verifique que no esté ya anulada.' });
    }
  },

  // ==========================================
  // API: Enviar Ticket por Correo (CON DESCUENTOS Y SKU)
  // ==========================================
  enviarTicketEmailAPI: async (req, res) => {
    const { id_venta, email_destino } = req.body;

    try {
      // 1. Configuramos tu cuenta de Gmail
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'futbolinsideout@gmail.com', 
          pass: 'tjpr hldk urxz wqkt' 
        }
      });

      // 2. Traemos los datos del ticket desde la base de datos
      const ticketData = await VentaModel.obtenerTicketVenta(id_venta);
      if (!ticketData) {
        return res.json({ status: 'error', message: 'Ticket no encontrado' });
      }

      const cabecera = ticketData.cabecera;
      const detalles = ticketData.detalles;

      // 3. Lógica visual: Cliente y DNI
      let textoCliente = cabecera.cli_nombre === 'Consumidor' ? 'Consumidor Final' : `${cabecera.cli_nombre} ${cabecera.cli_apellido}`;
      let textoDni = cabecera.cli_nombre === 'Consumidor' ? '' : `<strong>DNI/CUIL:</strong> ${cabecera.cli_dni}<br>`;

      // 4. Armamos el diseño visual del correo
      let htmlCorreo = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px;">
          <div style="text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #0d6efd; margin-bottom: 5px;">TIENDA ELECTRÓNICA</h2>
            <p style="margin: 0; color: #777;">Av. Siempreviva 123</p>
          </div>
          
          <div style="margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
            <strong>Ticket N°:</strong> ${cabecera.id}<br>
            <strong>Fecha:</strong> ${new Date(cabecera.fecha_hora).toLocaleString('es-AR')}<br>
            <strong>Cajero/a:</strong> ${cabecera.nombre} ${cabecera.apellido}<br>
            <br>
            <strong>Cliente:</strong> ${textoCliente}<br>
            ${textoDni}
          </div>

          <table style="width: 100%; text-align: left; border-collapse: collapse; margin-bottom: 20px;">
            <tr style="border-bottom: 2px solid #333;">
              <th style="padding: 10px 0; width: 50%;">Producto</th>
              <th style="text-align: center; width: 15%;">Cant.</th>
              <th style="text-align: right; width: 35%;">Subt.</th>
            </tr>
      `;

      detalles.forEach(item => {
        let nombreLimitado = item.producto.length > 25 ? item.producto.substring(0, 25) + "..." : item.producto;

        htmlCorreo += `
            <tr style="border-bottom: 1px solid #eaeaea;">
              <td style="padding: 10px 0; font-size: 14px;">
                <strong>${nombreLimitado}</strong><br>
                <span style="font-size: 11px; color: #888;">${item.sku}</span>
              </td>
              <td style="text-align: center; font-size: 14px;">${item.cantidad}</td>
              <td style="text-align: right; font-size: 14px; font-weight: bold;">$${Number(item.cantidad * item.precio_unitario).toLocaleString('es-AR')}</td>
            </tr>`;
      });

      htmlCorreo += `
          </table>
          
          <div style="text-align: right; border-top: 2px dashed #ccc; padding-top: 15px;">
      `;

      if (Number(cabecera.descuento_aplicado) > 0) {
        const totalFinalTicket = Number(cabecera.total_venta) - Number(cabecera.descuento_aplicado);
        htmlCorreo += `
            <p style="margin: 0 0 5px 0; font-size: 15px; color: #555;">Subtotal: $${Number(cabecera.total_venta).toLocaleString('es-AR')}</p>
            <p style="margin: 0 0 5px 0; font-size: 15px; color: #d9534f; font-weight: bold;">Descuento: -$${Number(cabecera.descuento_aplicado).toLocaleString('es-AR')}</p>
            <h2 style="margin: 5px 0 10px 0; color: #333;">TOTAL: $${totalFinalTicket.toLocaleString('es-AR')}</h2>
        `;
      } else {
        htmlCorreo += `
            <h2 style="margin: 0 0 10px 0; color: #333;">TOTAL: $${Number(cabecera.total_venta).toLocaleString('es-AR')}</h2>
        `;
      }

      htmlCorreo += `
            <p style="margin: 0 0 5px 0; font-size: 15px;"><strong>Detalle de Pago:</strong></p>
      `;

      ticketData.pagos.forEach(p => {
        htmlCorreo += `<p style="margin: 2px 0; font-size: 14px;">${p.metodo_pago}: $${Number(p.monto).toLocaleString('es-AR')}</p>`;
      });

      if (cabecera.vuelto > 0) {
        htmlCorreo += `<p style="margin: 5px 0; font-size: 14px; font-weight: bold; color: #198754;">Vuelto entregado: $${Number(cabecera.vuelto).toLocaleString('es-AR')}</p>`;
      }

      htmlCorreo += `
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea;">
            <p style="font-size: 12px; color: #777;">Este es un comprobante electrónico válido. ¡Gracias por tu compra!</p>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: '"Tienda Electrónica" <futbolinsideout@gmail.com>',
        to: email_destino,
        subject: `Comprobante de Compra N° ${cabecera.id} - Tienda Electrónica`,
        html: htmlCorreo
      });

      res.json({ status: 'success', message: '¡Correo enviado con éxito!' });
    } catch (error) {
      console.error('Error al enviar correo:', error);
      res.json({ status: 'error', message: 'No se pudo enviar el correo. Revisa la consola.' });
    }
  },

  // ==========================================
  // API: Registrar la Apertura de Caja
  // ==========================================
  abrirCajaAPI: async (req, res) => {
    const { monto_inicial } = req.body;
    const id_usuario = req.session.usuario.id;

    if (monto_inicial === undefined || isNaN(monto_inicial) || monto_inicial < 0) {
      return res.json({ status: 'error', message: 'El monto inicial debe ser 0 o mayor.' });
    }

    const exito = await VentaModel.abrirCaja(monto_inicial, id_usuario);
    if (exito) {
      await AuditoriaModel.registrar(id_usuario, 'INSERT', 'caja_diaria', null, `Abrió la caja del día con un fondo de $${monto_inicial}`);
      res.json({ status: 'success', message: 'Caja abierta correctamente.' });
    } else {
      res.json({ status: 'error', message: 'Error al abrir la caja. Posiblemente ya fue abierta hoy.' });
    }
  },

  // ==========================================
  // MÓDULO DE ENVÍOS (PEDIDOS WEB)
  // ==========================================

// 1. Mostrar la pantalla a los empleados con los pedidos de la web (CON FILTROS Y PAGINACIÓN)
  listarPedidosWeb: async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    // 1. Atrapamos los parámetros de la URL
    const busqueda = req.query.busqueda || '';
    const estadoFiltro = req.query.estado || '';
    const paginaActual = parseInt(req.query.pagina) || 1;
    const limite = 10; // 10 pedidos por página
    const offset = (paginaActual - 1) * limite;

    try {
      // 2. Armamos la consulta dinámica según lo que el usuario esté buscando
      let queryWhere = "WHERE v.origen_venta = 'Web' AND v.activo = 1";
      let queryParams = [];

      // Si escribió algo en el buscador (Nro de orden, nombre o apellido)
      if (busqueda) {
        queryWhere += " AND (v.id LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ?)";
        queryParams.push(`%${busqueda}%`, `%${busqueda}%`, `%${busqueda}%`);
      }

      // Si seleccionó un filtro en el desplegable (Ej: "Pendiente de Despacho")
      if (estadoFiltro) {
        queryWhere += " AND v.estado_envio = ?";
        queryParams.push(estadoFiltro);
      }

      // 3. Contamos el total para saber cuántas páginas dibujar
      const [totalRows] = await pool.query(`
        SELECT COUNT(*) as total
        FROM ventas v
        JOIN clientes c ON v.FK_cliente = c.id
        ${queryWhere}
      `, queryParams);
      
      const totalVentas = totalRows[0].total;
      const totalPaginas = Math.ceil(totalVentas / limite);

      // 4. Traemos los pedidos de esa página exacta
      const [pedidos] = await pool.query(`
        SELECT v.id, v.fecha_hora, v.total_venta, v.estado_envio, v.metodo_pago, v.id_pago_mercadopago,
               c.nombre AS cliente_nombre, c.apellido AS cliente_apellido, c.telefono AS cliente_telefono,
               d.alias, d.calle, d.numero, d.ciudad, d.provincia, d.codigo_postal
        FROM ventas v
        JOIN clientes c ON v.FK_cliente = c.id
        LEFT JOIN direcciones_cliente d ON v.FK_direccion_envio = d.id
        ${queryWhere}
        ORDER BY v.fecha_hora DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, limite, offset]);

      // 5. Mantenemos los filtros en la URL para que no se borren al cambiar de página
      let urlBase = '/pedidos-web?';
      if (busqueda) urlBase += `busqueda=${busqueda}&`;
      if (estadoFiltro) urlBase += `estado=${estadoFiltro}&`;

      res.render('pedidos_web', {
        usuario: req.session.usuario,
        pedidos: pedidos,
        // Variables para la vista:
        busquedaActual: busqueda,
        estadoActual: estadoFiltro,
        paginaActual: paginaActual,
        totalPaginas: totalPaginas,
        urlBase: urlBase
      });
    } catch (error) {
      console.error('Error al cargar la gestión de pedidos web:', error);
      res.status(500).send('Error interno del servidor');
    }
  },

// 2. API: Cambiar el estado del paquete, NOTIFICAR AL CLIENTE y GESTIONAR CAJA/ENTREGA
    actualizarEstadoEnvioAPI: async (req, res) => {
        // Atrapamos los datos tradicionales más los nuevos de la Prueba de Entrega Digital
        const { id_venta, nuevo_estado, receptor_nombre, receptor_dni } = req.body;

        if (!id_venta || !nuevo_estado) {
            return res.json({ status: 'error', message: 'Faltan datos para actualizar.' });
        }

        try {
            // 1. Buscamos los datos actuales de la venta antes de tocar nada
            const [ventaInfo] = await pool.query(`
                SELECT v.total_venta, v.metodo_pago, v.estado, c.email, c.nombre 
                FROM ventas v 
                JOIN clientes c ON v.FK_cliente = c.id 
                WHERE v.id = ?
            `, [id_venta]);

            if (ventaInfo.length === 0) return res.json({ status: 'error', message: 'Venta no encontrada.' });
            const venta = ventaInfo[0];

            // 2. LÓGICA DE ACTUALIZACIÓN DINÁMICA (Caja diaria + Datos del Receptor)
            let queryUpdate = 'UPDATE ventas SET estado_envio = ?';
            let paramsUpdate = [nuevo_estado];

            if (nuevo_estado === 'Entregado') {
                // Si se marca como entregado, guardamos de forma obligatoria quién retiró/recibió
                queryUpdate += ", receptor_nombre = ?, receptor_dni = ?, fecha_entregado = NOW()";
                paramsUpdate.push(receptor_nombre || 'Cliente Titular', receptor_dni || 'N/A');

                // LÓGICA FINANCIERA: Si el pago estaba Pendiente (Efectivo/Transferencia), lo liquidamos en caja
                if (venta.estado === 'Pendiente') {
                    queryUpdate += ", estado = 'Completada'";
                    
                    // Limpiamos el texto para quitar el "(Pendiente)" de la vista
                    let metodoLimpio = venta.metodo_pago.includes('Efectivo') ? 'Efectivo Local' : 'Transferencia Bancaria';
                    queryUpdate += ", metodo_pago = ?";
                    paramsUpdate.push(metodoLimpio);

                    // Insertamos el movimiento en la caja registradora para los reportes financieros
                    await pool.query('INSERT INTO pagos_venta (FK_venta, metodo_pago, monto) VALUES (?, ?, ?)', [id_venta, metodoLimpio, venta.total_venta]);
                }
            }

            queryUpdate += ' WHERE id = ?';
            paramsUpdate.push(id_venta);

            // Ejecutamos la gran consulta unificada en la base de datos
            await pool.query(queryUpdate, paramsUpdate);

            // 3. 🚀 LÓGICA DE NOTIFICACIONES AUTOMÁTICAS (Emails con Nodemailer)
            if (nuevo_estado === 'Enviado por Correo' || nuevo_estado === 'Retira en Sucursal') {
                let asunto = '';
                let mensajeHtml = '';

                if (nuevo_estado === 'Enviado por Correo') {
                    asunto = `🚚 Tu pedido #${id_venta} está en camino`;
                    mensajeHtml = `
                        <div style="font-family: Arial; padding: 20px; text-align: center; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: #0d6efd;">¡Buenas noticias, ${venta.nombre}!</h2>
                            <p style="font-size: 16px;">Acabamos de despachar tu paquete con el correo.</p>
                            <p style="font-size: 16px;">Pronto estará llegando al domicilio que indicaste. ¡Atento al timbre!</p>
                        </div>`;
                } else if (nuevo_estado === 'Retira en Sucursal') {
                    asunto = `🏪 Tu pedido #${id_venta} está listo para retirar`;
                    mensajeHtml = `
                        <div style="font-family: Arial; padding: 20px; text-align: center; border: 1px solid #ddd; border-radius: 10px;">
                            <h2 style="color: #198754;">¡Hola, ${venta.nombre}! Tu paquete te espera.</h2>
                            <p style="font-size: 16px;">Ya preparamos tu Orden #${id_venta}.</p>
                            <p style="font-size: 16px;">Podés pasar a retirarla por nuestro local (Av. Siempreviva 123) presentando tu DNI y este número de orden.</p>
                        </div>`;
                }

                // Enviamos el correo silenciosamente por atrás
                try {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: { user: 'futbolinsideout@gmail.com', pass: 'tjpr hldk urxz wqkt' }
                    });

                    await transporter.sendMail({
                        from: '"Tienda Electrónica" <futbolinsideout@gmail.com>',
                        to: venta.email,
                        subject: asunto,
                        html: mensajeHtml
                    });
                } catch (errMail) {
                    console.error('Error enviando correo de actualización:', errMail);
                }
            }

            res.json({ status: 'success', message: `El pedido #${id_venta} ahora figura como: ${nuevo_estado}` });
        } catch (error) {
            console.error('Error crítico en la base de datos:', error);
            res.json({ status: 'error', message: 'Error interno del servidor al procesar el estado.' });
        }
    },

// 3. API: Obtener detalles completos de un pedido web para el Modal
  obtenerDetallesPedidoAPI: async (req, res) => {
    const { id_venta } = req.params;
    try {
      // 1. Traemos los productos de la caja
      const [detalles] = await pool.query(`
        SELECT dv.cantidad, dv.precio_unitario, dv.subtotal, p.nombre, p.imagen, p.sku
        FROM detalles_venta dv
        JOIN productos p ON dv.FK_producto = p.id
        WHERE dv.FK_venta = ?
      `, [id_venta]);

      // 2. Traemos la info general del cliente y la entrega
      const [cabecera] = await pool.query(`
        SELECT c.nombre, c.apellido, c.dni_cuil, c.telefono, c.email,
               v.estado_envio, v.total_venta, v.metodo_pago,
               d.calle, d.numero, d.ciudad, d.provincia
        FROM ventas v
        JOIN clientes c ON v.FK_cliente = c.id
        LEFT JOIN direcciones_cliente d ON v.FK_direccion_envio = d.id
        WHERE v.id = ?
      `, [id_venta]);

      res.json({ status: 'success', detalles, cabecera: cabecera[0] });
    } catch (error) {
      console.error('Error al obtener detalles del pedido:', error);
      res.json({ status: 'error', message: 'Error interno al buscar los productos.' });
    }
  },

  // 4. API Oculta: Contar cuántos pedidos web están sin despachar (Para la Campanita)
  contarPedidosPendientesAPI: async (req, res) => {
    try {
      const [resultado] = await pool.query(`
        SELECT COUNT(*) as cantidad 
        FROM ventas 
        WHERE origen_venta = 'Web' AND estado_envio = 'Pendiente de Despacho' AND activo = 1
      `);
      res.json({ status: 'success', cantidad: resultado[0].cantidad });
    } catch (error) {
      console.error('Error al contar notificaciones:', error);
      res.json({ status: 'error', cantidad: 0 });
    }
  },

  // 5. Vista: Imprimir Etiqueta de Despacho (Remito Estilo Mercado Libre)
  imprimirRemitoWeb: async (req, res) => {
    const { id_venta } = req.params;
    
    // Verificamos que el empleado tenga sesión iniciada
    if (!req.session.usuario) return res.redirect('/login');

    try {
      // Traemos los productos del paquete
      const [detalles] = await pool.query(`
        SELECT dv.cantidad, p.nombre, p.sku
        FROM detalles_venta dv
        JOIN productos p ON dv.FK_producto = p.id
        WHERE dv.FK_venta = ?
      `, [id_venta]);

      // Traemos los datos del cliente, la dirección y el cobro
      const [cabecera] = await pool.query(`
        SELECT c.nombre, c.apellido, c.dni_cuil, c.telefono,
               v.total_venta, v.metodo_pago, v.estado,
               d.calle, d.numero, d.piso_depto, d.ciudad, d.provincia, d.codigo_postal
        FROM ventas v
        JOIN clientes c ON v.FK_cliente = c.id
        LEFT JOIN direcciones_cliente d ON v.FK_direccion_envio = d.id
        WHERE v.id = ?
      `, [id_venta]);

      if (cabecera.length === 0) {
        return res.status(404).send('Pedido no encontrado.');
      }

      res.render('remito_impresion', {
        id_venta: id_venta,
        cabecera: cabecera[0],
        detalles: detalles
      });

    } catch (error) {
        console.error('Error al generar remito:', error);
        res.status(500).send('Error interno al generar etiqueta.');
    }
  },

  // ==========================================
  // API: Modificar cantidades (+ y -) Carrito Empleado (FÍSICO)
  // ==========================================
  modificarCantidadAPI: async (req, res) => {
      const { id_producto, accion } = req.body;
      
      // Verificamos que el empleado tenga un carrito abierto en su sesión
      if (!req.session.carrito) {
          req.session.carrito = [];
          return res.json({ status: 'error', message: 'El carrito está vacío.' });
      }

      // Buscamos el producto dentro del arreglo del carrito
      const productoEnCarrito = req.session.carrito.find(p => p.id == id_producto);

      if (productoEnCarrito) {
          if (accion === 'sumar') {
              productoEnCarrito.cantidad += 1;
          } else if (accion === 'restar') {
              productoEnCarrito.cantidad -= 1;
              // Si la cantidad llega a 0 o menos, lo filtramos (lo borramos) de la lista
              if (productoEnCarrito.cantidad <= 0) {
                  req.session.carrito = req.session.carrito.filter(p => p.id != id_producto);
              }
          }
          res.json({ status: 'success', message: 'Cantidad actualizada' });
      } else {
          res.json({ status: 'error', message: 'Producto no encontrado en el carrito.' });
      }
  }
}

export default ventasControlador;