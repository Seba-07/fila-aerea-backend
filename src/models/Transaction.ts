import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPasajeroCompra {
  nombre: string;
  apellido: string;
  rut: string;
  esMenor: boolean;
}

export interface ITransaction extends Document {
  // Info del comprador
  email: string;
  nombre_comprador: string;
  telefono?: string;

  // Info de la compra
  cantidad_tickets: number;
  pasajeros: IPasajeroCompra[];
  monto_total: number;

  // Info de Transbank
  buy_order: string; // Orden de compra única
  token: string; // Token de Transbank
  session_id?: string;

  // Estado del pago
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'anulada';

  // Respuesta de Transbank
  response_code?: number;
  authorization_code?: string;
  payment_type_code?: string;
  vci?: string;
  transaction_date?: Date;
  accounting_date?: string;
  installments_number?: number;

  // Relaciones
  userId?: Types.ObjectId; // Usuario creado después del pago
  ticketIds?: Types.ObjectId[]; // Tickets generados

  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    nombre_comprador: {
      type: String,
      required: true,
      trim: true,
    },
    telefono: {
      type: String,
      trim: true,
    },
    cantidad_tickets: {
      type: Number,
      required: true,
      min: 1,
    },
    pasajeros: [
      {
        nombre: { type: String, required: true, trim: true },
        apellido: { type: String, required: true, trim: true },
        rut: { type: String, required: true, trim: true },
        esMenor: { type: Boolean, default: false },
      },
    ],
    monto_total: {
      type: Number,
      required: true,
      min: 0,
    },
    buy_order: {
      type: String,
      required: true,
      unique: true,
    },
    token: {
      type: String,
      required: true,
    },
    session_id: String,
    estado: {
      type: String,
      enum: ['pendiente', 'aprobada', 'rechazada', 'anulada'],
      default: 'pendiente',
    },
    response_code: Number,
    authorization_code: String,
    payment_type_code: String,
    vci: String,
    transaction_date: Date,
    accounting_date: String,
    installments_number: Number,
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    ticketIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Ticket',
      },
    ],
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ buy_order: 1 });
transactionSchema.index({ token: 1 });
transactionSchema.index({ email: 1 });
transactionSchema.index({ estado: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
