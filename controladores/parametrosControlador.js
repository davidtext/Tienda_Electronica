import ParametrosModel from '../modelos/parametros.js';
import AuditoriaModel from '../modelos/auditoria.js';

const ParametrosControlador = {
  mostrarPantalla: async (req, res) => {
    // Seguridad: Solo Admin
    if (req.session.usuario.rol_id !== 1) return res.redirect('/menu');
    
    const limite = 5; // Mostramos de a 5 para que la pantalla quede simétrica y bonita

    // Parámetros de Categorías
    const bCat = req.query.b_cat || '';
    const pCat = parseInt(req.query.p_cat) || 1;
    const offsetCat = (pCat - 1) * limite;
    const totalCat = await ParametrosModel.contar('categorias', bCat);
    const categorias = await ParametrosModel.obtenerPagina('categorias', bCat, limite, offsetCat);

    // Parámetros de Marcas
    const bMar = req.query.b_mar || '';
    const pMar = parseInt(req.query.p_mar) || 1;
    const offsetMar = (pMar - 1) * limite;
    const totalMar = await ParametrosModel.contar('marcas', bMar);
    const marcas = await ParametrosModel.obtenerPagina('marcas', bMar, limite, offsetMar);

    res.render('parametros', {
      usuario: req.session.usuario,
      categorias, marcas,
      bCat, pCat, totPagCat: Math.ceil(totalCat / limite),
      bMar, pMar, totPagMar: Math.ceil(totalMar / limite)
    });
  },

  apiGuardar: async (req, res) => {
    const { tipo, id, nombre } = req.body; 
    
    if (!nombre || nombre.trim() === '') return res.json({status: 'error', message: 'El nombre es obligatorio.'});
    
    // Validamos duplicados
    const existe = await ParametrosModel.verificarNombre(tipo, nombre.trim(), id);
    if (existe) return res.json({status: 'error', message: `El nombre '${nombre}' ya existe.`});

    let exito = id ? await ParametrosModel.editar(tipo, id, nombre.trim()) : await ParametrosModel.crear(tipo, nombre.trim());

    if (exito) {
        await AuditoriaModel.registrar(req.session.usuario.id, id ? 'UPDATE' : 'INSERT', tipo, id || 0, `${id ? 'Editó' : 'Creó'} en ${tipo}: ${nombre}`);
        res.json({status: 'success', message: 'Guardado correctamente.'});
    } else {
        res.json({status: 'error', message: 'Error interno.'});
    }
  },

  apiBorrar: async (req, res) => {
    const { tipo, id } = req.body;
    const campo_fk = tipo === 'categorias' ? 'FK_categoria' : 'FK_marca';

    // VALIDACIÓN ESTRELLA
    const enUso = await ParametrosModel.verificarUsoEnProductos(campo_fk, id);
    if (enUso) return res.json({status: 'error', message: `¡Alto! Hay productos en tu catálogo usando esta ${tipo === 'categorias' ? 'Categoría' : 'Marca'}. Modifica esos productos primero.`});

    const exito = await ParametrosModel.borrar(tipo, id);
    if (exito) {
        await AuditoriaModel.registrar(req.session.usuario.id, 'DELETE', tipo, id, `Ocultó registro ID ${id} de ${tipo}`);
        res.json({status: 'success', message: 'Eliminado correctamente.'});
    } else {
        res.json({status: 'error', message: 'Error al eliminar.'});
    }
  }
};

export default ParametrosControlador;