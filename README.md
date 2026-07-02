# 🛒 Sistema ERP Híbrido: E-commerce & Punto de Venta (POS)

Esta es una plataforma integral construida con **Node.js, Express y MySQL** diseñada para resolver la logística de una tienda de electrónica. El sistema funciona de manera dual: ofrece una tienda online para clientes y un potente panel de administración/Punto de Venta para los empleados del local físico.

Este proyecto fue desarrollado bajo la arquitectura **MVC (Modelo-Vista-Controlador)**, garantizando un código escalable, seguro y fácil de mantener.

## 🚀 Tecnologías Utilizadas
* **Backend:** Node.js, Express.js
* **Base de Datos:** MySQL (mysql2/promise)
* **Frontend:** HTML5, CSS3, Bootstrap 5, EJS (Embedded JavaScript)
* **Librerías Clave:** 
  * `nodemailer` (Envío automatizado de correos)
  * `bcryptjs` (Encriptación de contraseñas)
  * `express-session` (Manejo de carritos y accesos)
  * `multer` (Carga de imágenes)

## ⚙️ Características y Soluciones del Sistema
* **Carritos Independientes:** Lógica de sesión separada para compras online de clientes y cobros en mostrador por parte de empleados.
* **Control de Caja Diaria:** Sistema de apertura con fondo de caja, registro de pagos múltiples (Efectivo, Transferencia, Tarjetas) y cálculo automatizado de vueltos.
* **Gestión de Inventario y RMA (Garantías):** Módulo avanzado que separa automáticamente el stock activo del stock defectuoso al anular ventas, calculando el capital inmovilizado para reclamos a proveedores.
* **Comprobantes Automáticos:** Generación de tickets detallados (con desglose de descuentos) y envío automático en tiempo real al correo del cliente.
* **Descuentos Dinámicos:** Aplicación de rebajas porcentuales individuales o masivas por categoría.

## 📌 Roles de Usuario
* **Cliente:** Puede explorar el catálogo filtrado, armar su carrito y gestionar sus direcciones de envío.
* **Cajero/Administrador:** Tiene acceso al Punto de Venta físico, gestión de productos, apertura/cierre de caja, reportes y módulo de devoluciones.
