/*
 * DATOS DE EJEMPLO - cifras INVENTADAS.
 * La app los usa solo si en este dispositivo no se cargó "mis-datos.json".
 * Tienen la misma estructura que mis-datos.json (mismos nombres de campos e "id").
 */
window.DATOS_EJEMPLO = {
  version: 1,
  ejemplo: true,

  ingresos: {
    pagoPorHora: 20,
    horasPorSemana: 40,
    brutoSemanal: 800,
    netoSemanal: { monto: 720, nota: "Ejemplo", confirmar: false },
    diaDeCobro: "viernes",
    semanaMala: { netoMinimo: 400, netoMaximo: 550 }
  },

  periodoDePago: {
    confirmar: true,
    nota: "Cada cheque cubre de lunes a domingo y se cobra el viernes de la semana siguiente",
    diaDeCobro: "viernes",
    pagoPorHora: 20,
    horasNormales: 40,
    pagoHoraExtra: 30,
    proporcionNeto: 0.9,
    diasDeTrabajoPorSemana: 5,
    horasPorDia: 8
  },

  gastosFijos: [
    { id: "renta", nombre: "Renta", monto: 1200, frecuencia: "mensual", venceDia: 1, recargoAtraso: 40 },
    {
      id: "telefono", nombre: "Teléfono", monto: 120, frecuencia: "mensual",
      montoDespues: 100, mesDelMonto: "2026-11", venceDia: 20, nota: "Ejemplo", pagosPendientes: [], confirmar: false
    },
    { id: "luz", nombre: "Luz", monto: 70, frecuencia: "mensual", partes: { consumo: 60, cuotaPlan: 10 },
      deudaPlan: "deudaLuz", venceDia: 10, confirmar: false },
    { id: "internet", nombre: "Internet", monto: 50, frecuencia: "mensual", facturaDia: 5, venceDia: 25,
      cambio: { desde: "2027-01-05", monto: 60, confirmar: false } },
    { id: "comida", nombre: "Comida", monto: 150, frecuencia: "semanal" },
    {
      id: "transporte", nombre: "Transporte", monto: 50, frecuencia: "semanal",
      porDia: 10, diasPorSemana: 5, detalleDia: { trenIda: 5, taxi: 0, trenVuelta: 5 }
    },
    { id: "prestamoSemanal", nombre: "Préstamo semanal", monto: 50, frecuencia: "semanal", semanasRestantes: 3, confirmar: false }
  ],

  deudasAtrasadas: [
    { id: "deudaRenta", nombre: "Renta atrasada", monto: 600, prioridad: 1,
      creado: "2026-01-01T00:00:00.000Z", modificado: "2026-01-01T00:00:00.000Z" },
    { id: "deudaLuz", nombre: "Plan de pagos de luz", monto: 120, prioridad: 4, cuotaMensual: 10, pagoExtraOpcional: true,
      creado: "2026-01-01T00:00:00.000Z", modificado: "2026-01-01T00:00:00.000Z" },
    { id: "deudaInternet", nombre: "Internet atrasado", monto: 80, prioridad: 2, venceInmediato: true,
      creado: "2026-01-01T00:00:00.000Z", modificado: "2026-01-01T00:00:00.000Z" },
    { id: "deudaPrestamo", nombre: "Préstamo semanal pendiente", monto: 150, prioridad: null, automatico: true,
      creado: "2026-01-01T00:00:00.000Z", modificado: "2026-01-01T00:00:00.000Z" },
    { id: "deudaAmigo", nombre: "Préstamo de un amigo", monto: 300, prioridad: 3, puedeEsperar: true,
      creado: "2026-01-01T00:00:00.000Z", modificado: "2026-01-01T00:00:00.000Z" }
  ],

  reglasDePrioridad: {
    nivel1: { descripcion: "No se atrasa", pagos: ["renta", "prestamoSemanal", "transporte", "comida"], comidaMinima: 100 },
    nivel2: {
      descripcion: "Se puede dividir o mover con costo",
      telefono: { sePuedeDividir: true, pagos: 2, sePuedeMoverFecha: true },
      luz: { sePuedeMover: true },
      internet: { sePuedeMover: true },
      deudaInternet: { riesgo: "alto", nota: "Ejemplo" }
    },
    nivel3: { descripcion: "Puede esperar", pagos: ["deudaAmigo", "colchon", "deudaLuz"] },
    recargos: { renta: 40, internetPorFactura: 5, luz: { monto: 5, confirmar: false }, telefono: { monto: 5, confirmar: false } },
    semanaBuena: { porcentajeColchon: 50 }
  },

  fechasImportantes: [
    { id: "venceRenta", nombre: "Vence la renta", diaDelMes: 1, critica: false },
    { id: "accionLegal", nombre: "Acción legal si queda saldo de renta", diaDelMes: 15, critica: true }
  ],

  contactos: {
    administradora: {
      nombre: "Administración (ejemplo)",
      correo: "administracion@ejemplo.com",
      telefono: "555-000-0000",
      extension: "0"
    }
  }
};
