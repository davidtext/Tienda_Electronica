import pool from './conexion.js'
import AuditoriaModel from './auditoria.js';

const VentaModel = {
  // ==========================================
  // FUNCIÓN 1: Procesar Venta (CON DESCUENTO)
  // ==========================================
  procesarVenta: async (id_usuario, carrito, total_venta, listaPagos, vuelto, id_cliente, descuento_aplicado) => {
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()

      let metodoPrincipal = listaPagos.length === 1 ? listaPagos[0].metodo : 'Múltiple';

      // NUEVO: Insertamos también el descuento_aplicado
      const [resVenta] = await conexion.query(
        'INSERT INTO ventas (FK_usuario, FK_cliente, total_venta, descuento_aplicado, metodo_pago, vuelto) VALUES (?, ?, ?, ?, ?, ?)',
        [id_usuario, id_cliente, total_venta, descuento_aplicado, metodoPrincipal, vuelto]
      )
      const id_nueva_venta = resVenta.insertId

      for (const pago of listaPagos) {
        await conexion.query(
          'INSERT INTO pagos_venta (FK_venta, metodo_pago, monto) VALUES (?, ?, ?)',
          [id_nueva_venta, pago.metodo, pago.monto]
        )
      }

      for (const item of carrito) {
        await conexion.query(
          'INSERT INTO detalles_venta (FK_venta, FK_producto, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
          [id_nueva_venta, item.id, item.cantidad, item.precio]
        )
        await conexion.query(
          'UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?',
          [item.cantidad, item.id]
        )
      }

      await conexion.commit()
      // AUDITORÍA
      await AuditoriaModel.registrar(
        id_usuario, 'INSERT', 'ventas', id_nueva_venta,
        `Realizó una venta por $${total_venta.toLocaleString('es-AR')} con descuento de $${descuento_aplicado.toLocaleString('es-AR')}`
      );
      return id_nueva_venta
    } catch (error) {
      await conexion.rollback()
      console.error('Error Crítico al procesar la venta en BD:', error)
      return false
    } finally {
      conexion.release()
    }
  },

// ==========================================
  // FUNCIÓN 2: Traer datos para el Ticket (CON SOPORTE DE DOBLE DESCUENTO)
  // ==========================================
  obtenerTicketVenta: async (id_venta) => {
    try {
      const [venta] = await pool.query(`
        SELECT v.id, v.fecha_hora, v.total_venta, v.descuento_aplicado, v.metodo_pago, v.vuelto, 
               e.nombre, e.apellido, e.dni,
               c.nombre as cli_nombre, c.apellido as cli_apellido, c.dni_cuil as cli_dni, c.email as cli_email
        FROM ventas v
        JOIN usuarios u ON v.FK_usuario = u.id
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN clientes c ON v.FK_cliente = c.id
        WHERE v.id = ?
      `, [id_venta])

      if (venta.length === 0) return null;

      // MODIFICACIÓN CLAVE: Cruzamos con la tabla productos para traer el precio base y su % de descuento original
      const [detalles] = await pool.query(`
        SELECT d.cantidad, d.precio_unitario, p.nombre as producto, p.sku,
               p.precio_venta AS precio_original_base, p.porcentaje_descuento AS descuento_catalogo
        FROM detalles_venta d
        JOIN productos p ON d.FK_producto = p.id
        WHERE d.FK_venta = ?
      `, [id_venta])

      const [pagos] = await pool.query(`
        SELECT metodo_pago, monto FROM pagos_venta WHERE FK_venta = ?
      `, [id_venta])

      return { cabecera: venta[0], detalles: detalles, pagos: pagos }
    } catch (error) {
      console.error('Error al obtener el ticket:', error)
      return null;
    }
  },

  // ==========================================
  // FUNCIÓN 3A: Contar ventas para la paginación
  // ==========================================
  contarHistorial: async (busqueda, fecha) => {
    try {
      let query = `
        SELECT COUNT(*) as total 
        FROM ventas v
        JOIN usuarios u ON v.FK_usuario = u.id
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN clientes c ON v.FK_cliente = c.id
        WHERE 1=1
      `;
      let params = [];

      if (fecha) {
        query += ` AND DATE(v.fecha_hora) = ?`;
        params.push(fecha);
      }

      if (busqueda) {
        const searchStr = `%${busqueda}%`;
        // Busca por Ticket, Cajero o Cliente
        query += ` AND (v.id LIKE ? OR e.nombre LIKE ? OR e.apellido LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ?)`;
        params.push(searchStr, searchStr, searchStr, searchStr, searchStr);
      }

      const [filas] = await pool.query(query, params);
      return filas[0].total;
    } catch (error) {
      console.error('Error al contar historial:', error);
      return 0;
    }
  },

  // ==========================================
  // FUNCIÓN 3B: Obtener el Historial Paginado y Filtrado
  // ==========================================
  obtenerHistorialPaginado: async (busqueda, fecha, limite, offset) => {
    try {
      let query = `
        SELECT v.id, v.fecha_hora, v.total_venta, v.metodo_pago, v.estado, 
               e.nombre, e.apellido, c.nombre as cli_nombre, c.apellido as cli_apellido
        FROM ventas v
        JOIN usuarios u ON v.FK_usuario = u.id
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN clientes c ON v.FK_cliente = c.id
        WHERE 1=1
      `;
      let params = [];

      if (fecha) {
        query += ` AND DATE(v.fecha_hora) = ?`;
        params.push(fecha);
      }

      if (busqueda) {
        const searchStr = `%${busqueda}%`;
        query += ` AND (v.id LIKE ? OR e.nombre LIKE ? OR e.apellido LIKE ? OR c.nombre LIKE ? OR c.apellido LIKE ?)`;
        params.push(searchStr, searchStr, searchStr, searchStr, searchStr);
      }

      query += ` ORDER BY v.fecha_hora DESC LIMIT ? OFFSET ?`;
      params.push(limite, offset);

      const [filas] = await pool.query(query, params);
      return filas;
    } catch (error) {
      console.error('Error al obtener el historial paginado:', error);
      return [];
    }
  },

// ==========================================
  // FUNCIÓN 4: Anular una Venta (Desvío de Stock Inteligente)
  // ==========================================
  anularVenta: async (id_venta, motivo) => {
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()

      const [venta] = await conexion.query('SELECT estado FROM ventas WHERE id = ?', [id_venta])
      if (venta.length === 0 || venta[0].estado === 'Anulada') {
        throw new Error('La venta no existe o ya está anulada')
      }

      // 1. Ocultamos la venta
      await conexion.query('UPDATE ventas SET estado = ?, activo = 0 WHERE id = ?', ['Anulada', id_venta])

      // 2. Traemos todos los productos que se vendieron en ese ticket
      const [detalles] = await conexion.query('SELECT FK_producto, cantidad FROM detalles_venta WHERE FK_venta = ?', [id_venta])

      // 3. LA GRAN BIFURCACIÓN: Repartimos el stock según el motivo
      for (const item of detalles) {
        if (motivo === 'normal') {
          // Vuelve a la vitrina para venderse a otra persona
          await conexion.query(
            'UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?',
            [item.cantidad, item.FK_producto]
          )
        } else {
          // Va directo a la caja fuerte del depósito (Stock Defectuoso) para tramitar la garantía
          await conexion.query(
            'UPDATE productos SET stock_defectuoso = stock_defectuoso + ? WHERE id = ?',
            [item.cantidad, item.FK_producto]
          )
        }
      }

      await conexion.commit()
      return true
    } catch (error) {
      await conexion.rollback()
      console.error('Error al anular la venta:', error)
      return false
    } finally {
      conexion.release()
    }
  },

  // ==========================================
  // FUNCIÓN: Abrir la Caja del Día
  // ==========================================
  abrirCaja: async (monto_inicial, id_usuario) => {
    try {
      await pool.query(
        'INSERT INTO caja_diaria (fecha, monto_inicial, FK_usuario_apertura) VALUES (CURDATE(), ?, ?)',
        [monto_inicial, id_usuario]
      );
      return true;
    } catch (error) {
      console.error('Error al abrir caja:', error);
      return false;
    }
  },

  // ==========================================
  // FUNCIÓN: Resumen de Caja del Día (AHORA CON FONDO INICIAL)
  // ==========================================
  obtenerResumenCajaHoy: async () => {
    try {
      // 1. Buscamos si la caja se abrió hoy y traemos el fondo inicial
      const [cajaApertura] = await pool.query('SELECT monto_inicial FROM caja_diaria WHERE fecha = CURDATE()');
      const montoFondo = cajaApertura.length > 0 ? Number(cajaApertura[0].monto_inicial) : 0;
      const estadoCaja = cajaApertura.length > 0 ? 'Abierta' : 'Cerrada';

      // 2. Sumamos lo cobrado
      const [filas] = await pool.query(`
        SELECT 
            COALESCE(SUM(CASE WHEN pv.metodo_pago = 'Efectivo' THEN pv.monto ELSE 0 END), 0) as total_efectivo,
            COALESCE(SUM(CASE WHEN pv.metodo_pago != 'Efectivo' THEN pv.monto ELSE 0 END), 0) as total_digital
        FROM pagos_venta pv
        JOIN ventas v ON pv.FK_venta = v.id
        WHERE v.estado = 'Completada' AND DATE(v.fecha_hora) = CURDATE()
      `);

      // 3. Sumamos los vueltos entregados
      const [vueltos] = await pool.query(`
        SELECT COALESCE(SUM(vuelto), 0) as total_vueltos
        FROM ventas 
        WHERE estado = 'Completada' AND DATE(fecha_hora) = CURDATE()
      `);

      const totalEf = Number(filas[0].total_efectivo);
      const totalDig = Number(filas[0].total_digital);
      const totVueltos = Number(vueltos[0].total_vueltos);

      // MATEMÁTICA LIMPIA: Al efectivo en el cajón le sumamos el Fondo Inicial
      const total_efectivo_real = (totalEf + montoFondo) - totVueltos;
      const total_general = total_efectivo_real + totalDig;

      return {
        estado_caja: estadoCaja,
        monto_inicial: montoFondo,
        total_efectivo: total_efectivo_real,
        total_digital: totalDig,
        total_general: total_general
      };
    } catch (error) {
      console.error('Error al calcular la caja de hoy:', error);
      return { estado_caja: 'Error', monto_inicial: 0, total_efectivo: 0, total_digital: 0, total_general: 0 };
    }
  }
}

export default VentaModel