import UsuarioModel from './modelos/usuarios.js'
import express from 'express' //aca instalamos el express
import pool from './modelos/conexion.js'
import bcrypt from 'bcryptjs'
import session from 'express-session'
import ProductosControlador from './controladores/productosControlador.js'
import ProductoModel from './modelos/productos.js'
import VentaModel from './modelos/ventas.js'
import ventasControlador from './controladores/ventasControlador.js'
import clientesControlador from './controladores/clientesControlador.js'
import dashboardControlador from './controladores/dashboardControlador.js';
import auditoriaControlador from './controladores/auditoriaControlador.js';
import AuditoriaModel from './modelos/auditoria.js';
import multer from 'multer';
import path from 'path';
import ParametrosControlador from './controladores/parametrosControlador.js';
import usuariosControlador from './controladores/usuariosControlador.js';
import reportesControlador from './controladores/reportesControlador.js';
import tiendaControlador from './controladores/tiendaControlador.js';

const app = express() //y aca lo ponemos dentro de otra variable para posteriormente usarlo en todo el resto del sistema

// ==========================================
// 1. CONFIGURACIONES GENERALES
// ==========================================
app.set('view engine', 'ejs')
app.set('views', './vistas/paginas')
app.use(express.urlencoded({ extended: true })) // <-- Esto lee formularios normales
app.use(express.json()) // <-- ¡NUEVO! Esto lee los datos AJAX/Fetch de SweetAlert

// DAR PERMISO PARA LEER LA CARPETA ASSETS (CSS, JS, IMÁGENES)
app.use('/assets', express.static('assets')) // <--- AGREGA ESTA LÍNEA

// ==========================================
// CONFIGURACIÓN DE MULTER (SUBIDA DE IMÁGENES)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/images/productos') // Guarda las fotos en esta carpeta
  },
  filename: function (req, file, cb) {
    // Le cambia el nombre al archivo para que no haya duplicados (ej: 1654321-foto.jpg)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})
const upload = multer({ storage: storage })

// ==========================================
// 2. CONFIGURACIÓN DE SESIONES (¡Debe ir arriba de las rutas!)
// ==========================================
app.use(session({
  secret: 'mi_secreto_super_seguro_123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}))

// ==========================================
// 3. MIDDLEWARE DE SEGURIDAD (El Guardia)
// ==========================================
const requerirLogin = (req, res, next) => {
  if (req.session.usuario) {
    // ¡NUEVO! Le damos órdenes estrictas al navegador de NO guardar caché
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    next()
  } else {
    console.log('Intento de acceso bloqueado. Redirigiendo al Login.')
    res.redirect('/')
  }
}

// ==========================================
// 4. RUTAS PÚBLICAS (No requieren sesión)
// ==========================================

// RUTA DE INICIO
app.get('/', async (req, res) => {
  const cantidadUsuarios = await UsuarioModel.verificarSiHayUsuarios()
  if (cantidadUsuarios === 0) {
    return res.redirect('/setup')
  }
  res.render('login')
})

// MOSTRAR FORMULARIO SETUP
app.get('/setup', async (req, res) => {
  const cantidadUsuarios = await UsuarioModel.verificarSiHayUsuarios()
  if (cantidadUsuarios > 0) {
    return res.redirect('/')
  }
  res.render('setup')
})

// PROCESAR FORMULARIO SETUP
app.post('/setup', async (req, res) => {
  const { nombre, apellido, dni, email_acceso, password } = req.body
  const cantidadUsuarios = await UsuarioModel.verificarSiHayUsuarios()

  if (cantidadUsuarios > 0) return res.redirect('/')

  const salt = await bcrypt.genSalt(10)
  const passwordEncriptada = await bcrypt.hash(password, salt)

  const exito = await UsuarioModel.crearUsuarioAdmin({
    nombre, apellido, dni, email_acceso, password_encriptada: passwordEncriptada
  })

  if (exito) {
    console.log('✅ Administrador creado con éxito en MySQL.')
    res.redirect('/')
  } else {
    res.send('<h1>Error grave al instalar. Revisa la terminal.</h1>')
  }
}) // <--- ¡AQUÍ SE CIERRA CORRECTAMENTE EL SETUP!

// PROCESAR EL LOGIN (AHORA CON AJAX Y JSON)
app.post('/login', async (req, res) => {
  const { email_acceso, password } = req.body

  const usuarioEncontrado = await UsuarioModel.buscarPorEmail(email_acceso)
  
  // Si el correo no existe en la base de datos
  if (!usuarioEncontrado) {
    return res.json({ status: 'error', message: 'El correo ingresado no existe en el sistema.' })
  }

  const passwordValida = await bcrypt.compare(password, usuarioEncontrado.password)
  
  // Si la contraseña es incorrecta
  if (!passwordValida) {
    return res.json({ status: 'error', message: 'Contraseña incorrecta. Inténtalo de nuevo.' })
  }

  // Si todo está perfecto, armamos la mochila de la sesión
  req.session.usuario = {
    id: usuarioEncontrado.id_usuario,
    nombre_completo: `${usuarioEncontrado.nombre} ${usuarioEncontrado.apellido}`,
    rol: usuarioEncontrado.rol_nombre,
    rol_id: usuarioEncontrado.rol_id,
    requiere_cambio: usuarioEncontrado.requiere_cambio_password
  }

  // Le decimos al frontend que fue un éxito y a dónde debe redirigir
  res.json({ status: 'success', redirect: '/menu' })
})

// ==========================================
// MÓDULO: TIENDA ONLINE PÚBLICA (Estilo Mercado Libre)
// ==========================================
app.get('/tienda', tiendaControlador.mostrarTienda);
app.get('/tienda/producto/:id', tiendaControlador.verProductoDetalle);

// Pantallas de Autenticación de Clientes
app.get('/tienda/login', tiendaControlador.mostrarLoginCliente);
app.get('/tienda/registro', tiendaControlador.mostrarRegistroCliente);

// APIs del Carrito de la Web
app.post('/api/tienda/carrito/agregar', tiendaControlador.agregarAlCarritoWeb);
app.get('/api/tienda/carrito/ver', tiendaControlador.verCarritoWeb);
app.post('/api/tienda/carrito/vaciar', tiendaControlador.vaciarCarritoWeb);

// Ruta API para el Registro
app.post('/api/tienda/registro', tiendaControlador.registrarClienteAPI);

// Proteger el botón de Iniciar Compra
app.get('/tienda/checkout', tiendaControlador.mostrarCheckout);

// Verificación de Cuenta
app.get('/tienda/verificar', tiendaControlador.mostrarVerificacion);
app.post('/api/tienda/verificar', tiendaControlador.verificarCodigoAPI);

// Procesar ingreso y salida del cliente
app.post('/api/tienda/login', tiendaControlador.loginClienteAPI);
app.get('/tienda/logout', tiendaControlador.logoutCliente);

// API para los botones + y - del carrito
app.post('/api/tienda/carrito/modificar', tiendaControlador.modificarCantidadCarritoWeb);

// Rutas del Checkout y Pedidos Web
app.post('/api/tienda/direccion/nueva', tiendaControlador.agregarDireccionAPI);
app.post('/api/tienda/checkout/procesar', tiendaControlador.procesarCompraWebAPI);

// Retornos de Mercado Pago
app.get('/tienda/pago-exitoso', tiendaControlador.pagoExitosoWeb);
app.get('/tienda/pago-fallido', tiendaControlador.pagoFallidoWeb);
app.get('/tienda/pago-pendiente', tiendaControlador.pagoPendienteWeb);

// Panel del Cliente
app.get('/tienda/mis-compras', tiendaControlador.misComprasWeb);
app.get('/tienda/mis-compras/:id', tiendaControlador.verDetalleCompraWeb);

// Rutas del Perfil del Cliente
app.get('/tienda/mi-perfil', tiendaControlador.mostrarPerfilCliente);
app.post('/api/tienda/mi-perfil/actualizar', tiendaControlador.actualizarPerfilAPI);
app.post('/api/tienda/mi-perfil/password', tiendaControlador.cambiarPasswordClienteAPI);

// Rutas para Gestión de Pedidos de la Tienda Online (Empleados)
app.get('/pedidos-web', ventasControlador.listarPedidosWeb);
app.post('/api/pedidos/actualizar-envio', ventasControlador.actualizarEstadoEnvioAPI);
app.get('/api/pedidos/:id_venta/detalles', ventasControlador.obtenerDetallesPedidoAPI);
app.post('/api/tienda/mis-compras/cancelar', tiendaControlador.cancelarPedidoAPI);

// Webhook de Mercado Pago
app.post('/api/webhook/mercadopago', tiendaControlador.recibirWebhookMercadoPago);

app.get('/tienda/pago-manual', tiendaControlador.pagoManualExitosoWeb);
app.get('/api/notificaciones/pedidos-pendientes', ventasControlador.contarPedidosPendientesAPI);

app.post('/carrito/modificar', ventasControlador.modificarCantidadAPI);
// ==========================================
// RUTAS PRO DE RECUPERACIÓN (DNI + EMAIL RESPALDO)
// ==========================================
app.get('/tienda/recuperar-cuenta', tiendaControlador.mostrarRecuperarCuenta);
app.post('/api/tienda/recuperar-cuenta/buscar-dni', tiendaControlador.buscarCuentaPorDniAPI);
app.post('/api/tienda/recuperar-cuenta/enviar-codigo', tiendaControlador.enviarCodigoRecuperacionAPI);
app.get('/tienda/reestablecer-password', tiendaControlador.mostrarReestablecerPassword);
app.post('/api/tienda/recuperar-cuenta/confirmar', tiendaControlador.procesarReestablecerPasswordAPI);

app.get('/pedidos-web/:id_venta/remito', ventasControlador.imprimirRemitoWeb);
// ==========================================
// RUTA: ATRAPAR USUARIOS NUEVOS AL ENTRAR AL MENU
// ==========================================
// Middleware (Guardia Especial): Revisa si el empleado necesita cambiar la clave
const verificarPasswordCambiada = (req, res, next) => {
  // Si requiere_cambio es 1, lo pateamos a la pantalla de cambiar clave
  if (req.session.usuario && req.session.usuario.requiere_cambio === 1) {
    return res.redirect('/cambiar-password')
  }
  // Si es 0 (como tú el Admin), lo deja pasar (next) al Menu
  next()
}

// Ahora le agregamos ese segundo guardia a tu ruta del Menú
// Se lee así: get('/menu' -> requiere estar logueado -> requiere clave cambiada -> Mostrar Menu)
// RUTA: ATRAPAR USUARIOS NUEVOS AL ENTRAR AL MENU Y MOSTRAR DASHBOARD
app.get('/menu', requerirLogin, verificarPasswordCambiada, dashboardControlador.mostrarDashboard);


// ==========================================
// RUTA: MOSTRAR PANTALLA DE CAMBIO DE CLAVE
// ==========================================
app.get('/cambiar-password', requerirLogin, (req, res) => {
  // res.render = dibuja el HTML de cambiar_password.ejs
  res.render('cambiar_password')
})

// ==========================================
// RUTA: RECIBIR Y GUARDAR LA NUEVA CLAVE
// ==========================================
app.post('/guardar-nueva-password', requerirLogin, async (req, res) => {
  // req.body = sacamos la clave que escribió en el formulario
  const { password_nueva, password_confirmacion } = req.body

  // Validación rápida: Si no son iguales, lo devolvemos
  if (password_nueva !== password_confirmacion) {
    return res.send('Las contraseñas no coinciden. Vuelve atrás e intenta de nuevo.')
  }

  // bcrypt.hash = Encriptamos la nueva clave para guardarla en MySQL
  const salt = await bcrypt.genSalt(10)
  const claveEncriptada = await bcrypt.hash(password_nueva, salt)

  // Llamamos al Modelo para hacer el UPDATE
  const exito = await UsuarioModel.actualizarPassword(req.session.usuario.id, claveEncriptada)

  if (exito) {
    // Si salió bien, destruimos su sesión actual (req.session.destroy) 
    // y lo mandamos al Login (res.redirect('/')) como pediste.
    req.session.destroy()
    res.redirect('/')
  } else {
    res.send('Error en la base de datos al guardar la clave.')
  }
})

// ==========================================
// MÓDULO: AUDITORÍA (Logs)
// ==========================================
app.get('/auditoria', requerirLogin, auditoriaControlador.mostrarAuditoria);

// ==========================================
// MÓDULO: USUARIOS (EMPLEADOS)
// ==========================================
// 1. Mostrar Pantalla (Controlador Nuevo)
app.get('/usuarios', requerirLogin, verificarPasswordCambiada, usuariosControlador.listar);

// 2. Crear y Editar (Controlador Nuevo)
app.post('/usuarios/crear-api', requerirLogin, usuariosControlador.crearAPI);
app.post('/usuarios/editar-api', requerirLogin, usuariosControlador.editarAPI);

// 3. Borrar Usuario (Baja Lógica)
app.post('/usuarios/borrar', requerirLogin, async (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'No tienes permiso.' });
  const id_a_borrar = req.body.id;
  if (req.session.usuario.id == id_a_borrar) return res.json({ status: 'error', message: 'No puedes borrarte a ti mismo.' });

  const exito = await UsuarioModel.desactivarUsuario(id_a_borrar);
  if (exito) {
    await AuditoriaModel.registrar(req.session.usuario.id, 'DELETE', 'usuarios', id_a_borrar, `Desactivó el acceso al usuario ID: ${id_a_borrar}`);
    res.json({ status: 'success', message: 'Usuario desactivado correctamente.' });
  } else res.json({ status: 'error', message: 'Error en la base de datos.' });
});

// 4. Reiniciar Password (Botón Power)
app.post('/usuarios/reiniciar', requerirLogin, async (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'No tienes permiso.' });
  const { id, email } = req.body;
  if (!id || !email) return res.json({ status: 'error', message: 'Faltan datos para reiniciar.' });

  const exito = await UsuarioModel.reiniciarPassword(id, email);
  if (exito) {
    await AuditoriaModel.registrar(req.session.usuario.id, 'REINICIAR', 'usuarios', id, `Reinició la contraseña del usuario ID: ${id}`);
    res.json({ status: 'success', message: 'Contraseña reiniciada. El usuario deberá cambiarla al ingresar.' });
  } else res.json({ status: 'error', message: 'Error en la base de datos.' });
});

// ==========================================
// 5. RUTAS PROTEGIDAS (Requieren estar logueado)
// ==========================================

// MÓDULO CATÁLOGO DE PRODUCTOS: 
// Cuando entren a /productos, llama al gerente "ProductosControlador" y que él ejecute "mostrarCatalogo"
app.get('/productos', requerirLogin, verificarPasswordCambiada, ProductosControlador.mostrarCatalogo)

// ==========================================
// MÓDULO: REPORTES FINANCIEROS (Solo Administrador)
// ==========================================
app.get('/reportes', requerirLogin, verificarPasswordCambiada, reportesControlador.mostrarReportes);

// ==========================================
// MÓDULO: GESTIÓN DE PRODUCTOS (Solo Administrador)
// ==========================================

// 1. Mostrar la pantalla con el formulario y la tabla
app.get('/gestion-productos', requerirLogin, verificarPasswordCambiada, (req, res) => {
  // Verificamos que sea Admin (Rol 1)
  if (req.session.usuario.rol_id !== 1) return res.redirect('/menu')

  // Llamamos al gerente para que arme la pantalla
  ProductosControlador.mostrarGestion(req, res)
})

// 2. Procesar el formulario de Crear Producto (AHORA CON MULTIPLES IMÁGENES)
app.post('/gestion-productos/crear', requerirLogin, upload.array('imagenes', 5), (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'Sin permisos.' });
  ProductosControlador.guardarNuevoProducto(req, res);
});

// 3. API AJAX: Actualizar Producto (AHORA CON MULTIPLES IMÁGENES)
app.post('/gestion-productos/editar', requerirLogin, upload.array('imagenes', 5), (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'Sin permisos.' });
  ProductosControlador.editarProductoAPI(req, res);
});

// 4. API AJAX: Borrar Producto
app.post('/gestion-productos/borrar', requerirLogin, (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'Sin permisos.' });
  ProductosControlador.borrarProductoAPI(req, res);
});

// ¡NUEVO! 5. API AJAX: Aplicar Descuento Masivo
app.post('/gestion-productos/descuento-masivo', requerirLogin, (req, res) => {
  if (req.session.usuario.rol_id !== 1) return res.json({ status: 'error', message: 'Sin permisos.' });
  ProductosControlador.aplicarDescuentoMasivoAPI(req, res);
});

// ==========================================
// MÓDULO: INGRESOS DE STOCK (Carga de mercadería)
// ==========================================

// 1. Mostrar la pantalla visual (La construiremos en el próximo paso)
app.get('/stock/ingresos', requerirLogin, verificarPasswordCambiada, (req, res) => {
  res.render('ingreso_stock', { usuario: req.session.usuario })
})

// 2. API AJAX: Recibir el disparo de la pistola de código de barras
app.post('/stock/buscar', requerirLogin, async (req, res) => {
  const termino = req.body.termino
  const resultados = await ProductoModel.buscarParaStock(termino)

  if (resultados.length > 0) {
    res.json({ status: 'success', productos: resultados })
  } else {
    res.json({ status: 'error', message: 'No se encontró ningún producto con ese SKU o Nombre.' })
  }
})

// 3. API AJAX: Guardar el nuevo stock (BLINDADO)
app.post('/stock/guardar', requerirLogin, async (req, res) => {
  // Atrapamos la nueva variable "nuevo_precio_venta"
  const { id_producto, cantidad, precio_costo, nuevo_precio_venta } = req.body;
  const id_usuario = req.session.usuario.id;

  if (!id_producto) return res.json({ status: 'error', message: 'Falta el ID del producto.' });
  if (isNaN(cantidad) || cantidad <= 0) return res.json({ status: 'error', message: 'La cantidad debe ser mayor a 0.' });
  if (isNaN(precio_costo) || precio_costo < 0) return res.json({ status: 'error', message: 'El precio de costo no puede ser negativo.' });

  // Enviamos todas las variables al modelo
  const exito = await ProductoModel.registrarIngresoStock({
    id_producto, id_usuario, cantidad, precio_costo, nuevo_precio_venta
  });

  if (exito) {
    let msgAuditoria = `Ingresó ${cantidad} unidades al producto ID: ${id_producto}. Costo: $${precio_costo}.`;
    if (nuevo_precio_venta) msgAuditoria += ` Actualizó precio venta a: $${nuevo_precio_venta}`;

    await AuditoriaModel.registrar(req.session.usuario.id, 'UPDATE', 'productos_stock', id_producto, msgAuditoria);
    res.json({ status: 'success', message: 'Stock actualizado correctamente.' });
  } else {
    res.json({ status: 'error', message: 'Error al guardar en la base de datos.' });
  }
});

// ==========================================
// MÓDULO 3: CARRITO DE COMPRAS (Memoria de Sesión)
// ==========================================

// ==========================================
// API: Agregar un producto al carrito (CON VALIDACIÓN DE STOCK Y DESCUENTOS)
// ==========================================
app.post('/carrito/agregar', requerirLogin, async (req, res) => {
  const { id_producto } = req.body

  if (!req.session.carrito) req.session.carrito = []

  // 1. Buscamos el producto en BD para saber el stock y el DESCUENTO
  const productoDB = await ProductoModel.traerProductoPorId(id_producto)

  if (!productoDB) {
    return res.json({ status: 'error', message: 'El producto no existe.' })
  }

  // 🪄 MAGIA FINANCIERA: Calculamos el precio real aplicando el descuento de la base de datos
  const descuento = parseFloat(productoDB.porcentaje_descuento) || 0;
  const precioRealConDescuento = productoDB.precio * (1 - (descuento / 100));

  // 2. Revisamos si el producto YA existe adentro del carrito
  const indiceProducto = req.session.carrito.findIndex(prod => prod.id == id_producto)

  if (indiceProducto !== -1) {
    const cantidadActualEnCarrito = req.session.carrito[indiceProducto].cantidad
    if ((cantidadActualEnCarrito + 1) > productoDB.stock_actual) {
      return res.json({ status: 'error', message: `No hay más stock. Solo quedan ${productoDB.stock_actual} unidades.` })
    }
    
    // Le sumamos 1 y guardamos ambos precios para que la vista del carrito sea hermosa
    req.session.carrito[indiceProducto].precio = precioRealConDescuento;
    req.session.carrito[indiceProducto].precio_original = productoDB.precio;
    req.session.carrito[indiceProducto].cantidad += 1;
    
    return res.json({ status: 'success', message: 'Cantidad aumentada', carrito: req.session.carrito })
  } else {
    // 3. Si no existe en el carrito
    if (productoDB.stock_actual <= 0) {
      return res.json({ status: 'error', message: 'Producto agotado.' })
    }

    req.session.carrito.push({
      id: productoDB.id,
      nombre: productoDB.nombre,
      precio: precioRealConDescuento, // <--- PRECIO REBAJADO PARA COBRAR BIEN
      precio_original: productoDB.precio, // <--- PRECIO VIEJO PARA TACHÁRLO EN PANTALLA
      cantidad: 1
    })

    return res.json({ status: 'success', message: 'Producto agregado', carrito: req.session.carrito })
  }
})

// 1. API: Vaciar todo el carrito de golpe (NUEVO)
app.post('/carrito/vaciar', requerirLogin, (req, res) => {
  req.session.carrito = []
  res.json({ status: 'success', message: 'Carrito vaciado correctamente.' })
})

// 2. API: Finalizar la venta (Soporte para Pagos Múltiples y DESCUENTOS) 
app.post('/carrito/finalizar', requerirLogin, async (req, res) => {
  const carrito = req.session.carrito || [];

  // NUEVO: Atrapamos la variable "descuento"
  const { listaPagos, vuelto, cliente_id, descuento } = req.body;

  if (carrito.length === 0) return res.json({ status: 'error', message: 'El carrito está vacío.' });
  if (!listaPagos || listaPagos.length === 0) return res.json({ status: 'error', message: 'No se registraron pagos.' });

  const total = carrito.reduce((suma, item) => suma + (item.precio * item.cantidad), 0);
  const id_empleado = req.session.usuario.id;

  // Forzamos a que el descuento sea un número (si no enviaron nada, es 0)
  const descuentoAplicado = parseFloat(descuento) || 0;

  // Pasamos el descuentoAplicado al modelo
  const idVenta = await VentaModel.procesarVenta(id_empleado, carrito, total, listaPagos, vuelto, cliente_id, descuentoAplicado);

  if (idVenta) {
    req.session.carrito = [];
    res.json({ status: 'success', message: 'Venta registrada con éxito.', ticket: idVenta });
  } else {
    res.json({ status: 'error', message: 'Hubo un error al guardar en BD.' });
  }
});

// API: Ver todo lo que hay en el carrito actual
app.get('/carrito/ver', requerirLogin, (req, res) => {
  // Retorna el carrito si existe, o un arreglo vacío si aún no compró nada
  const carritoActual = req.session.carrito || []
  res.json({ status: 'success', carrito: carritoActual })
})

// API: Devolver datos del ticket para el Modal
app.get('/ventas/ticket/datos/:id', requerirLogin, async (req, res) => {
  const idVenta = req.params.id
  const datosTicket = await VentaModel.obtenerTicketVenta(idVenta)

  if (datosTicket) {
    res.json({ status: 'success', ticket: datosTicket })
  } else {
    res.json({ status: 'error', message: 'No se encontró el ticket.' })
  }
})

// API: Enviar Ticket por Email
app.post('/api/ventas/enviar-ticket', requerirLogin, ventasControlador.enviarTicketEmailAPI);

// ==========================================
// MÓDULO 4: HISTORIAL Y CAJA
// ==========================================

// API: Abrir la caja del día
app.post('/caja/abrir', requerirLogin, ventasControlador.abrirCajaAPI);

// Vista: Mostrar tabla de historial
app.get('/historial', requerirLogin, ventasControlador.mostrarHistorial)

// Ruta para ver e imprimir un ticket específico
app.get('/ventas/ticket/:id', requerirLogin, ventasControlador.verTicket);

// API: Anular Venta (El botón rojo)
app.post('/ventas/anular/:id', requerirLogin, ventasControlador.anularVentaAPI)

// API: Eliminar un producto específico del carrito
app.post('/carrito/eliminar', requerirLogin, (req, res) => {
  const { id_producto } = req.body;

  if (req.session.carrito) {
    // Filtramos el carrito: dejamos todos los productos MENOS el que queremos borrar
    req.session.carrito = req.session.carrito.filter(prod => prod.id != id_producto);
  }

  res.json({ status: 'success', message: 'Producto eliminado', carrito: req.session.carrito });
});

// ==========================================
// MÓDULO 5: CLIENTES
// ==========================================
// Vista principal
app.get('/clientes', requerirLogin, clientesControlador.listar)

// APIs para usar con AJAX (fetch)
app.get('/api/clientes/buscar', requerirLogin, clientesControlador.buscarAPI)
app.post('/api/clientes/nuevo', requerirLogin, clientesControlador.guardarAPI)
app.post('/api/clientes/editar', requerirLogin, clientesControlador.editarAPI);
app.post('/api/clientes/borrar', requerirLogin, clientesControlador.borrarAPI);

// ==========================================
// MÓDULO: CATEGORÍAS Y MARCAS (PARÁMETROS)
// ==========================================
app.get('/parametros', requerirLogin, ParametrosControlador.mostrarPantalla);
app.post('/parametros/guardar', requerirLogin, ParametrosControlador.apiGuardar);
app.post('/parametros/borrar', requerirLogin, ParametrosControlador.apiBorrar);

// ==========================================
// RUTAS DE PAGINAS LEGALES
// ==========================================
app.get('/tienda/terminos-y-condiciones', tiendaControlador.mostrarTerminos);
app.get('/tienda/arrepentimiento', tiendaControlador.mostrarArrepentimiento);
app.get('/tienda/ayuda', tiendaControlador.mostrarAyuda); // <-- NUEVA
app.post('/api/tienda/arrepentimiento', tiendaControlador.procesarArrepentimientoAPI); // <-- NUEVA

// ==========================================
// Mostrar Panel de Stock Roto / RMA (Solo Admin)
// ==========================================
app.get('/stock-defectuoso', requerirLogin, ProductosControlador.mostrarStockDefectuoso);

// CERRAR SESIÓN
app.get('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/')
})

// ==========================================
// 6. ENCENDIDO DEL SERVIDOR
// ==========================================
const PUERTO = 3000
app.listen(PUERTO, () => {
  console.log(`🚀 Servidor corriendo en: http://localhost:${PUERTO}`)
})