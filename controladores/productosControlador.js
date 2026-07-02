import ProductoModel from '../modelos/productos.js';
import AuditoriaModel from '../modelos/auditoria.js';
import pool from '../modelos/conexion.js';

const ProductosControlador = {

  mostrarCatalogo: async (req, res) => {
    const categoria = req.query.categoria || null;
    const busqueda = req.query.busqueda || null;
    const marca = req.query.marca || null; 
    
    const limite = 12; 
    const paginaActual = parseInt(req.query.pagina) || 1; 
    const offset = (paginaActual - 1) * limite;

    const totalProductos = await ProductoModel.contarProductos(categoria, busqueda, marca);
    const totalPaginas = Math.ceil(totalProductos / limite);

    const productos = await ProductoModel.traerProductos(categoria, busqueda, limite, offset, marca);
    const categorias = await ProductoModel.traerCategorias();
    const marcas = await ProductoModel.traerMarcas(); 

    let urlBase = '/productos?';
    if (categoria) urlBase += `categoria=${categoria}&`;
    if (marca) urlBase += `marca=${marca}&`; 
    if (busqueda) urlBase += `busqueda=${busqueda}&`;

    res.render('productos', { 
      usuario: req.session.usuario, productos, categorias, marcas, 
      categoriaActual: categoria, marcaActual: marca, busquedaActual: busqueda,
      paginaActual, totalPaginas, urlBase
    });
  },

  mostrarGestion: async (req, res) => {
    try {
      const busqueda = req.query.busqueda || '';
      const paginaActual = parseInt(req.query.pagina) || 1;
      const limite = 10; 
      const offset = (paginaActual - 1) * limite;

      const totalProductos = await ProductoModel.contarProductos(null, busqueda);
      const totalPaginas = Math.ceil(totalProductos / limite);

      const listaProductos = await ProductoModel.traerProductos(null, busqueda, limite, offset);
      const listaCategorias = await ProductoModel.traerCategorias();
      const listaMarcas = await ProductoModel.traerMarcas();

      res.render('gestion_productos', {
        usuario: req.session.usuario, productos: listaProductos, categorias: listaCategorias, marcas: listaMarcas,
        paginaActual, totalPaginas, busqueda      
      });
    } catch (error) { res.redirect('/menu'); }
  },

  // GUARDAR PRODUCTO CON DESCUENTO
  guardarNuevoProducto: async (req, res) => {
    // Atrapamos el descuento (Si viene vacío, es 0)
    const { sku, nombre, descripcion, precio_venta, FK_categoria, FK_marca, porcentaje_descuento } = req.body;
    const descuento = porcentaje_descuento || 0;

    if (!sku || !nombre || !precio_venta || !FK_categoria || !FK_marca) return res.json({ status: 'error', message: 'Faltan datos obligatorios.' });
    if (precio_venta < 0) return res.json({ status: 'error', message: 'El precio no puede ser negativo.' });

    const skuExiste = await ProductoModel.verificarSkuExistente(sku);
    if (skuExiste) return res.json({ status: 'error', message: `El código SKU '${sku}' ya está registrado.` });

    try {
      const archivos = req.files || [];
      const imagenPrincipal = archivos.length > 0 ? `/assets/images/productos/${archivos[0].filename}` : '/assets/images/productos/default.png';

      // Pasamos el descuento al modelo
      const exito = await ProductoModel.crearProducto({ sku, nombre, descripcion, precio_venta, FK_categoria, FK_marca, imagen: imagenPrincipal, porcentaje_descuento: descuento });

      if (exito) {
        const [ultimoProd] = await pool.query("SELECT id FROM productos WHERE sku = ? LIMIT 1", [sku]);
        const id_nuevo_producto = ultimoProd[0].id;

        if (archivos.length > 0) {
          for (let i = 0; i < archivos.length; i++) {
            const ruta = `/assets/images/productos/${archivos[i].filename}`;
            const esPrincipal = i === 0 ? 1 : 0; 
            await pool.query("INSERT INTO productos_imagenes (FK_producto, ruta_imagen, es_principal) VALUES (?, ?, ?)", [id_nuevo_producto, ruta, esPrincipal]);
          }
        }
        await AuditoriaModel.registrar(req.session.usuario.id, 'INSERT', 'productos', id_nuevo_producto, `Dio de alta el producto: ${nombre}`);
        res.json({ status: 'success', message: 'Producto creado exitosamente.' });
      } else { res.json({ status: 'error', message: 'Error interno en la base de datos.' }); }
    } catch (err) { res.json({ status: 'error', message: 'Error al procesar los archivos.' }); }
  },

  // EDITAR PRODUCTO CON DESCUENTO
  editarProductoAPI: async (req, res) => {
    const { id, nombre, descripcion, precio_venta, FK_categoria, FK_marca, porcentaje_descuento } = req.body;
    const descuento = porcentaje_descuento || 0;

    if (!nombre || !precio_venta || !FK_categoria || !FK_marca) return res.json({ status: 'error', message: 'Faltan datos obligatorios.' });

    try {
      const archivos = req.files || [];
      // Actualizamos también la columna de descuento
      let queryModificar = 'UPDATE productos SET nombre = ?, descripcion = ?, precio_venta = ?, FK_categoria = ?, FK_marca = ?, porcentaje_descuento = ?';
      let parametros = [nombre, descripcion, precio_venta, FK_categoria, FK_marca, descuento];

      if (archivos.length > 0) {
        const nuevaPortada = `/assets/images/productos/${archivos[0].filename}`;
        queryModificar += ', imagen = ?';
        parametros.push(nuevaPortada);
      }
      queryModificar += ' WHERE id = ?';
      parametros.push(id);
      
      await pool.query(queryModificar, parametros);

      if (archivos.length > 0) {
        for (let i = 0; i < archivos.length; i++) {
          const ruta = `/assets/images/productos/${archivos[i].filename}`;
          await pool.query("INSERT INTO productos_imagenes (FK_producto, ruta_imagen, es_principal) VALUES (?, ?, 0)", [id, ruta]);
        }
      }
      await AuditoriaModel.registrar(req.session.usuario.id, 'UPDATE', 'productos', id, `Modificó datos del producto: ${nombre}`);
      res.json({ status: 'success', message: 'Producto actualizado con éxito.' });
    } catch (error) { res.json({ status: 'error', message: 'Error interno en el servidor.' }); }
  },

// ¡NUEVO! API DESCUENTO MASIVO POR CATEGORÍA O GLOBAL
  aplicarDescuentoMasivoAPI: async (req, res) => {
      const { id_categoria, porcentaje } = req.body;
      
      if (!id_categoria || porcentaje === undefined) {
          return res.json({ status: 'error', message: 'Faltan datos.' });
      }

      const exito = await ProductoModel.aplicarDescuentoMasivo(id_categoria, porcentaje);
      
      if (exito) {
          // Registramos en la auditoría qué tipo de rebaja hizo
          let msjAuditoria = id_categoria === 'TODOS' 
              ? `Aplicó descuento masivo del ${porcentaje}% a TODO EL CATÁLOGO.` 
              : `Aplicó descuento masivo del ${porcentaje}% a la categoría ID: ${id_categoria}`;
              
          await AuditoriaModel.registrar(req.session.usuario.id, 'UPDATE', 'productos', 0, msjAuditoria);
          res.json({ status: 'success', message: `Descuento del ${porcentaje}% aplicado con éxito.` });
      } else {
          res.json({ status: 'error', message: 'Error al aplicar el descuento masivo.' });
      }
  },

  borrarProductoAPI: async (req, res) => {
    const id_producto = req.body.id;
    const exito = await ProductoModel.desactivarProducto(id_producto);
    if (exito) {
      await AuditoriaModel.registrar(req.session.usuario.id, 'DELETE', 'productos', id_producto, `Baja de producto: ${id_producto}`);
      res.json({ status: 'success', message: 'Producto eliminado.' });
    } else { res.json({ status: 'error', message: 'Error al borrar.' }); }
  },

// ==========================================
  // ¡NUEVO! MOSTRAR PANTALLA DE STOCK DEFECTUOSO (CON BUSCADOR Y PAGINADO)
  // ==========================================
  mostrarStockDefectuoso: async (req, res) => {
      if (req.session.usuario.rol_id !== 1) {
          return res.redirect('/menu');
      }

      try {
          // 1. Atrapamos los parámetros que viajan por la URL (?busqueda=...&pagina=...)
          const busqueda = req.query.busqueda || '';
          const paginaActual = parseInt(req.query.pagina) || 1;
          const limite = 10; // 10 productos defectuosos por página
          const offset = (paginaActual - 1) * limite;

          // 2. Ejecutamos la matemática y las consultas paginadas
          const totalRotos = await ProductoModel.contarStockDefectuoso(busqueda);
          const totalPaginas = Math.ceil(totalRotos / limite);
          const productosRotos = await ProductoModel.traerStockDefectuoso(busqueda, limite, offset);
          
          // 3. Calculamos de forma global TODA la plata estancada (sin importar el filtro de la página)
          const [sumaTotal] = await pool.query('SELECT SUM(precio_venta * stock_defectuoso) as total FROM productos WHERE stock_defectuoso > 0');
          const totalDineroRetenido = sumaTotal[0].total || 0;

          // 4. Construimos la URL base para que cambiar de página no te borre lo que escribiste en el buscador
          let urlBase = '/stock-defectuoso?';
          if (busqueda) urlBase += `busqueda=${busqueda}&`;

          res.render('stock_defectuoso', {
              usuario: req.session.usuario,
              productosRotos: productosRotos,
              totalRetenido: totalDineroRetenido,
              busquedaActual: busqueda,
              paginaActual: paginaActual,
              totalPaginas: totalPaginas,
              urlBase: urlBase
          });
      } catch (error) {
          console.error('Error al cargar la vista de stock defectuoso:', error);
          res.redirect('/menu');
      }
  }
};

export default ProductosControlador;