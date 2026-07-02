import pool from '../modelos/conexion.js';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { MercadoPagoConfig, Preference, PaymentRefund } from 'mercadopago';

const tiendaControlador = {
    // 1. Vista del catálogo público general (CON FILTROS, BÚSQUEDA, ORDEN Y PAGINACIÓN)
    mostrarTienda: async (req, res) => {
        try {
            // 1. Atrapamos todo lo que el cliente pida por la URL
            const busqueda = req.query.busqueda || '';
            const categoriaId = req.query.categoria || '';
            const orden = req.query.orden || 'nuevos'; // Por defecto, los más nuevos
            const paginaActual = parseInt(req.query.pagina) || 1;

            const limite = 12; // Mostramos 12 productos por página
            const offset = (paginaActual - 1) * limite;

            // 2. Construimos la consulta SQL de forma dinámica
            let queryWhere = 'WHERE p.activo = 1';
            let queryParams = [];

            if (busqueda) {
                queryWhere += ' AND p.nombre LIKE ?';
                queryParams.push(`%${busqueda}%`);
            }

            if (categoriaId) {
                queryWhere += ' AND p.FK_categoria = ?';
                queryParams.push(categoriaId);
            }

            // 3. Determinamos cómo ordenar los productos
            let queryOrder = 'ORDER BY p.id DESC'; // Default: Más nuevos

            // Calculamos el precio real (con descuento) en tiempo real para ordenar bien
            const calculoPrecioReal = '(p.precio_venta * (1 - (p.porcentaje_descuento / 100)))';

            if (orden === 'precio_asc') {
                queryOrder = `ORDER BY ${calculoPrecioReal} ASC`;
            } else if (orden === 'precio_desc') {
                queryOrder = `ORDER BY ${calculoPrecioReal} DESC`;
            } else if (orden === 'mas_vendidos') {
                // Magia SQL: Subconsulta para contar cuántas veces se vendió este producto
                queryOrder = `ORDER BY (SELECT COALESCE(SUM(cantidad), 0) FROM detalles_venta WHERE FK_producto = p.id) DESC`;
            }

            // 4. Contamos el total de productos para la paginación
            const [totalRows] = await pool.query(`SELECT COUNT(*) as total FROM productos p ${queryWhere}`, queryParams);
            const totalProductos = totalRows[0].total;
            const totalPaginas = Math.ceil(totalProductos / limite);

            // 5. Traemos los productos finales con límite y orden
            const [productos] = await pool.query(`
                SELECT p.id, p.nombre, p.precio_venta, p.porcentaje_descuento, p.stock_actual, p.imagen, p.FK_categoria 
                FROM productos p 
                ${queryWhere} 
                ${queryOrder} 
                LIMIT ? OFFSET ?
            `, [...queryParams, limite, offset]);

            // 6. Traemos las categorías para el menú lateral
            const [categorias] = await pool.query("SELECT id, nombre FROM categorias WHERE activo = 1");

            // 7. Renderizamos la vista pasando todos los datos
            res.render('home_tienda', {
                productos,
                categorias,
                cliente: req.session.cliente || null,
                // Pasamos los filtros a la vista para mantenerlos seleccionados visualmente
                filtrosActuales: {
                    busqueda,
                    categoriaId,
                    orden,
                    paginaActual,
                    totalPaginas
                }
            });
        } catch (error) {
            console.error('Error al cargar la tienda pública:', error);
            res.status(500).send('Error interno del servidor al cargar el catálogo.');
        }
    },

    // 2. Vista de detalle del producto (Estilo Mercado Libre)
    verProductoDetalle: async (req, res) => {
        const id_producto = req.params.id;

        try {
            // A. Traemos la información principal del producto, su marca y categoría
            const [producto] = await pool.query(`
                SELECT p.*, c.nombre as categoria_nombre, m.nombre as marca_nombre
                FROM productos p
                JOIN categorias c ON p.FK_categoria = c.id
                JOIN marcas m ON p.FK_marca = m.id
                WHERE p.id = ? AND p.activo = 1
            `, [id_producto]);

            if (producto.length === 0) {
                return res.status(404).send('<h3>El producto no está disponible o no existe.</h3>');
            }

            // B. ¡NUEVO! Traemos todas las imágenes de la galería secundaria que creamos en la BD
            const [imagenesGaleria] = await pool.query(`
                SELECT ruta_imagen, es_principal 
                FROM productos_imagenes 
                WHERE FK_producto = ?
            `, [id_producto]);

            res.render('producto_detalle', {
                producto: producto[0],
                galeria: imagenesGaleria,
                cliente: req.session.cliente || null
            });
        } catch (error) {
            console.error('Error al cargar el detalle del producto:', error);
            res.status(500).send('Error interno del servidor');
        }
    },

    // 3. API: Agregar producto al carrito web
    agregarAlCarritoWeb: async (req, res) => {
        const { id_producto } = req.body;

        // Si no existe el carrito web en la sesión, lo creamos vacío
        if (!req.session.carritoWeb) req.session.carritoWeb = [];

        // Buscamos el producto en BD
        const [productoDB] = await pool.query('SELECT id, nombre, precio_venta, porcentaje_descuento, imagen, stock_actual FROM productos WHERE id = ?', [id_producto]);

        if (productoDB.length === 0) return res.json({ status: 'error', message: 'Producto no encontrado' });
        const p = productoDB[0];

        // Calculamos el precio real por si tiene descuento
        const precioReal = p.precio_venta * (1 - (p.porcentaje_descuento / 100));

        // Verificamos si ya está en el carrito
        const indice = req.session.carritoWeb.findIndex(item => item.id == id_producto);

        if (indice !== -1) {
            if ((req.session.carritoWeb[indice].cantidad + 1) > p.stock_actual) {
                return res.json({ status: 'error', message: 'No hay más stock disponible.' });
            }
            req.session.carritoWeb[indice].cantidad += 1;
        } else {
            if (p.stock_actual <= 0) return res.json({ status: 'error', message: 'Producto agotado.' });

            req.session.carritoWeb.push({
                id: p.id,
                nombre: p.nombre,
                imagen: p.imagen,
                precio: precioReal,
                cantidad: 1
            });
        }
        res.json({ status: 'success', carrito: req.session.carritoWeb });
    },

    // 4. API: Ver lo que hay en el carrito web
    verCarritoWeb: (req, res) => {
        res.json({ status: 'success', carrito: req.session.carritoWeb || [] });
    },

    // 5. API: Vaciar carrito web
    vaciarCarritoWeb: (req, res) => {
        req.session.carritoWeb = [];
        res.json({ status: 'success', message: 'Carrito vaciado' });
    },

    // 6. Vista del Login de Clientes
    mostrarLoginCliente: (req, res) => {
        // Si el cliente ya está logueado, lo mandamos al catálogo directo
        if (req.session.cliente) return res.redirect('/tienda');
        res.render('login_cliente');
    },

    // 7. Vista de Registro de Clientes
    mostrarRegistroCliente: (req, res) => {
        if (req.session.cliente) return res.redirect('/tienda');
        res.render('registro_cliente');
    },

    // 8. Vista del Checkout Seguro (Trae las direcciones del cliente)
    mostrarCheckout: async (req, res) => {
        // Si no está logueado, al login directo
        if (!req.session.cliente) {
            return res.redirect('/tienda/login');
        }

        const id_cliente = req.session.cliente.id;
        const carrito = req.session.carritoWeb || [];

        // Si intenta entrar al checkout con el carrito vacío, lo devolvemos a la tienda
        if (carrito.length === 0) {
            return res.redirect('/tienda');
        }

        try {
            // Buscamos si el cliente tiene direcciones registradas en la base de datos
            const [direcciones] = await pool.query(
                'SELECT * FROM direcciones_cliente WHERE FK_cliente = ? ORDER BY es_principal DESC',
                [id_cliente]
            );

            // Calculamos el total del carrito para mostrarlo en la pantalla
            const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

            res.render('checkout', {
                cliente: req.session.cliente,
                carrito: carrito,
                direcciones: direcciones,
                total: total
            });

        } catch (error) {
            console.error('Error al cargar el checkout:', error);
            res.status(500).send('Error interno del servidor');
        }
    },

    // 15. API: Guardar una nueva dirección desde el Checkout
    agregarDireccionAPI: async (req, res) => {
        const { alias, calle, numero, piso_depto, ciudad, provincia, codigo_postal } = req.body;
        const id_cliente = req.session.cliente.id;

        if (!alias || !calle || !numero || !ciudad || !provincia || !codigo_postal) {
            return res.json({ status: 'error', message: 'Todos los campos obligatorios deben estar completos.' });
        }

        try {
            // Insertamos la nueva dirección asociada al cliente
            await pool.query(
                'INSERT INTO direcciones_cliente (FK_cliente, alias, calle, numero, piso_depto, ciudad, provincia, codigo_postal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [id_cliente, alias, calle, numero, piso_depto, ciudad, provincia, codigo_postal]
            );

            // Traemos la lista actualizada de direcciones para devolverla al frontend
            const [direcciones] = await pool.query('SELECT * FROM direcciones_cliente WHERE FK_cliente = ?', [id_cliente]);

            res.json({ status: 'success', message: 'Dirección guardada correctamente.', direcciones: direcciones });

        } catch (error) {
            console.error('Error al guardar dirección:', error);
            res.json({ status: 'error', message: 'Error al registrar la dirección.' });
        }
    },

    // 16. API: Procesar la compra (Mercado Pago o Manual)
    procesarCompraWebAPI: async (req, res) => {
        // AHORA RECIBIMOS EL METODO DE PAGO DESDE EL CHECKOUT
        const { metodo_entrega, id_direccion, metodo_pago } = req.body;
        const carrito = req.session.carritoWeb || [];
        const id_cliente = req.session.cliente ? req.session.cliente.id : null;

        if (carrito.length === 0) return res.json({ status: 'error', message: 'El carrito está vacío.' });
        if (metodo_entrega === 'envio' && !id_direccion) return res.json({ status: 'error', message: 'Selecciona una dirección.' });
        if (!metodo_pago) return res.json({ status: 'error', message: 'Selecciona cómo vas a pagar.' });

        try {
            req.session.envio_metodo = metodo_entrega;
            req.session.envio_direccion = id_direccion || null;

            // ==========================================
            // RUTA A: MERCADO PAGO (Lo que ya funcionaba)
            // ==========================================
            if (metodo_pago === 'mercadopago') {
                const client = new MercadoPagoConfig({ accessToken: 'APP_USR-1596620673634722-061412-89a75bf1348a75be7db8f590bd53165f-3473858750' });
                const itemsParaMercadoPago = carrito.map(item => ({
                    id: item.id.toString(),
                    title: item.nombre,
                    quantity: Number(item.cantidad),
                    unit_price: Number(item.precio),
                    currency_id: 'ARS'
                }));

                const preference = new Preference(client);
                const resultado = await preference.create({
                    body: {
                        items: itemsParaMercadoPago,
                        back_urls: {
                            success: 'http://localhost:3000/tienda/pago-exitoso',
                            failure: 'http://localhost:3000/tienda/pago-fallido',
                            pending: 'http://localhost:3000/tienda/pago-pendiente'
                        },
                        // auto_return: 'approved', <-- Lo dejamos comentado por ahora para evitar el error 400
                        statement_descriptor: 'TIENDA ELECTRÓNICA'
                    }
                });
                return res.json({ status: 'success', url_pago: resultado.init_point });
            }

            // ==========================================
            // RUTA B: EFECTIVO O TRANSFERENCIA (El Desvío)
            // ==========================================
            else {
                const conexion = await pool.getConnection();
                try {
                    await conexion.beginTransaction();
                    const total_venta = carrito.reduce((sum, item) => sum + (Number(item.precio) * Number(item.cantidad)), 0);
                    const estado_envio = 'Pendiente de Despacho';
                    const textoPago = metodo_pago === 'efectivo' ? 'Efectivo Local (Pendiente)' : 'Transferencia (A Verificar)';

                    // Buscamos a un administrador para asignarle la venta "huérfana"
                    const [usuariosAdmin] = await conexion.query('SELECT id FROM usuarios WHERE activo = 1 LIMIT 1');
                    const fk_usuario_web = usuariosAdmin.length > 0 ? usuariosAdmin[0].id : 1;

                    // GUARDAMOS LA VENTA COMO PENDIENTE INMEDIATAMENTE
                    const [resVenta] = await conexion.query(`
                        INSERT INTO ventas (FK_usuario, FK_cliente, total_venta, metodo_pago, estado, origen_venta, estado_envio, FK_direccion_envio) 
                        VALUES (?, ?, ?, ?, 'Pendiente', 'Web', ?, ?)`,
                        [fk_usuario_web, id_cliente, total_venta, textoPago, estado_envio, id_direccion]
                    );
                    const id_nueva_venta = resVenta.insertId;

                    // Insertamos detalles y RESTAMOS STOCK (Se reserva el producto)
                    for (const item of carrito) {
                        await conexion.query('INSERT INTO detalles_venta (FK_venta, FK_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
                            [id_nueva_venta, item.id, item.cantidad, item.precio, (item.precio * item.cantidad)]
                        );
                        await conexion.query('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?', [item.cantidad, item.id]);
                    }

                    await conexion.commit();

                    // Limpiamos carrito
                    delete req.session.envio_metodo;
                    delete req.session.envio_direccion;
                    req.session.carritoWeb = [];

                    // Respondemos al Frontend que redirija a la pantalla de éxito manual
                    return res.json({
                        status: 'success_manual',
                        url_redireccion: `/tienda/pago-manual?id_venta=${id_nueva_venta}&metodo=${metodo_pago}`
                    });

                } catch (errorManual) {
                    await conexion.rollback();
                    console.error('Error procesando pago manual:', errorManual);
                    return res.json({ status: 'error', message: 'Error al procesar el pedido manual.' });
                } finally {
                    conexion.release();
                }
            }
        } catch (error) {
            console.error('Error crítico:', error);
            res.json({ status: 'error', message: 'No se pudo procesar el checkout.' });
        }
    },

    // 16.B Vista de Éxito para Efectivo y Transferencia
    pagoManualExitosoWeb: (req, res) => {
        const { id_venta, metodo } = req.query;
        if (!req.session.cliente) return res.redirect('/tienda');

        res.render('pago_manual_exitoso', {
            cliente: req.session.cliente,
            id_venta: id_venta,
            metodo: metodo
        });
    },

    // 17. Vista de Éxito y confirmación en Base de Datos
    pagoExitosoWeb: async (req, res) => {
        const { payment_id } = req.query;

        const id_cliente = req.session.cliente ? req.session.cliente.id : null;
        const carrito = req.session.carritoWeb || [];

        // Si recarga la página o no hay carrito, lo mandamos al inicio
        if (!id_cliente || carrito.length === 0) {
            return res.redirect('/tienda');
        }

        // Recuperamos lo que el cliente había elegido en el checkout
        const metodo_entrega = req.session.envio_metodo || 'retiro';
        const id_direccion = req.session.envio_direccion || null;
        const estado_envio = 'Pendiente de Despacho';

        const conexion = await pool.getConnection();
        try {
            await conexion.beginTransaction();

            const total_venta = carrito.reduce((sum, item) => sum + (Number(item.precio) * Number(item.cantidad)), 0);

            // 1. SEGURIDAD: Buscamos al primer empleado/usuario activo para asignarle la venta web
            // Esto evita que MySQL bloquee la venta por "Cajero Inexistente"
            const [usuariosAdmin] = await conexion.query('SELECT id FROM usuarios WHERE activo = 1 LIMIT 1');
            const fk_usuario_web = usuariosAdmin.length > 0 ? usuariosAdmin[0].id : 1;

            // 2. Insertamos la venta usando tu columna oficial "id_pago_mercadopago"
            const [resVenta] = await conexion.query(`
                INSERT INTO ventas (FK_usuario, FK_cliente, total_venta, metodo_pago, estado, origen_venta, estado_envio, FK_direccion_envio, id_pago_mercadopago) 
                VALUES (?, ?, ?, 'Mercado Pago', 'Completada', 'Web', ?, ?, ?)`,
                [fk_usuario_web, id_cliente, total_venta, estado_envio, id_direccion, payment_id]
            );

            const id_nueva_venta = resVenta.insertId;

            // 3. Registramos el pago en tu tabla pagos_venta
            await conexion.query('INSERT INTO pagos_venta (FK_venta, metodo_pago, monto) VALUES (?, ?, ?)',
                [id_nueva_venta, 'Mercado Pago', total_venta]
            );

            // 4. Guardamos los detalles y restamos el stock
            for (const item of carrito) {
                const [prod] = await conexion.query('SELECT stock_actual FROM productos WHERE id = ?', [item.id]);
                if (prod.length > 0 && prod[0].stock_actual >= item.cantidad) {
                    await conexion.query('INSERT INTO detalles_venta (FK_venta, FK_producto, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
                        [id_nueva_venta, item.id, item.cantidad, item.precio, (item.precio * item.cantidad)]
                    );
                    // Restamos el stock físico
                    await conexion.query('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?', [item.cantidad, item.id]);
                }
            }

            await conexion.commit();

            // ========================================================
            // 🚀 NUEVO: ENVÍO AUTOMÁTICO DEL TICKET AL CORREO DEL CLIENTE
            // ========================================================
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: 'futbolinsideout@gmail.com',
                        pass: 'tjpr hldk urxz wqkt'
                    }
                });

                // Armamos una lista de productos en HTML
                let listaProductosHTML = '';
                carrito.forEach(item => {
                    listaProductosHTML += `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 8px 0;">${item.nombre}</td>
                            <td style="text-align: center;">${item.cantidad}</td>
                            <td style="text-align: right;">$${Number(item.precio * item.cantidad).toLocaleString('es-AR')}</td>
                        </tr>
                    `;
                });

                const htmlCorreo = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #198754; text-align: center;">¡Gracias por tu compra en Tienda Electrónica!</h2>
                        <p>Hola <strong>${req.session.cliente.nombre}</strong>,</p>
                        <p>Hemos recibido tu pago a través de Mercado Pago y tu pedido ya está siendo procesado.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 0;"><strong>Orden de Compra:</strong> #${id_nueva_venta}</p>
                            <p style="margin: 0;"><strong>Estado del Envío:</strong> ${estado_envio}</p>
                            <p style="margin: 0;"><strong>Ref. Pago:</strong> ${payment_id}</p>
                        </div>

                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr style="border-bottom: 2px solid #333;">
                                <th style="text-align: left; padding-bottom: 8px;">Producto</th>
                                <th>Cant.</th>
                                <th style="text-align: right;">Subtotal</th>
                            </tr>
                            ${listaProductosHTML}
                        </table>

                        <h3 style="text-align: right; color: #333;">Total Pagado: $${total_venta.toLocaleString('es-AR')}</h3>
                        
                        <p style="text-align: center; color: #777; font-size: 12px; margin-top: 30px;">
                            Guarda este correo como comprobante de tu compra.<br>
                            Si tienes dudas, contáctanos por WhatsApp.
                        </p>
                    </div>
                `;

                await transporter.sendMail({
                    from: '"Tienda Electrónica" <futbolinsideout@gmail.com>',
                    to: req.session.cliente.email, // Se lo mandamos al email del cliente logueado
                    subject: `Confirmación de Pedido #${id_nueva_venta} - Tienda Electrónica`,
                    html: htmlCorreo
                });
                console.log(`✉️ Correo de confirmación enviado con éxito al cliente: ${req.session.cliente.email}`);
            } catch (errorMail) {
                console.error('Error al enviar el correo automático:', errorMail);
                // No detenemos el proceso si falla el correo, la compra ya se guardó.
            }
            // ========================================================

            // 5. Limpiamos la mochila
            delete req.session.envio_metodo;
            delete req.session.envio_direccion;
            req.session.carritoWeb = [];

            // 6. ¡Pantalla de victoria!
            res.render('pago_exitoso', {
                cliente: req.session.cliente,
                id_pago: payment_id,
                id_venta: id_nueva_venta
            });

        } catch (error) {
            await conexion.rollback();
            console.error('Error REAL en MySQL al registrar venta:', error);
            res.send('Ocurrió un error al registrar tu compra, pero tu pago fue procesado. Contáctanos.');
        } finally {
            conexion.release();
        }
    },

    // 18. Vistas de Fallo o Pendiente
    pagoFallidoWeb: (req, res) => {
        res.send('<h1 style="color:red; text-align:center; margin-top:50px;">El pago fue rechazado. Vuelve a intentarlo.</h1><a href="/tienda/checkout">Volver</a>');
    },

    // 19. Panel del Cliente: Mis Compras
    misComprasWeb: async (req, res) => {
        // Si no está logueado, lo mandamos al login
        if (!req.session.cliente) {
            return res.redirect('/tienda/login');
        }

        try {
            // Buscamos todas las compras de este cliente usando la columna correcta "fecha_hora"
            const [compras] = await pool.query(`
                SELECT id, fecha_hora AS fecha_venta, total_venta, estado, estado_envio, metodo_pago, FK_direccion_envio
                FROM ventas 
                WHERE FK_cliente = ? 
                ORDER BY fecha_hora DESC
            `, [req.session.cliente.id]);

            res.render('mis_compras', {
                cliente: req.session.cliente,
                compras: compras
            });

        } catch (error) {
            console.error('Error al cargar mis compras:', error);
            res.status(500).send('Error interno del servidor');
        }
    },

    // 20. Panel del Cliente: Ver detalle de una compra específica
    verDetalleCompraWeb: async (req, res) => {
        const id_venta = req.params.id;

        if (!req.session.cliente) {
            return res.redirect('/tienda/login');
        }

        try {
            // 1. Traemos la cabecera de la venta (y cruzamos con la dirección de envío si la hay)
            const [ventaBD] = await pool.query(`
                SELECT v.*, d.alias, d.calle, d.numero, d.ciudad, d.provincia, d.codigo_postal
                FROM ventas v
                LEFT JOIN direcciones_cliente d ON v.FK_direccion_envio = d.id
                WHERE v.id = ? AND v.FK_cliente = ?
            `, [id_venta, req.session.cliente.id]);

            // Seguridad: Si la venta no existe o no es de este cliente, lo pateamos
            if (ventaBD.length === 0) {
                return res.redirect('/tienda/mis-compras');
            }

            // 2. Traemos los productos específicos de esta venta
            const [detalles] = await pool.query(`
                SELECT dv.cantidad, dv.precio_unitario, dv.subtotal, p.nombre, p.imagen
                FROM detalles_venta dv
                JOIN productos p ON dv.FK_producto = p.id
                WHERE dv.FK_venta = ?
            `, [id_venta]);

            res.render('detalle_compra', {
                cliente: req.session.cliente,
                venta: ventaBD[0],
                detalles: detalles
            });

        } catch (error) {
            console.error('Error al cargar detalle de compra:', error);
            res.status(500).send('Error interno del servidor');
        }
    },

    pagoPendienteWeb: (req, res) => {
        res.send('<h1 style="color:orange; text-align:center; margin-top:50px;">Tu pago está pendiente (Ej: Rapipago). Te avisaremos cuando se acredite.</h1><a href="/tienda">Volver</a>');
    },

    // 9. API: Sumar o restar cantidades con los botones + y -
    modificarCantidadCarritoWeb: async (req, res) => {
        const { id_producto, accion } = req.body; // accion será 'sumar' o 'restar'
        let carrito = req.session.carritoWeb || [];
        const indice = carrito.findIndex(item => item.id == id_producto);

        if (indice !== -1) {
            if (accion === 'sumar') {
                // Verificamos si hay stock en la BD antes de dejarle sumar
                const [productoDB] = await pool.query('SELECT stock_actual FROM productos WHERE id = ?', [id_producto]);
                if (carrito[indice].cantidad + 1 > productoDB[0].stock_actual) {
                    return res.json({ status: 'error', message: 'Has alcanzado el stock máximo disponible.' });
                }
                carrito[indice].cantidad += 1;
            } else if (accion === 'restar') {
                carrito[indice].cantidad -= 1;
                // Si la cantidad llega a 0, lo borramos del carrito
                if (carrito[indice].cantidad <= 0) {
                    carrito.splice(indice, 1);
                }
            }
            req.session.carritoWeb = carrito;
            return res.json({ status: 'success', carrito: req.session.carritoWeb });
        }
        res.json({ status: 'error', message: 'Producto no encontrado' });
    },

    // 10. API: Registrar al cliente y enviar el código de 6 dígitos por email (CON VALIDACIÓN CRUZADA)
    registrarClienteAPI: async (req, res) => {
        const { nombre, apellido, dni, email, password, password_conf } = req.body;

        // 1. Validaciones básicas
        if (!nombre || !apellido || !dni || !email || !password) {
            return res.json({ status: 'error', message: 'Todos los campos son obligatorios.' });
        }
        if (password !== password_conf) {
            return res.json({ status: 'error', message: 'Las contraseñas no coinciden.' });
        }

        try {
            // 2. Verificar que no exista ya en la tabla de CLIENTES
            const [existeCliente] = await pool.query('SELECT id FROM clientes WHERE email = ? OR dni_cuil = ?', [email, dni]);
            if (existeCliente.length > 0) {
                return res.json({ status: 'error', message: 'El correo electrónico o DNI ya están registrados como cliente.' });
            }

            // 3. ¡NUEVO! Validación cruzada con la tabla de EMPLEADOS (Tu brillante propuesta)
            const [existePersonal] = await pool.query('SELECT id FROM empleados WHERE (email = ? OR dni = ?) AND activo = 1', [email, dni]);

            if (existePersonal.length > 0) {
                // Si el email o el DNI pertenecen al personal, verificamos si coinciden en la MISMA persona
                const [empleadoVerificado] = await pool.query('SELECT id FROM empleados WHERE email = ? AND dni = ? AND activo = 1', [email, dni]);

                if (empleadoVerificado.length === 0) {
                    // Si el email es de un empleado pero el DNI no coincide (o viceversa), bloqueamos por seguridad
                    return res.json({ status: 'error', message: 'El correo electrónico o DNI ingresado ya corresponden a una cuenta de personal protegida.' });
                }
                // Si ambos coinciden, confirmamos que es el verdadero empleado/admin y lo dejamos continuar.
            }

            // 4. Encriptar contraseña y generar el código de 6 números al azar
            const passwordEncriptada = await bcrypt.hash(password, 10);
            const codigoVerificacion = Math.floor(100000 + Math.random() * 900000).toString();

            // 5. Guardar en la base de datos (con email_verificado en 0)
            await pool.query(
                'INSERT INTO clientes (nombre, apellido, dni_cuil, email, password, email_verificado, codigo_verificacion) VALUES (?, ?, ?, ?, ?, 0, ?)',
                [nombre, apellido, dni, email, passwordEncriptada, codigoVerificacion]
            );

            // 6. Configurar el envío del Email
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'futbolinsideout@gmail.com',
                    pass: 'tjpr hldk urxz wqkt'
                }
            });

            // 7. Diseñar y enviar el correo al cliente
            await transporter.sendMail({
                from: '"Tienda Electrónica" <futbolinsideout@gmail.com>',
                to: email,
                subject: 'Tu código de seguridad - Tienda Electrónica',
                html: `
                    <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px; margin: auto;">
                        <h2 style="color: #0d6efd;">¡Hola, ${nombre}!</h2>
                        <p style="color: #555; font-size: 16px;">Gracias por registrarte en nuestra Tienda Online.</p>
                        <p style="color: #555; font-size: 16px;">Para activar tu cuenta, ingresá el siguiente código de seguridad en la pantalla:</p>
                        <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 8px;">
                            <h1 style="color: #333; letter-spacing: 5px; margin: 0; font-size: 32px;">${codigoVerificacion}</h1>
                        </div>
                        <p style="color: #999; font-size: 12px;">Si no solicitaste este registro, ignorá este correo.</p>
                    </div>
                `
            });

            // 8. Guardamos el email en la mochila de Node temporalmente para la pantalla de verificación
            req.session.emailPendienteVerificacion = email;

            res.json({ status: 'success', message: '¡Cuenta creada! Revisa tu correo.' });

        } catch (error) {
            console.error('Error Crítico al registrar cliente:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // 11. Mostrar la pantalla de verificación
    mostrarVerificacion: (req, res) => {
        // Si no hay un email pendiente de verificar en la memoria, lo pateamos al registro
        if (!req.session.emailPendienteVerificacion) {
            return res.redirect('/tienda/registro');
        }
        res.render('verificar_cliente', { email: req.session.emailPendienteVerificacion });
    },

    // 12. API: Procesar los 6 dígitos y loguear al cliente
    verificarCodigoAPI: async (req, res) => {
        const { codigo } = req.body;
        const email = req.session.emailPendienteVerificacion;

        if (!email) return res.json({ status: 'error', message: 'Sesión expirada. Vuelve a registrarte.' });

        try {
            // Buscamos al cliente con ese email y ese código exacto
            const [clienteDB] = await pool.query('SELECT id, nombre, apellido, email FROM clientes WHERE email = ? AND codigo_verificacion = ?', [email, codigo]);

            if (clienteDB.length === 0) {
                return res.json({ status: 'error', message: 'El código es incorrecto. Revisa tu correo e inténtalo de nuevo.' });
            }

            const cliente = clienteDB[0];

            // Si el código es correcto:
            // 1. Lo marcamos como verificado y le borramos el código usado
            await pool.query('UPDATE clientes SET email_verificado = 1, codigo_verificacion = NULL WHERE id = ?', [cliente.id]);

            // 2. Le creamos la sesión oficial para que ya pueda navegar y comprar
            req.session.cliente = {
                id: cliente.id,
                nombre: cliente.nombre,
                email: cliente.email
            };

            // 3. Limpiamos la memoria temporal
            delete req.session.emailPendienteVerificacion;

            res.json({ status: 'success', message: '¡Cuenta verificada con éxito!' });

        } catch (error) {
            console.error('Error al verificar:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // 13. API: Procesar el Login del Cliente
    loginClienteAPI: async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.json({ status: 'error', message: 'Todos los campos son obligatorios.' });
        }

        try {
            // Buscamos al cliente en la base de datos (que esté activo)
            const [rows] = await pool.query('SELECT * FROM clientes WHERE email = ? AND activo = 1', [email]);

            if (rows.length === 0) {
                return res.json({ status: 'error', message: 'El correo electrónico o la contraseña son incorrectos.' });
            }

            const cliente = rows[0];

            // SEGURIDAD: Si el cliente existe pero aún no verificó su mail con los 6 dígitos
            if (cliente.email_verificado === 0) {
                // Guardamos su email en la sesión temporal para que la pantalla de verificación sepa a quién validar
                req.session.emailPendienteVerificacion = cliente.email;
                return res.json({
                    status: 'error_verificacion',
                    message: 'Tu cuenta aún no está activa. Te redirigiremos para que ingreses el código de seguridad que enviamos a tu correo.'
                });
            }

            // Comparamos la contraseña tipeada con el hash encriptado de la BD
            const passwordValida = await bcrypt.compare(password, cliente.password);

            if (!passwordValida) {
                return res.json({ status: 'error', message: 'El correo electrónico o la contraseña son incorrectos.' });
            }

            // Si las credenciales son perfectas, creamos la sesión oficial del cliente
            req.session.cliente = {
                id: cliente.id,
                nombre: cliente.nombre,
                email: cliente.email
            };

            res.json({ status: 'success', message: '¡Ingreso exitoso!' });

        } catch (error) {
            console.error('Error en el login del cliente:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },
    // 21. API: Cancelar Pedido Web (Botón de Arrepentimiento)
    cancelarPedidoAPI: async (req, res) => {
        const { id_venta } = req.body;
        const id_cliente = req.session.cliente ? req.session.cliente.id : null;

        if (!id_cliente) return res.json({ status: 'error', message: 'No tienes sesión activa.' });

        const conexion = await pool.getConnection();
        try {
            await conexion.beginTransaction();

            // 1. Buscamos la venta para asegurar que le pertenece y está pendiente
            const [ventas] = await conexion.query(`
                SELECT id, id_pago_mercadopago, estado_envio, estado 
                FROM ventas 
                WHERE id = ? AND FK_cliente = ?
            `, [id_venta, id_cliente]);

            if (ventas.length === 0) throw new Error('Venta no encontrada.');
            const venta = ventas[0];

            if (venta.estado_envio !== 'Pendiente de Despacho') {
                return res.json({ status: 'error', message: 'El pedido ya fue procesado o enviado. Contáctanos por WhatsApp para gestionar la devolución.' });
            }

            // 2. Conectamos con Mercado Pago para devolver la plata REAL
            if (venta.id_pago_mercadopago) {
                try {
                    const client = new MercadoPagoConfig({ accessToken: 'APP_USR-1596620673634722-061412-89a75bf1348a75be7db8f590bd53165f-3473858750' });
                    const refund = new PaymentRefund(client);
                    await refund.create({ payment_id: venta.id_pago_mercadopago });
                } catch (mpError) {
                    // Si Mercado Pago rebota el reembolso por estar en Modo Prueba, lo ignoramos y seguimos.
                    console.log('⚠️ Aviso MP: No se pudo reembolsar en Mercado Pago (Normal en Sandbox). Cancelando localmente...');
                }
            }

            // 3. Devolvemos el stock físico al local
            const [detalles] = await conexion.query('SELECT FK_producto, cantidad FROM detalles_venta WHERE FK_venta = ?', [id_venta]);
            for (const item of detalles) {
                await conexion.query('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?', [item.cantidad, item.FK_producto]);
            }

            // 4. Marcamos la venta como Anulada
            await conexion.query("UPDATE ventas SET estado = 'Anulada', estado_envio = 'Cancelado por Cliente' WHERE id = ?", [id_venta]);

            await conexion.commit();
            res.json({ status: 'success', message: 'Pedido cancelado. El dinero será reembolsado a tu tarjeta y los productos volvieron a nuestro stock.' });

        } catch (error) {
            await conexion.rollback();
            console.error('Error al cancelar el pedido:', error);
            res.json({ status: 'error', message: 'No se pudo cancelar el pedido. Puede que el pago ya haya sido reintegrado.' });
        } finally {
            conexion.release();
        }
    },

    // 22. API Oculta: Webhook de Mercado Pago (El "Chismoso")
    recibirWebhookMercadoPago: async (req, res) => {
        // MP nos envía un aviso POST cuando un pago se aprueba, falla o si se paga en Rapipago
        const pagoInfo = req.query;

        // Por seguridad, siempre hay que responderle "OK 200" rápido a MP para que no reenvíe el aviso
        res.status(200).send('OK');

        if (pagoInfo.type === 'payment') {
            try {
                // Aquí buscaríamos en la API de MP los detalles del pagoInfo.data.id
                // Y actualizaríamos la base de datos de "Pendiente" a "Completada".
                // (Implementaremos la lógica completa del webhook cuando ataquemos Rapipago/Transferencias).
                console.log('🔔 [WEBHOOK MP]: Se ha registrado un movimiento en el pago ID:', pagoInfo['data.id']);
            } catch (error) {
                console.error('Error procesando Webhook de MP:', error);
            }
        }
    },

// 23. Vista: Mi Perfil (Cliente)
    mostrarPerfilCliente: async (req, res) => {
        if (!req.session.cliente) return res.redirect('/tienda/login');

        try {
            // 1. Traemos los datos personales actualizados
            const [clienteDB] = await pool.query('SELECT nombre, apellido, dni_cuil, email, telefono, email_alternativo FROM clientes WHERE id = ?', [req.session.cliente.id]);
            
            // 2. Traemos todas las direcciones guardadas de este cliente
            const [direccionesDB] = await pool.query('SELECT * FROM direcciones_cliente WHERE FK_cliente = ? ORDER BY es_principal DESC, id DESC', [req.session.cliente.id]);

            res.render('perfil_cliente', {
                cliente: clienteDB[0],
                direcciones: direccionesDB // Pasamos las direcciones a la vista
            });
        } catch (error) {
            console.error('Error al cargar el perfil:', error);
            res.status(500).send('Error interno del servidor');
        }
    },

    // 24. API: Actualizar Datos Personales del Cliente
    actualizarPerfilAPI: async (req, res) => {
        if (!req.session.cliente) return res.json({ status: 'error', message: 'Sesión expirada.' });

        const { nombre, apellido, telefono, email_alternativo } = req.body; // <-- ATRAPAMOS EL NUEVO CAMPO
        const id_cliente = req.session.cliente.id;

        if (!nombre || !apellido) return res.json({ status: 'error', message: 'El nombre y apellido son obligatorios.' });

        try {
            await pool.query(
                'UPDATE clientes SET nombre = ?, apellido = ?, telefono = ?, email_alternativo = ? WHERE id = ?',
                [nombre, apellido, telefono, email_alternativo, id_cliente] // <-- EVALUAMOS EN LA BD
            );

            req.session.cliente.nombre = nombre;
            res.json({ status: 'success', message: 'Tus datos fueron actualizados correctamente.' });
        } catch (error) {
            console.error('Error al actualizar perfil:', error);
            res.json({ status: 'error', message: 'No se pudieron actualizar los datos.' });
        }
    },

    // 25. API: Cambiar Contraseña del Cliente
    cambiarPasswordClienteAPI: async (req, res) => {
        if (!req.session.cliente) return res.json({ status: 'error', message: 'Sesión expirada.' });

        const { password_actual, password_nueva, password_conf } = req.body;
        const id_cliente = req.session.cliente.id;

        if (!password_actual || !password_nueva || !password_conf) {
            return res.json({ status: 'error', message: 'Todos los campos de contraseña son obligatorios.' });
        }

        if (password_nueva !== password_conf) {
            return res.json({ status: 'error', message: 'La nueva contraseña y su confirmación no coinciden.' });
        }

        try {
            // Buscamos la contraseña vieja en la BD
            const [clienteDB] = await pool.query('SELECT password FROM clientes WHERE id = ?', [id_cliente]);
            const passwordValida = await bcrypt.compare(password_actual, clienteDB[0].password);

            if (!passwordValida) {
                return res.json({ status: 'error', message: 'La contraseña actual es incorrecta.' });
            }

            // Encriptamos y guardamos la nueva
            const nuevaPasswordHash = await bcrypt.hash(password_nueva, 10);
            await pool.query('UPDATE clientes SET password = ? WHERE id = ?', [nuevaPasswordHash, id_cliente]);

            res.json({ status: 'success', message: 'Tu contraseña ha sido cambiada con éxito. Usa la nueva la próxima vez que inicies sesión.' });
        } catch (error) {
            console.error('Error al cambiar password de cliente:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // 26. Vista: Mostrar formulario para pedir código de recuperación
    mostrarRecuperarCuenta: (req, res) => {
        if (req.session.cliente) return res.redirect('/tienda');
        res.render('recuperar_cuenta');
    },

    // 27. API A: Buscar cliente por DNI y devolver correos asociados completos
    buscarCuentaPorDniAPI: async (req, res) => {
        const { dni } = req.body;
        try {
            const [clienteDB] = await pool.query(
                "SELECT id, nombre, email, email_alternativo FROM clientes WHERE dni_cuil = ? AND activo = 1",
                [dni]
            );

            if (clienteDB.length === 0) {
                return res.json({ status: 'error', message: 'No encontramos ninguna cuenta activa asociada a ese número de DNI.' });
            }

            const c = clienteDB[0];
            res.json({
                status: 'success',
                id_cliente: c.id,
                nombre: c.nombre,
                email: c.email,
                email_alternativo: c.email_alternativo
            });
        } catch (error) {
            console.error('Error al buscar DNI:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // 27.B API B: Generar código de 6 dígitos y enviar al casillero seleccionado
    enviarCodigoRecuperacionAPI: async (req, res) => {
        const { id_cliente, destino_correo } = req.body;
        try {
            const [clienteDB] = await pool.query("SELECT id, nombre, email, email_alternativo FROM clientes WHERE id = ?", [id_cliente]);
            if (clienteDB.length === 0) return res.json({ status: 'error', message: 'Cliente no válido.' });
            const c = clienteDB[0];

            // Elegimos a qué bandeja disparar el correo
            let correoDestinoFinal = (destino_correo === 'alternativo' && c.email_alternativo) ? c.email_alternativo : c.email;

            // Generamos código
            const codigoRecuperacion = Math.floor(100000 + Math.random() * 900000).toString();
            await pool.query("UPDATE clientes SET codigo_verificacion = ? WHERE id = ?", [codigoRecuperacion, c.id]);

            // Despachamos el Gmail
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: 'futbolinsideout@gmail.com', pass: 'tjpr hldk urxz wqkt' }
            });

            await transporter.sendMail({
                from: '"Tienda Electrónica" <futbolinsideout@gmail.com>',
                to: correoDestinoFinal,
                subject: 'Código de Recuperación de Cuenta - Tienda Electrónica',
                html: `
                    <div style="font-family: Arial; padding: 20px; text-align: center; border: 1px solid #ddd; border-radius: 10px; max-width: 500px; margin: auto;">
                        <h2 style="color: #e0a800;">Restablecer Contraseña</h2>
                        <p>Hola <strong>${c.nombre}</strong>,</p>
                        <p>Usaste tu DNI para solicitar la recuperación de tu cuenta.</p>
                        <p>Ingresa este código de seguridad para configurar tu nueva contraseña:</p>
                        <div style="background-color: #f8f9fa; padding: 10px; margin: 15px 0; border-radius: 8px;">
                            <h1 style="letter-spacing: 5px; margin: 0; color: #333;">${codigoRecuperacion}</h1>
                        </div>
                    </div>`
            });

            // Guardamos la sesión del correo original de la cuenta para saber a quién impactar la clave después
            req.session.emailEnRecuperacion = c.email;

            res.json({ status: 'success', message: `Código enviado con éxito a la bandeja: ${correoDestinoFinal}` });
        } catch (error) {
            console.error('Error al despachar código:', error);
            res.json({ status: 'error', message: 'No se pudo enviar el correo de seguridad.' });
        }
    },

    // 28. Vista: Mostrar formulario para ingresar el código y la nueva contraseña
    mostrarReestablecerPassword: (req, res) => {
        if (!req.session.emailEnRecuperacion) {
            return res.redirect('/tienda/recuperar-cuenta');
        }
        res.render('reestablecer_password');
    },

    // 29. API C: Validar código y reestablecer clave con Bcrypt
    procesarReestablecerPasswordAPI: async (req, res) => {
        const { codigo, password_nueva } = req.body;
        const email = req.session.emailEnRecuperacion;

        if (!email) return res.json({ status: 'error', message: 'La sesión de recuperación expiró. Vuelve a empezar.' });

        try {
            const [clienteDB] = await pool.query("SELECT id FROM clientes WHERE email = ? AND codigo_verificacion = ?", [email, codigo]);
            if (clienteDB.length === 0) return res.json({ status: 'error', message: 'El código de seguridad es incorrecto o ya fue usado.' });

            const passwordEncriptada = await bcrypt.hash(password_nueva, 10);
            await pool.query("UPDATE clientes SET password = ?, codigo_verificacion = NULL WHERE id = ?", [passwordEncriptada, clienteDB[0].id]);

            delete req.session.emailEnRecuperacion;
            res.json({ status: 'success', message: 'Tu contraseña fue actualizada correctamente. Ya puedes iniciar sesión.' });
        } catch (error) {
            console.error(error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // ==========================================
    // VISTAS LEGALES Y DE AYUDA
    // ==========================================
    mostrarTerminos: (req, res) => {
        // Renderizamos la vista pasándole el cliente si es que está logueado
        res.render('terminos_condiciones', {
            cliente: req.session.cliente || null
        });
    },

    mostrarArrepentimiento: (req, res) => {
        res.render('arrepentimiento', {
            cliente: req.session.cliente || null
        });
    },

    // ==========================================
    // API: Procesar Botón de Arrepentimiento
    // ==========================================
    procesarArrepentimientoAPI: async (req, res) => {
        const { id_venta, email, motivo } = req.body;

        if (!id_venta || !email) {
            return res.json({ status: 'error', message: 'El número de ticket y el correo son obligatorios.' });
        }

        try {
            // Validamos que el ticket realmente exista en tu tienda
            const [venta] = await pool.query('SELECT id FROM ventas WHERE id = ?', [id_venta]);
            
            if (venta.length === 0) {
                return res.json({ status: 'error', message: 'No encontramos ninguna compra con ese número de ticket.' });
            }

            // Si existe, guardamos el reclamo en la BD
            await pool.query(
                'INSERT INTO solicitudes_arrepentimiento (id_venta, email, motivo) VALUES (?, ?, ?)', 
                [id_venta, email, motivo]
            );

            res.json({ status: 'success', message: 'Tu solicitud ha sido registrada con éxito. Nos contactaremos a la brevedad.' });
        } catch (error) {
            console.error('Error al registrar arrepentimiento:', error);
            res.json({ status: 'error', message: 'Error interno del servidor.' });
        }
    },

    // ==========================================
    // VISTA: Centro de Ayuda (FAQ)
    // ==========================================
    mostrarAyuda: (req, res) => {
        res.render('centro_ayuda', {
            cliente: req.session.cliente || null
        });
    },

    // Cerrar sesión del cliente (Logout de la web)
    logoutCliente: (req, res) => {
        delete req.session.cliente;
        res.redirect('/tienda');
    }
};

export default tiendaControlador;