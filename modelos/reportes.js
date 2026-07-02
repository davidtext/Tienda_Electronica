import pool from './conexion.js';

const ReportesModel = {
    // 1. Obtener los totales generales (Ingresos, Costos, Ganancia)
    obtenerTotales: async (fechaDesde, fechaHasta) => {
        try {
            // A. Sacamos el total vendido y los descuentos
            const [ventas] = await pool.query(`
                SELECT 
                    COALESCE(SUM(total_venta), 0) as ingresos,
                    COALESCE(SUM(descuento_aplicado), 0) as descuentos
                FROM ventas
                WHERE estado = 'Completada' AND fecha_hora BETWEEN ? AND ?
            `, [fechaDesde, fechaHasta]);

            // B. Calculamos el costo cruzando lo vendido con el último precio de compra
            const [costos] = await pool.query(`
                SELECT COALESCE(SUM(dv.cantidad * (
                    SELECT precio_costo_unitario 
                    FROM ingresos_stock 
                    WHERE FK_producto = dv.FK_producto 
                    ORDER BY fecha_hora DESC LIMIT 1
                )), 0) as costo_total
                FROM detalles_venta dv
                JOIN ventas v ON dv.FK_venta = v.id
                WHERE v.estado = 'Completada' AND v.fecha_hora BETWEEN ? AND ?
            `, [fechaDesde, fechaHasta]);

            const ingresos = Number(ventas[0].ingresos);
            const descuentos = Number(ventas[0].descuentos);
            const costo = Number(costos[0].costo_total);
            const ganancia_neta = ingresos - costo;

            return { ingresos, costo, descuentos, ganancia_neta };
        } catch (error) {
            console.error('Error al obtener totales financieros:', error);
            return { ingresos: 0, costo: 0, descuentos: 0, ganancia_neta: 0 };
        }
    },

    // 2. Obtener el desglose por Método de Pago
    obtenerPagosAgrupados: async (fechaDesde, fechaHasta) => {
        try {
            const [filas] = await pool.query(`
                SELECT pv.metodo_pago, SUM(pv.monto) as total
                FROM pagos_venta pv
                JOIN ventas v ON pv.FK_venta = v.id
                WHERE v.estado = 'Completada' AND v.fecha_hora BETWEEN ? AND ?
                GROUP BY pv.metodo_pago
                ORDER BY total DESC
            `, [fechaDesde, fechaHasta]);
            return filas;
        } catch (error) {
            console.error('Error al obtener pagos:', error);
            return [];
        }
    },

    // 3. Ranking de Rentabilidad de Productos
    obtenerRankingRentabilidad: async (fechaDesde, fechaHasta) => {
        try {
            const [filas] = await pool.query(`
                SELECT 
                    p.nombre,
                    SUM(dv.cantidad) as unidades_vendidas,
                    SUM(dv.cantidad * dv.precio_unitario) as ingresos_generados,
                    COALESCE((SELECT precio_costo_unitario FROM ingresos_stock WHERE FK_producto = p.id ORDER BY fecha_hora DESC LIMIT 1), 0) as costo_unitario,
                    (SUM(dv.cantidad * dv.precio_unitario) - SUM(dv.cantidad * COALESCE((SELECT precio_costo_unitario FROM ingresos_stock WHERE FK_producto = p.id ORDER BY fecha_hora DESC LIMIT 1), 0))) as ganancia_neta
                FROM detalles_venta dv
                JOIN productos p ON dv.FK_producto = p.id
                JOIN ventas v ON dv.FK_venta = v.id
                WHERE v.estado = 'Completada' AND v.fecha_hora BETWEEN ? AND ?
                GROUP BY p.id, p.nombre
                ORDER BY ganancia_neta DESC
                LIMIT 15
            `, [fechaDesde, fechaHasta]);
            return filas;
        } catch (error) {
            console.error('Error al obtener ranking:', error);
            return [];
        }
    }
};

export default ReportesModel;