import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_dev_cambiar';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
  rol: string;
}

export interface QRPayload {
  boarding_pass_id: string;
  ticket_id: string;
  flight_id: string;
  seatNumber: string;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};

export const generateQRToken = (payload: QRPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
};

export const verifyQRToken = (token: string): QRPayload => {
  return jwt.verify(token, JWT_SECRET) as QRPayload;
};
