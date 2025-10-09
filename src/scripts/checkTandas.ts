import mongoose from 'mongoose';
import { Flight, Aircraft } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkCircuitos = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Obtener todos los aviones
    const aircrafts = await Aircraft.find();
    console.log('\n=== AVIONES ===');
    aircrafts.forEach(a => {
      console.log(`${a.matricula} (ID: ${a._id})`);
    });

    // Obtener todos los vuelos agrupados por circuito
    const flights = await Flight.find().populate('aircraftId').sort({ numero_circuito: 1, 'aircraftId.matricula': 1 });

    const circuitosMap: any = {};
    flights.forEach(f => {
      if (!circuitosMap[f.numero_circuito]) {
        circuitosMap[f.numero_circuito] = [];
      }
      circuitosMap[f.numero_circuito].push({
        matricula: (f.aircraftId as any)?.matricula,
        aircraftId: f.aircraftId,
        estado: f.estado,
      });
    });

    console.log('\n=== CIRCUITOS ===');
    Object.keys(circuitosMap).sort((a, b) => Number(a) - Number(b)).forEach(circuito => {
      console.log(`\nCircuito ${circuito}:`);
      circuitosMap[circuito].forEach((v: any) => {
        console.log(`  - ${v.matricula} (${v.aircraftId}) [${v.estado}]`);
      });
    });

    // Verificar específicamente circuito 2
    console.log('\n=== VERIFICACIÓN CIRCUITO 2 ===');
    const circuito2Flights = await Flight.find({ numero_circuito: 2 }).populate('aircraftId');
    console.log(`Vuelos en circuito 2: ${circuito2Flights.length}`);
    circuito2Flights.forEach(f => {
      console.log(`  - ${(f.aircraftId as any)?.matricula} (ID: ${f.aircraftId})`);
    });

    // Buscar si CC-SKE está en alguna circuito
    const skePlane = aircrafts.find(a => a.matricula === 'CC-SKE');
    if (skePlane) {
      console.log(`\n=== CC-SKE (${skePlane._id}) ===`);
      const skeFlights = await Flight.find({ aircraftId: skePlane._id }).sort({ numero_circuito: 1 });
      console.log(`Vuelos de CC-SKE: ${skeFlights.length}`);
      skeFlights.forEach(f => {
        console.log(`  - Circuito ${f.numero_circuito} [${f.estado}]`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkCircuitos();
