import { Request, Response } from 'express';
import { webpayPlus, TRANSBANK_CONFIG } from '../config/transbank';
import { Transaction, User, Ticket, Settings } from '../models';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';

// Iniciar transacción de pago
export const iniciarPago = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      nombre_comprador,
      telefono,
      cantidad_tickets,
      pasajeros, // Array de { nombre, apellido, rut, esMenor }
    } = req.body;

    // Validaciones
    if (!email || !nombre_comprador || !cantidad_tickets || !pasajeros || pasajeros.length === 0) {
      res.status(400).json({ error: 'Todos los campos son obligatorios' });
      return;
    }

    if (pasajeros.length !== cantidad_tickets) {
      res.status(400).json({ error: 'La cantidad de pasajeros debe coincidir con la cantidad de tickets' });
      return;
    }

    // Obtener precio del ticket desde configuración
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        duracion_tanda_minutos: 20,
        max_tandas_sin_reabastecimiento_default: 4,
        precio_ticket: 15000,
      });
    }
    const PRECIO_POR_TICKET = settings.precio_ticket;

    // Calcular monto total
    const monto_total = PRECIO_POR_TICKET * cantidad_tickets;

    // Generar orden de compra única (máximo 26 caracteres para Transbank)
    // Formato: ORD + timestamp últimos 10 dígitos + random 6 caracteres = ~20 chars
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    const buy_order = `ORD${timestamp}${random}`;
    const session_id = `SES${timestamp}`;

    // Crear transacción en Transbank
    const response = await webpayPlus.create(
      buy_order,
      session_id,
      monto_total,
      TRANSBANK_CONFIG.returnUrl
    );

    // Guardar transacción en BD
    const transaction = await Transaction.create({
      email,
      nombre_comprador,
      telefono,
      cantidad_tickets,
      pasajeros,
      monto_total,
      buy_order,
      token: response.token,
      session_id,
      estado: 'pendiente',
    });

    logger.info(`Transacción iniciada: ${buy_order} - Monto: $${monto_total}`);

    // Retornar URL y token para redirigir a Webpay
    res.json({
      url: response.url,
      token: response.token,
      buy_order,
      monto_total,
    });
  } catch (error: any) {
    logger.error('Error iniciando pago:', error);
    res.status(500).json({ error: 'Error al iniciar el pago', details: error.message });
  }
};

// Confirmar transacción (callback de Transbank)
export const confirmarPago = async (req: Request, res: Response): Promise<void> => {
  try {
    const token_ws = req.body.token_ws || req.query.token_ws;

    if (!token_ws) {
      res.status(400).json({ error: 'Token no proporcionado' });
      return;
    }

    // Confirmar transacción con Transbank
    const response = await webpayPlus.commit(token_ws);

    logger.info(`Respuesta de Transbank:`, response);

    // Buscar transacción en BD
    const transaction = await Transaction.findOne({ token: token_ws });

    if (!transaction) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }

    // Actualizar transacción con datos de Transbank
    transaction.response_code = response.response_code;
    transaction.authorization_code = response.authorization_code;
    transaction.payment_type_code = response.payment_type_code;
    transaction.vci = response.vci;
    transaction.transaction_date = response.transaction_date ? new Date(response.transaction_date) : undefined;
    transaction.accounting_date = response.accounting_date;
    transaction.installments_number = response.installments_number;

    // Verificar si el pago fue aprobado
    if (response.response_code === 0 && response.vci === 'TSY') {
      transaction.estado = 'aprobada';

      // Crear usuario o buscar existente
      let user = await User.findOne({ email: transaction.email });

      if (!user) {
        // Generar contraseña temporal
        const passwordTemp = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(passwordTemp, 10);

        user = await User.create({
          email: transaction.email,
          password: hashedPassword,
          nombre: transaction.nombre_comprador.split(' ')[0],
          apellido: transaction.nombre_comprador.split(' ').slice(1).join(' ') || '',
          rut: transaction.pasajeros[0]?.rut || '',
          rol: 'passenger',
        });

        logger.info(`Usuario creado: ${user.email} - Contraseña temporal: ${passwordTemp}`);

        // TODO: Enviar email con contraseña temporal
      }

      transaction.userId = user._id as any;

      // Crear tickets para cada pasajero
      const ticketIds = [];
      for (const pasajero of transaction.pasajeros) {
        const ticket = await Ticket.create({
          userId: user._id,
          codigo_ticket: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          pasajeros: [pasajero],
          estado: 'disponible',
        });
        ticketIds.push(ticket._id);
      }

      transaction.ticketIds = ticketIds as any;

      logger.info(`✅ Pago aprobado - ${ticketIds.length} tickets creados para ${user.email}`);
    } else {
      transaction.estado = 'rechazada';
      logger.warn(`❌ Pago rechazado - Response code: ${response.response_code}`);
    }

    await transaction.save();

    res.json({
      success: transaction.estado === 'aprobada',
      transaction: {
        buy_order: transaction.buy_order,
        amount: transaction.monto_total,
        estado: transaction.estado,
        authorization_code: transaction.authorization_code,
        payment_type: transaction.payment_type_code,
        installments: transaction.installments_number,
        tickets_generados: transaction.ticketIds?.length || 0,
      },
    });
  } catch (error: any) {
    logger.error('Error confirmando pago:', error);
    res.status(500).json({ error: 'Error al confirmar el pago', details: error.message });
  }
};

// Obtener estado de transacción
export const getTransactionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { buy_order } = req.params;

    const transaction = await Transaction.findOne({ buy_order })
      .populate('userId', 'email nombre apellido')
      .populate('ticketIds', 'codigo_ticket estado');

    if (!transaction) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }

    res.json({ transaction });
  } catch (error: any) {
    logger.error('Error obteniendo estado de transacción:', error);
    res.status(500).json({ error: 'Error al obtener estado de transacción' });
  }
};
