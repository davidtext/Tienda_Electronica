import ReportesModel from '../modelos/reportes.js';

const reportesControlador = {
    mostrarReportes: async (req, res) => {
        // 1. Validar Seguridad: Solo el Administrador puede ver los números del negocio
        if (req.session.usuario.rol_id !== 1) {
            return res.redirect('/menu');
        }

        // 2. Manejo de Fechas (Filtros)
        let fechaInicio = req.query.desde;
        let fechaFin = req.query.hasta;

        // Si no enviaron fechas, ponemos por defecto "Este Mes"
        if (!fechaInicio || !fechaFin) {
            const hoy = new Date();
            const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            
            // Formato YYYY-MM-DD para los inputs
            fechaInicio = primerDiaMes.toISOString().split('T')[0];
            fechaFin = hoy.toISOString().split('T')[0];
        }

        // Para MySQL, agregamos la hora exacta para abarcar todo el día
        const fechaDesdeSQL = `${fechaInicio} 00:00:00`;
        const fechaHastaSQL = `${fechaFin} 23:59:59`;

        // 3. Consultar al Modelo
        const totales = await ReportesModel.obtenerTotales(fechaDesdeSQL, fechaHastaSQL);
        const pagosAgrupados = await ReportesModel.obtenerPagosAgrupados(fechaDesdeSQL, fechaHastaSQL);
        const rankingRentabilidad = await ReportesModel.obtenerRankingRentabilidad(fechaDesdeSQL, fechaHastaSQL);

        // 4. Preparar datos para el gráfico de Chart.js
        const labelsPagos = pagosAgrupados.map(p => p.metodo_pago);
        const dataPagos = pagosAgrupados.map(p => p.total);

        // 5. Enviar todo a la Vista
        res.render('reportes', {
            usuario: req.session.usuario,
            fechaInicio: fechaInicio,
            fechaFin: fechaFin,
            totales: totales,
            ranking: rankingRentabilidad,
            // Convertimos los arrays a texto JSON para inyectarlos en Chart.js
            chartLabels: JSON.stringify(labelsPagos),
            chartData: JSON.stringify(dataPagos)
        });
    }
};

export default reportesControlador;