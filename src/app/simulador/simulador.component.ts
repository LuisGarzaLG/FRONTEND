import { Component } from '@angular/core';
import { SimulacionService } from '../servicios/simulacion.service';
import * as math from 'mathjs';

interface Registro {
  Empleado: string;
  Tipo: string;
  TipoDocumento: string;
  Documento: string;
  Llegada: number;
  Inicio: number;
  Salida: number;
  Espera: number;
  Duracion: number;
  Impresora_ID: string | number;
}

interface EstadisticasTipo {
  promedioDuracion: number;
}

interface Estadisticas {
  BN: EstadisticasTipo;
  Color: EstadisticasTipo;
}

interface Rendimiento {
  BN: number;
  Color: number;
}
interface ConteoImpresoras {
  [nombre: string]: number;
}

@Component({
  selector: 'app-simulador',
  templateUrl: './simulador.component.html',
  styleUrls: ['./simulador.component.scss']
})
export class SimuladorComponent {
  parametros = {
    num_personas: 100,
    tiempo_llegadas: 2,
    tiempo_simulacion: 1000,
    duracion_bn: [1, 3],
    duracion_color: [4, 10],
    impresoras_bn: 1,
    impresoras_color: 1
  };

  validacionModelo = {
    BN: { teorico: 0, simulado: 0, diferencia: 0 },
    Color: { teorico: 0, simulado: 0, diferencia: 0 }
  };

  conteoImpresoras: ConteoImpresoras = {};
  registros: Registro[] = [];
  chartData: { name: string; value: number }[] = [];
  chartData2: { name: string; value: number }[] = [];
  rendimiento: Rendimiento = { BN: 0, Color: 0 };
  estadisticas: Estadisticas = {
    BN: { promedioDuracion: 0 },
    Color: { promedioDuracion: 0 }
  };
  colaVisualizada: string[] = [];
  impacto: string = '';

  colorScheme = {
    domain: ['#3366FF', '#FF9933']
  };

  constructor(private simService: SimulacionService) {}

  ejecutarSimulacion() {
  this.simService.simular(this.parametros).subscribe({
    next: (res: any) => {
      this.registros = res.registros;
      this.conteoImpresoras = res.conteo_impresoras || {};
      console.log('Registros:', this.registros);
      console.log('Parámetros:', this.parametros);

      this.updateCharts();
      this.estadisticas = this.calcularEstadisticas();
      this.rendimiento = this.calcularRendimiento();

      this.validarModelo(); // validación M/M/c
      this.calcularImpacto(); // <-- Agregar esta línea
      this.mostrarEventosPasoAPaso();
    },
    error: (err) => {
      console.error('Error en simulación:', err);
    }
  });
}


  validarModelo() {
    const llegadasTotales = this.parametros.num_personas / this.parametros.tiempo_simulacion;
    const durBN = this.promedioDuracion('BN') || 0.0001;
    const durColor = this.promedioDuracion('COLOR') || 0.0001;

    const muBN = 1 / durBN;
    const muColor = 1 / durColor;

    console.log('Validando modelo...');
    console.log('Llegadas totales (λ):', llegadasTotales);
    console.log('Duración promedio BN:', durBN);
    console.log('Duración promedio Color:', durColor);
    console.log('Mu BN:', muBN, 'Mu Color:', muColor);

    const teoricoBN = this.calcularTeoricoMMC(llegadasTotales, muBN, this.parametros.impresoras_bn);
    const teoricoColor = this.calcularTeoricoMMC(llegadasTotales, muColor, this.parametros.impresoras_color);

    const simBN = this.promedioEspera('BN');
    const simColor = this.promedioEspera('COLOR');

    this.validacionModelo = {
      BN: {
        teorico: teoricoBN,
        simulado: simBN,
        diferencia: Math.abs(simBN - teoricoBN)
      },
      Color: {
        teorico: teoricoColor,
        simulado: simColor,
        diferencia: Math.abs(simColor - teoricoColor)
      }
    };
  }

  calcularTeoricoMMC(lambda: number, mu: number, c: number): number {
    const rho = lambda / (c * mu);
    if (rho >= 1) return Infinity;

    let sum = 0;
    for (let n = 0; n < c; n++) {
      sum += Math.pow(lambda / mu, n) / math.factorial(n);
    }

    const p0Inv = sum + (Math.pow(lambda / mu, c) / (math.factorial(c) * (1 - rho)));
    const p0 = 1 / p0Inv;

    const Lq = (Math.pow(lambda / mu, c) * lambda * mu) / (math.factorial(c) * Math.pow(c * mu - lambda, 2)) * p0;
    const Wq = Lq / lambda;

    return Number(Wq.toFixed(2));
  }

  promedioDuracion(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.length > 0
      ? registrosTipo.reduce((acc, r) => acc + r.Duracion, 0) / registrosTipo.length
      : 0;
  }

  promedioEspera(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.length > 0
      ? registrosTipo.reduce((acc, r) => acc + r.Espera, 0) / registrosTipo.length
      : 0;
  }

  getTiempoOcupado(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.reduce((acc, curr) => acc + curr.Duracion, 0);
  }

  updateCharts() {
    this.chartData = [
      { name: 'Impresoras BN', value: this.getTiempoOcupado('BN') },
      { name: 'Impresoras Color', value: this.getTiempoOcupado('COLOR') }
    ];

    this.chartData2 = [
      { name: 'BN', value: this.promedioEspera('BN') },
      { name: 'Color', value: this.promedioEspera('COLOR') }
    ];
  }

  calcularEstadisticas(): Estadisticas {
    const registrosBN = this.registros.filter(r => r.Tipo.toUpperCase() === 'BN');
    const registrosColor = this.registros.filter(r => r.Tipo.toUpperCase() === 'COLOR');

    const promedioDuracionBN = registrosBN.length > 0
      ? registrosBN.reduce((acc, r) => acc + r.Duracion, 0) / registrosBN.length
      : 0;

    const promedioDuracionColor = registrosColor.length > 0
      ? registrosColor.reduce((acc, r) => acc + r.Duracion, 0) / registrosColor.length
      : 0;

    return {
      BN: { promedioDuracion: promedioDuracionBN },
      Color: { promedioDuracion: promedioDuracionColor }
    };
  }

  calcularRendimiento(): Rendimiento {
    const tiempoTotal = this.parametros.tiempo_simulacion;
    const tiempoOcupadoBN = this.getTiempoOcupado('BN');
    const tiempoOcupadoColor = this.getTiempoOcupado('COLOR');

    return {
      BN: (tiempoOcupadoBN / tiempoTotal) * 100,
      Color: (tiempoOcupadoColor / tiempoTotal) * 100
    };
  }

  mostrarEventosPasoAPaso(): void {
    this.colaVisualizada = [];
    let i = 0;
    const ordenados = [...this.registros].sort((a, b) => a.Llegada - b.Llegada);

    const intervalo = setInterval(() => {
      if (i >= ordenados.length) {
        clearInterval(intervalo);
        return;
      }

      const r = ordenados[i];
      this.colaVisualizada.push(`🟡El ${r.Empleado} llegó en ${r.Llegada} segundos e imprimió en ${r.Salida} segundos`);
      i++;
    }, 500);
  }

  calcularImpacto(): void {
    const esperaBN = this.promedioEspera('BN');
    const esperaColor = this.promedioEspera('COLOR');
    const rendimientoBN = this.rendimiento.BN;
    const rendimientoColor = this.rendimiento.Color;
    const totalBN = this.registros.filter(r => r.Tipo === 'BN').length;
    const totalColor = this.registros.filter(r => r.Tipo === 'COLOR').length;

    const bnRecomendacion = this.parametros.impresoras_bn > 1 && esperaBN < 2
      ? '✔️ Usar más de 1 impresora B/N reduce significativamente la espera.'
      : '⚠️ Una impresora B/N puede ser insuficiente si hay mucha carga.';

    const colorRecomendacion = this.parametros.impresoras_color > 1 && esperaColor < 2
      ? '✔️ Más impresoras color ayudan a reducir la espera.'
      : '⚠️ Una impresora color puede causar cuellos de botella si se usa mucho.';

    this.impacto = `B/N: ${this.parametros.impresoras_bn} impresora(s), espera promedio: ${esperaBN.toFixed(2)} seg, uso: ${rendimientoBN.toFixed(1)}%, trabajos: ${totalBN}.\n${bnRecomendacion}\n\nColor: ${this.parametros.impresoras_color} impresora(s), espera promedio: ${esperaColor.toFixed(2)} seg, uso: ${rendimientoColor.toFixed(1)}%, trabajos: ${totalColor}.\n${colorRecomendacion}`;
  }
}
