import ClienteModel from '../modelos/clientes.js';
import AuditoriaModel from '../modelos/auditoria.js';

const clientesControlador = {
    // 1. Mostrar pantalla de clientes con Paginación y Búsqueda
    listar: async (req, res) => {
        const busqueda = req.query.busqueda || '';
        const paginaActual = parseInt(req.query.pagina) || 1;
        const limite = 10;
        const offset = (paginaActual - 1) * limite;

        const totalClientes = await ClienteModel.contarClientes(busqueda);
        const totalPaginas = Math.ceil(totalClientes / limite);
        const clientes = await ClienteModel.obtenerPaginados(busqueda, limite, offset);

        let urlBase = '/clientes?';
        if (busqueda) urlBase += `busqueda=${busqueda}&`;

        res.render('clientes', {
            usuario: req.session.usuario,
            clientes,
            busquedaActual: busqueda,
            paginaActual,
            totalPaginas,
            urlBase
        });
    },

    // 2. API: Buscador POS
    buscarAPI: async (req, res) => {
        const termino = req.query.q;
        const resultados = await ClienteModel.buscar(termino);
        res.json(resultados);
    },

    // 3. API: Guardar Nuevo (CORREGIDO PARA ADMITIR CAMPOS OPCIONALES)
    guardarAPI: async (req, res) => {
        const { nombre, apellido, dni_cuil, telefono, email } = req.body;

        // Ahora SOLO el Nombre y el DNI son estrictamente críticos y obligatorios
        if (!nombre || !nombre.trim() || !dni_cuil || !dni_cuil.trim()) {
            return res.json({ status: 'error', message: 'El Nombre y el DNI son obligatorios.' });
        }

        // VALIDACIÓN LÓGICA BACKEND: DNI Duplicado
        const existeDni = await ClienteModel.verificarDocumento(dni_cuil.trim());
        if (existeDni) return res.json({ status: 'error', message: `El DNI/CUIL '${dni_cuil}' ya está registrado en otro cliente.` });

        // VALIDACIÓN LÓGICA BACKEND: Email Duplicado (Solo si el cajero escribió un correo)
        if (email && email.trim() !== '') {
            const existeEmail = await ClienteModel.verificarEmail(email.trim());
            if (existeEmail) return res.json({ status: 'error', message: `El email '${email}' ya pertenece a otro cliente.` });
        }

        // Preparamos los datos limpios para inyectar en el Modelo
        const datosCliente = {
            nombre: nombre.trim(),
            apellido: apellido ? apellido.trim() : '',
            dni_cuil: dni_cuil.trim(),
            telefono: telefono ? telefono.trim() : '',
            email: email ? email.trim() : ''
        };

        const nuevoId = await ClienteModel.crear(datosCliente);
        
        if (nuevoId) {
            await AuditoriaModel.registrar(req.session.usuario.id, 'INSERT', 'clientes', nuevoId, `Registró al cliente rápido: ${datosCliente.nombre}`);
            res.json({ status: 'success', id: nuevoId, message: 'Cliente registrado con éxito.' });
        } else {
            res.json({ status: 'error', message: 'Error interno al registrar el cliente.' });
        }
    },

    // 4. API: Editar Existente (CORREGIDO)
    editarAPI: async (req, res) => {
        const { id, nombre, apellido, dni_cuil, telefono, email } = req.body;
        
        if (id == 1) return res.json({ status: 'error', message: 'No puedes editar al Consumidor Final.' });

        if (!nombre || !nombre.trim() || !dni_cuil || !dni_cuil.trim()) {
            return res.json({ status: 'error', message: 'El Nombre y el DNI son requeridos.' });
        }

        // VALIDACIÓN: DNI Duplicado (Ignorando al cliente que estamos editando)
        const existeDni = await ClienteModel.verificarDocumento(dni_cuil.trim(), id);
        if (existeDni) return res.json({ status: 'error', message: `El DNI/CUIL '${dni_cuil}' ya está registrado en otro cliente.` });

        // VALIDACIÓN: Email Duplicado (Solo si el campo contiene texto)
        if (email && email.trim() !== '') {
            const existeEmail = await ClienteModel.verificarEmail(email.trim(), id);
            if (existeEmail) return res.json({ status: 'error', message: `El email '${email}' ya pertenece a otro cliente.` });
        }

        const datosActualizados = {
            nombre: nombre.trim(),
            apellido: apellido ? apellido.trim() : '',
            dni_cuil: dni_cuil.trim(),
            telefono: telefono ? telefono.trim() : '',
            email: email ? email.trim() : ''
        };

        const exito = await ClienteModel.editar(id, datosActualizados);
        if (exito) {
            await AuditoriaModel.registrar(req.session.usuario.id, 'UPDATE', 'clientes', id, `Editó al cliente: ${datosActualizados.nombre}`);
            res.json({ status: 'success', message: 'Cliente actualizado correctamente.' });
        } else {
            res.json({ status: 'error', message: 'Error al actualizar base de datos.' });
        }
    },

    // 5. API: Baja Lógica (Ocultar)
    borrarAPI: async (req, res) => {
        const { id } = req.body;

        if (id == 1) return res.json({ status: 'error', message: 'El Consumidor Final no se puede eliminar del sistema.' });

        const exito = await ClienteModel.borrar(id);
        if (exito) {
            await AuditoriaModel.registrar(req.session.usuario.id, 'DELETE', 'clientes', id, `Ocultó al cliente ID: ${id}`);
            res.json({ status: 'success', message: 'Cliente eliminado del registro.' });
        } else {
            res.json({ status: 'error', message: 'Error al intentar eliminar el cliente.' });
        }
    }
}

export default clientesControlador;