import pool from './conexion.js';

const DashboardModel = {
    // 1. Tarjetas Superiores
    obtenerMetricasGenerales: async () => {
        const [ventasHoy] = await pool.query(`SELECT COALESCE(SUM(total_venta), 0) as total FROM ventas WHERE DATE(fecha_hora) = CURDATE() AND estado = 'Completada'`);
        const [ventasMes] = await pool.query(`SELECT COALESCE(SUM(total_venta), 0) as total FROM ventas WHERE MONTH(fecha_hora) = MONTH(CURDATE()) AND YEAR(fecha_hora) = YEAR(CURDATE()) AND estado = 'Completada'`);
        const [clientesTotales] = await pool.query(`SELECT COUNT(*) as total FROM clientes WHERE activo = 1`);
        
        return {
            ventasHoy: ventasHoy[0].total,
            ventasMes: ventasMes[0].total,
            totalClientes: clientesTotales[0].total
        };
    },

    // 2. Gráfico de los últimos 7 días
    obtenerVentasUltimos7Dias: async () => {
        const [filas] = await pool.query(`
            SELECT DATE(fecha_hora) as fecha, SUM(total_venta) as total
            FROM ventas
            WHERE fecha_hora >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND estado = 'Completada'
            GROUP BY DATE(fecha_hora)
            ORDER BY fecha ASC
        `);
        return filas;
    },

    // 3. Top 5 Productos
    obtenerTopProductos: async () => {
        const [filas] = await pool.query(`
            SELECT p.nombre, SUM(d.cantidad) as total_vendido
            FROM detalles_venta d
            JOIN ventas v ON d.FK_venta = v.id
            JOIN productos p ON d.FK_producto = p.id
            WHERE v.estado = 'Completada'
            GROUP BY d.FK_producto
            ORDER BY total_vendido DESC
            LIMIT 5
        `);
        return filas;
    },

    // 4. Alertas de Stock Crítico
    obtenerAlertasStock: async () => {
        const [filas] = await pool.query(`
            SELECT nombre, stock_actual, stock_minimo
            FROM productos
            WHERE stock_actual <= stock_minimo AND activo = 1
            ORDER BY stock_actual ASC
        `);
        return filas;
    },

    // 5. NUEVO: Ranking de Vendedores del Mes
    obtenerRankingVendedores: async () => {
        const [filas] = await pool.query(`
            SELECT e.nombre, e.apellido, SUM(v.total_venta) as total_recaudado, COUNT(v.id) as cantidad_ventas
            FROM ventas v
            JOIN usuarios u ON v.FK_usuario = u.id
            JOIN empleados e ON u.FK_empleado = e.id
            WHERE v.estado = 'Completada' AND MONTH(v.fecha_hora) = MONTH(CURDATE()) AND YEAR(v.fecha_hora) = YEAR(CURDATE())
            GROUP BY u.id
            ORDER BY total_recaudado DESC
            LIMIT 5
        `);
        return filas;
    },

    // 6. NUEVO: Feed de Actividad (Últimos 7 movimientos)
    obtenerFeedActividad: async () => {
        const [filas] = await pool.query(`
            SELECT a.accion, a.tabla_afectada, a.fecha_hora, a.detalle, e.nombre as empleado_nombre, e.apellido as empleado_apellido
            FROM auditoria_logs a
            JOIN usuarios u ON a.FK_usuario = u.id
            JOIN empleados e ON u.FK_empleado = e.id
            ORDER BY a.fecha_hora DESC
            LIMIT 7
        `);
        return filas;
    }
};

export default DashboardModel;