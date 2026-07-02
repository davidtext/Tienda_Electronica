import UsuarioModel from '../modelos/usuarios.js';
import AuditoriaModel from '../modelos/auditoria.js';
import bcrypt from 'bcryptjs';

const usuariosControlador = {
    // 1. Mostrar pantalla principal
    listar: async (req, res) => {
        // SEGURIDAD: Solo Admin
        if (req.session.usuario.rol_id !== 1) return res.redirect('/menu');

        const busqueda = req.query.busqueda || '';
        const paginaActual = parseInt(req.query.pagina) || 1;
        const limite = 10;
        const offset = (paginaActual - 1) * limite;

        const totalUsuarios = await UsuarioModel.contarUsuarios(busqueda);
        const totalPaginas = Math.ceil(totalUsuarios / limite);
        const usuarios = await UsuarioModel.obtenerPaginados(busqueda, limite, offset);

        let urlBase = '/usuarios?';
        if (busqueda) urlBase += `busqueda=${busqueda}&`;

        res.render('alta_listado_usuarios', {
            usuario: req.session.usuario,
            usuarios,
            busquedaActual: busqueda,
            paginaActual,
            totalPaginas,
            urlBase
        });
    },

    // 2. Guardar (Solo por AJAX ahora)
    crearAPI: async (req, res) => {
        const { nombre, apellido, dni, email, rol_id } = req.body;

        // Validaciones Backend
        if (!nombre || !apellido || !dni || !email || !rol_id) {
            return res.json({ status: 'error', message: 'Todos los campos son obligatorios.' });
        }
        
        if (await UsuarioModel.verificarDni(dni)) {
            return res.json({ status: 'error', message: 'Ese DNI ya pertenece a otro empleado.' });
        }
        
        if (await UsuarioModel.verificarEmailDuplicado(email)) {
            return res.json({ status: 'error', message: 'Ese email de acceso ya está en uso.' });
        }

        // Su primera clave es su email encriptado
        const salt = await bcrypt.genSalt(10);
        const pass = await bcrypt.hash(email, salt);

        const exito = await UsuarioModel.crearUsuarioEmpleado({
            nombre, apellido, dni, email_acceso: email, password_encriptada: pass, rol_id
        });

        if (exito) {
            await AuditoriaModel.registrar(req.session.usuario.id, 'INSERT', 'usuarios', 0, `Creó al empleado: ${nombre} ${apellido}`);
            res.json({ status: 'success', message: 'Empleado creado correctamente.' });
        } else {
            res.json({ status: 'error', message: 'Error en la base de datos.' });
        }
    },

// 3. Editar
    editarAPI: async (req, res) => {
        const { id_usuario, empleado_id, nombre, apellido, dni, email, rol_id } = req.body;

        // REGLA DE DEIDAD: No se le puede quitar el rol de admin al ID 1
        if (id_usuario == 1 && rol_id != 1) {
            return res.json({ status: 'error', message: 'No puedes quitarle el rol de Administrador al usuario principal.' });
        }

        // VALIDACIÓN: Todos los campos obligatorios
        if (!nombre || !apellido || !dni || !email || !rol_id) {
            return res.json({ status: 'error', message: 'Todos los campos son obligatorios, incluyendo el email.' });
        }

        // VALIDACIÓN: DNIs duplicados
        if (await UsuarioModel.verificarDni(dni, empleado_id)) {
            return res.json({ status: 'error', message: 'Ese DNI ya pertenece a otro empleado.' });
        }

        // VALIDACIÓN: Email duplicado (excluyendo a este mismo usuario)
        if (await UsuarioModel.verificarEmailDuplicado(email, id_usuario)) {
            return res.json({ status: 'error', message: 'Ese email ya está siendo usado por otro empleado.' });
        }

        const exito = await UsuarioModel.editarUsuarioEmpleado(req.body);
        if (exito) {
            await AuditoriaModel.registrar(req.session.usuario.id, 'UPDATE', 'usuarios', id_usuario, `Editó al empleado: ${nombre} ${apellido}`);
            res.json({ status: 'success', message: 'Empleado actualizado.' });
        } else {
            res.json({ status: 'error', message: 'Error al actualizar.' });
        }
    }
};

export default usuariosControlador;