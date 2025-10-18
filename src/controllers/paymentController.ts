import { Request, Response } from 'express';
import { webpayPlus, TRANSBANK_CONFIG } from '../config/transbank';
import { Transaction, User, Ticket, Settings, Payment, Reservation, Flight } from '../models';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';

// Iniciar transacción de pago
export const iniciarPago = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      nombre_comprador,
      telefono,
      cantidad_tickets,
      pasajeros, // Array de { nombre, apellido, rut, esMenor }
      selectedFlightId, // Optional - flight to associate tickets with
      reservationId, // Optional - reservation to confirm
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

    // If reservationId is provided, validate it
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

      // Check if reservation has expired
      const now = new Date();
      if (reservation.expiresAt < now) {
        res.status(400).json({ error: 'La reserva ha expirado' });
        return;
      }

      // Validate cantidad_tickets matches reservation
      if (reservation.cantidadPasajeros !== cantidad_tickets) {
        res.status(400).json({
          error: `La cantidad de tickets (${cantidad_tickets}) no coincide con la reserva (${reservation.cantidadPasajeros})`
        });
        return;
      }

      // If selectedFlightId is provided, it must match the reservation
      if (selectedFlightId && selectedFlightId !== reservation.flightId.toString()) {
        res.status(400).json({ error: 'El vuelo seleccionado no coincide con la reserva' });
        return;
      }
    }

    // If selectedFlightId is provided, validate the flight
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

    // Obtener precio del ticket desde configuración
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        duracion_circuito_minutos: 20,
        max_circuitos_sin_reabastecimiento_default: 4,
        precio_ticket: 15000,
      });
    }
    const PRECIO_POR_TICKET = settings.precio_ticket;

    // Calcular subtotal (tickets sin comisión)
    const subtotal = PRECIO_POR_TICKET * cantidad_tickets;

    // Calcular comisión Webpay (3.5% - tarjeta de crédito)
    const comisionBruta = subtotal * 0.035;
    // Redondear al múltiplo de 100 superior
    const comisionRedondeada = Math.ceil(comisionBruta / 100) * 100;

    // Monto total = subtotal + comisión
    const monto_total = subtotal + comisionRedondeada;

    // Generar orden de compra única (máximo 26 caracteres para Transbank)
    // Formato: ORD + timestamp últimos 10 dígitos + random 6 caracteres = ~20 chars
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    const buy_order = `ORD${timestamp}${random}`;
    const session_id = `SES${timestamp}`;

    const returnUrl = TRANSBANK_CONFIG.returnUrl;
    logger.info(`Iniciando pago - Buy Order: ${buy_order}`);
    logger.info(`  Subtotal (${cantidad_tickets} tickets): $${subtotal}`);
    logger.info(`  Comisión Webpay (3.5%): $${comisionRedondeada}`);
    logger.info(`  Total a cobrar: $${monto_total}`);
    logger.info(`  Return URL: ${returnUrl}`);
    logger.info(`Variables de entorno - TRANSBANK_RETURN_URL: ${process.env.TRANSBANK_RETURN_URL}, FRONTEND_URL: ${process.env.FRONTEND_URL}`);

    // Validar que tenemos una return URL válida
    if (!returnUrl || returnUrl === 'null' || returnUrl === 'undefined') {
      throw new Error('Return URL no configurada correctamente');
    }

    // Crear transacción en Transbank
    const response = await webpayPlus.create(
      buy_order,
      session_id,
      monto_total,
      returnUrl
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
      reservationId: reservationId || undefined,
      selectedFlightId: selectedFlightId || undefined,
    });

    logger.info(`Transacción iniciada: ${buy_order} - Monto: $${monto_total}${reservationId ? ` - Reserva: ${reservationId}` : ''}${selectedFlightId ? ` - Vuelo: ${selectedFlightId}` : ''}`);

    // Retornar URL y token para redirigir a Webpay
    res.json({
      url: response.url,
      token: response.token,
      buy_order,
      monto_total,
    });
  } catch (error: any) {
    logger.error('Error iniciando pago:', error);

    // Log más detallado del error
    if (error.response) {
      logger.error('Error response:', error.response.data);
    }

    const errorMessage = error.response?.data?.error_message
      || error.response?.data
      || error.message
      || 'Error desconocido';

    res.status(500).json({
      error: 'Error al iniciar el pago',
      details: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)
    });
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

      // If there's a reservation, mark it as confirmed
      if (transaction.reservationId) {
        const reservation = await Reservation.findById(transaction.reservationId);
        if (reservation && reservation.status === 'active') {
          reservation.status = 'confirmed';
          await reservation.save();
          logger.info(`Reserva confirmada: ${reservation._id}`);
        }
      }

      // Determine the flight to associate tickets with
      let defaultFlightId = transaction.selectedFlightId;
      if (!defaultFlightId && transaction.reservationId) {
        const reservation = await Reservation.findById(transaction.reservationId);
        if (reservation) {
          defaultFlightId = reservation.flightId;
        }
      }

      // Crear tickets para cada pasajero
      const ticketIds = [];
      const flightsToUpdate: { [flightId: string]: number } = {}; // Contador de pasajeros por vuelo

      for (const pasajero of transaction.pasajeros) {
        // El pasajero puede tener su propio flightId (vuelos separados) o usar el default
        const pasajeroFlightId = pasajero.flightId || defaultFlightId;

        const ticket = await Ticket.create({
          userId: user._id,
          codigo_ticket: `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          pasajeros: [pasajero],
          estado: pasajeroFlightId ? 'inscrito' : 'disponible',
          flightId: pasajeroFlightId || undefined,
        });
        ticketIds.push(ticket._id);

        // Contar pasajeros por vuelo para actualizar asientos después
        if (pasajeroFlightId) {
          const flightIdStr = pasajeroFlightId.toString();
          flightsToUpdate[flightIdStr] = (flightsToUpdate[flightIdStr] || 0) + 1;
        }
      }

      transaction.ticketIds = ticketIds as any;

      // Actualizar asientos_ocupados para cada vuelo
      // Solo si NO hay reserva (si hay reserva, los asientos ya fueron incrementados)
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

      // Obtener tickets creados para enviar por email
      const ticketsCreados = await Ticket.find({ _id: { $in: ticketIds } });

      // Enviar email con los tickets
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
        logger.error('Error enviando email de tickets:', emailError);
        // No fallar la transacción si el email falla
      }

      // Crear registro de pago en historial
      const tipoTarjeta = response.payment_type_code === 'VD' ? 'debito' :
                         response.payment_type_code === 'VN' ? 'credito' : undefined;

      const descripcionPago = `Compra via Webpay ${tipoTarjeta ? `(${tipoTarjeta})` : ''}` +
                             (response.installments_number > 0 ? ` en ${response.installments_number} cuotas` : '') +
                             ` - ${transaction.pasajeros.map(p => `${p.nombre} ${p.apellido}`).join(', ')}`;

      await Payment.create({
        userId: user._id,
        monto: transaction.monto_total,
        metodo_pago: 'webpay',
        cantidad_tickets: transaction.cantidad_tickets,
        tipo: 'compra',
        descripcion: descripcionPago,
        fecha: new Date(),
        transactionId: transaction._id,
        tipo_tarjeta: tipoTarjeta,
        cuotas: response.installments_number || 0,
        codigo_autorizacion: response.authorization_code,
      });

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
