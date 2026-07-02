import mysql from 'mysql2/promise'

// Creamos la conexión a nuestra base de datos local
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Sin contraseña en XAMPP por defecto
  database: 'tienda_electronica',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

console.log('✅ Base de datos conectada exitosamente')

// Exportamos el 'pool' para que otros archivos puedan usarlo
export default pool

//YA CON ESTO ES SUFICIENTE, NO HACE FALTA CREAR FUNCIONES COMO GUARDAR, INSERTAR Y DEMAS COMO HACIAMOS ANTES EN PHP
//CON NODE.JS NO HACE FALTA CREAR ESO, SOLO HACES QUERY PARA CONSULTAR, LA QUERY HACE TODO
//CREAR; BORRAR ETC




