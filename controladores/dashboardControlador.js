import DashboardModel from '../modelos/dashboard.js';

const dashboardControlador = {
    mostrarDashboard: async (req, res) => {
        try {
            const metricas = await DashboardModel.obtenerMetricasGenerales();
            const ventas7Dias = await DashboardModel.obtenerVentasUltimos7Dias();
            const topProductos = await DashboardModel.obtenerTopProductos();
            const alertasStock = await DashboardModel.obtenerAlertasStock();
            
            // NUEVAS VARIABLES
            const rankingVendedores = await DashboardModel.obtenerRankingVendedores();
            const feedActividad = await DashboardModel.obtenerFeedActividad();

            res.render('menu', {
                usuario: req.session.usuario,
                metricas,
                ventas7Dias: JSON.stringify(ventas7Dias),
                topProductos,
                alertasStock,
                rankingVendedores, // Enviamos el ranking
                feedActividad      // Enviamos el feed
            });
        } catch (error) {
            console.error('Error al cargar el Dashboard:', error);
            res.send('Ocurrió un error al cargar el panel.');
        }
    }
};

export default dashboardControlador;