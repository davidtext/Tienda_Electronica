import pool from './conexion.js'

const ProductoModel = {

  traerCategorias: async () => {
    try {
      const [filas] = await pool.query('SELECT * FROM categorias ORDER BY nombre ASC')
      return filas
    } catch (error) { return [] }
  },

  contarProductos: async (categoria_id, busqueda, marca_id = null) => {
    try {
      let query = 'SELECT COUNT(*) as total FROM productos p WHERE p.activo = 1';
      let params = [];
      if (categoria_id) { query += ' AND p.FK_categoria = ?'; params.push(categoria_id); }
      if (marca_id) { query += ' AND p.FK_marca = ?'; params.push(marca_id); }
      if (busqueda) {
        const searchStr = `%${busqueda}%`;
        query += ' AND (p.nombre LIKE ? OR p.sku LIKE ?)';
        params.push(searchStr, searchStr);
      }
      const [filas] = await pool.query(query, params);
      return filas[0].total;
    } catch (error) { return 0; }
  },

  traerProductos: async (categoria_id, busqueda, limite, offset, marca_id = null) => {
    try {
      let query = `
        SELECT p.id, p.sku, p.nombre, p.descripcion, p.precio_venta as precio, 
               p.porcentaje_descuento, p.stock_actual, p.imagen, c.nombre as nombre_categoria,
               p.FK_categoria, p.FK_marca
        FROM productos p
        JOIN categorias c ON p.FK_categoria = c.id
        WHERE p.activo = 1
      `;
      let params = [];

      if (categoria_id) { query += ' AND p.FK_categoria = ?'; params.push(categoria_id); }
      if (marca_id) { query += ' AND p.FK_marca = ?'; params.push(marca_id); }
      if (busqueda) {
        const searchStr = `%${busqueda}%`;
        query += ' AND (p.nombre LIKE ? OR p.sku LIKE ?)';
        params.push(searchStr, searchStr);
      }
      query += ' ORDER BY p.id DESC';
      if (limite !== undefined && offset !== undefined) { query += ' LIMIT ? OFFSET ?'; params.push(limite, offset); }

      const [filas] = await pool.query(query, params);
      return filas;
    } catch (error) { return []; }
  },

  // AHORA GUARDA EL PORCENTAJE DE DESCUENTO
  crearProducto: async (datos) => {
    const { sku, nombre, descripcion, precio_venta, FK_categoria, FK_marca, imagen, porcentaje_descuento } = datos;
    try {
      await pool.query(
        'INSERT INTO productos (sku, nombre, descripcion, precio_venta, FK_categoria, FK_marca, imagen, porcentaje_descuento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sku, nombre, descripcion, precio_venta, FK_categoria, FK_marca, imagen, porcentaje_descuento]
      );
      return true;
    } catch (error) { return false; }
  },

  traerMarcas: async () => {
    try {
      const [filas] = await pool.query('SELECT * FROM marcas ORDER BY nombre ASC')
      return filas
    } catch (error) { return [] }
  },

  borrarProducto: async (id_producto) => {
    try {
      await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [id_producto])
      return true
    } catch (error) { return false }
  },

  buscarParaStock: async (termino_busqueda) => {
    try {
      const [filas] = await pool.query(`
        SELECT id, sku, nombre, precio_venta as precio, stock_actual 
        FROM productos 
        WHERE activo = 1 AND (sku = ? OR nombre LIKE ?)
        LIMIT 5
      `, [termino_busqueda, `%${termino_busqueda}%`])
      return filas
    } catch (error) { return [] }
  },

  registrarIngresoStock: async (datos) => {
    const { id_producto, id_usuario, cantidad, precio_costo, nuevo_precio_venta } = datos
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      await conexion.query('INSERT INTO ingresos_stock (FK_producto, FK_usuario, cantidad_ingresada, precio_costo_unitario) VALUES (?, ?, ?, ?)', [id_producto, id_usuario, cantidad, precio_costo])
      await conexion.query('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?', [cantidad, id_producto])
      if (nuevo_precio_venta !== null && nuevo_precio_venta !== undefined) {
        await conexion.query('UPDATE productos SET precio_venta = ? WHERE id = ?', [nuevo_precio_venta, id_producto])
      }
      await conexion.commit()
      return true
    } catch (error) {
      await conexion.rollback()
      return false
    } finally { conexion.release() }
  },

  traerProductoPorId: async (id_producto) => {
    try {
      const [filas] = await pool.query(`SELECT id, nombre, precio_venta as precio, stock_actual, porcentaje_descuento FROM productos WHERE id = ? AND activo = 1`, [id_producto])
      return filas[0]
    } catch (error) { return null }
  },

  desactivarProducto: async (id) => {
    try {
      await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
      return true;
    } catch (error) { return false; }
  },

  verificarSkuExistente: async (sku, id_excluir = null) => {
    try {
      let query = 'SELECT id FROM productos WHERE sku = ?';
      let params = [sku];
      if (id_excluir) { query += ' AND id != ?'; params.push(id_excluir); }
      const [filas] = await pool.query(query, params);
      return filas.length > 0; 
    } catch (error) { return true; }
  },

// ==========================================
  // ¡NUEVO! APLICAR DESCUENTO A TODA UNA CATEGORÍA O A TODA LA TIENDA
  // ==========================================
  aplicarDescuentoMasivo: async (id_categoria, porcentaje) => {
      try {
          if (id_categoria === 'TODOS') {
              // Si eligió TODOS, actualizamos la tienda entera (solo productos activos)
              await pool.query('UPDATE productos SET porcentaje_descuento = ? WHERE activo = 1', [porcentaje]);
          } else {
              // Si eligió una categoría, filtramos por el FK_categoria
              await pool.query('UPDATE productos SET porcentaje_descuento = ? WHERE FK_categoria = ? AND activo = 1', [porcentaje, id_categoria]);
          }
          return true;
      } catch (error) {
          console.error("Error al aplicar descuento masivo:", error);
          return false;
      }
  },

// ==========================================
  // ¡NUEVO! CONTAR STOCK DEFECTUOSO (Para la paginación de RMA)
  // ==========================================
  contarStockDefectuoso: async (busqueda) => {
    try {
        let query = 'SELECT COUNT(*) as total FROM productos WHERE stock_defectuoso > 0';
        let params = [];

        if (busqueda) {
            query += ' AND (nombre LIKE ? OR sku LIKE ?)';
            const searchStr = `%${busqueda}%`;
            params.push(searchStr, searchStr);
        }

        const [filas] = await pool.query(query, params);
        return filas[0].total;
    } catch (error) {
        console.error('Error al contar stock defectuoso:', error);
        return 0;
    }
  },

  // ==========================================
  // ¡NUEVO! TRAER STOCK DEFECTUOSO / RMA (CON FILTROS Y PAGINACIÓN)
  // ==========================================
  traerStockDefectuoso: async (busqueda, limite, offset) => {
      try {
          let query = `
              SELECT id, sku, nombre, precio_venta, stock_defectuoso, imagen, FK_categoria 
              FROM productos 
              WHERE stock_defectuoso > 0
          `;
          let params = [];

          if (busqueda) {
              query += ' AND (nombre LIKE ? OR sku LIKE ?)';
              const searchStr = `%${busqueda}%`;
              params.push(searchStr, searchStr);
          }

          query += ' ORDER BY nombre ASC LIMIT ? OFFSET ?';
          params.push(limite, offset);

          const [filas] = await pool.query(query, params);
          return filas;
      } catch (error) {
          console.error("Error al traer stock defectuoso:", error);
          return [];
      }
  }
}

export default ProductoModel