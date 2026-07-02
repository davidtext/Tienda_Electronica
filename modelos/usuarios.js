// modelos/usuarios.js
import pool from './conexion.js'
import bcrypt from 'bcryptjs' // Node permite importar dentro de funciones si es necesario

const UsuarioModel = {

  verificarSiHayUsuarios: async () => {
    try {
      const [filas] = await pool.query('SELECT COUNT(*) as total FROM usuarios WHERE activo = 1')
      return filas[0].total
    } catch (error) {
      console.error('Error al contar usuarios:', error)
      return 0
    }
  },

  crearUsuarioAdmin: async (datos) => {
    const { nombre, apellido, dni, email_acceso, password_encriptada } = datos
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      const [resultadoEmpleado] = await conexion.query(
        'INSERT INTO empleados (nombre, apellido, dni) VALUES (?, ?, ?)',
        [nombre, apellido, dni]
      )
      const idEmpleadoCreado = resultadoEmpleado.insertId
      // requiere_cambio_password = 0 porque el admin ya elige su clave en el setup
      await conexion.query(
        'INSERT INTO usuarios (email_acceso, password, FK_rol, FK_empleado, requiere_cambio_password) VALUES (?, ?, ?, ?, 0)',
        [email_acceso, password_encriptada, 1, idEmpleadoCreado]
      )
      await conexion.commit()
      return true
    } catch (error) {
      await conexion.rollback()
      console.error('Error Crítico al crear el Admin:', error)
      return false
    } finally {
      conexion.release()
    }
  },

  buscarPorEmail: async (email_acceso) => {
    try {
      const [filas] = await pool.query(`
        SELECT 
          u.id as id_usuario, 
          u.email_acceso, 
          u.password, 
          u.requiere_cambio_password,
          u.FK_rol as rol_id,
          r.nombre as rol_nombre,
          e.nombre, 
          e.apellido, 
          e.dni 
        FROM usuarios u
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN roles r ON u.FK_rol = r.id
        WHERE u.email_acceso = ? AND u.activo = 1
      `, [email_acceso])
      return filas[0]
    } catch (error) {
      console.error('Error al buscar usuario por email:', error)
      return null
    }
  },

  // =====================================
  // NUEVAS FUNCIONES DE VALIDACIÓN Y LISTADO
  // =====================================
  
  verificarDni: async (dni, id_empleado_excluir = null) => {
    let query = 'SELECT id FROM empleados WHERE dni = ? AND activo = 1';
    let params = [dni];
    if (id_empleado_excluir) { query += ' AND id != ?'; params.push(id_empleado_excluir); }
    const [filas] = await pool.query(query, params);
    return filas.length > 0;
  },

verificarEmailDuplicado: async (email, id_usuario_excluir = null) => {
    let query = 'SELECT id FROM usuarios WHERE email_acceso = ? AND activo = 1';
    let params = [email];
    
    // Si estamos editando, ignoramos el ID del usuario actual para que no choque consigo mismo
    if (id_usuario_excluir) { 
        query += ' AND id != ?'; 
        params.push(id_usuario_excluir); 
    }
    
    const [filas] = await pool.query(query, params);
    return filas.length > 0;
  },

  contarUsuarios: async (busqueda) => {
    try {
      let query = `
        SELECT COUNT(*) as total FROM usuarios u
        JOIN empleados e ON u.FK_empleado = e.id
        WHERE u.activo = 1
      `;
      let params = [];
      if (busqueda) {
        query += ' AND (e.dni LIKE ? OR e.nombre LIKE ? OR e.apellido LIKE ? OR u.email_acceso LIKE ?)';
        const searchStr = `%${busqueda}%`;
        params.push(searchStr, searchStr, searchStr, searchStr);
      }
      const [filas] = await pool.query(query, params);
      return filas[0].total;
    } catch (error) {
      console.error('Error al contar usuarios:', error);
      return 0;
    }
  },

  obtenerPaginados: async (busqueda, limite, offset) => {
    try {
      let query = `
        SELECT u.id, u.email_acceso, u.FK_rol as rol_id, r.nombre as rol, 
               e.id as empleado_id, e.nombre, e.apellido, e.dni
        FROM usuarios u
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN roles r ON u.FK_rol = r.id
        WHERE u.activo = 1
      `;
      let params = [];

      if (busqueda) {
        query += ' AND (e.dni LIKE ? OR e.nombre LIKE ? OR e.apellido LIKE ? OR u.email_acceso LIKE ?)';
        const searchStr = `%${busqueda}%`;
        params.push(searchStr, searchStr, searchStr, searchStr);
      }

      query += ' ORDER BY u.id ASC LIMIT ? OFFSET ?';
      params.push(limite, offset);

      const [filas] = await pool.query(query, params);
      return filas;
    } catch (error) {
      console.error('Error al traer usuarios paginados:', error);
      return [];
    }
  },

  traerTodos: async () => {
    try {
      const [filas] = await pool.query(`
        SELECT u.id, u.email_acceso, e.nombre, e.apellido, r.nombre as rol
        FROM usuarios u
        JOIN empleados e ON u.FK_empleado = e.id
        JOIN roles r ON u.FK_rol = r.id
        WHERE u.activo = 1
      `)
      return filas
    } catch (error) {
      console.error('Error al traer usuarios:', error)
      return []
    }
  },

  crearUsuarioEmpleado: async (datos) => {
    const { nombre, apellido, dni, email_acceso, password_encriptada, rol_id } = datos
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()
      const [resultadoEmpleado] = await conexion.query(
        'INSERT INTO empleados (nombre, apellido, dni) VALUES (?, ?, ?)',
        [nombre, apellido, dni]
      )
      const idEmpleadoCreado = resultadoEmpleado.insertId
      // Por defecto, requiere_cambio_password se asume en 1 (lo definiste en la BD)
      await conexion.query(
        'INSERT INTO usuarios (email_acceso, password, FK_rol, FK_empleado) VALUES (?, ?, ?, ?)',
        [email_acceso, password_encriptada, rol_id, idEmpleadoCreado]
      )
      await conexion.commit()
      return true
    } catch (error) {
      await conexion.rollback()
      console.error('Error al crear empleado:', error)
      return false
    } finally {
      conexion.release()
    }
  },

  actualizarPassword: async (id_usuario, nueva_password_encriptada) => {
    try {
      await pool.query(
        'UPDATE usuarios SET password = ?, requiere_cambio_password = 0 WHERE id = ?',
        [nueva_password_encriptada, id_usuario]
      )
      return true
    } catch (error) {
      console.error('Error al actualizar password:', error)
      return false
    }
  }

  // (Aquí arriba termina tu función actualizarPassword)
  ,

  // ==========================================
  // FUNCIÓN: Borrado Lógico (Desactivar usuario)
  // ==========================================
  desactivarUsuario: async (id_usuario) => {
    try {
      // Cambiamos activo a 0 tanto en el usuario como en el empleado
      const conexion = await pool.getConnection()
      try {
        await conexion.beginTransaction()

        // Desactivamos el usuario
        await conexion.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id_usuario])

        // Buscamos el ID del empleado para desactivarlo también
        const [filas] = await conexion.query('SELECT FK_empleado FROM usuarios WHERE id = ?', [id_usuario])
        if (filas.length > 0) {
          await conexion.query('UPDATE empleados SET activo = 0 WHERE id = ?', [filas[0].FK_empleado])
        }

        await conexion.commit()
        return true
      } catch (error) {
        await conexion.rollback()
        throw error // Pasamos el error al catch principal
      } finally {
        conexion.release()
      }
    } catch (error) {
      console.error('Error al desactivar usuario:', error)
      return false
    }
  },

  // ==========================================
  // FUNCIÓN: El Botón "Power" (Reiniciar Password)
  // ==========================================
  reiniciarPassword: async (id_usuario, email) => {
    try {
      // 1. Encriptamos el propio email para usarlo de contraseña temporal
      const salt = await bcrypt.genSalt(10)
      const nuevaPasswordEncriptada = await bcrypt.hash(email, salt)

      // 2. Actualizamos la BD: Ponemos la nueva clave y forzamos el cambio (requiere_cambio = 1)
      await pool.query(
        'UPDATE usuarios SET password = ?, requiere_cambio_password = 1 WHERE id = ?',
        [nuevaPasswordEncriptada, id_usuario]
      )
      return true
    } catch (error) {
      console.error('Error al reiniciar password:', error)
      return false
    }
  }

  // (Aquí termina tu función reiniciarPassword)
  ,

  // ==========================================
  // FUNCIÓN: Editar Datos de Usuario/Empleado
  // ==========================================
editarUsuarioEmpleado: async (datos) => {
    // ¡Añadimos el email a los datos que recibimos!
    const { id_usuario, nombre, apellido, dni, email, rol_id } = datos
    const conexion = await pool.getConnection()
    try {
      await conexion.beginTransaction()

      // 1. Actualizamos el Rol Y EL EMAIL en la tabla de usuarios
      await conexion.query('UPDATE usuarios SET FK_rol = ?, email_acceso = ? WHERE id = ?', [rol_id, email, id_usuario])

      // 2. Buscamos a qué empleado pertenece este usuario
      const [filas] = await conexion.query('SELECT FK_empleado FROM usuarios WHERE id = ?', [id_usuario])

      // 3. Actualizamos los datos personales en la tabla empleados
      if (filas.length > 0) {
        const id_empleado = filas[0].FK_empleado
        await conexion.query(
          'UPDATE empleados SET nombre = ?, apellido = ?, dni = ? WHERE id = ?',
          [nombre, apellido, dni, id_empleado]
        )
      }

      await conexion.commit()
      return true
    } catch (error) {
      await conexion.rollback()
      console.error('Error al editar usuario:', error)
      return false
    } finally {
      conexion.release()
    }
  }




}

export default UsuarioModel