import { Request, Response } from 'express';
import { getMercadoPagoClients, MERCADOPAGO_CONFIG } from '../config/mercadopago';
import { Transaction, User, Ticket, Settings, Payment, Reservation, Flight } from '../models';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';

// Iniciar pago con Mercado Pago
export const iniciarPagoMP = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      nombre_comprador,
      telefono,
      cantidad_tickets,
      pasajeros,
      selectedFlightId,
      reservationId,
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

    // Validar reserva si existe
    if (reservationId) {
      const reservation = await Reservation.findById(reservationId);
      if (!reservation) {
        res.status(404).json({ error: 'Reserva no encontrada' });
        return;
      }
      if (reservation.status !== 'active') {
        res.status(400).json({ error: 'La reserva no está activa' });
        return;
      }
      const now = new Date();
      if (reservation.expiresAt < now) {
        res.status(400).json({ error: 'La reserva ha expirado' });
        return;
      }
      if (reservation.cantidadPasajeros !== cantidad_tickets) {
        res.status(400).json({
          error: `La cantidad de tickets (${cantidad_tickets}) no coincide con la reserva (${reservation.cantidadPasajeros})`
        });
        return;
      }
    }

    // Validar vuelo si existe
    if (selectedFlightId) {
      const flight = await Flight.findById(selectedFlightId);
      if (!flight) {
        res.status(404).json({ error: 'Vuelo no encontrado' });
        return;
      }
      if (flight.estado !== 'abierto') {
        res.status(400).json({ error: 'El vuelo no está disponible' });
        return;
      }
    }

    // Obtener precio del ticket
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 20,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 15000,
      });
    }
    const PRECIO_POR_TICKET = settings.precio_ticket;

    // Calcular subtotal
    const subtotal = PRECIO_POR_TICKET * cantidad_tickets;

    // Calcular comisión Mercado Pago (4.5%)
    const comisionBruta = subtotal * 0.045;
    const comisionRedondeada = Math.ceil(comisionBruta / 100) * 100;

    // Monto total
    const monto_total = subtotal + comisionRedondeada;

    // Generar orden de compra única
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    const external_reference = `MP${timestamp}${random}`;

    logger.info(`Iniciando pago Mercado Pago - External Reference: ${external_reference}`);
    logger.info(`  Subtotal (${cantidad_tickets} tickets): $${subtotal}`);
    logger.info(`  Comisión Mercado Pago (4.5%): $${comisionRedondeada}`);
    logger.info(`  Total a cobrar: $${monto_total}`);

    // Obtener cliente de Mercado Pago
    const { preferenceClient } = getMercadoPagoClients();

    // Crear preferencia de pago en Mercado Pago
    const preference = {
      body: {
        items: [
          {
            title: `${cantidad_tickets} Ticket(s) de Vuelo - Club Aéreo Castro`,
            quantity: 1,
            unit_price: monto_total,
            currency_id: 'CLP',
          },
        ],
        payer: {
          name: nombre_comprador.split(' ')[0],
          surname: nombre_comprador.split(' ').slice(1).join(' ') || '',
          email: email,
          phone: {
            number: telefono || '',
          },
        },
        back_urls: {
          success: `${MERCADOPAGO_CONFIG.successUrl}?external_reference=${external_reference}`,
          failure: MERCADOPAGO_CONFIG.failureUrl,
          pending: MERCADOPAGO_CONFIG.pendingUrl,
        },
        auto_return: 'approved' as const,
        external_reference: external_reference,
        notification_url: MERCADOPAGO_CONFIG.notificationUrl,
        statement_descriptor: 'CLUB AEREO CASTRO',
      }
    };

    const response = await preferenceClient.create(preference);

    // Guardar transacción en BD
    const transaction = await Transaction.create({
      email,
      nombre_comprador,
      telefono,
      cantidad_tickets,
      pasajeros,
      monto_total,
      buy_order: external_reference,
      token: response.body.id || '', // ID de la preferencia
      session_id: external_reference,
      estado: 'pendiente',
      reservationId: reservationId || undefined,
      selectedFlightId: selectedFlightId || undefined,
    });

    logger.info(`Transacción creada: ${external_reference} - Monto: $${monto_total}`);

    // Retornar URL para redirigir a Mercado Pago
    res.json({
      init_point: response.init_point, // URL para redirigir al usuario
      preference_id: response.id,
      external_reference,
      monto_total,
    });
  } catch (error: any) {
    logger.error('Error iniciando pago con Mercado Pago:', error);
    res.status(500).json({
      error: 'Error al iniciar el pago',
      details: error.message || 'Error desconocido'
    });
  }
};

// Confirmar pago (webhook de Mercado Pago)
export const webhookMP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, data } = req.body;

    logger.info('Webhook Mercado Pago recibido:', { type, data });

    // Solo procesar notificaciones de pago
    if (type !== 'payment') {
      res.status(200).send('OK');
      return;
    }

    const paymentId = data.id;

    // Obtener cliente de Mercado Pago
    const { paymentClient } = getMercadoPagoClients();

    // Obtener información del pago desde Mercado Pago
    const paymentData = await paymentClient.get({ id: paymentId });

    logger.info('Datos del pago:', paymentData);

    const external_reference = paymentData.external_reference;

    // Buscar transacción
    const transaction = await Transaction.findOne({ buy_order: external_reference });

    if (!transaction) {
      logger.error(`Transacción no encontrada: ${external_reference}`);
      res.status(404).send('Transaction not found');
      return;
    }

    // Actualizar transacción con datos de Mercado Pago
    transaction.authorization_code = paymentData.id?.toString();
    transaction.payment_type_code = paymentData.payment_type_id;
    transaction.transaction_date = paymentData.date_approved ? new Date(paymentData.date_approved) : undefined;

    // Verificar si el pago fue aprobado
    if (paymentData.status === 'approved') {
      transaction.estado = 'aprobada';
      transaction.response_code = 0;

      // Crear usuario o buscar existente
      let user = await User.findOne({ email: transaction.email });

      if (!user) {
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

        logger.info(`Usuario creado: ${user.email}`);
      }

      transaction.userId = user._id as any;

      // Confirmar reserva si existe
      if (transaction.reservationId) {
        const reservation = await Reservation.findById(transaction.reservationId);
        if (reservation && reservation.status === 'active') {
          reservation.status = 'confirmed';
          await reservation.save();
          logger.info(`Reserva confirmada: ${reservation._id}`);
        }
      }

      // Determinar vuelo
      let defaultFlightId = transaction.selectedFlightId;
      if (!defaultFlightId && transaction.reservationId) {
        const reservation = await Reservation.findById(transaction.reservationId);
        if (reservation) {
          defaultFlightId = reservation.flightId;
        }
      }

      // Crear tickets
      const ticketIds = [];
      const flightsToUpdate: { [flightId: string]: number } = {};

      for (const pasajero of transaction.pasajeros) {
        const pasajeroFlightId = pasajero.flightId || defaultFlightId;

        const ticket = await Ticket.create({
          userId: user._id,
          codigo_ticket: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          pasajeros: [pasajero],
          estado: pasajeroFlightId ? 'asignado' : 'disponible',
          flightId: pasajeroFlightId || undefined,
        });
        ticketIds.push(ticket._id);

        if (pasajeroFlightId) {
          const flightIdStr = pasajeroFlightId.toString();
          flightsToUpdate[flightIdStr] = (flightsToUpdate[flightIdStr] || 0) + 1;
        }
      }

      transaction.ticketIds = ticketIds as any;

      // Actualizar asientos
      if (!transaction.reservationId && Object.keys(flightsToUpdate).length > 0) {
        for (const [flightIdStr, count] of Object.entries(flightsToUpdate)) {
          const flight = await Flight.findById(flightIdStr);
          if (flight) {
            flight.asientos_ocupados += count;
            await flight.save();
            logger.info(`Asientos actualizados en vuelo ${flightIdStr}: +${count}`);
          }
        }
      }

      // Obtener tickets para email
      const ticketsCreados = await Ticket.find({ _id: { $in: ticketIds } });

      // Enviar email
      try {
        await emailService.sendTickets({
          to: transaction.email,
          tickets: ticketsCreados,
          nombreComprador: transaction.nombre_comprador,
          cantidadTickets: transaction.cantidad_tickets,
          montoTotal: transaction.monto_total,
        });
        logger.info(`📧 Email enviado exitosamente a ${transaction.email}`);
      } catch (emailError) {
        logger.error('Error enviando email:', emailError);
      }

      // Crear registro de pago
      await Payment.create({
        userId: user._id,
        monto: transaction.monto_total,
        metodo_pago: 'mercadopago',
        cantidad_tickets: transaction.cantidad_tickets,
        tipo: 'compra',
        descripcion: `Compra via Mercado Pago - ${transaction.pasajeros.map(p => `${p.nombre} ${p.apellido}`).join(', ')}`,
        fecha: new Date(),
        transactionId: transaction._id,
        codigo_autorizacion: paymentData.id?.toString(),
      });

      logger.info(`✅ Pago aprobado Mercado Pago - ${ticketIds.length} tickets creados para ${user.email}`);
    } else if (paymentData.status === 'rejected') {
      transaction.estado = 'rechazada';
      transaction.response_code = 1;
      logger.warn(`❌ Pago rechazado - Payment ID: ${paymentId}`);
    } else {
      logger.info(`⏳ Pago pendiente - Status: ${paymentData.status}`);
    }

    await transaction.save();
    res.status(200).send('OK');
  } catch (error: any) {
    logger.error('Error en webhook Mercado Pago:', error);
    res.status(500).send('Error');
  }
};

// Confirmar pago manualmente (cuando usuario vuelve de Mercado Pago)
export const confirmarPagoMP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { external_reference, payment_id, status } = req.query;

    if (!external_reference) {
      res.status(400).json({ error: 'External reference no proporcionado' });
      return;
    }

    const transaction = await Transaction.findOne({ buy_order: external_reference as string });

    if (!transaction) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }

    // Si el pago ya fue procesado, retornar info
    if (transaction.estado !== 'pendiente') {
      res.json({
        success: transaction.estado === 'aprobada',
        transaction: {
          buy_order: transaction.buy_order,
          amount: transaction.monto_total,
          estado: transaction.estado,
          authorization_code: transaction.authorization_code,
          payment_type: transaction.payment_type_code,
          tickets_generados: transaction.ticketIds?.length || 0,
        },
      });
      return;
    }

    // Si el webhook aún no procesó, esperar un momento y consultar
    if (payment_id) {
      try {
        const { paymentClient } = getMercadoPagoClients();
        const paymentData = await paymentClient.get({ id: Number(payment_id) });

        if (paymentData.status === 'approved' && transaction.estado === 'pendiente') {
          // Procesar manualmente (el webhook debería haberlo hecho, pero por si acaso)
          logger.warn('Procesando pago manualmente desde confirmación');
          // Aquí podrías llamar a la lógica del webhook o simplemente esperar
        }
      } catch (error) {
        logger.error('Error consultando pago:', error);
      }
    }

    res.json({
      success: transaction.estado === 'aprobada',
      transaction: {
        buy_order: transaction.buy_order,
        amount: transaction.monto_total,
        estado: transaction.estado,
        authorization_code: transaction.authorization_code,
        payment_type: transaction.payment_type_code,
        tickets_generados: transaction.ticketIds?.length || 0,
      },
    });
  } catch (error: any) {
    logger.error('Error confirmando pago Mercado Pago:', error);
    res.status(500).json({ error: 'Error al confirmar el pago' });
  }
};
