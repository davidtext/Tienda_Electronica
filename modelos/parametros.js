import pool from './conexion.js';

const ParametrosModel = {
  // 1. Traer datos paginados (Sirve para ambas tablas)
  obtenerPagina: async (tabla, busqueda, limite, offset) => {
    let query = `SELECT * FROM ${tabla} WHERE activo = 1`;
    let params = [];
    if (busqueda) { query += ' AND nombre LIKE ?'; params.push(`%${busqueda}%`); }
    query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limite, offset);
    const [filas] = await pool.query(query, params);
    return filas;
  },

  // 2. Contar para la paginación
  contar: async (tabla, busqueda) => {
    let query = `SELECT COUNT(*) as total FROM ${tabla} WHERE activo = 1`;
    let params = [];
    if (busqueda) { query += ' AND nombre LIKE ?'; params.push(`%${busqueda}%`); }
    const [filas] = await pool.query(query, params);
    return filas[0].total;
  },

  // 3. VALIDACIÓN LÓGICA: Evitar nombres duplicados ("Samsung" dos veces)
  verificarNombre: async (tabla, nombre, id_excluir = null) => {
    let query = `SELECT id FROM ${tabla} WHERE nombre = ? AND activo = 1`;
    let params = [nombre];
    if (id_excluir) { query += ' AND id != ?'; params.push(id_excluir); }
    const [filas] = await pool.query(query, params);
    return filas.length > 0;
  },

  // 4. Crear y Editar
  crear: async (tabla, nombre) => {
    await pool.query(`INSERT INTO ${tabla} (nombre) VALUES (?)`, [nombre]);
    return true;
  },
  editar: async (tabla, id, nombre) => {
    await pool.query(`UPDATE ${tabla} SET nombre = ? WHERE id = ?`, [nombre, id]);
    return true;
  },

  // 5. VALIDACIÓN LÓGICA ESTRELLA: Evitar que borren si está en uso
  verificarUsoEnProductos: async (campo_fk, id) => {
    // Busca si hay al menos 1 producto usando esta marca o categoria
    const [filas] = await pool.query(`SELECT id FROM productos WHERE ${campo_fk} = ? AND activo = 1 LIMIT 1`, [id]);
    return filas.length > 0;
  },

  // 6. Baja Lógica
  borrar: async (tabla, id) => {
    await pool.query(`UPDATE ${tabla} SET activo = 0 WHERE id = ?`, [id]);
    return true;
  }
};

export default ParametrosModel;