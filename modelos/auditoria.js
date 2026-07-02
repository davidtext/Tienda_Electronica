import pool from './conexion.js';

const AuditoriaModel = {
    // 1. Función central para registrar (La que ya teníamos)
    registrar: async (id_usuario, accion, tabla, registro_id, detalle) => {
        try {
            await pool.query(
                'INSERT INTO auditoria_logs (FK_usuario, accion, tabla_afectada, registro_id, detalle) VALUES (?, ?, ?, ?, ?)',
                [id_usuario, accion, tabla, registro_id, detalle]
            );
            return true;
        } catch (error) {
            console.error('Error al registrar log de auditoría:', error);
            return false;
        }
    },

    // 2. NUEVA: Obtener el historial paginado y con buscador
    obtenerHistorialPaginado: async (pagina = 1, limite = 15, busqueda = '') => {
        const offset = (pagina - 1) * limite;
        
        let query = `
            SELECT a.id, a.accion, a.tabla_afectada, a.fecha_hora, a.detalle,
                   e.nombre, e.apellido, u.email_acceso
            FROM auditoria_logs a
            JOIN usuarios u ON a.FK_usuario = u.id
            JOIN empleados e ON u.FK_empleado = e.id
        `;
        
        let countQuery = `
            SELECT COUNT(*) as total
            FROM auditoria_logs a
            JOIN usuarios u ON a.FK_usuario = u.id
            JOIN empleados e ON u.FK_empleado = e.id
        `;
        
        let params = [];
        let countParams = [];

        // Si el usuario escribió algo en el buscador
        if (busqueda) {
            const searchStr = `%${busqueda}%`;
            const whereClause = ` WHERE e.nombre LIKE ? OR e.apellido LIKE ? OR a.accion LIKE ? OR a.tabla_afectada LIKE ? `;
            query += whereClause;
            countQuery += whereClause;
            // Metemos el texto 4 veces (una por cada columna que queremos buscar)
            params.push(searchStr, searchStr, searchStr, searchStr);
            countParams.push(searchStr, searchStr, searchStr, searchStr);
        }

        // Ordenamos por los más recientes y aplicamos el límite (Paginación)
        query += ` ORDER BY a.fecha_hora DESC LIMIT ? OFFSET ?`;
        params.push(limite, offset);

        try {
            const [filas] = await pool.query(query, params);
            const [totalFilas] = await pool.query(countQuery, countParams);
            
            const total = totalFilas[0].total;
            const totalPaginas = Math.ceil(total / limite);
            
            return { logs: filas, total, paginas: totalPaginas };
        } catch (error) {
            console.error('Error al obtener logs paginados:', error);
            return { logs: [], total: 0, paginas: 0 };
        }
    }
};

export default AuditoriaModel;