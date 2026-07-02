import AuditoriaModel from '../modelos/auditoria.js';

const auditoriaControlador = {
    mostrarAuditoria: async (req, res) => {
        // SEGURIDAD: Solo el Rol 1 (Administrador) puede entrar aquí
        if (req.session.usuario.rol_id !== 1) {
            return res.redirect('/menu');
        }

        // Tomamos la página de la URL (ej: /auditoria?pagina=2), por defecto es 1
        const pagina = parseInt(req.query.pagina) || 1;
        const limite = 10; // Mostraremos 15 acciones por página
        const busqueda = req.query.busqueda || '';

        // Pedimos los datos al modelo
        const { logs, total, paginas } = await AuditoriaModel.obtenerHistorialPaginado(pagina, limite, busqueda);

        // Renderizamos la vista
        res.render('auditoria', {
            usuario: req.session.usuario,
            logs,
            paginaActual: pagina,
            totalPaginas: paginas,
            busqueda,
            totalRegistros: total
        });
    }
};

export default auditoriaControlador;