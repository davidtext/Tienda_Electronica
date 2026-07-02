import pool from './conexion.js'

const ClienteModel = {
    // 1. Contar para Paginación
    contarClientes: async (busqueda) => {
        try {
            let query = 'SELECT COUNT(*) as total FROM clientes WHERE activo = 1';
            let params = [];
            if (busqueda) {
                query += ' AND (dni_cuil LIKE ? OR nombre LIKE ? OR apellido LIKE ?)';
                const searchStr = `%${busqueda}%`;
                params.push(searchStr, searchStr, searchStr);
            }
            const [filas] = await pool.query(query, params);
            return filas[0].total;
        } catch (error) {
            console.error('Error al contar clientes:', error);
            return 0;
        }
    },

    // 2. Obtener clientes paginados y buscados
    obtenerPaginados: async (busqueda, limite, offset) => {
        try {
            let query = 'SELECT * FROM clientes WHERE activo = 1';
            let params = [];

            if (busqueda) {
                query += ' AND (dni_cuil LIKE ? OR nombre LIKE ? OR apellido LIKE ?)';
                const searchStr = `%${busqueda}%`;
                params.push(searchStr, searchStr, searchStr);
            }

            query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
            params.push(limite, offset);

            const [filas] = await pool.query(query, params);
            return filas;
        } catch (error) {
            console.error('Error al traer clientes:', error);
            return [];
        }
    },

    // 3. Buscar (Usado para el buscador en tiempo real del POS)
    buscar: async (termino) => {
        try {
            const [filas] = await pool.query(`
                SELECT id, nombre, apellido, dni_cuil, email 
                FROM clientes 
                WHERE activo = 1 AND (dni_cuil LIKE ? OR nombre LIKE ? OR apellido LIKE ?)
                LIMIT 10
            `, [`%${termino}%`, `%${termino}%`, `%${termino}%`])
            return filas;
        } catch (error) {
            console.error('Error al buscar cliente:', error);
            return [];
        }
    },

    // =====================================
    // VALIDACIONES LÓGICAS (NUEVO)
    // =====================================
    verificarDocumento: async (dni, id_excluir = null) => {
        let query = 'SELECT id FROM clientes WHERE dni_cuil = ? AND activo = 1';
        let params = [dni];
        if (id_excluir) { query += ' AND id != ?'; params.push(id_excluir); }
        const [filas] = await pool.query(query, params);
        return filas.length > 0;
    },

    verificarEmail: async (email, id_excluir = null) => {
        let query = 'SELECT id FROM clientes WHERE email = ? AND activo = 1';
        let params = [email];
        if (id_excluir) { query += ' AND id != ?'; params.push(id_excluir); }
        const [filas] = await pool.query(query, params);
        return filas.length > 0;
    },

    // 4. Crear
    crear: async (datos) => {
        const { nombre, apellido = '', dni_cuil = '', telefono = '', email = '' } = datos;
        try {
            const [resultado] = await pool.query(
                'INSERT INTO clientes (nombre, apellido, dni_cuil, telefono, email) VALUES (?, ?, ?, ?, ?)',
                [nombre, apellido, dni_cuil, telefono, email]
            );
            return resultado.insertId;
        } catch (error) {
            console.error('Error al crear cliente:', error);
            return null;
        }
    },

    // 5. Editar
    editar: async (id, datos) => {
        const { nombre, apellido = '', dni_cuil = '', telefono = '', email = '' } = datos;
        try {
            await pool.query(
                'UPDATE clientes SET nombre = ?, apellido = ?, dni_cuil = ?, telefono = ?, email = ? WHERE id = ?',
                [nombre, apellido, dni_cuil, telefono, email, id]
            );
            return true;
        } catch (error) {
            console.error('Error al editar cliente:', error);
            return false;
        }
    },

    // 6. Baja Lógica (Borrar)
    borrar: async (id) => {
        try {
            await pool.query('UPDATE clientes SET activo = 0 WHERE id = ?', [id]);
            return true;
        } catch (error) {
            console.error('Error al borrar cliente:', error);
            return false;
        }
    }
}

export default ClienteModel;